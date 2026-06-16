<script setup lang="ts">
import { computed, inject, onUnmounted, ref } from "vue";

import { FILTERS_KEY, SELECTION_KEY, WORKSPACE_KEY } from "../keys";
import type { SampleMetadata } from "../types";
import SampleCard from "./SampleCard.vue";

const workspace = inject(WORKSPACE_KEY)!;
const selection = inject(SELECTION_KEY)!;
const filters = inject(FILTERS_KEY)!;

const props = defineProps<{
  visibleSamples: SampleMetadata[];
}>();

const emit = defineEmits<{
  openDetail: [sample: SampleMetadata];
}>();

const gridContainerRef = ref<HTMLElement | null>(null);
const rubberBand = ref<{ startX: number; startY: number; currentX: number; currentY: number; active: boolean }>({
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  active: false,
});

let pointerId: number | null = null;

function handleGridPointerDown(event: PointerEvent): void {
  const target = event.target as HTMLElement;
  if (target.closest(".sample-card")) return;

  const rect = gridContainerRef.value?.getBoundingClientRect();
  if (!rect) return;

  pointerId = event.pointerId;
  rubberBand.value = {
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    active: true,
  };

  gridContainerRef.value?.setPointerCapture(event.pointerId);
}

function handleGridPointerMove(event: PointerEvent): void {
  if (!rubberBand.value.active || event.pointerId !== pointerId) return;
  rubberBand.value.currentX = event.clientX;
  rubberBand.value.currentY = event.clientY;

  const selectedIds = getIntersectingSampleIds();
  if (!event.metaKey && !event.ctrlKey) {
    selection.selectedSampleIds = selectedIds;
  }
}

function handleGridPointerUp(event: PointerEvent): void {
  if (!rubberBand.value.active || event.pointerId !== pointerId) return;

  const selectedIds = getIntersectingSampleIds();
  if (event.metaKey || event.ctrlKey) {
    const merged = new Set(selection.selectedSampleIds);
    selectedIds.forEach((id) => merged.add(id));
    selection.selectedSampleIds = [...merged];
  } else {
    selection.selectedSampleIds = selectedIds;
  }

  if (selectedIds.length > 0 && !selection.selectedSampleId) {
    selection.selectedSampleId = selectedIds[0];
  }

  rubberBand.value.active = false;
  pointerId = null;
  gridContainerRef.value?.releasePointerCapture(event.pointerId);
}

function getIntersectingSampleIds(): string[] {
  if (!gridContainerRef.value) return [];

  const bandRect = {
    left: Math.min(rubberBand.value.startX, rubberBand.value.currentX),
    top: Math.min(rubberBand.value.startY, rubberBand.value.currentY),
    right: Math.max(rubberBand.value.startX, rubberBand.value.currentX),
    bottom: Math.max(rubberBand.value.startY, rubberBand.value.currentY),
  };

  const cards = gridContainerRef.value.querySelectorAll<HTMLElement>(".sample-card");
  const ids: string[] = [];

  cards.forEach((card) => {
    const cardRect = card.getBoundingClientRect();
    if (
      cardRect.left < bandRect.right &&
      cardRect.right > bandRect.left &&
      cardRect.top < bandRect.bottom &&
      cardRect.bottom > bandRect.top
    ) {
      const sampleId = card.dataset.sampleId;
      if (sampleId) ids.push(sampleId);
    }
  });

  return ids;
}

const rubberBandStyle = computed(() => {
  if (!rubberBand.value.active) return {};
  const { startX, startY, currentX, currentY } = rubberBand.value;
  const containerRect = gridContainerRef.value?.getBoundingClientRect();
  if (!containerRect) return {};

  return {
    left: `${Math.min(startX, currentX) - containerRect.left}px`,
    top: `${Math.min(startY, currentY) - containerRect.top}px`,
    width: `${Math.abs(currentX - startX)}px`,
    height: `${Math.abs(currentY - startY)}px`,
  };
});
</script>

<template>
  <div
    ref="gridContainerRef"
    class="sample-grid-container"
    @pointerdown="handleGridPointerDown"
    @pointermove="handleGridPointerMove"
    @pointerup="handleGridPointerUp"
  >
    <div v-if="!visibleSamples.length" class="panel empty-state">
      没有匹配当前筛选条件的样本。
    </div>
    <div v-else class="sample-grid" :style="{ '--grid-min-size': `${filters.gridMinSize}px` }">
      <SampleCard
        v-for="(sample, index) in visibleSamples"
        :key="sample.sample_id"
        :sample="sample"
        :selected="sample.sample_id === selection.selectedSampleId"
        :multi-selected="selection.selectedSampleIds.includes(sample.sample_id)"
        @select="({ sample: s, event: e }) => selection.handleSampleClick(s, e, index, visibleSamples)"
        @dblclick="emit('openDetail', sample)"
      />
    </div>

    <div
      v-if="rubberBand.active"
      class="rubber-band"
      :style="rubberBandStyle"
    ></div>
  </div>
</template>
