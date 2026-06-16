<script setup lang="ts">
import type { FlatTag } from "../types";

const props = defineProps<{
  tag: FlatTag;
  active: boolean;
  assignmentState: "checked" | "mixed" | "unchecked";
  sampleCount: number;
  isDetail?: boolean;
}>();

const emit = defineEmits<{
  toggleFilter: [path: string];
  toggleAssign: [path: string];
  toggleCollapse: [path: string];
  selectEdit: [tag: FlatTag];
  contextmenu: [tag: FlatTag, event: MouseEvent];
}>();
</script>

<template>
  <div
    class="tag-row"
    :class="{ active, assigned: assignmentState === 'checked' }"
    :style="{ paddingLeft: `${(isDetail ? 8 : 12) + tag.depth * 16}px` }"
    @contextmenu.prevent="emit('contextmenu', tag, $event)"
  >
    <button
      type="button"
      class="tag-disclosure"
      :class="{ invisible: !tag.hasChildren }"
      :aria-label="tag.expanded ? '收起标签' : '展开标签'"
      @click.stop="emit('toggleCollapse', tag.path)"
    >
      {{ tag.expanded ? "▾" : "▸" }}
    </button>
    <button
      type="button"
      class="keyword-check"
      :class="assignmentState"
      :title="`给选中图片打 keyword：${tag.path}`"
      @click.stop="emit('toggleAssign', tag.path)"
    >
      <span v-if="assignmentState === 'checked'">✓</span>
      <span v-else-if="assignmentState === 'mixed'">—</span>
    </button>
    <button
      type="button"
      class="tag-label-button"
      @click="emit('toggleFilter', tag.path)"
      @dblclick="emit('selectEdit', tag)"
    >
      <span>{{ tag.label }}</span>
      <small>{{ tag.path }}</small>
    </button>
    <span v-if="!isDetail" class="keyword-count">{{ sampleCount }}</span>
  </div>
</template>
