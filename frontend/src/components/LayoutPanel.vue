<script setup lang="ts">
import { computed, inject, ref } from "vue";

import { FILTERS_KEY, SELECTION_KEY, WORKSPACE_KEY } from "../keys";
import type { LayoutType, SampleMetadata } from "../types";
import { defaultBoundariesForLayout } from "../composables/useWorkspace";

const workspace = inject(WORKSPACE_KEY)!;
const filters = inject(FILTERS_KEY)!;
const selection = inject(SELECTION_KEY)!;

const layoutPanelOpen = ref(true);

const layoutTypes: LayoutType[] = ["unlabeled", "single", "dual", "triple"];

const layoutTargetSamples = computed<SampleMetadata[]>(() => {
  if (!workspace.metadata) return [];
  const selected = selection.selectedSampleIds
    .map((id) => workspace.metadata!.samples[id])
    .filter((s): s is SampleMetadata => Boolean(s));
  if (selected.length) return selected;
  const current = selection.selectedSampleId
    ? workspace.metadata.samples[selection.selectedSampleId]
    : null;
  return current ? [current] : [];
});

function layoutAssignmentState(layoutType: LayoutType): "checked" | "mixed" | "unchecked" {
  const targets = layoutTargetSamples.value;
  if (!targets.length) return "unchecked";
  const count = targets.filter((s) => s.layout_type === layoutType).length;
  if (count === targets.length) return "checked";
  if (count > 0) return "mixed";
  return "unchecked";
}

function layoutSampleCount(layoutType: LayoutType): number {
  return workspace.layoutCounts.get(layoutType) ?? 0;
}

async function assignLayoutToTargets(layoutType: LayoutType): Promise<void> {
  const targets = [...layoutTargetSamples.value];
  if (!targets.length) return;
  const sampleIds = targets.map((s) => s.sample_id);
  await workspace.batchPatchSamples(sampleIds, {
    layout_type: layoutType,
    boundaries: defaultBoundariesForLayout(layoutType),
  });
}

function layoutLabel(layoutType: LayoutType): string {
  if (layoutType === "unlabeled") return "布局未标注";
  if (layoutType === "single") return "单栏";
  if (layoutType === "dual") return "双栏";
  return "三栏";
}
</script>

<template>
  <button type="button" class="panel-toggle" @click="layoutPanelOpen = !layoutPanelOpen">
    <span>{{ layoutPanelOpen ? "▾" : "▸" }}</span>
    Layout Type 面板
  </button>
  <template v-if="layoutPanelOpen">
    <p class="muted keyword-help">
      先选中图片，再点击分栏类型前的勾选框设置。点击分栏名称可筛选该类型。
    </p>
    <div
      v-for="layout in layoutTypes"
      :key="layout"
      class="tag-row layout-row"
      :class="{
        assigned: layoutAssignmentState(layout) === 'checked',
        active: filters.selectedLayouts.includes(layout),
      }"
    >
      <span class="tag-disclosure invisible">▸</span>
      <button
        type="button"
        class="keyword-check"
        :class="layoutAssignmentState(layout)"
        :title="`将选中图片设为 ${layout}`"
        @click.stop="assignLayoutToTargets(layout)"
      >
        <span v-if="layoutAssignmentState(layout) === 'checked'">✓</span>
        <span v-else-if="layoutAssignmentState(layout) === 'mixed'">—</span>
      </button>
      <span class="tag-dot layout-dot" :class="layout"></span>
      <button type="button" class="tag-label-button" @click="filters.toggleLayout(layout)">
        <span>{{ layoutLabel(layout) }}</span>
        <small>{{ layout === "unlabeled" ? "布局未标注" : layout === "single" ? "[0, 0]" : layout === "dual" ? "[x1, 0]" : "[x1, x2]" }}</small>
      </button>
      <span class="keyword-count">{{ layoutSampleCount(layout) }}</span>
    </div>
  </template>
</template>
