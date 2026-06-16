<script setup lang="ts">
import { computed, inject, ref } from "vue";

import { FILTERS_KEY, WORKSPACE_KEY } from "../keys";
import type { ContextMenuItem, FlatFolder } from "../types";
import { flattenFolders, getFolderSampleIds } from "../composables/useFolderTree";
import ContextMenu from "./ContextMenu.vue";

const workspace = inject(WORKSPACE_KEY)!;
const filters = inject(FILTERS_KEY)!;

const folderSearch = ref("");

const folderList = computed<FlatFolder[]>(() => {
  const all = flattenFolders(workspace.samples, filters.collapsedFolderPaths);
  if (!folderSearch.value.trim()) return all;
  const search = folderSearch.value.trim().toLowerCase();
  return all.filter((f) => f.path.toLowerCase().includes(search));
});

function isFolderSelected(folderPath: string): boolean {
  return filters.selectedFolders.includes(folderPath);
}

function handleFolderClick(folder: FlatFolder, event: MouseEvent): void {
  filters.toggleFolder(folder.path, {
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
  });
}

const contextMenuState = ref<{ position: { x: number; y: number } | null; items: ContextMenuItem[] }>({
  position: null,
  items: [],
});

function handleFolderContextMenu(folder: FlatFolder, event: MouseEvent): void {
  const sampleIds = getFolderSampleIds(workspace.samples, folder.path);

  contextMenuState.value = {
    position: { x: event.clientX, y: event.clientY },
    items: [
      {
        label: `批量删除 (${sampleIds.length} 个样本)`,
        action: () => {
          if (!sampleIds.length) return;
          const confirmed = window.confirm(
            `将 "${folder.path}" 及其子文件夹下的 ${sampleIds.length} 个样本移入回收站？`,
          );
          if (confirmed) {
            workspace.batchPatchSamples(sampleIds, { trashed: true });
          }
        },
        disabled: !sampleIds.length,
      },
      {
        label: "移动文件夹（暂不支持）",
        disabled: true,
      },
    ],
  };
}

function closeContextMenu(): void {
  contextMenuState.value.position = null;
}
</script>

<template>
  <aside class="panel folder-panel">
    <h2>文件夹</h2>
    <input
      v-model="folderSearch"
      type="search"
      placeholder="搜索文件夹..."
      class="folder-search"
    />
    <p v-if="!folderList.length" class="muted">暂无文件夹。</p>
    <div
      v-for="folder in folderList"
      :key="folder.path"
      class="folder-row"
      :class="{ active: isFolderSelected(folder.path) }"
      :style="{ paddingLeft: `${8 + folder.depth * 16}px` }"
      @click="handleFolderClick(folder, $event)"
      @contextmenu.prevent="handleFolderContextMenu(folder, $event)"
    >
      <button
        type="button"
        class="tag-disclosure"
        :class="{ invisible: !folder.hasChildren }"
        :aria-label="folder.expanded ? '收起' : '展开'"
        @click.stop="filters.toggleFolderCollapse(folder.path)"
      >
        {{ folder.expanded ? "▾" : "▸" }}
      </button>
      <span class="folder-icon">📁</span>
      <span class="folder-name">{{ folder.name }}</span>
      <span class="keyword-count">{{ folder.sampleCount }}</span>
    </div>

    <ContextMenu
      :items="contextMenuState.items"
      :position="contextMenuState.position"
      @close="closeContextMenu"
    />
  </aside>
</template>
