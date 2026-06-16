import { onMounted, onUnmounted } from "vue";

import type { SelectionState } from "./useSelection";
import type { WorkspaceState } from "./useWorkspace";
import type { SampleMetadata } from "../types";

export function useKeyboard(
  workspace: WorkspaceState,
  selection: SelectionState,
  getSelectedSample: () => SampleMetadata | null,
  getVisibleSamples: () => SampleMetadata[],
): void {
  function handleKeyboardShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

    if (event.key === "g" || event.key === "G") {
      selection.activeView = "grid";
      return;
    }

    if (selection.activeView !== "detail") return;

    const sample = getSelectedSample();
    if (!sample) return;

    if (event.key === "1") void workspace.setLayout(sample, "single");
    if (event.key === "2") void workspace.setLayout(sample, "dual");
    if (event.key === "3") void workspace.setLayout(sample, "triple");
    if (event.key === "f" || event.key === "F") void workspace.toggleFlagged(sample);
    if (event.key === " ") {
      event.preventDefault();
      void workspace.setStatus(sample, "labeled");
    }
    const visible = getVisibleSamples();
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
