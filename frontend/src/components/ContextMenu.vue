<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";

import type { ContextMenuItem } from "../types";

const props = defineProps<{
  items: ContextMenuItem[];
  position: { x: number; y: number } | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const menuRef = ref<HTMLElement | null>(null);

function handleClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const actionEl = target.closest("[data-action-index]") as HTMLElement | null;
  if (!actionEl) return;

  const index = parseInt(actionEl.dataset.actionIndex ?? "-1", 10);
  const item = props.items[index];
  if (item && !item.disabled && !item.separator && item.action) {
    item.action();
    emit("close");
  }
}

function handleGlobalClick(event: MouseEvent): void {
  if (menuRef.value && !menuRef.value.contains(event.target as Node)) {
    emit("close");
  }
}

onMounted(() => {
  window.addEventListener("click", handleGlobalClick, true);
});

onUnmounted(() => {
  window.removeEventListener("click", handleGlobalClick, true);
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="position"
      ref="menuRef"
      class="context-menu"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @click="handleClick"
    >
      <template v-for="(item, index) in items" :key="index">
        <div v-if="item.separator" class="context-menu-separator"></div>
        <button
          v-else
          type="button"
          class="context-menu-item"
          :class="{ disabled: item.disabled }"
          :data-action-index="index"
        >
          {{ item.label }}
        </button>
      </template>
    </div>
  </Teleport>
</template>
