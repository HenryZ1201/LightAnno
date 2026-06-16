<script setup lang="ts">
import { inject, ref } from "vue";

import { WORKSPACE_KEY } from "../keys";

const workspace = inject(WORKSPACE_KEY)!;

const props = defineProps<{
  mode: "open" | "new" | "import";
}>();

const emit = defineEmits<{
  close: [];
}>();

const catalogNameDraft = ref("");
const catalogPathDraft = ref("");
const importFolderDraft = ref("");
const importInProgress = ref(false);

async function createNewCatalog(): Promise<void> {
  if (!catalogNameDraft.value.trim()) return;
  const ok = await workspace.createNewCatalog(catalogNameDraft.value);
  if (ok) {
    catalogNameDraft.value = "";
    emit("close");
  }
}

async function openCatalogFromPath(): Promise<void> {
  if (!catalogPathDraft.value.trim()) return;
  const ok = await workspace.openCatalogFromPathAction(catalogPathDraft.value);
  if (ok) {
    catalogPathDraft.value = "";
    emit("close");
  }
}

async function importFolder(): Promise<void> {
  if (!importFolderDraft.value.trim()) return;
  importInProgress.value = true;
  await workspace.importFolderAction(importFolderDraft.value);
  importInProgress.value = false;
  importFolderDraft.value = "";
  emit("close");
}
</script>

<template>
  <section class="panel catalog-panel" :class="`mode-${mode}`">
    <div v-if="mode === 'open'" class="catalog-section">
      <h2>打开 / 切换 Catalog</h2>
      <div v-if="workspace.activeCatalog" class="catalog-current">
        <strong>{{ workspace.activeCatalog.name }}</strong>
        <span>{{ workspace.activeCatalog.sample_count }} samples</span>
        <small>{{ workspace.activeCatalog.dataset_root }}</small>
      </div>
      <label class="catalog-switcher">
        Catalog 路径
        <input
          v-model="catalogPathDraft"
          type="text"
          placeholder="如 catalogs/default 或 catalogs/default/metadata.json"
        />
      </label>
      <button type="button" @click="openCatalogFromPath">打开</button>
    </div>

    <div v-if="mode === 'new'" class="catalog-section">
      <h2>新建 Catalog</h2>
      <input v-model="catalogNameDraft" type="text" placeholder="Catalog 名称" />
      <button type="button" @click="createNewCatalog">新建并打开</button>
      <p class="muted">新建后会创建空 Catalog。请在右侧通过"导入文件夹"扫描 sample。</p>
    </div>

    <div v-if="mode === 'import'" class="catalog-section">
      <h2>导入文件夹到当前 Catalog</h2>
      <input
        v-model="importFolderDraft"
        type="text"
        placeholder="文件夹路径，如 /data 或 /workspace/data_test/milktea_bill_screenshots"
      />
      <button type="button" :disabled="importInProgress" @click="importFolder">
        {{ importInProgress ? "导入中..." : "导入并扫描" }}
      </button>
      <p class="muted">导入会将该文件夹作为当前 Catalog 的数据根目录，并扫描其中的 sample 文件夹。</p>
    </div>
  </section>
</template>
