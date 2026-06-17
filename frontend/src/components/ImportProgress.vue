<script setup lang="ts">
import { inject } from "vue";

import { WORKSPACE_KEY } from "../keys";

const workspace = inject(WORKSPACE_KEY)!;
</script>

<template>
  <div v-if="workspace.importProgress" class="import-progress-overlay">
    <div class="import-progress-modal">
      <h3>正在导入文件夹...</h3>

      <div v-if="workspace.importProgress.type === 'progress'" class="progress-info">
        <div class="progress-bar-container">
          <div
            class="progress-bar"
            :style="{ width: `${workspace.importProgressPercent}%` }"
          ></div>
        </div>
        <p class="progress-text">
          {{ workspace.importProgress.current }} / {{ workspace.importProgress.total }}
          ({{ workspace.importProgressPercent }}%)
        </p>
        <p class="progress-folder">
          正在扫描: {{ workspace.importProgress.current_folder }}
        </p>
      </div>

      <div v-else-if="workspace.importProgress.type === 'complete'" class="progress-complete">
        <p class="success-text">✓ 导入完成！</p>
      </div>

      <div v-else-if="workspace.importProgress.type === 'error'" class="progress-error">
        <p class="error-text">✗ 导入失败: {{ workspace.importProgress.message }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.import-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.import-progress-modal {
  background: #2a2a2a;
  border: 2px solid #444;
  border-radius: 12px;
  padding: 32px;
  min-width: 400px;
  max-width: 600px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.import-progress-modal h3 {
  margin: 0 0 24px 0;
  font-size: 20px;
  color: #f5f5f5;
  text-align: center;
}

.progress-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-bar-container {
  width: 100%;
  height: 24px;
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid #444;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #4CAF50 0%, #45a049 100%);
  transition: width 0.3s ease;
  border-radius: 12px;
}

.progress-text {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: #f5f5f5;
  text-align: center;
}

.progress-folder {
  margin: 0;
  font-size: 14px;
  color: #999;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.progress-complete,
.progress-error {
  text-align: center;
}

.success-text {
  font-size: 24px;
  color: #4CAF50;
  font-weight: 600;
  margin: 0;
}

.error-text {
  font-size: 18px;
  color: #f44336;
  font-weight: 600;
  margin: 0;
}
</style>
