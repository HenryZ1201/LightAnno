<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from "vue";

const props = defineProps<{
  message: string | null;
  type?: "success" | "error";
  duration?: number;
}>();

const emit = defineEmits<{
  dismiss: [];
}>();

const visible = ref(false);
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

watch(
  () => props.message,
  (msg) => {
    if (msg) {
      visible.value = true;
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => {
        visible.value = false;
        emit("dismiss");
      }, props.duration ?? 3000);
    } else {
      visible.value = false;
    }
  },
);

onUnmounted(() => {
  if (dismissTimer) clearTimeout(dismissTimer);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible && message" class="toast-notification" :class="type ?? 'success'">
        {{ message }}
      </div>
    </Transition>
  </Teleport>
</template>
