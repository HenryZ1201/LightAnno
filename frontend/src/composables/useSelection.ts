import { reactive, ref } from "vue";

import type { SampleMetadata } from "../types";

export function useSelection() {
  const activeView = ref<"grid" | "detail">("grid");
  const selectedSampleId = ref<string | null>(null);
  const selectedSampleIds = ref<string[]>([]);
  const lastSelectedIndex = ref<number | null>(null);

  function openDetail(sample: SampleMetadata): void {
    selectedSampleId.value = sample.sample_id;
    // 保留多选列表，只更新当前主选中项
    // 如果该样本不在多选中，则添加到多选中
    if (!selectedSampleIds.value.includes(sample.sample_id)) {
      selectedSampleIds.value = [...selectedSampleIds.value, sample.sample_id];
    }
    activeView.value = "detail";
  }

  function backToGrid(): void {
    activeView.value = "grid";
  }

  function handleSampleClick(
    sample: SampleMetadata,
    event: MouseEvent,
    index: number,
    visibleSamples: SampleMetadata[],
  ): void {
    if (event.shiftKey && lastSelectedIndex.value !== null) {
      selectedSampleId.value = sample.sample_id;
      const start = Math.min(lastSelectedIndex.value, index);
      const end = Math.max(lastSelectedIndex.value, index);
      selectedSampleIds.value = visibleSamples.slice(start, end + 1).map((s) => s.sample_id);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      const isCurrentlySelected = selectedSampleIds.value.includes(sample.sample_id);
      if (isCurrentlySelected) {
        // 取消选择
        selectedSampleIds.value = selectedSampleIds.value.filter((id) => id !== sample.sample_id);
        // 如果取消的是主选中项，将主选中改为多选列表的第一项
        if (selectedSampleId.value === sample.sample_id) {
          selectedSampleId.value = selectedSampleIds.value[0] ?? null;
        }
      } else {
        // 添加到选择
        selectedSampleIds.value = [...selectedSampleIds.value, sample.sample_id];
        selectedSampleId.value = sample.sample_id;
      }
      lastSelectedIndex.value = index;
      return;
    }

    // 普通点击
    selectedSampleId.value = sample.sample_id;
    selectedSampleIds.value = [sample.sample_id];
    lastSelectedIndex.value = index;
  }

  function selectAllVisible(visibleSamples: SampleMetadata[]): void {
    selectedSampleIds.value = visibleSamples.map((s) => s.sample_id);
    selectedSampleId.value = selectedSampleIds.value[0] ?? null;
  }

  function clearSelection(): void {
    selectedSampleIds.value = [];
    selectedSampleId.value = null;
  }

  function moveSelection(
    delta: number,
    visibleSamples: SampleMetadata[],
  ): void {
    if (!visibleSamples.length || !selectedSampleId.value) return;
    const currentIndex = visibleSamples.findIndex(
      (s) => s.sample_id === selectedSampleId.value,
    );
    const nextIndex =
      currentIndex === -1
        ? 0
        : Math.min(Math.max(currentIndex + delta, 0), visibleSamples.length - 1);
    selectedSampleId.value = visibleSamples[nextIndex].sample_id;
  }

  function resetAfterLoad(firstSampleId: string | null): void {
    selectedSampleId.value = firstSampleId;
    selectedSampleIds.value = firstSampleId ? [firstSampleId] : [];
    activeView.value = "grid";
  }

  return reactive({
    activeView,
    selectedSampleId,
    selectedSampleIds,
    lastSelectedIndex,
    openDetail,
    backToGrid,
    handleSampleClick,
    selectAllVisible,
    clearSelection,
    moveSelection,
    resetAfterLoad,
  });
}

export type SelectionState = ReturnType<typeof useSelection>;
