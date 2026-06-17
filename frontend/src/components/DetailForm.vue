<script setup lang="ts">
import { computed, inject } from "vue";

import { FILTERS_KEY, WORKSPACE_KEY } from "../keys";
import type { LayoutType, SampleMetadata, SampleStatus } from "../types";

const workspace = inject(WORKSPACE_KEY)!;
const filters = inject(FILTERS_KEY)!;

const props = defineProps<{
  sample: SampleMetadata;
}>();

/** 实际类别状态：有 tags 则视为已标注（优先于存储的 class_status） */
const effectiveStatus = computed<SampleStatus>(() => {
  if (props.sample.tags.length > 0) return "labeled";
  return props.sample.class_status;
});

function layoutLabel(layoutType: LayoutType): string {
  if (layoutType === "unlabeled") return "布局未标注";
  if (layoutType === "single") return "单栏";
  if (layoutType === "dual") return "双栏";
  return "三栏";
}

async function setStatus(status: SampleStatus): Promise<void> {
  await workspace.patchSample(props.sample, { class_status: status });
}

async function setLayout(layoutType: LayoutType): Promise<void> {
  const boundaries: [number, number] =
    layoutType === "unlabeled" || layoutType === "single"
      ? [0, 0]
      : layoutType === "dual"
        ? [props.sample.boundaries[0] > 0 ? props.sample.boundaries[0] : 0.5, 0]
        : [0.3333, 0.6667];
  await workspace.patchSample(props.sample, { layout_type: layoutType, boundaries });
}

function categoryStatusLabel(sample: SampleMetadata): string {
  return sample.tags.length ? `已标注 ${sample.tags.length} 个 keyword` : "类别未标注";
}
</script>

<template>
  <div class="detail-form">
    <!-- 状态选择 -->
    <div class="detail-section">
      <p class="field-label">状态</p>
      <div class="status-button-group">
        <button
          type="button"
          class="status-btn status-btn-unlabeled"
          :class="{ active: effectiveStatus === 'unlabeled' }"
          @click="setStatus('unlabeled')"
        >
          类别未标注
        </button>
        <button
          type="button"
          class="status-btn status-btn-labeled"
          :class="{ active: effectiveStatus === 'labeled' }"
          @click="setStatus('labeled')"
        >
          类别已标注
        </button>
        <button
          type="button"
          class="status-btn status-btn-flagged"
          :class="{ active: sample.flagged }"
          @click="workspace.toggleFlagged(sample)"
        >
          存疑
        </button>
      </div>
      <p class="detail-category-label" :class="{ empty: !sample.tags.length }">
        {{ categoryStatusLabel(sample) }}
      </p>
    </div>

    <!-- 分栏选择（大按钮） -->
    <div class="detail-section">
      <p class="field-label">分栏布局</p>
      <div class="layout-button-group">
        <button
          type="button"
          class="layout-btn"
          :class="{ active: sample.layout_type === 'unlabeled' }"
          @click="setLayout('unlabeled')"
        >
          布局未标注
        </button>
        <button
          type="button"
          class="layout-btn"
          :class="{ active: sample.layout_type === 'single' }"
          @click="setLayout('single')"
        >
          单栏
        </button>
        <button
          type="button"
          class="layout-btn"
          :class="{ active: sample.layout_type === 'dual' }"
          @click="setLayout('dual')"
        >
          双栏
        </button>
        <button
          type="button"
          class="layout-btn"
          :class="{ active: sample.layout_type === 'triple' }"
          @click="setLayout('triple')"
        >
          三栏
        </button>
      </div>
    </div>

    <!-- 边界值（大字体显示） -->
    <div class="detail-section">
      <p class="field-label">边界位置</p>
      <div class="boundary-display">
        <span class="boundary-value">{{ sample.boundaries[0].toFixed(4) }}</span>
        <span class="boundary-sep">,</span>
        <span class="boundary-value">{{ sample.boundaries[1].toFixed(4) }}</span>
      </div>
      <p class="boundary-hint">拖动图片中的橙色竖线调整{{ filters.autoSnap ? "，靠近 1/3、1/2、2/3 自动吸附" : "（自动吸附已关闭）" }}</p>
    </div>

    <!-- 文件信息 -->
    <div class="detail-section detail-info-section">
      <dl>
        <dt>图片</dt>
        <dd>{{ sample.image_path }}</dd>
        <dt>控件树</dt>
        <dd>{{ sample.text_info ?? "缺失" }}</dd>
        <dt>路径</dt>
        <dd>{{ sample.sample_path }}</dd>
      </dl>
    </div>
  </div>
</template>
