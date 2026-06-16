import { reactive, ref } from "vue";

import { exportUrl } from "../api";
import type {
  LayoutType,
  SampleMetadata,
  SampleStatus,
} from "../types";

export function useFilters() {
  const selectedTags = ref<string[]>([]);
  const collapsedTagPaths = ref<string[]>([]);
  const selectedLayouts = ref<LayoutType[]>([]);
  const selectedFolders = ref<string[]>([]);
  const collapsedFolderPaths = ref<string[]>([]);
  const statusFilter = ref<"" | SampleStatus>("");
  const flaggedFilter = ref<"" | "flagged" | "not_flagged">("");
  const cueFilter = ref<"all" | "missing" | "present">("all");
  const archiveFilter = ref<"active" | "archived" | "trashed" | "all">("active");
  const searchText = ref("");
  const gridMinSize = ref(188);

  function visibleSamples(samples: SampleMetadata[]): SampleMetadata[] {
    const search = searchText.value.trim().toLowerCase();

    return samples.filter((sample) => {
      if (archiveFilter.value === "active" && (sample.archived || sample.trashed)) return false;
      if (archiveFilter.value === "archived" && !sample.archived) return false;
      if (archiveFilter.value === "trashed" && !sample.trashed) return false;
      if (statusFilter.value && sample.class_status !== statusFilter.value) return false;
      if (flaggedFilter.value === "flagged" && !sample.flagged) return false;
      if (flaggedFilter.value === "not_flagged" && sample.flagged) return false;
      if (selectedLayouts.value.length && !selectedLayouts.value.includes(sample.layout_type)) {
        return false;
      }
      if (selectedFolders.value.length) {
        const inFolder = selectedFolders.value.some(
          (folder) => sample.sample_path === folder || sample.sample_path.startsWith(`${folder}/`),
        );
        if (!inFolder) return false;
      }
      if (cueFilter.value === "missing" && sample.text_info) return false;
      if (cueFilter.value === "present" && !sample.text_info) return false;
      if (selectedTags.value.length) {
        const hasAllSelectedTags = selectedTags.value.every((selectedTag) =>
          sample.tags.some(
            (tag) => tag === selectedTag || tag.startsWith(`${selectedTag}/`),
          ),
        );
        if (!hasAllSelectedTags) return false;
      }
      if (search && !matchesSearch(sample, search)) return false;
      return true;
    });
  }

  function toggleTag(path: string): void {
    selectedTags.value = selectedTags.value.includes(path)
      ? selectedTags.value.filter((t) => t !== path)
      : [...selectedTags.value, path];
  }

  function toggleTagCollapse(path: string): void {
    collapsedTagPaths.value = collapsedTagPaths.value.includes(path)
      ? collapsedTagPaths.value.filter((p) => p !== path)
      : [...collapsedTagPaths.value, path];
  }

  function toggleLayout(layout: LayoutType): void {
    selectedLayouts.value = selectedLayouts.value.includes(layout)
      ? selectedLayouts.value.filter((l) => l !== layout)
      : [...selectedLayouts.value, layout];
  }

  function toggleFolder(folder: string, event?: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }): void {
    const isModifier = event?.ctrlKey || event?.metaKey;
    if (isModifier) {
      selectedFolders.value = selectedFolders.value.includes(folder)
        ? selectedFolders.value.filter((f) => f !== folder)
        : [...selectedFolders.value, folder];
    } else {
      if (selectedFolders.value.length === 1 && selectedFolders.value[0] === folder) {
        selectedFolders.value = [];
      } else {
        selectedFolders.value = [folder];
      }
    }
  }

  function toggleFolderCollapse(path: string): void {
    collapsedFolderPaths.value = collapsedFolderPaths.value.includes(path)
      ? collapsedFolderPaths.value.filter((p) => p !== path)
      : [...collapsedFolderPaths.value, path];
  }

  function clearFolderFilter(): void {
    selectedFolders.value = [];
  }

  function clearLayoutFilter(): void {
    selectedLayouts.value = [];
  }

  function clearTagFilter(): void {
    selectedTags.value = [];
  }

  function filterByStatus(status: "" | SampleStatus): void {
    statusFilter.value = status;
  }

  function filterByFlaged(value: "" | "flagged" | "not_flagged"): void {
    flaggedFilter.value = value;
  }

  function matchesSearch(sample: SampleMetadata, search: string): boolean {
    return [sample.sample_path, sample.image_path, sample.text_info ?? ""].some((field) =>
      field.toLowerCase().includes(search),
    );
  }

  function exportCurrentFilter(): void {
    const params = new URLSearchParams();
    if (statusFilter.value) params.set("class_status", statusFilter.value);
    if (searchText.value.trim()) params.set("search", searchText.value.trim());
    if (cueFilter.value === "missing") params.set("missing_cue_data", "true");
    if (cueFilter.value === "present") params.set("missing_cue_data", "false");
    if (archiveFilter.value === "archived") params.set("include_archived", "true");
    if (archiveFilter.value === "trashed") params.set("include_trashed", "true");
    if (archiveFilter.value === "all") {
      params.set("include_archived", "true");
      params.set("include_trashed", "true");
    }
    selectedTags.value.forEach((tag) => params.append("tags", tag));
    selectedLayouts.value.forEach((layout) => params.append("layout_type", layout));
    selectedFolders.value.forEach((folder) => params.append("folder", folder));
    window.open(exportUrl(params), "_blank", "noopener,noreferrer");
  }

  function increaseGridSize(): void {
    gridMinSize.value = Math.min(gridMinSize.value + 24, 320);
  }

  function decreaseGridSize(): void {
    gridMinSize.value = Math.max(gridMinSize.value - 24, 116);
  }

  return reactive({
    selectedTags,
    collapsedTagPaths,
    selectedLayouts,
    selectedFolders,
    collapsedFolderPaths,
    statusFilter,
    flaggedFilter,
    cueFilter,
    archiveFilter,
    searchText,
    gridMinSize,
    visibleSamples,
    toggleTag,
    toggleTagCollapse,
    toggleLayout,
    toggleFolder,
    toggleFolderCollapse,
    clearFolderFilter,
    clearLayoutFilter,
    clearTagFilter,
    filterByStatus,
    filterByFlaged,
    exportCurrentFilter,
    increaseGridSize,
    decreaseGridSize,
  });
}

export type FiltersState = ReturnType<typeof useFilters>;
