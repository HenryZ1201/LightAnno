<script setup lang="ts">
import { computed, onMounted, onUnmounted, provide, ref, watch } from "vue";

import { useFilters } from "./composables/useFilters";
import { useKeyboard } from "./composables/useKeyboard";
import { useSelection } from "./composables/useSelection";
import { useWorkspace } from "./composables/useWorkspace";
import { FILTERS_KEY, SELECTION_KEY, WORKSPACE_KEY } from "./keys";

import CatalogPanel from "./components/CatalogPanel.vue";
import DefectsPanel from "./components/DefectsPanel.vue";
import DetailView from "./components/DetailView.vue";
import Filmstrip from "./components/Filmstrip.vue";
import FolderPanel from "./components/FolderPanel.vue";
import GridView from "./components/GridView.vue";
import ImportProgress from "./components/ImportProgress.vue";
import MenuBar from "./components/MenuBar.vue";
import StatsBar from "./components/StatsBar.vue";
import ToastNotification from "./components/ToastNotification.vue";

import type { LayoutType, SampleMetadata } from "./types";

const workspace = useWorkspace();
const selection = useSelection();
const filters = useFilters();

provide(WORKSPACE_KEY, workspace);
provide(SELECTION_KEY, selection);
provide(FILTERS_KEY, filters);

const catalogPanelOpen = ref(false);
const catalogPanelMode = ref<"open" | "new" | "import">("open");
const searchDraft = ref("");
let searchTimer: ReturnType<typeof setTimeout> | null = null;

// Panel resize state
const leftPanelWidth = ref(260);
const rightPanelWidth = ref(360);
const minPanelWidth = 180;
const maxLeftPanelWidth = 500;
const maxRightPanelWidth = 600;
const isResizing = ref(false);
const resizeTarget = ref<"left" | "right" | null>(null);
const resizeStartX = ref(0);
const resizeStartWidth = ref(0);

// Filmstrip resize state
const filmstripHeight = ref(100);
const minFilmstripHeight = 60;
const maxFilmstripHeight = 300;
const isResizingFilmstrip = ref(false);
const filmstripResizeStartY = ref(0);
const filmstripResizeStartHeight = ref(0);

const gridTemplateColumns = computed(() => {
  return `${leftPanelWidth.value}px 6px minmax(0, 1fr) 6px ${rightPanelWidth.value}px`;
});

function startResize(target: "left" | "right", event: MouseEvent): void {
  isResizing.value = true;
  resizeTarget.value = target;
  resizeStartX.value = event.clientX;
  resizeStartWidth.value = target === "left" ? leftPanelWidth.value : rightPanelWidth.value;
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
}

function startFilmstripResize(event: MouseEvent): void {
  isResizingFilmstrip.value = true;
  filmstripResizeStartY.value = event.clientY;
  filmstripResizeStartHeight.value = filmstripHeight.value;
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
}

function handleMouseMove(event: MouseEvent): void {
  if (isResizing.value && resizeTarget.value) {
    const delta = event.clientX - resizeStartX.value;
    const minWidth = minPanelWidth;

    if (resizeTarget.value === "left") {
      const newWidth = Math.max(minWidth, Math.min(maxLeftPanelWidth, resizeStartWidth.value + delta));
      leftPanelWidth.value = newWidth;
    } else {
      const newWidth = Math.max(minWidth, Math.min(maxRightPanelWidth, resizeStartWidth.value - delta));
      rightPanelWidth.value = newWidth;
    }
  }

  if (isResizingFilmstrip.value) {
    const delta = filmstripResizeStartY.value - event.clientY;
    const newHeight = Math.max(minFilmstripHeight, Math.min(maxFilmstripHeight, filmstripResizeStartHeight.value + delta));
    filmstripHeight.value = newHeight;
  }
}

