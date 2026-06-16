<script setup lang="ts">
import { computed, inject, ref } from "vue";

import { SELECTION_KEY, WORKSPACE_KEY } from "../keys";
import type { SampleMetadata } from "../types";
import KeywordPanel from "./KeywordPanel.vue";
import LayoutPanel from "./LayoutPanel.vue";

const workspace = inject(WORKSPACE_KEY)!;
const selection = inject(SELECTION_KEY)!;

const inspectorPanelOpen = ref(true);
const defectsPanelOpen = ref(true);

const selectedSample = computed<SampleMetadata | null>(() => {
  const id = selection.selectedSampleId;
  if (!id || !workspace.metadata?.samples[id]) return null;
  return workspace.metadata.samples[id];
});

function effectiveStatusLabel(sample: SampleMetadata): string {
  return sample.tags.length > 0 ? "类别已标注" : sample.class_status === "labeled" ? "类别已标注" : "类别未标注";
}

async function toggleFlagged(): Promise<void> {
  const sample = selectedSample.value;
  if (!sample) return;
  await workspace.toggleFlagged(sample);
}
</script>

<template>
  <aside class="panel defects-panel">
    <button type="button" class="panel-toggle" @click="inspectorPanelOpen = !inspectorPanelOpen">
      <span>{{ inspectorPanelOpen ? "▾" : "▸" }}</span>
      信息面板
    </button>
    <dl v-if="inspectorPanelOpen && selectedSample" class="inspector-list">
      <dt>状态</dt>
      <dd class="status-with-toggle">
        <span>{{ effectiveStatusLabel(selectedSample) }}</span>
        <button
          type="button"
          class="flag-toggle-btn"
          :class="{ active: selectedSample.flagged }"
          :title="selectedSample.flagged ? '取消存疑' : '标记为存疑'"
          @click="toggleFlagged"
        >
          ⚑
        </button>
      </dd>
      <dt>分栏</dt>
      <dd>{{ selectedSample.layout_type }}</dd>
      <dt>边界</dt>
      <dd>{{ selectedSample.boundaries.join(", ") }}</dd>
      <dt>标签</dt>
      <dd>{{ selectedSample.tags.join(", ") || "无标签" }}</dd>
      <dt>路径</dt>
      <dd>{{ selectedSample.sample_path }}</dd>
    </dl>

    <KeywordPanel />

    <LayoutPanel />

    <button type="button" class="panel-toggle" @click="defectsPanelOpen = !defectsPanelOpen">
      <span>{{ defectsPanelOpen ? "▾" : "▸" }}</span>
      缺陷面板
    </button>
    <template v-if="defectsPanelOpen">
      <p v-if="!workspace.warnings.length" class="muted">暂无 warnings/errors。</p>
      <button
        v-for="warning in workspace.warnings"
        :key="`${warning.sample_path}-${warning.code}`"
        type="button"
        class="warning-row"
        @click="$emit('searchPath', warning.sample_path)"
      >
        <strong>{{ warning.code }}</strong>
        <span>{{ warning.sample_path }}</span>
        <small>{{ warning.message }}</small>
      </button>
    </template>
  </aside>
</template>
