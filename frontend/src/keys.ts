import type { InjectionKey } from "vue";

import type { FiltersState } from "./composables/useFilters";
import type { SelectionState } from "./composables/useSelection";
import type { WorkspaceState } from "./composables/useWorkspace";

export const WORKSPACE_KEY: InjectionKey<WorkspaceState> = Symbol("workspace");
export const SELECTION_KEY: InjectionKey<SelectionState> = Symbol("selection");
export const FILTERS_KEY: InjectionKey<FiltersState> = Symbol("filters");
