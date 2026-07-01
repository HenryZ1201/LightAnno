<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref, watch } from "vue";

import { SELECTION_KEY } from "../keys";
import { imageUrl } from "../api";
import type { SampleMetadata } from "../types";

const selection = inject(SELECTION_KEY)!;

const props = defineProps<{
  samples: SampleMetadata[];
}>();

const containerRef = ref<HTMLElement | null>(null);
const scrollLeft = ref(0);
const containerWidth = ref(800);
const ITEM_WIDTH = 80;
const OVERSCAN = 8;

const visibleRange = computed(() => {
  const start = Math.max(0, Math.floor(scrollLeft.value / ITEM_WIDTH) - OVERSCAN);
  const end = Math.min(
    props.samples.length,
    Math.ceil((scrollLeft.value + containerWidth.value) / ITEM_WIDTH) + OVERSCAN,
  );
  return { start, end };
});

const renderedSamples = computed(() => props.samples.slice(visibleRange.value.start, visibleRange.value.end));
const renderOffset = computed(() => visibleRange.value.start * ITEM_WIDTH);
const totalWidth = computed(() => props.samples.length * ITEM_WIDTH);

const selectedSampleIdSet = computed(() => new Set(selection.selectedSampleIds));

function handleFrameClick(sample: SampleMetadata, event: MouseEvent): void {
  const index = props.samples.findIndex((s) => s.sample_id === sample.sample_id);
  if (index === -1) return;
  selection.handleSampleClick(sample, event, index, props.samples);
}

function handleScroll(event: Event): void {
  scrollLeft.value = (event.target as HTMLElement).scrollLeft;
}

function handleResize(): void {
  containerWidth.value = containerRef.value?.clientWidth ?? 800;
}

onMounted(() => {
  handleResize();
  window.addEventListener("resize", handleResize);
});

onUnmounted(() => {
  window.removeEventListener("resize", handleResize);
});

watch(
  () => selection.selectedSampleId,
  (sampleId) => {
    if (!sampleId || !containerRef.value) return;
    const index = props.samples.findIndex((sample) => sample.sample_id === sampleId);
    if (index === -1) return;
    const left = index * ITEM_WIDTH;
    const right = left + ITEM_WIDTH;
    const viewportLeft = containerRef.value.scrollLeft;
    const viewportRight = viewportLeft + containerRef.value.clientWidth;
    if (left < viewportLeft || right > viewportRight) {
      containerRef.value.scrollTo({ left: Math.max(0, left - ITEM_WIDTH * 2), behavior: "smooth" });
    }
  },
);
</script>

<template>
  <div ref="containerRef" class="filmstrip" aria-label="Filmstrip" @scroll="handleScroll">
    <div class="filmstrip-virtual" :style="{ width: `${totalWidth}px` }">
      <div class="filmstrip-window" :style="{ transform: `translateX(${renderOffset}px)` }">
        <button
          v-for="sample in renderedSamples"
          :key="`filmstrip-${sample.sample_id}`"
          type="button"
          class="filmstrip-frame"
          :class="{
            active: sample.sample_id === selection.selectedSampleId,
            'multi-selected': selectedSampleIdSet.has(sample.sample_id)
          }"
          @click="handleFrameClick(sample, $event)"
        >
          <img :src="imageUrl(sample.sample_id)" :alt="sample.sample_path" loading="lazy" />
          <span>{{ sample.layout_type }}</span>
        </button>
      </div>
    </div>
  </div>
</template>
