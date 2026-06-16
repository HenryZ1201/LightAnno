<script setup lang="ts">
defineProps<{
  total: number;
  visible: number;
  selected: number;
  labeled: number;
  flagged: number;
  warnings: number;
}>();
</script>

<template>
  <div class="stats-bar">
    <div class="stats-card">
      <strong>{{ total }}</strong>
      <span>总样本</span>
    </div>
    <div class="stats-card">
      <strong>{{ visible }}</strong>
      <span>当前筛选</span>
    </div>
    <div class="stats-card stats-selected">
      <strong>{{ selected }}</strong>
      <span>已选中</span>
    </div>
    <div class="stats-card stats-labeled">
      <strong>{{ labeled }}</strong>
      <span>已标注</span>
    </div>
    <div class="stats-card stats-flagged">
      <strong>{{ flagged }}</strong>
      <span>存疑</span>
    </div>
    <div class="stats-card stats-warnings">
      <strong>{{ warnings }}</strong>
      <span>缺陷</span>
    </div>
  </div>
</template>
