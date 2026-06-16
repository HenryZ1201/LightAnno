<script setup lang="ts">
import { inject, onUnmounted, ref } from "vue";

import { FILTERS_KEY, SELECTION_KEY, WORKSPACE_KEY } from "../keys";
import type { LayoutType, SampleStatus } from "../types";

const workspace = inject(WORKSPACE_KEY)!;
const selection = inject(SELECTION_KEY)!;
const filters = inject(FILTERS_KEY)!;

const emit = defineEmits<{
  showCatalogPanel: [mode: "open" | "new" | "import"];
  selectAll: [];
  clearSelection: [];
}>();

const openMenu = ref<"file" | "edit" | "view" | "help" | null>(null);
const menuBarRef = ref<HTMLElement | null>(null);

function toggleMenu(menu: "file" | "edit" | "view" | "help"): void {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function closeMenus(): void {
  openMenu.value = null;
}

function handleDropdownClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target?.closest("button")) return;
  window.setTimeout(closeMenus, 0);
}

function handleGlobalPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null;
  if (target && menuBarRef.value?.contains(target)) return;
  closeMenus();
}

function showCatalogPanel(mode: "open" | "new" | "import"): void {
  emit("showCatalogPanel", mode);
  closeMenus();
}

function filterByStatus(status: "" | SampleStatus): void {
  filters.filterByStatus(status);
  closeMenus();
}

function filterByFlagged(value: "" | "flagged" | "not_flagged"): void {
  filters.filterByFlaged(value);
  closeMenus();
}

function filterByLayout(layout: "" | LayoutType): void {
  if (!layout) {
    filters.clearLayoutFilter();
  } else {
    filters.selectedLayouts = [layout];
  }
  closeMenus();
}

function selectAll(): void {
  emit("selectAll");
  closeMenus();
}

function clearSelection(): void {
  emit("clearSelection");
  closeMenus();
}

async function flagSelected(): Promise<void> {
  if (!selection.selectedSampleIds.length) return;
  await workspace.batchPatchSamples(selection.selectedSampleIds, { flagged: true });
  closeMenus();
}

async function unflagSelected(): Promise<void> {
  if (!selection.selectedSampleIds.length) return;
  await workspace.batchPatchSamples(selection.selectedSampleIds, { flagged: false });
  closeMenus();
}

function saveMetadataNow(): void {
  workspace.saveMetadataNow();
  closeMenus();
}

function exportAll(): void {
  workspace.exportAllMetadata();
  closeMenus();
}

function exportFilter(): void {
  filters.exportCurrentFilter();
  closeMenus();
}

async function createBackup(): Promise<void> {
  await workspace.createBackup();
  closeMenus();
}

function increaseGridSize(): void {
  filters.increaseGridSize();
  closeMenus();
}

function decreaseGridSize(): void {
  filters.decreaseGridSize();
  closeMenus();
}

function showVersion(): void {
  window.alert("LightAnno v0.1.0");
  closeMenus();
}

function showUsageHelp(): void {
  window.alert(
    [
      "LightAnno 使用说明",
      "",
      "File: 新建/打开 Catalog、导入文件夹、导出/备份 metadata。",
      "Edit: 全选/全不选，并按标注状态或分栏类别筛选。",
      "View: 调整 Grid 缩略图尺寸，切换 Grid/Detail 视图。",
      "Detail: 1/2/3 切换分栏，拖拽边界线会自动保存。",
    ].join("\n"),
  );
  closeMenus();
}

function showAuthor(): void {
  window.alert("作者：z84280372");
  closeMenus();
}

window.addEventListener("pointerdown", handleGlobalPointerDown);

onUnmounted(() => {
  window.removeEventListener("pointerdown", handleGlobalPointerDown);
});
</script>

