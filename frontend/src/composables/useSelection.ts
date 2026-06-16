import { reactive, ref } from "vue";

import type { SampleMetadata } from "../types";

export function useSelection() {
  const activeView = ref<"grid" | "detail">("grid");
  const selectedSampleId = ref<string | null>(null);
  const selectedSampleIds = ref<string[]>([]);
  const lastSelectedIndex = ref<number | null>(null);

  function openDetail(sample: SampleMetadata): void {
    selectedSampleId.value = sample.sample_id;
    selectedSampleIds.value = [sample.sample_id];
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
    selectedSampleId.value = sample.sample_id;

    if (event.shiftKey && lastSelectedIndex.value !== null) {
      const start = Math.min(lastSelectedIndex.value, index);
      const end = Math.max(lastSelectedIndex.value, index);
      selectedSampleIds.value = visibleSamples.slice(start, end + 1).map((s) => s.sample_id);
      return;
    }

    if (event.metaKey || event.ctrlKey) {
      selectedSampleIds.value = selectedSampleIds.value.includes(sample.sample_id)
        ? selectedSampleIds.value.filter((id) => id !== sample.sample_id)
        : [...selectedSampleIds.value, sample.sample_id];
      lastSelectedIndex.value = index;
      return;
    }

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
