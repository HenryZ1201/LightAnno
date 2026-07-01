import { computed, reactive, ref } from "vue";

import {
  backupMetadata,
  batchTag,
  batchUpdateSamples,
  createCatalog,
  deleteTag,
  exportUrl,
  fetchHealth,
  importFolder,
  importFolderWithProgress,
  initializeWorkspaceWithProgress,
  listCatalogs,
  moveFolder,
  openCatalog,
  openCatalogPath,
  renameTagPath,
  updateSampleMetadata,
  updateTag,
  upsertTag,
  type HealthResponse,
  type ImportProgress,
  type InitProgress,
} from "../api";
import type {
  CatalogSummary,
  FlatTag,
  InitResponse,
  LayoutType,
  MetadataPatch,
  ProjectMetadata,
  SampleMetadata,
  SampleStatus,
  SampleWarning,
} from "../types";

export function defaultBoundariesForLayout(layoutType: LayoutType): [number, number] {
  if (layoutType === "unlabeled" || layoutType === "single") return [0, 0];
  if (layoutType === "dual") return [0.5, 0];
  return [0.3333, 0.6667];
}

export function withAutoLabeledStatus(
  sample: SampleMetadata,
  patch: MetadataPatch,
): MetadataPatch {
  if (patch.class_status !== undefined || sample.class_status !== "unlabeled") return patch;

  const hasAssignedTags = Array.isArray(patch.tags) && patch.tags.length > 0;
  const hasAssignedLayout = patch.layout_type !== undefined && patch.layout_type !== "unlabeled";
  const hasEditedLayoutBoundary =
    patch.boundaries !== undefined &&
    sample.layout_type !== "unlabeled" &&
    sample.layout_type !== "single";

  if (!hasAssignedTags && !hasAssignedLayout && !hasEditedLayoutBoundary) return patch;
  return { ...patch, class_status: "labeled" };
}