<template>
  <nav ref="menuBarRef" class="menu-bar">
    <div class="menu-item">
      <button type="button" class="menu-title" @click="toggleMenu('file')">File</button>
      <div v-if="openMenu === 'file'" class="menu-dropdown" @click="handleDropdownClick">
        <button type="button" @click="showCatalogPanel('new')">新建 Catalog...</button>
        <button type="button" @click="showCatalogPanel('open')">打开 Catalog...</button>
        <div class="menu-nested">
          <span class="menu-nested-title">打开最近 ▸</span>
          <div class="menu-nested-dropdown">
            <button v-if="!workspace.catalogs.length" type="button" disabled>
              暂无最近 Catalog
            </button>
            <button
              v-for="catalog in workspace.catalogs.slice(0, 5)"
              :key="`recent-${catalog.catalog_id}`"
              type="button"
              @click="workspace.openExistingCatalog(catalog.catalog_id); closeMenus()"
            >
              {{ catalog.name }}
            </button>
          </div>
        </div>
        <button type="button" @click="showCatalogPanel('import')">导入文件夹...</button>
        <button type="button" @click="exportAll">导出 metadata</button>
        <button type="button" @click="exportFilter">导出当前筛选的 metadata</button>
        <button type="button" @click="saveMetadataNow">保存 metadata</button>
        <button type="button" @click="createBackup">备份 metadata</button>
      </div>
    </div>

    <div class="menu-item">
      <button type="button" class="menu-title" @click="toggleMenu('edit')">Edit</button>
      <div v-if="openMenu === 'edit'" class="menu-dropdown" @click="handleDropdownClick">
        <button type="button" @click="selectAll">全选</button>
        <button type="button" @click="clearSelection">全不选</button>
        <hr class="menu-divider" />
        <button
          type="button"
          :disabled="!selection.selectedSampleIds.length"
          @click="flagSelected"
        >
          标记存疑（{{ selection.selectedSampleIds.length }}）
        </button>
        <button
          type="button"
          :disabled="!selection.selectedSampleIds.length"
          @click="unflagSelected"
        >
          取消存疑（{{ selection.selectedSampleIds.length }}）
        </button>
        <hr class="menu-divider" />
        <div class="menu-subgroup">
          <span>基于类别筛选</span>
          <button type="button" @click="filterByStatus('labeled')">类别已标注</button>
          <button type="button" @click="filterByStatus('unlabeled')">类别未标注</button>
        </div>
        <div class="menu-subgroup">
          <span>基于存疑筛选</span>
          <button type="button" @click="filterByFlagged('flagged')">存疑</button>
          <button type="button" @click="filterByFlagged('not_flagged')">未存疑</button>
          <button type="button" @click="filterByFlagged('')">不限</button>
        </div>
        <div class="menu-subgroup">
          <span>基于多栏类别筛选</span>
          <button type="button" @click="filterByStatus('unlabeled')">类别未标注</button>
          <button type="button" @click="filterByLayout('unlabeled')">布局未标注</button>
          <button type="button" @click="filterByLayout('single')">单栏</button>
          <button type="button" @click="filterByLayout('dual')">双栏</button>
          <button type="button" @click="filterByLayout('triple')">三栏</button>
        </div>
      </div>
    </div>

    <div class="menu-item">
      <button type="button" class="menu-title" @click="toggleMenu('view')">View</button>
      <div v-if="openMenu === 'view'" class="menu-dropdown" @click="handleDropdownClick">
        <button type="button" @click="increaseGridSize">增大 Grid Size</button>
        <button type="button" @click="decreaseGridSize">减小 Grid Size</button>
        <button type="button" @click="selection.activeView = 'grid'; closeMenus()">Grid View</button>
        <button
          type="button"
          :disabled="!selection.selectedSampleId || !workspace.metadata?.samples[selection.selectedSampleId ?? '']"
          @click="selection.activeView = 'detail'; closeMenus()"
        >
          Detail View
        </button>
      </div>
    </div>

    <div class="menu-item">
      <button type="button" class="menu-title" @click="toggleMenu('help')">Help</button>
      <div v-if="openMenu === 'help'" class="menu-dropdown" @click="handleDropdownClick">
        <button type="button" @click="showVersion">版本</button>
        <button type="button" @click="showUsageHelp">使用说明</button>
        <button type="button" @click="showAuthor">作者（z84280372）</button>
      </div>
    </div>

    <span class="menu-spacer"></span>
    <span class="catalog-chip">
      当前 Catalog:
      <strong>{{ workspace.activeCatalog?.name ?? "未加载" }}</strong>
    </span>
  </nav>
</template>