function handleMouseUp(): void {
  if (isResizing.value) {
    isResizing.value = false;
    resizeTarget.value = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
  if (isResizingFilmstrip.value) {
    isResizingFilmstrip.value = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
}

onMounted(() => {
  window.addEventListener("mousemove", handleMouseMove);
  window.addEventListener("mouseup", handleMouseUp);
});

onUnmounted(() => {
  window.removeEventListener("mousemove", handleMouseMove);
  window.removeEventListener("mouseup", handleMouseUp);
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
});

watch(searchDraft, (value) => {
  if (searchTimer) {
    clearTimeout(searchTimer);
  }
  searchTimer = setTimeout(() => {
    filters.searchText = value;
  }, 180);
});

const selectedSample = computed<SampleMetadata | null>(() => {
  const id = selection.selectedSampleId;
  if (!id || !workspace.metadata?.samples[id]) return null;
  return workspace.metadata.samples[id] ?? null;
});

const visibleSamples = computed(() =>
  filters.visibleSamples(workspace.samples),
);

const stats = computed(() => ({
  total: workspace.sampleStats.total,
  visible: visibleSamples.value.length,
  labeled: workspace.sampleStats.labeled,
  flagged: workspace.sampleStats.flagged,
  warnings: workspace.warnings.length,
}));

useKeyboard(
  workspace,
  selection,
  () => selectedSample.value,
  () => visibleSamples.value,
);

watch(
  () => workspace.metadata,
  (meta, oldMeta) => {
    if (!oldMeta && meta) {
      const firstId = Object.keys(meta.samples)[0] ?? null;
      selection.resetAfterLoad(firstId);
    }
  },
);

onMounted(async () => {
  await workspace.initHealth();
  await workspace.refreshCatalogs();
  await workspace.loadWorkspace();
});

function showCatalogPanel(mode: "open" | "new" | "import"): void {
  catalogPanelMode.value = mode;
  catalogPanelOpen.value = true;
}

function closeCatalogPanel(): void {
  catalogPanelOpen.value = false;
}

function handleSelectAll(): void {
  selection.selectAllVisible(visibleSamples.value);
}

function handleClearSelection(): void {
  selection.clearSelection();
}

function handleSearchPath(path: string): void {
  searchDraft.value = path;
  filters.searchText = path;
}

function handleOpenDetail(sample: SampleMetadata): void {
  selection.openDetail(sample);
}

function handleBackToGrid(): void {
  selection.backToGrid();
}

function handleToastDismiss(): void {
  workspace.feedbackMessage = null;
}

function handleLayoutQuickFilter(event: Event): void {
  const value = (event.target as HTMLSelectElement).value;
  filters.selectedLayouts = value ? [value as LayoutType] : [];
}
</script>

<template>
  <main class="workspace-shell">
    <div class="workspace-header">
      <MenuBar
        @show-catalog-panel="showCatalogPanel"
        @select-all="handleSelectAll"
        @clear-selection="handleClearSelection"
      />

      <header class="topbar">
        <div class="topbar-title">
          <p class="eyebrow">LightAnno</p>
          <p class="dataset-line">{{ workspace.metadata?.dataset_root ?? "未选择数据目录" }}</p>
        </div>
        <div class="topbar-filters">
          <input
            v-model="searchDraft"
            type="search"
            placeholder="搜索 sample 路径、图片路径或控件树文件..."
            class="header-search"
          />
          <select v-model="filters.statusFilter" class="header-select">
            <option value="">全部状态</option>
            <option value="unlabeled">类别未标注</option>
            <option value="labeled">类别已标注</option>
          </select>
          <select
            class="header-select"
            :value="filters.selectedLayouts.length === 1 ? filters.selectedLayouts[0] : ''"
            @change="handleLayoutQuickFilter($event)"
          >
            <option value="">全部分栏</option>
            <option value="unlabeled">布局未标注</option>
            <option value="single">单栏</option>
            <option value="dual">双栏</option>
            <option value="triple">三栏</option>
          </select>
          <select v-model="filters.cueFilter" class="header-select">
            <option value="all">控件树不限</option>
            <option value="missing">缺控件树</option>
            <option value="present">有控件树</option>
          </select>
        </div>
        <div class="topbar-right">
          <StatsBar
            :total="stats.total"
            :visible="stats.visible"
            :selected="selection.selectedSampleIds.length"
            :labeled="stats.labeled"
            :flagged="stats.flagged"
            :warnings="stats.warnings"
          />
          <div class="topbar-actions">
            <span v-if="workspace.health" class="health health-ok">API: {{ workspace.health.status }}</span>
            <span v-else class="health health-error">API: {{ workspace.healthError ?? "checking" }}</span>
          </div>
        </div>
      </header>

      <p v-if="workspace.errorMessage" class="error-banner">{{ workspace.errorMessage }}</p>
    </div>

    <CatalogPanel
      v-if="catalogPanelOpen"
      :mode="catalogPanelMode"
      @close="closeCatalogPanel"
    />

    <section class="workspace-grid" :style="{ gridTemplateColumns: gridTemplateColumns }">
      <FolderPanel />
      <div class="resize-handle resize-handle-left" @mousedown="startResize('left', $event)"></div>

      <section class="main-panel">
        <div v-if="workspace.loading" class="panel empty-state">正在扫描数据集...</div>

        <template v-else-if="selection.activeView === 'grid'">
          <GridView
            :visible-samples="visibleSamples"
            @open-detail="handleOpenDetail"
          />
        </template>

        <DetailView
          v-else-if="selectedSample"
          :sample="selectedSample"
          @back-to-grid="handleBackToGrid"
        />

        <div class="filmstrip-container" :style="{ height: `${filmstripHeight}px` }">
          <div class="filmstrip-resize-handle" @mousedown="startFilmstripResize"></div>
          <Filmstrip :samples="visibleSamples" />
        </div>
      </section>
      <div class="resize-handle resize-handle-right" @mousedown="startResize('right', $event)"></div>

      <DefectsPanel @search-path="handleSearchPath" />
    </section>

    <ToastNotification
      :message="workspace.feedbackMessage"
      type="success"
      @dismiss="handleToastDismiss"
    />

    <ImportProgress />
  </main>
</template>
