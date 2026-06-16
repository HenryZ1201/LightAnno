<script setup lang="ts">
import { imageUrl } from "../api";
import type { SampleMetadata } from "../types";

defineProps<{
  samples: SampleMetadata[];
  selectedSampleId: string | null;
}>();

const emit = defineEmits<{
  select: [sampleId: string];
}>();
</script>

<template>
  <div class="filmstrip" aria-label="Filmstrip">
    <button
      v-for="sample in samples"
      :key="`filmstrip-${sample.sample_id}`"
      type="button"
      class="filmstrip-frame"
      :class="{ active: sample.sample_id === selectedSampleId }"
      @click="emit('select', sample.sample_id)"
    >
      <img :src="imageUrl(sample.sample_id)" :alt="sample.sample_path" loading="lazy" />
      <span>{{ sample.layout_type }}</span>
    </button>
  </div>
</template>
