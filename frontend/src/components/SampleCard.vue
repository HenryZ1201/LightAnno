<script setup lang="ts">
import { computed } from "vue";
import { imageUrl } from "../api";
import type { LayoutType, SampleMetadata, SampleStatus } from "../types";

const props = defineProps<{
  sample: SampleMetadata;
  selected: boolean;
  multiSelected: boolean;
}>();

const emit = defineEmits<{
  select: [payload: { sample: SampleMetadata; event: MouseEvent }];
  dblclick: [sample: SampleMetadata];
}>();

const showBoundaries = computed(() => {
  return (
    (props.sample.layout_type === "dual" || props.sample.layout_type === "triple") &&
    props.sample.boundaries[0] > 0
  );
});

const boundaryPositions = computed(() => {
  if (!showBoundaries.value) return [];
  if (props.sample.layout_type === "dual") {
    return [props.sample.boundaries[0] * 100];
  }
  if (props.sample.layout_type === "triple") {
    return [props.sample.boundaries[0] * 100, props.sample.boundaries[1] * 100];
  }
  return [];
});

function layoutLabel(layoutType: LayoutType): string {
  if (layoutType === "unlabeled") return "布局未标注";
  if (layoutType === "single") return "单栏";
  if (layoutType === "dual") return "双栏";
  return "三栏";
}

function categoryLabel(sample: SampleMetadata): string {
  if (sample.flagged) return "存疑";
  if (sample.tags.length) return "类别已标注";
  return "类别未标注";
}

function categoryBadgeClass(sample: SampleMetadata): string {
  if (sample.flagged) return "status-badge flagged";
  if (sample.tags.length) return "status-badge labeled";
  return "status-badge category-unlabeled";
}

function statusColor(status: SampleStatus): string {
  if (status === "labeled") return "#16a34a";
  return "#525252";
}
</script>

<template>
  <button
    type="button"
    class="sample-card"
    :class="{ selected, multiSelected }"
    :data-sample-id="sample.sample_id"
    @click="emit('select', { sample, event: $event })"
    @dblclick="emit('dblclick', sample)"
  >
    <div class="sample-card-image-wrap">
      <img :src="imageUrl(sample.sample_id)" :alt="sample.sample_path" loading="lazy" />
      <span class="status-indicator" :style="{ background: statusColor(sample.class_status) }"></span>
      <span :class="categoryBadgeClass(sample)">{{ categoryLabel(sample) }}</span>
      <span class="layout-badge" :class="sample.layout_type">{{ layoutLabel(sample.layout_type) }}</span>
      <div v-if="showBoundaries" class="boundary-lines">
        <span
          v-for="(pos, idx) in boundaryPositions"
          :key="idx"
          class="boundary-line"
          :style="{ left: `${pos}%` }"
        ></span>
      </div>
    </div>
    <strong>{{ sample.sample_path }}</strong>
    <small>{{ sample.tags.join(", ") || "无标签" }}</small>
  </button>
</template>
