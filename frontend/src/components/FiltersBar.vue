<script setup lang="ts">
import { inject } from "vue";

import { FILTERS_KEY } from "../keys";

const filters = inject(FILTERS_KEY)!;
</script>

<template>
  <div class="panel filters-panel">
    <input v-model="filters.searchText" type="search" placeholder="搜索 sample_path / image_path / text_info" />
    <select v-model="filters.statusFilter">
      <option value="">全部状态</option>
      <option value="unlabeled">未标注</option>
      <option value="labeled">已标注</option>
    </select>
    <select v-model="filters.flaggedFilter">
      <option value="">存疑不限</option>
      <option value="flagged">存疑</option>
      <option value="not_flagged">未存疑</option>
    </select>
    <select v-model="filters.cueFilter">
      <option value="all">控件树不限</option>
      <option value="missing">缺控件树</option>
      <option value="present">有控件树</option>
    </select>
    <select v-model="filters.archiveFilter">
      <option value="active">默认样本</option>
      <option value="archived">归档样本</option>
      <option value="trashed">回收站</option>
      <option value="all">全部样本</option>
    </select>
  </div>
</template>
