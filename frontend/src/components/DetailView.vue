<script setup lang="ts">
import { inject, ref } from "vue";

import { WORKSPACE_KEY } from "../keys";
import type { SampleMetadata } from "../types";
import { imageUrl } from "../api";
import BoundaryCanvas from "./BoundaryCanvas.vue";
import DetailForm from "./DetailForm.vue";

const workspace = inject(WORKSPACE_KEY)!;

const props = defineProps<{
  sample: SampleMetadata;
}>();

const emit = defineEmits<{
  backToGrid: [];
}>();

const boundarySaveTimer = ref<ReturnType<typeof setTimeout> | null>(null);

function saveBoundariesDebounced(boundaries: [number, number]): void {
  if (boundarySaveTimer.value) {
    clearTimeout(boundarySaveTimer.value);
  }
  boundarySaveTimer.value = setTimeout(() => {
    void workspace.patchSample(props.sample, { boundaries });
  }, 300);
}
</script>

<template>
  <section class="panel detail-panel">
    <div class="detail-header">
      <button type="button" @click="emit('backToGrid')">返回 Grid</button>
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
