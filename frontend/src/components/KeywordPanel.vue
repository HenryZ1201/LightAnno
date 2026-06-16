<script setup lang="ts">
import { computed, inject, ref } from "vue";

import { FILTERS_KEY, SELECTION_KEY, WORKSPACE_KEY } from "../keys";
import type { ContextMenuItem, FlatTag, SampleMetadata } from "../types";
import { withAutoLabeledStatus } from "../composables/useWorkspace";
import ContextMenu from "./ContextMenu.vue";
import TagTreeItem from "./TagTreeItem.vue";

const workspace = inject(WORKSPACE_KEY)!;
const filters = inject(FILTERS_KEY)!;
const selection = inject(SELECTION_KEY)!;

const keywordPanelOpen = ref(true);

const tagPathDraft = ref("");
const tagLabelDraft = ref("");
const tagEditPath = ref("");
const tagRenameDraft = ref("");

const tagList = computed<FlatTag[]>(() =>
  workspace.metadata
    ? flattenTags(workspace.metadata.tag_tree, filters.collapsedTagPaths)
    : [],
);

const keywordTargetSamples = computed<SampleMetadata[]>(() => {
  if (!workspace.metadata) return [];
  const selected = selection.selectedSampleIds
    .map((id) => workspace.metadata!.samples[id])
    .filter((s): s is SampleMetadata => Boolean(s));
  if (selected.length) return selected;
  const current = selection.selectedSampleId
    ? workspace.metadata.samples[selection.selectedSampleId]
    : null;
  return current ? [current] : [];
});

function flattenTags(
  tree: Record<string, any>,
  collapsedPaths: string[],
  parentPath = "",
  depth = 0,
): FlatTag[] {
  return Object.entries(tree).flatMap(([key, node]: [string, any]) => {
    const path = parentPath ? `${parentPath}/${key}` : key;
    const hasChildren = Object.keys(node.children).length > 0;
    const expanded = !collapsedPaths.includes(path);
    const children =
      hasChildren && expanded
        ? flattenTags(node.children, collapsedPaths, path, depth + 1)
        : [];

    return [
      { path, label: node.label, depth, hasChildren, expanded },
      ...children,
    ];
  });
}

function keywordAssignmentState(path: string): "checked" | "mixed" | "unchecked" {
  const targets = keywordTargetSamples.value;
  if (!targets.length) return "unchecked";
  const count = targets.filter((s) => s.tags.includes(path)).length;
  if (count === targets.length) return "checked";
  if (count > 0) return "mixed";
  return "unchecked";
}

function keywordSampleCount(path: string): number {
  return workspace.samples.filter((s) =>
    s.tags.some((t) => t === path || t.startsWith(`${path}/`)),
  ).length;
}

async function toggleKeywordAssignment(path: string): Promise<void> {
  const targets = [...keywordTargetSamples.value];
  if (!targets.length) return;
  const shouldRemove = targets.every((s) => s.tags.includes(path));
  for (const sample of targets) {
    const nextTags = shouldRemove
      ? sample.tags.filter((t) => t !== path)
      : Array.from(new Set([...sample.tags, path]));
    await workspace.patchSample(sample, withAutoLabeledStatus(sample, { tags: nextTags }));
  }
}

async function createOrUpdateTag(): Promise<void> {
  await workspace.createOrUpdateTag(tagPathDraft.value, tagLabelDraft.value);
}

async function editSelectedTag(): Promise<void> {
  await workspace.editTag(tagEditPath.value, tagRenameDraft.value, tagLabelDraft.value);
}

async function removeSelectedTag(): Promise<void> {
  const ok = await workspace.removeTag(tagEditPath.value);
  if (ok) {
    filters.selectedTags = filters.selectedTags.filter((t) => t !== tagEditPath.value);
    tagEditPath.value = "";
  }
}

function selectTagForEdit(tag: FlatTag): void {
  tagEditPath.value = tag.path;
  tagRenameDraft.value = tag.path;
  tagLabelDraft.value = tag.label;
}

function handleToggleFilter(path: string): void {
  filters.toggleTag(path);
}

const contextMenuState = ref<{ position: { x: number; y: number } | null; items: ContextMenuItem[] }>({
  position: null,
  items: [],
});

function handleTagContextMenu(tag: FlatTag, event: MouseEvent): void {
  contextMenuState.value = {
    position: { x: event.clientX, y: event.clientY },
    items: [
      {
        label: "新建子标签",
        action: () => {
          tagPathDraft.value = `${tag.path}/`;
          tagLabelDraft.value = "";
          tagEditPath.value = "";
        },
      },
      {
        label: "编辑标签",
        action: () => selectTagForEdit(tag),
      },
      { separator: true, label: "" },
      {
        label: "级联删除",
        action: () => {
          tagEditPath.value = tag.path;
          void removeSelectedTag();
        },
      },
    ],
  };
}

function closeContextMenu(): void {
  contextMenuState.value.position = null;
}
</script>

<template>
  <button type="button" class="panel-toggle" @click="keywordPanelOpen = !keywordPanelOpen">
    <span>{{ keywordPanelOpen ? "▾" : "▸" }}</span>
    Keyword 面板
  </button>
  <template v-if="keywordPanelOpen">
    <div class="tag-editor">
      <input v-model="tagPathDraft" type="text" placeholder="Keyword 路径，如 ecommerce/cart" />
      <input v-model="tagLabelDraft" type="text" placeholder="Keyword 显示名" />
      <button type="button" @click="createOrUpdateTag">新建/保存 Keyword</button>
    </div>
    <div v-if="tagEditPath" class="tag-editor">
      <p class="muted">正在编辑：{{ tagEditPath }}</p>
      <input v-model="tagRenameDraft" type="text" placeholder="新路径，留空则不改路径" />
      <button type="button" @click="editSelectedTag">更新 Keyword</button>
      <button type="button" class="danger-button" @click="removeSelectedTag">级联删除</button>
    </div>
    <p class="muted keyword-help">
      先选中图片，再点击 keyword 前的勾选框打标签。点击 keyword 名称可筛选该标签及子标签。
    </p>
    <p v-if="!tagList.length" class="muted">暂无 keywords，可在上方创建。</p>
    <TagTreeItem
      v-for="tag in tagList"
      :key="tag.path"
      :tag="tag"
      :active="filters.selectedTags.includes(tag.path)"
      :assignment-state="keywordAssignmentState(tag.path)"
      :sample-count="keywordSampleCount(tag.path)"
      @toggle-filter="handleToggleFilter"
      @toggle-assign="toggleKeywordAssignment"
      @toggle-collapse="filters.toggleTagCollapse"
      @select-edit="selectTagForEdit"
      @contextmenu="handleTagContextMenu"
    />

    <ContextMenu
      :items="contextMenuState.items"
      :position="contextMenuState.position"
      @close="closeContextMenu"
    />
  </template>
</template>
