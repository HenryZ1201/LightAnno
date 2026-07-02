import { onMounted, onUnmounted } from "vue";

import type { SelectionState } from "./useSelection";
import type { WorkspaceState } from "./useWorkspace";
import type { FiltersState } from "./useFilters";
import type { SampleMetadata } from "../types";

export function useKeyboard(
  workspace: WorkspaceState,
  selection: SelectionState,
  filters: FiltersState,
  getSelectedSample: () => SampleMetadata | null,
  getVisibleSamples: () => SampleMetadata[],
): void {
  function handleKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

    // Select all: Cmd/Ctrl + A
    if ((event.metaKey || event.ctrlKey) && event.key === "a") {
      event.preventDefault();
      selection.selectAllVisible(getVisibleSamples());
      return;
    }

    // Clear selection: Escape
    if (event.key === "Escape") {
      selection.clearSelection();
      return;
    }

    if (event.key === "g" || event.key === "G") {
      selection.activeView = "grid";
      return;
    }

    const visible = getVisibleSamples();
    const sample = getSelectedSample();

    // Grid view: arrow key navigation
    if (selection.activeView === "grid") {
      if (!sample || !visible.length) return;

      const currentIndex = visible.findIndex((s) => s.sample_id === sample.sample_id);
      if (currentIndex === -1) return;

      // Calculate columns based on grid settings
      const containerWidth = window.innerWidth - 260 - 360 - 28; // Approximate: left panel + right panel + padding
      const minItemSize = filters.gridMinSize;
      const gap = 12;
      const columns = Math.max(1, Math.floor((containerWidth + gap) / (minItemSize + gap)));

      let nextIndex = currentIndex;

      if (event.key === "ArrowLeft") {
        nextIndex = Math.max(0, currentIndex - 1);
      } else if (event.key === "ArrowRight") {
        nextIndex = Math.min(visible.length - 1, currentIndex + 1);
      } else if (event.key === "ArrowUp") {
        nextIndex = Math.max(0, currentIndex - columns);
      } else if (event.key === "ArrowDown") {
        nextIndex = Math.min(visible.length - 1, currentIndex + columns);
      } else {
        return;
      }

      if (nextIndex !== currentIndex) {
        event.preventDefault();
        const nextSample = visible[nextIndex];
        selection.selectedSampleId = nextSample.sample_id;
        if (!event.metaKey && !event.ctrlKey && !event.shiftKey) {
          selection.selectedSampleIds = [nextSample.sample_id];
        }
        selection.lastSelectedIndex = nextIndex;

        // Scroll to the selected sample
        const row = Math.floor(nextIndex / columns);
        const rowHeight = Math.ceil(minItemSize * (16 / 9) + 48 + gap);
        const targetScrollTop = row * rowHeight;

        // Dispatch a custom event for GridView to handle scrolling
        window.dispatchEvent(
          new CustomEvent("scroll-to-sample", {
            detail: { scrollTop: targetScrollTop, rowHeight },
          }),
        );
      }
      return;
    }

    // Detail view
    if (selection.activeView !== "detail") return;
    if (!sample) return;

    if (event.key === "1") void workspace.setLayout(sample, "single");
    if (event.key === "2") void workspace.setLayout(sample, "dual");
    if (event.key === "3") void workspace.setLayout(sample, "triple");
    if (event.key === "f" || event.key === "F") void workspace.toggleFlagged(sample);
    if (event.key === " ") {
      event.preventDefault();
      void workspace.setStatus(sample, "labeled");
    }
    if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") {
      selection.moveSelection(-1, visible);
    }
    if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") {
      selection.moveSelection(1, visible);
    }
  }

  onMounted(() => {
    window.addEventListener("keydown", handleKeyboardShortcut);
  });

  onUnmounted(() => {
    window.removeEventListener("keydown", handleKeyboardShortcut);
  });
}