export function flattenTags(
  tree: ProjectMetadata["tag_tree"],
  collapsedPaths: string[],
  parentPath = "",
  depth = 0,
): FlatTag[] {
  return Object.entries(tree).flatMap(([key, node]) => {
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

export function useWorkspace() {
  const health = ref<HealthResponse | null>(null);
  const healthError = ref<string | null>(null);
  const metadata = ref<ProjectMetadata | null>(null);
  const warnings = ref<SampleWarning[]>([]);
  const loading = ref(false);
  const errorMessage = ref<string | null>(null);
  const feedbackMessage = ref<string | null>(null);
  const catalogs = ref<CatalogSummary[]>([]);
  const activeCatalogId = ref<string | null>(null);

  // Import progress state
  const importProgress = ref<ImportProgress | null>(null);
  const importProgressPercent = computed(() => {
    if (!importProgress.value || importProgress.value.type !== "progress") return 0;
    const { current = 0, total = 1 } = importProgress.value;
    return Math.round((current / total) * 100);
  });

  // Scan/init progress state
  const scanProgress = ref<InitProgress | null>(null);
  const scanProgressPercent = computed(() => {
    if (!scanProgress.value || scanProgress.value.type !== "progress") return 0;
    const { current = 0, total = 1 } = scanProgress.value;
    return Math.round((current / total) * 100);
  });

  const samples = computed(() => Object.values(metadata.value?.samples ?? {}));
  const sampleStats = computed(() => {
    let labeled = 0;
    let flagged = 0;
    for (const sample of samples.value) {
      if (sample.class_status === "labeled") labeled += 1;
      if (sample.flagged) flagged += 1;
    }
    return { total: samples.value.length, labeled, flagged };
  });
  const layoutCounts = computed(() => {
    const counts = new Map<LayoutType, number>();
    for (const sample of samples.value) {
      counts.set(sample.layout_type, (counts.get(sample.layout_type) ?? 0) + 1);
    }
    return counts;
  });
  const keywordCounts = computed(() => {
    const counts = new Map<string, number>();
    for (const sample of samples.value) {
      const counted = new Set<string>();
      for (const tag of sample.tags) {
        const parts = tag.split("/");
        let path = "";
        for (const part of parts) {
          path = path ? `${path}/${part}` : part;
          counted.add(path);
        }
      }
      counted.forEach((path) => counts.set(path, (counts.get(path) ?? 0) + 1));
    }
    return counts;
  });
  const activeCatalog = computed(
    () => catalogs.value.find((c) => c.catalog_id === activeCatalogId.value) ?? null,
  );

  function applyWorkspaceResponse(response: InitResponse): void {
    // 自动同步 class_status：有 tags 的样本一律视为已标注
    const samples = response.metadata.samples;
    for (const sample of Object.values(samples)) {
      if (sample.tags.length > 0 && sample.class_status !== "labeled") {
        sample.class_status = "labeled";
      }
      if (sample.tags.length === 0 && sample.class_status === "labeled") {
        sample.class_status = "unlabeled";
      }
    }
    metadata.value = response.metadata;
    warnings.value = response.warnings;
  }

  async function initHealth(): Promise<void> {
    try {
      health.value = await fetchHealth();
    } catch (error) {
      healthError.value = error instanceof Error ? error.message : "Unknown health check error";
    }
  }

  async function loadWorkspace(): Promise<void> {
    loading.value = true;
    errorMessage.value = null;
    scanProgress.value = null;
    try {
      const response = await initializeWorkspaceWithProgress((progress) => {
        scanProgress.value = progress;
      });
      applyWorkspaceResponse(response);
      await refreshCatalogs();
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "无法初始化工作区";
    } finally {
      loading.value = false;
      scanProgress.value = null;
    }
  }

  async function refreshCatalogs(): Promise<void> {
    try {
      const response = await listCatalogs();
      catalogs.value = response.catalogs;
      activeCatalogId.value = response.active_catalog_id;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "读取 Catalog 失败";
    }
  }

  async function createNewCatalog(name: string): Promise<boolean> {
    if (!name.trim()) return false;
    try {
      const response = await createCatalog(name.trim());
      applyWorkspaceResponse(response);
      await refreshCatalogs();
      feedbackMessage.value = "Catalog 已创建并打开";
      return true;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "创建 Catalog 失败";
      return false;
    }
  }

  async function openExistingCatalog(catalogId: string): Promise<void> {
    try {
      const response = await openCatalog(catalogId);
      applyWorkspaceResponse(response);
      await refreshCatalogs();
      feedbackMessage.value = "Catalog 已切换";
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "打开 Catalog 失败";
    }
  }

  async function openCatalogFromPathAction(catalogPath: string): Promise<boolean> {
    if (!catalogPath.trim()) return false;
    try {
      const response = await openCatalogPath(catalogPath.trim());
      applyWorkspaceResponse(response);
      await refreshCatalogs();
      feedbackMessage.value = "Catalog 已从路径打开";
      return true;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "打开 Catalog 路径失败";
      return false;
    }
  }

  async function importFolderAction(folderPath: string): Promise<void> {
    if (!activeCatalogId.value || !folderPath.trim()) return;
    loading.value = true;
    importProgress.value = null;
    try {
      const response = await importFolderWithProgress(
        activeCatalogId.value,
        folderPath.trim(),
        (progress) => {
          importProgress.value = progress;
        }
      );
      applyWorkspaceResponse(response);
      await refreshCatalogs();
      feedbackMessage.value = `导入完成：${Object.keys(response.metadata.samples).length} 个 sample，${response.warnings.length} 个 warning`;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "导入文件夹失败";
    } finally {
      loading.value = false;
      importProgress.value = null;
    }
  }

  function applySamplePatchLocally(sampleId: string, patch: Partial<SampleMetadata>): void {
    if (!metadata.value || !metadata.value.samples[sampleId]) return;
    Object.assign(metadata.value.samples[sampleId], patch);
  }

  async function patchSample(
    sample: SampleMetadata,
    patch: MetadataPatch,
  ): Promise<void> {
    const nextPatch = withAutoLabeledStatus(sample, patch);
    const previousSample = {
      ...sample,
      boundaries: [...sample.boundaries] as [number, number],
      tags: [...sample.tags],
    };
    try {
      applySamplePatchLocally(sample.sample_id, nextPatch);
      const updatedSample = await updateSampleMetadata(sample, nextPatch);
      applySamplePatchLocally(sample.sample_id, updatedSample);
    } catch (error) {
      applySamplePatchLocally(sample.sample_id, previousSample);
      errorMessage.value = error instanceof Error ? error.message : "保存失败";
    }
  }

  async function setLayout(
    sample: SampleMetadata,
    layoutType: LayoutType,
  ): Promise<void> {
    const boundaries: [number, number] =
      layoutType === "unlabeled" || layoutType === "single"
        ? [0, 0]
        : layoutType === "dual"
          ? [sample.boundaries[0] > 0 ? sample.boundaries[0] : 0.5, 0]
          : [0.3333, 0.6667];
    await patchSample(sample, { layout_type: layoutType, boundaries });
  }

  async function setStatus(sample: SampleMetadata, value: SampleStatus): Promise<void> {
    await patchSample(sample, { class_status: value });
  }

  async function toggleFlagged(sample: SampleMetadata): Promise<void> {
    await patchSample(sample, { flagged: !sample.flagged });
  }

  async function saveTagsForSample(sampleId: string, tagsText: string): Promise<void> {
    const tags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const sample = metadata.value?.samples[sampleId];
    const previousSample = sample
      ? { ...sample, boundaries: [...sample.boundaries] as [number, number], tags: [...sample.tags] }
      : null;
    try {
      const patch = sample ? withAutoLabeledStatus(sample, { tags }) : { tags };
      if (sample) applySamplePatchLocally(sample.sample_id, patch);
      const updatedSample = await updateSampleMetadata({ sample_id: sampleId }, patch);
      applySamplePatchLocally(sampleId, updatedSample);
      feedbackMessage.value = "标签已保存";
    } catch (error) {
      if (previousSample) applySamplePatchLocally(previousSample.sample_id, previousSample);
      errorMessage.value = error instanceof Error ? error.message : "标签保存失败";
    }
  }

  async function createOrUpdateTag(
    tagPath: string,
    label: string,
  ): Promise<void> {
    if (!tagPath.trim() || !label.trim()) return;
    try {
      metadata.value = await upsertTag(tagPath.trim(), label.trim());
      feedbackMessage.value = "标签已保存";
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "标签保存失败";
    }
  }

  async function editTag(
    tagPath: string,
    newTagPath: string,
    label: string,
  ): Promise<void> {
    if (!tagPath.trim()) return;
    try {
      if (newTagPath.trim() && newTagPath.trim() !== tagPath.trim()) {
        metadata.value = await renameTagPath(tagPath.trim(), newTagPath.trim());
      }
      metadata.value = await updateTag(
        tagPath.trim(),
        label.trim() || undefined,
      );
      feedbackMessage.value = "标签已更新";
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "标签更新失败";
    }
  }

  async function removeTag(tagPath: string): Promise<boolean> {
    if (!tagPath.trim()) return false;
    const affected = samples.value.filter((s) =>
      s.tags.some(
        (t) => t === tagPath.trim() || t.startsWith(`${tagPath.trim()}/`),
      ),
    ).length;

    if (!window.confirm(`删除 ${tagPath}？将级联移除 ${affected} 个样本上的该标签。`)) {
      return false;
    }
    try {
      metadata.value = await deleteTag(tagPath.trim());
      feedbackMessage.value = "标签已删除";
      return true;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "标签删除失败";
      return false;
    }
  }

  async function batchPatchSamples(
    sampleIds: string[],
    patch: MetadataPatch,
  ): Promise<void> {
    if (!sampleIds.length) return;
    if (sampleIds.length === 1) {
      const sample = metadata.value?.samples[sampleIds[0]];
      if (sample) {
        await patchSample(sample, patch);
      }
      return;
    }
    try {
      const response = await batchUpdateSamples(sampleIds, patch);
      metadata.value = response.metadata;
      const okCount = response.results.filter((r) => r.ok).length;
      feedbackMessage.value = `批量更新完成：${okCount}/${sampleIds.length} 成功`;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "批量更新失败";
    }
  }

  async function batchTagSamples(
    sampleIds: string[],
    tagPath: string,
    action: "add" | "remove",
  ): Promise<void> {
    if (!sampleIds.length) return;
    if (sampleIds.length === 1) {
      const sample = metadata.value?.samples[sampleIds[0]];
      if (sample) {
        const tags =
          action === "add"
            ? Array.from(new Set([...sample.tags, tagPath])).sort()
            : sample.tags.filter((tag) => tag !== tagPath);
        await patchSample(sample, { tags });
      }
      return;
    }
    try {
      const response = await batchTag(sampleIds, tagPath, action);
      metadata.value = response.metadata;
      const okCount = response.results.filter((r) => r.ok).length;
      feedbackMessage.value = `批量${action === "add" ? "添加" : "删除"}标签：${okCount}/${sampleIds.length} 成功`;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "批量标签操作失败";
    }
  }

  async function moveFolderAction(
    sourceFolder: string,
    targetFolder: string,
  ): Promise<void> {
    if (!sourceFolder.trim() || !targetFolder.trim()) return;
    loading.value = true;
    try {
      const response = await moveFolder(sourceFolder.trim(), targetFolder.trim());
      applyWorkspaceResponse({ metadata: response, samples: [], warnings: [] });
      feedbackMessage.value = `文件夹已从 "${sourceFolder}" 移动到 "${targetFolder}"`;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "移动文件夹失败";
    } finally {
      loading.value = false;
    }
  }

  async function createBackup(): Promise<void> {
    try {
      const response = await backupMetadata();
      feedbackMessage.value = `已创建备份：${response.backup_file}`;
    } catch (error) {
      errorMessage.value = error instanceof Error ? error.message : "备份失败";
    }
  }

  function saveMetadataNow(): void {
    feedbackMessage.value = "metadata 已保存（标注变更会自动写入当前 Catalog）";
  }

  function exportAllMetadata(): void {
    const params = new URLSearchParams();
    params.set("include_archived", "true");
    params.set("include_trashed", "true");
    window.open(exportUrl(params), "_blank", "noopener,noreferrer");
  }

  function clearMessages(): void {
    errorMessage.value = null;
    feedbackMessage.value = null;
  }

  return reactive({
    health,
    healthError,
    metadata,
    warnings,
    loading,
    errorMessage,
    feedbackMessage,
    catalogs,
    activeCatalogId,
    samples,
    sampleStats,
    layoutCounts,
    keywordCounts,
    activeCatalog,
    importProgress,
    importProgressPercent,
    scanProgress,
    scanProgressPercent,
    initHealth,
    loadWorkspace,
    refreshCatalogs,
    createNewCatalog,
    openExistingCatalog,
    openCatalogFromPathAction,
    importFolderAction,
    applySamplePatchLocally,
    patchSample,
    setLayout,
    setStatus,
    toggleFlagged,
    saveTagsForSample,
    createOrUpdateTag,
    editTag,
    removeTag,
    batchPatchSamples,
    batchTagSamples,
    moveFolderAction,
    createBackup,
    saveMetadataNow,
    exportAllMetadata,
    clearMessages,
    applyWorkspaceResponse,
  });
}

export type WorkspaceState = ReturnType<typeof useWorkspace>;
