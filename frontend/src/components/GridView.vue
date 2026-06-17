<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

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

// Virtual scrolling state
const scrollTop = ref(0);
const containerHeight = ref(800);
const containerWidth = ref(1200);
const OVERSCAN = 4; // Extra rows to render above/below viewport
const GRID_GAP = 12;
const GRID_PADDING_X = 28;
const CARD_TEXT_HEIGHT = 48;

// Calculate grid dimensions
const gridDimensions = computed(() => {
  const minItemSize = filters.gridMinSize;
  const availableWidth = Math.max(0, containerWidth.value - GRID_PADDING_X);
  const columns = Math.max(1, Math.floor((availableWidth + GRID_GAP) / (minItemSize + GRID_GAP)));
  const itemWidth = Math.max(
    minItemSize,
    (availableWidth - GRID_GAP * (columns - 1)) / columns,
  );
  const rowHeight = Math.ceil(itemWidth * (16 / 9) + CARD_TEXT_HEIGHT + GRID_GAP);
  const totalRows = Math.ceil(props.visibleSamples.length / columns);
  const totalHeight = totalRows * rowHeight;

  return { columns, rowHeight, totalRows, totalHeight, itemWidth };
});

// Calculate visible range
const visibleRange = computed(() => {
  const { rowHeight, totalRows } = gridDimensions.value;
  const startIndex = Math.floor(scrollTop.value / rowHeight);
  const visibleRows = Math.ceil(containerHeight.value / rowHeight);

  const start = Math.max(0, startIndex - OVERSCAN);
  const end = Math.min(totalRows, startIndex + visibleRows + OVERSCAN);

  return { start, end };
});

// Get samples to render
const renderedSamples = computed(() => {
  const { columns } = gridDimensions.value;
  const { start, end } = visibleRange.value;

  const startIndex = start * columns;
  const endIndex = Math.min(props.visibleSamples.length, end * columns);

  return props.visibleSamples.slice(startIndex, endIndex);
});

const selectedSampleIdSet = computed(() => new Set(selection.selectedSampleIds));

// Calculate offset for rendered items
const renderOffset = computed(() => {
  const { columns, rowHeight } = gridDimensions.value;
  const { start } = visibleRange.value;

  return {
    top: start * rowHeight,
    startIndex: start * columns
  };
});

// Handle scroll
function handleScroll(event: Event): void {
  const target = event.target as HTMLElement;
  scrollTop.value = target.scrollTop;
}

// Handle resize
function handleResize(): void {
  if (gridContainerRef.value) {
    containerHeight.value = gridContainerRef.value.clientHeight;
    containerWidth.value = gridContainerRef.value.clientWidth;
  }
}

onMounted(() => {
  handleResize();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

const visibleSamplesSignature = computed(() => {
  const first = props.visibleSamples[0]?.sample_id ?? "";
  const last = props.visibleSamples.at(-1)?.sample_id ?? "";
  return `${props.visibleSamples.length}:${first}:${last}`;
});

watch(visibleSamplesSignature, () => {
  if (gridContainerRef.value) {
    gridContainerRef.value.scrollTop = 0;
  }
  scrollTop.value = 0;
});

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
    @scroll="handleScroll"
    @pointerdown="handleGridPointerDown"
    @pointermove="handleGridPointerMove"
    @pointerup="handleGridPointerUp"
  >
    <div v-if="!visibleSamples.length" class="panel empty-state">
      没有匹配当前筛选条件的样本。
    </div>
    <div
      v-else
      class="virtual-scroll-container"
      :style="{ height: `${gridDimensions.totalHeight}px` }"
    >
      <div
        class="sample-grid"
        :style="{
          '--grid-min-size': `${filters.gridMinSize}px`,
          '--grid-item-width': `${gridDimensions.itemWidth}px`,
          gridTemplateColumns: `repeat(${gridDimensions.columns}, minmax(0, 1fr))`,
          transform: `translateY(${renderOffset.top}px)`
        }"
      >
        <SampleCard
          v-for="(sample, index) in renderedSamples"
          :key="sample.sample_id"
          :sample="sample"
          :selected="sample.sample_id === selection.selectedSampleId"
          :multi-selected="selectedSampleIdSet.has(sample.sample_id)"
          @select="({ sample: s, event: e }) => {
            const realIndex = renderOffset.startIndex + index;
            selection.handleSampleClick(s, e, realIndex, visibleSamples);
          }"
          @dblclick="emit('openDetail', sample)"
        />
      </div>
    </div>

    <div
      v-if="rubberBand.active"
      class="rubber-band"
      :style="rubberBandStyle"
    ></div>
  </div>
</template>

<style scoped>
.virtual-scroll-container {
  position: relative;
  overflow: hidden;
}

.sample-grid-container {
  overflow-y: auto;
  height: 100%;
}
</style>
