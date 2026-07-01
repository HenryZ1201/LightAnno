<script setup lang="ts">
import { computed, inject, ref } from "vue";

import { FILTERS_KEY, SELECTION_KEY, WORKSPACE_KEY } from "../keys";
import type { SampleMetadata } from "../types";
import { imageUrl } from "../api";
import BoundaryCanvas from "./BoundaryCanvas.vue";
import DetailForm from "./DetailForm.vue";

const workspace = inject(WORKSPACE_KEY)!;
const filters = inject(FILTERS_KEY)!;
const selection = inject(SELECTION_KEY)!;

const props = defineProps<{
  sample: SampleMetadata;
}>();

const emit = defineEmits<{
  backToGrid: [];
}>();

const boundarySaveTimer = ref<ReturnType<typeof setTimeout> | null>(null);

const currentPosition = computed(() => {
  const visibleSamples = filters.visibleSamples(workspace.samples);
  const index = visibleSamples.findIndex((s) => s.sample_id === props.sample.sample_id);
  if (index === -1) return null;
  return {
    current: index + 1,
    total: visibleSamples.length,
  };
});

function saveBoundariesDebounced(boundaries: [number, number]): void {
  if (boundarySaveTimer.value) {
    clearTimeout(boundarySaveTimer.value);
  }
  boundarySaveTimer.value = setTimeout(() => {
    // 如果多选，批量更新所有选中样本的边界
    if (selection.selectedSampleIds.length > 1) {
      void workspace.batchPatchSamples(selection.selectedSampleIds, { boundaries });
    } else {
      void workspace.patchSample(props.sample, { boundaries });
    }
  }, 300);
}
</script>

<template>
  <section class="panel detail-panel">
    <div class="detail-header">
      <button type="button" @click="emit('backToGrid')">返回 Grid</button>
      <span v-if="currentPosition" class="detail-position">
        {{ currentPosition.current }} / {{ currentPosition.total }}
      </span>
      <strong>{{ sample.sample_path }}</strong>
    </div>

    <div class="detail-body">
      <BoundaryCanvas
        :key="`${sample.sample_id}-${sample.layout_type}-${sample.boundaries.join('-')}`"
        :image-src="imageUrl(sample.sample_id)"
        :layout-type="sample.layout_type"
        :boundaries="sample.boundaries"
        @boundaries-change="saveBoundariesDebounced"
        @dblclick="emit('backToGrid')"
      />
      <DetailForm :sample="sample" />
    </div>
  </section>
</template>
