<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

import BoundaryCanvas from "./components/BoundaryCanvas.vue";
import {
  backupMetadata,
  batchUpdateSamples,
  createCatalog,
  deleteTag,
  exportUrl,
  fetchHealth,
  imageUrl,
  importFolder,
  initializeWorkspace,
  listCatalogs,
  openCatalog,
  openCatalogPath,
  renameTagPath,
  updateSampleMetadata,
  updateTag,
  upsertTag,
  type HealthResponse,
} from "./api";
import type { CatalogSummary, InitResponse, LayoutType, ProjectMetadata, SampleMetadata, SampleWarning } from "./types";

const health = ref<HealthResponse | null>(null);
const healthError = ref<string | null>(null);
const metadata = ref<ProjectMetadata | null>(null);
const warnings = ref<SampleWarning[]>([]);
const loading = ref(false);
const errorMessage = ref<string | null>(null);
const activeView = ref<"grid" | "detail">("grid");
const selectedSampleId = ref<string | null>(null);
const selectedTags = ref<string[]>([]);
const collapsedTagPaths = ref<string[]>([]);
const statusFilter = ref<"" | SampleMetadata["status"]>("");
const layoutFilter = ref<"" | LayoutType>("");
const cueFilter = ref<"all" | "missing" | "present">("all");
const archiveFilter = ref<"active" | "archived" | "trashed" | "all">("active");
const gridMinSize = ref(188);
const searchText = ref("");
const tagDraft = ref("");
const selectedSampleIds = ref<string[]>([]);
const lastSelectedIndex = ref<number | null>(null);
const batchTagDraft = ref("");
const tagPathDraft = ref("");
const tagLabelDraft = ref("");
const tagColorDraft = ref("#64748b");
const tagEditPath = ref("");
const tagRenameDraft = ref("");
const feedbackMessage = ref<string | null>(null);
const catalogs = ref<CatalogSummary[]>([]);
const activeCatalogId = ref<string | null>(null);
const catalogNameDraft = ref("");
const importFolderDraft = ref("");
const importInProgress = ref(false);
const importProgress = ref(0);
const importProgressText = ref("");
const catalogPanelOpen = ref(false);
const catalogPanelMode = ref<"open" | "new" | "import">("open");
const catalogOpenDraft = ref("");
const catalogPathDraft = ref("");
const openMenu = ref<"file" | "edit" | "view" | "help" | null>(null);
const menuBarRef = ref<HTMLElement | null>(null);
const inspectorPanelOpen = ref(true);
const defectsPanelOpen = ref(true);
let boundarySaveTimer: ReturnType<typeof window.setTimeout> | null = null;
let tagSaveTimer: ReturnType<typeof window.setTimeout> | null = null;
let importProgressTimer: ReturnType<typeof window.setInterval> | null = null;

interface FlatTag {
  path: string;
  label: string;
  color: string | null;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

const samples = computed(() => Object.values(metadata.value?.samples ?? {}));
const tagList = computed<FlatTag[]>(() => flattenTags(metadata.value?.tag_tree ?? {}));
const selectedSample = computed(() =>
  selectedSampleId.value && metadata.value ? metadata.value.samples[selectedSampleId.value] : null,
);
const visibleSamples = computed(() => {
  const search = searchText.value.trim().toLowerCase();

  return samples.value.filter((sample) => {
    if (archiveFilter.value === "active" && (sample.archived || sample.trashed)) return false;
    if (archiveFilter.value === "archived" && !sample.archived) return false;
    if (archiveFilter.value === "trashed" && !sample.trashed) return false;
    if (statusFilter.value && sample.status !== statusFilter.value) return false;
    if (layoutFilter.value && sample.layout_type !== layoutFilter.value) return false;
    if (cueFilter.value === "missing" && sample.cue_data_file) return false;
    if (cueFilter.value === "present" && !sample.cue_data_file) return false;
    if (selectedTags.value.length && !selectedTags.value.every((tag) => sample.tags.includes(tag))) {
      return false;
    }
    if (search && !matchesSearch(sample, search)) return false;
    return true;
  });
});

const stats = computed(() => ({
  total: samples.value.length,
  visible: visibleSamples.value.length,
  labeled: samples.value.filter((sample) => sample.status === "labeled").length,
  flagged: samples.value.filter((sample) => sample.status === "flagged").length,
  warnings: warnings.value.length,
}));
const selectedSamples = computed(() =>
  selectedSampleIds.value
    .map((sampleId) => metadata.value?.samples[sampleId])
    .filter((sample): sample is SampleMetadata => Boolean(sample)),
);
const keywordTargetSamples = computed(() => {
  if (selectedSamples.value.length) return selectedSamples.value;
  return selectedSample.value ? [selectedSample.value] : [];
});
const activeCatalog = computed(
  () => catalogs.value.find((catalog) => catalog.catalog_id === activeCatalogId.value) ?? null,
);

onMounted(async () => {
  window.addEventListener("keydown", handleKeyboardShortcut);
  window.addEventListener("pointerdown", handleGlobalPointerDown);

  try {
    health.value = await fetchHealth();
  } catch (error) {
    healthError.value = error instanceof Error ? error.message : "Unknown health check error";
  }

  await refreshCatalogs();
  await loadWorkspace();
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyboardShortcut);
  window.removeEventListener("pointerdown", handleGlobalPointerDown);
  if (boundarySaveTimer) {
    window.clearTimeout(boundarySaveTimer);
  }
  if (tagSaveTimer) {
    window.clearTimeout(tagSaveTimer);
  }
  stopImportProgress();
});

watch(selectedSample, (sample) => {
  tagDraft.value = sample?.tags.join(", ") ?? "";
});

async function loadWorkspace(): Promise<void> {
  loading.value = true;
  errorMessage.value = null;

  try {
    const response = await initializeWorkspace();
    applyWorkspaceResponse(response);
    await refreshCatalogs();
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "无法初始化工作区";
  } finally {
    loading.value = false;
  }
}

function applyWorkspaceResponse(response: InitResponse): void {
  metadata.value = response.metadata;
  warnings.value = response.warnings;
  selectedSampleId.value = response.samples[0]?.sample_id ?? null;
  selectedSampleIds.value = selectedSampleId.value ? [selectedSampleId.value] : [];
  activeView.value = "grid";
}

async function refreshCatalogs(): Promise<void> {
  try {
    const response = await listCatalogs();
    catalogs.value = response.catalogs;
    activeCatalogId.value = response.active_catalog_id;
    catalogOpenDraft.value = response.active_catalog_id ?? "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "读取 Catalog 失败";
  }
}

async function createNewCatalog(): Promise<void> {
  if (!catalogNameDraft.value.trim()) return;

  try {
    const response = await createCatalog(
      catalogNameDraft.value.trim(),
    );
    applyWorkspaceResponse(response);
    await refreshCatalogs();
    feedbackMessage.value = "Catalog 已创建并打开";
    catalogPanelOpen.value = false;
    catalogNameDraft.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "创建 Catalog 失败";
  }
}

async function openExistingCatalog(catalogId: string): Promise<void> {
  try {
    const response = await openCatalog(catalogId);
    applyWorkspaceResponse(response);
    await refreshCatalogs();
    feedbackMessage.value = "Catalog 已切换";
    catalogPanelOpen.value = false;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "打开 Catalog 失败";
  }
}

async function openCatalogFromDraft(): Promise<void> {
  if (!catalogOpenDraft.value || catalogOpenDraft.value === activeCatalogId.value) return;
  await openExistingCatalog(catalogOpenDraft.value);
}

async function openCatalogFromPath(): Promise<void> {
  if (!catalogPathDraft.value.trim()) {
    closeMenus();
    return;
  }

  try {
    const response = await openCatalogPath(catalogPathDraft.value.trim());
    applyWorkspaceResponse(response);
    await refreshCatalogs();
    feedbackMessage.value = "Catalog 已从路径打开";
    catalogPanelOpen.value = false;
    catalogPathDraft.value = "";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "打开 Catalog 路径失败";
  } finally {
    closeMenus();
  }
}

function toggleMenu(menu: "file" | "edit" | "view" | "help"): void {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function closeMenus(): void {
  openMenu.value = null;
}

function showCatalogPanel(mode: "open" | "new" | "import"): void {
  catalogPanelMode.value = mode;
  catalogPanelOpen.value = true;
  closeMenus();
}

function handleDropdownClick(event: MouseEvent): void {
  const target = event.target as HTMLElement | null;
  if (!target?.closest("button")) return;
  window.setTimeout(closeMenus, 0);
}

function handleGlobalPointerDown(event: PointerEvent): void {
  const target = event.target as Node | null;
  if (target && menuBarRef.value?.contains(target)) return;
  closeMenus();
}

async function importFolderIntoCatalog(): Promise<void> {
  if (!activeCatalogId.value || !importFolderDraft.value.trim()) return;

  loading.value = true;
  startImportProgress();
  try {
    const response = await importFolder(activeCatalogId.value, importFolderDraft.value.trim());
    applyWorkspaceResponse(response);
    await refreshCatalogs();
    finishImportProgress();
    feedbackMessage.value = `导入完成：${response.samples.length} 个 sample，${response.warnings.length} 个 warning`;
    catalogPanelOpen.value = false;
    importFolderDraft.value = "";
  } catch (error) {
    stopImportProgress();
    errorMessage.value = error instanceof Error ? error.message : "导入文件夹失败";
  } finally {
    loading.value = false;
  }
}

async function saveMetadataNow(): Promise<void> {
  await saveTags();
  feedbackMessage.value = "metadata 已保存（标注变更会自动写入当前 Catalog）";
  closeMenus();
}

function exportAllMetadata(): void {
  const params = new URLSearchParams();
  params.set("include_archived", "true");
  params.set("include_trashed", "true");
  window.open(exportUrl(params), "_blank", "noopener,noreferrer");
  closeMenus();
}

function exitApp(): void {
  closeMenus();
  feedbackMessage.value = "浏览器应用无法强制退出，请直接关闭当前标签页。";
}

function startImportProgress(): void {
  stopImportProgress();
  importInProgress.value = true;
  importProgress.value = 8;
  importProgressText.value = "正在准备导入...";

  importProgressTimer = window.setInterval(() => {
    if (importProgress.value < 35) {
      importProgress.value += 6;
      importProgressText.value = "正在扫描 sample 文件夹...";
      return;
    }
    if (importProgress.value < 72) {
      importProgress.value += 3;
      importProgressText.value = "正在校验图片和控件树...";
      return;
    }
    if (importProgress.value < 92) {
      importProgress.value += 1;
      importProgressText.value = "正在写入 Catalog metadata...";
    }
  }, 260);
}

function finishImportProgress(): void {
  if (importProgressTimer) {
    window.clearInterval(importProgressTimer);
    importProgressTimer = null;
  }
  importProgress.value = 100;
  importProgressText.value = "导入完成";
  window.setTimeout(() => {
    importInProgress.value = false;
    importProgress.value = 0;
    importProgressText.value = "";
  }, 900);
}

function stopImportProgress(): void {
  if (importProgressTimer) {
    window.clearInterval(importProgressTimer);
    importProgressTimer = null;
  }
  importInProgress.value = false;
  importProgress.value = 0;
  importProgressText.value = "";
}

function toggleTag(path: string): void {
  selectedTags.value = selectedTags.value.includes(path)
    ? selectedTags.value.filter((tag) => tag !== path)
    : [...selectedTags.value, path];
}

function keywordAssignmentState(path: string): "checked" | "mixed" | "unchecked" {
  const targets = keywordTargetSamples.value;
  if (!targets.length) return "unchecked";

  const assignedCount = targets.filter((sample) => sample.tags.includes(path)).length;
  if (assignedCount === targets.length) return "checked";
  if (assignedCount > 0) return "mixed";
  return "unchecked";
}

function keywordSampleCount(path: string): number {
  return samples.value.filter((sample) =>
    sample.tags.some((tag) => tag === path || tag.startsWith(`${path}/`)),
  ).length;
}

async function toggleKeywordAssignment(path: string): Promise<void> {
  const targets = [...keywordTargetSamples.value];
  if (!targets.length) return;

  const shouldRemove = targets.every((sample) => sample.tags.includes(path));
  let successCount = 0;

  try {
    for (const sample of targets) {
      const nextTags = shouldRemove
        ? sample.tags.filter((tag) => tag !== path)
        : Array.from(new Set([...sample.tags, path]));
      metadata.value = await updateSampleMetadata(sample, { tags: nextTags });
      successCount += 1;
    }
    feedbackMessage.value = shouldRemove
      ? `已从 ${successCount} 张图片移除 keyword：${path}`
      : `已为 ${successCount} 张图片添加 keyword：${path}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "Keyword 写入失败";
  }
}

function toggleTagCollapse(path: string): void {
  collapsedTagPaths.value = collapsedTagPaths.value.includes(path)
    ? collapsedTagPaths.value.filter((tagPath) => tagPath !== path)
    : [...collapsedTagPaths.value, path];
}

async function createOrUpdateTag(): Promise<void> {
  if (!tagPathDraft.value.trim() || !tagLabelDraft.value.trim()) return;

  try {
    metadata.value = await upsertTag(
      tagPathDraft.value.trim(),
      tagLabelDraft.value.trim(),
      tagColorDraft.value.trim(),
    );
    feedbackMessage.value = "标签已保存";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "标签保存失败";
  }
}

async function editSelectedTag(): Promise<void> {
  if (!tagEditPath.value.trim()) return;

  try {
    if (tagRenameDraft.value.trim() && tagRenameDraft.value.trim() !== tagEditPath.value.trim()) {
      metadata.value = await renameTagPath(tagEditPath.value.trim(), tagRenameDraft.value.trim());
      tagEditPath.value = tagRenameDraft.value.trim();
    }
    metadata.value = await updateTag(
      tagEditPath.value.trim(),
      tagLabelDraft.value.trim() || undefined,
      tagColorDraft.value.trim() || undefined,
    );
    feedbackMessage.value = "标签已更新";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "标签更新失败";
  }
}

async function removeSelectedTag(): Promise<void> {
  if (!tagEditPath.value.trim()) return;
  const affected = samples.value.filter((sample) =>
    sample.tags.some(
      (tag) => tag === tagEditPath.value.trim() || tag.startsWith(`${tagEditPath.value.trim()}/`),
    ),
  ).length;

  if (!window.confirm(`删除 ${tagEditPath.value}？将级联移除 ${affected} 个样本上的该标签。`)) {
    return;
  }

  try {
    metadata.value = await deleteTag(tagEditPath.value.trim());
    selectedTags.value = selectedTags.value.filter((tag) => tag !== tagEditPath.value.trim());
    tagEditPath.value = "";
    feedbackMessage.value = "标签已删除";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "标签删除失败";
  }
}

function selectTagForEdit(tag: FlatTag): void {
  tagEditPath.value = tag.path;
  tagRenameDraft.value = tag.path;
  tagLabelDraft.value = tag.label;
  tagColorDraft.value = tag.color ?? "#64748b";
}

function openDetail(sample: SampleMetadata): void {
  selectedSampleId.value = sample.sample_id;
  selectedSampleIds.value = [sample.sample_id];
  activeView.value = "detail";
}

function backToGrid(): void {
  activeView.value = "grid";
}

async function patchSelectedSample(patch: Parameters<typeof updateSampleMetadata>[1]): Promise<void> {
  const sample = selectedSample.value;
  if (!sample) return;

  try {
    metadata.value = await updateSampleMetadata(sample, patch);
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "保存失败";
  }
}

function handleSampleClick(sample: SampleMetadata, event: MouseEvent, index: number): void {
  selectedSampleId.value = sample.sample_id;

  if (event.shiftKey && lastSelectedIndex.value !== null) {
    const start = Math.min(lastSelectedIndex.value, index);
    const end = Math.max(lastSelectedIndex.value, index);
    selectedSampleIds.value = visibleSamples.value.slice(start, end + 1).map((item) => item.sample_id);
    return;
  }

  if (event.metaKey || event.ctrlKey) {
    selectedSampleIds.value = selectedSampleIds.value.includes(sample.sample_id)
      ? selectedSampleIds.value.filter((sampleId) => sampleId !== sample.sample_id)
      : [...selectedSampleIds.value, sample.sample_id];
    lastSelectedIndex.value = index;
    return;
  }

  selectedSampleIds.value = [sample.sample_id];
  lastSelectedIndex.value = index;
}

function selectAllVisible(): void {
  selectedSampleIds.value = visibleSamples.value.map((sample) => sample.sample_id);
  selectedSampleId.value = selectedSampleIds.value[0] ?? null;
  closeMenus();
}

function clearSelection(): void {
  selectedSampleIds.value = [];
  selectedSampleId.value = null;
  closeMenus();
}

function filterByStatus(status: "" | SampleMetadata["status"]): void {
  statusFilter.value = status;
  closeMenus();
}

function filterByLayout(layout: "" | LayoutType): void {
  layoutFilter.value = layout;
  closeMenus();
}

async function applyBatchPatch(patch: Parameters<typeof batchUpdateSamples>[1]): Promise<void> {
  if (!selectedSampleIds.value.length) return;

  try {
    const response = await batchUpdateSamples(selectedSampleIds.value, patch);
    metadata.value = response.metadata;
    feedbackMessage.value = `批量操作完成：${response.results.filter((result) => result.ok).length}/${response.results.length}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "批量操作失败";
  }
}

async function batchAddTags(): Promise<void> {
  const tagsToAdd = parseTags(batchTagDraft.value);
  if (!tagsToAdd.length) return;

  await patchSelectedSamplesIndividually((sample) => ({
    tags: Array.from(new Set([...sample.tags, ...tagsToAdd])),
  }));
}

async function batchRemoveTags(): Promise<void> {
  const tagsToRemove = new Set(parseTags(batchTagDraft.value));
  if (!tagsToRemove.size) return;

  await patchSelectedSamplesIndividually((sample) => ({
    tags: sample.tags.filter((tag) => !tagsToRemove.has(tag)),
  }));
}

async function patchSelectedSamplesIndividually(
  createPatch: (sample: SampleMetadata) => Parameters<typeof updateSampleMetadata>[1],
): Promise<void> {
  let successCount = 0;
  const targets = [...selectedSamples.value];

  try {
    for (const sample of targets) {
      metadata.value = await updateSampleMetadata(sample, createPatch(sample));
      successCount += 1;
    }
    feedbackMessage.value = `批量标签操作完成：${successCount}/${targets.length}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "批量标签操作失败";
  }
}

async function syncCurrentToSelection(fields: Array<"tags" | "layout_type" | "boundaries" | "status">): Promise<void> {
  const sample = selectedSample.value;
  if (!sample || selectedSampleIds.value.length <= 1) return;

  const patch: Parameters<typeof applyBatchPatch>[0] = {};
  if (fields.includes("tags")) patch.tags = sample.tags;
  if (fields.includes("status")) patch.status = sample.status;
  if (fields.includes("layout_type")) patch.layout_type = sample.layout_type;
  if (fields.includes("boundaries")) patch.boundaries = sample.boundaries;

  await applyBatchPatch(patch);
}

async function createBackup(): Promise<void> {
  try {
    const response = await backupMetadata();
    feedbackMessage.value = `已创建备份：${response.backup_file}`;
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "备份失败";
  }
}

async function setLayout(layoutType: LayoutType): Promise<void> {
  const current = selectedSample.value;
  if (!current) return;

  const boundaries: [number, number] =
    layoutType === "single"
      ? [0, 0]
      : layoutType === "dual"
        ? [current.boundaries[0] > 0 ? current.boundaries[0] : 0.5, 0]
        : [0.3333, 0.6667];

  await patchSelectedSample({ layout_type: layoutType, boundaries });
}

function saveBoundariesDebounced(boundaries: [number, number]): void {
  if (boundarySaveTimer) {
    window.clearTimeout(boundarySaveTimer);
  }

  boundarySaveTimer = window.setTimeout(() => {
    void patchSelectedSample({ boundaries });
  }, 300);
}

async function setStatus(value: string): Promise<void> {
  if (value === "unlabeled" || value === "labeled" || value === "flagged") {
    await patchSelectedSample({ status: value });
  }
}

async function setStatusFromEvent(event: Event): Promise<void> {
  await setStatus((event.target as HTMLSelectElement).value);
}

async function saveTags(): Promise<void> {
  if (tagSaveTimer) {
    window.clearTimeout(tagSaveTimer);
    tagSaveTimer = null;
  }

  if (!selectedSampleId.value) return;
  await saveTagsForSample(selectedSampleId.value, tagDraft.value);
}

async function saveTagsForSample(sampleId: string, tagsText: string): Promise<void> {
  const tags = tagsText
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);

  try {
    metadata.value = await updateSampleMetadata({ sample_id: sampleId }, { tags });
    feedbackMessage.value = "标签已保存";
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : "标签保存失败";
  }
}

function scheduleTagAutoSave(): void {
  const sampleId = selectedSampleId.value;
  const tagsText = tagDraft.value;
  if (!sampleId) return;

  if (tagSaveTimer) {
    window.clearTimeout(tagSaveTimer);
  }

  tagSaveTimer = window.setTimeout(() => {
    void saveTagsForSample(sampleId, tagsText);
  }, 700);
}

function exportCurrentFilter(): void {
  const params = new URLSearchParams();
  if (statusFilter.value) params.set("status", statusFilter.value);
  if (layoutFilter.value) params.set("layout_type", layoutFilter.value);
  if (searchText.value.trim()) params.set("search", searchText.value.trim());
  if (cueFilter.value === "missing") params.set("missing_cue_data", "true");
  if (cueFilter.value === "present") params.set("missing_cue_data", "false");
  if (archiveFilter.value === "archived") params.set("include_archived", "true");
  if (archiveFilter.value === "trashed") params.set("include_trashed", "true");
  if (archiveFilter.value === "all") {
    params.set("include_archived", "true");
    params.set("include_trashed", "true");
  }
  selectedTags.value.forEach((tag) => params.append("tags", tag));
  window.open(exportUrl(params), "_blank", "noopener,noreferrer");
}

function increaseGridSize(): void {
  gridMinSize.value = Math.min(gridMinSize.value + 24, 320);
  closeMenus();
}

function decreaseGridSize(): void {
  gridMinSize.value = Math.max(gridMinSize.value - 24, 116);
  closeMenus();
}

function showVersion(): void {
  window.alert("LightAnno v0.1.0");
  closeMenus();
}

function showUsageHelp(): void {
  window.alert(
    [
      "LightAnno 使用说明",
      "",
      "File: 新建/打开 Catalog、导入文件夹、导出/备份 metadata。",
      "Edit: 全选/全不选，并按标注状态或分栏类别筛选。",
      "View: 调整 Grid 缩略图尺寸，切换 Grid/Detail 视图。",
      "Detail: 1/2/3 切换分栏，拖拽边界线会自动保存。",
    ].join("\n"),
  );
  closeMenus();
}

function showAuthor(): void {
  window.alert("作者：z84280372");
  closeMenus();
}

function flattenTags(
  tree: ProjectMetadata["tag_tree"],
  parentPath = "",
  depth = 0,
): FlatTag[] {
  return Object.entries(tree).flatMap(([key, node]) => {
    const path = parentPath ? `${parentPath}/${key}` : key;
    const hasChildren = Object.keys(node.children).length > 0;
    const expanded = !collapsedTagPaths.value.includes(path);
    const children = hasChildren && expanded ? flattenTags(node.children, path, depth + 1) : [];

    return [
      { path, label: node.label, color: node.color ?? null, depth, hasChildren, expanded },
      ...children,
    ];
  });
}

function matchesSearch(sample: SampleMetadata, search: string): boolean {
  return [sample.sample_path, sample.image_file, sample.cue_data_file ?? ""].some((field) =>
    field.toLowerCase().includes(search),
  );
}

function parseTags(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function handleKeyboardShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

  if (event.key === "g" || event.key === "G") {
    activeView.value = "grid";
    return;
  }

  if (activeView.value !== "detail") return;

  if (event.key === "1") void setLayout("single");
  if (event.key === "2") void setLayout("dual");
  if (event.key === "3") void setLayout("triple");
  if (event.key === "f" || event.key === "F") void patchSelectedSample({ status: "flagged" });
  if (event.key === " ") {
    event.preventDefault();
    void patchSelectedSample({ status: "labeled" });
  }
  if (event.key === "ArrowLeft" || event.key === "a" || event.key === "A") moveSelection(-1);
  if (event.key === "ArrowRight" || event.key === "d" || event.key === "D") moveSelection(1);
}

function moveSelection(delta: number): void {
  if (!visibleSamples.value.length || !selectedSampleId.value) return;

  const currentIndex = visibleSamples.value.findIndex(
    (sample) => sample.sample_id === selectedSampleId.value,
  );
  const nextIndex =
    currentIndex === -1
      ? 0
      : Math.min(Math.max(currentIndex + delta, 0), visibleSamples.value.length - 1);
  selectedSampleId.value = visibleSamples.value[nextIndex].sample_id;
}
</script>

<template>
  <main class="workspace-shell">
    <nav ref="menuBarRef" class="menu-bar">
      <div class="menu-item">
        <button type="button" class="menu-title" @click="toggleMenu('file')">File</button>
        <div v-if="openMenu === 'file'" class="menu-dropdown" @click="handleDropdownClick">
          <button type="button" @click="showCatalogPanel('new')">新建 Catalog...</button>
          <button type="button" @click="showCatalogPanel('open')">打开 Catalog...</button>
          <div class="menu-nested">
            <span class="menu-nested-title">打开最近 ▸</span>
            <div class="menu-nested-dropdown">
              <button
                v-if="!catalogs.length"
                type="button"
                disabled
              >
                暂无最近 Catalog
              </button>
            <button
              v-for="catalog in catalogs.slice(0, 5)"
              :key="`recent-${catalog.catalog_id}`"
              type="button"
              @click="openExistingCatalog(catalog.catalog_id)"
            >
              {{ catalog.name }}
            </button>
            </div>
          </div>
          <button type="button" @click="showCatalogPanel('import')">导入文件夹...</button>
          <button type="button" @click="exportAllMetadata">导出 metadata</button>
          <button type="button" @click="exportCurrentFilter">导出当前筛选的 metadata</button>
          <button type="button" @click="saveMetadataNow">保存 metadata</button>
          <button type="button" @click="createBackup(); closeMenus()">备份 metadata</button>
          <button type="button" @click="exitApp">退出</button>
        </div>
      </div>

      <div class="menu-item">
        <button type="button" class="menu-title" @click="toggleMenu('edit')">Edit</button>
        <div v-if="openMenu === 'edit'" class="menu-dropdown" @click="handleDropdownClick">
          <button type="button" @click="selectAllVisible">全选</button>
          <button type="button" @click="clearSelection">全不选</button>
          <div class="menu-subgroup">
            <span>基于类别筛选</span>
            <button type="button" @click="filterByStatus('labeled')">已打标</button>
            <button type="button" @click="filterByStatus('unlabeled')">未打标</button>
          </div>
          <div class="menu-subgroup">
            <span>基于多栏类别筛选</span>
            <button type="button" @click="filterByStatus('unlabeled')">未打标</button>
            <button type="button" @click="filterByLayout('single')">单栏</button>
            <button type="button" @click="filterByLayout('dual')">双栏</button>
            <button type="button" @click="filterByLayout('triple')">三栏</button>
          </div>
        </div>
      </div>

      <div class="menu-item">
        <button type="button" class="menu-title" @click="toggleMenu('view')">View</button>
        <div v-if="openMenu === 'view'" class="menu-dropdown" @click="handleDropdownClick">
          <button type="button" @click="increaseGridSize">增大 Grid Size</button>
          <button type="button" @click="decreaseGridSize">减小 Grid Size</button>
          <button type="button" @click="activeView = 'grid'; closeMenus()">Grid View</button>
          <button type="button" :disabled="!selectedSample" @click="activeView = 'detail'; closeMenus()">
            Detail View
          </button>
        </div>
      </div>

      <div class="menu-item">
        <button type="button" class="menu-title" @click="toggleMenu('help')">Help</button>
        <div v-if="openMenu === 'help'" class="menu-dropdown" @click="handleDropdownClick">
          <button type="button" @click="showVersion">版本</button>
          <button type="button" @click="showUsageHelp">使用说明</button>
          <button type="button" @click="showAuthor">作者（z84280372）</button>
        </div>
      </div>

      <span class="menu-spacer"></span>
      <span class="catalog-chip">
        当前 Catalog:
        <strong>{{ activeCatalog?.name ?? "未加载" }}</strong>
      </span>
    </nav>

    <section v-if="catalogPanelOpen" class="panel catalog-panel" :class="`mode-${catalogPanelMode}`">
      <div v-if="catalogPanelMode === 'open'" class="catalog-section">
        <h2>打开 / 切换 Catalog</h2>
        <div v-if="activeCatalog" class="catalog-current">
          <strong>{{ activeCatalog.name }}</strong>
          <span>{{ activeCatalog.sample_count }} samples</span>
          <small>{{ activeCatalog.dataset_root }}</small>
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

      <div v-if="catalogPanelMode === 'new'" class="catalog-section">
        <h2>新建 Catalog</h2>
        <input v-model="catalogNameDraft" type="text" placeholder="Catalog 名称" />
        <button type="button" @click="createNewCatalog">新建并打开</button>
        <p class="muted">新建后会创建空 Catalog。请在右侧通过“导入文件夹”扫描 sample。</p>
      </div>

      <div v-if="catalogPanelMode === 'import'" class="catalog-section">
        <h2>导入文件夹到当前 Catalog</h2>
        <input
          v-model="importFolderDraft"
          type="text"
          placeholder="文件夹路径，如 /data 或 /workspace/data_test/milktea_bill_screenshots"
        />
        <button type="button" :disabled="importInProgress" @click="importFolderIntoCatalog">
          {{ importInProgress ? "导入中..." : "导入并扫描" }}
        </button>
        <div v-if="importInProgress" class="import-progress">
          <div class="import-progress-track">
            <span :style="{ width: `${importProgress}%` }"></span>
          </div>
          <p>{{ importProgressText }} {{ importProgress }}%</p>
        </div>
        <p class="muted">导入会将该文件夹作为当前 Catalog 的数据根目录，并扫描其中的 sample 文件夹。</p>
      </div>
    </section>

    <header class="topbar">
      <div>
        <p class="eyebrow">LightAnno</p>
        <h1>UI Layout Annotation Workspace</h1>
        <p class="dataset-line">{{ metadata?.dataset_root ?? "未选择数据目录" }}</p>
      </div>

      <div class="topbar-actions">
        <span v-if="health" class="health health-ok">API: {{ health.status }}</span>
        <span v-else class="health health-error">API: {{ healthError ?? "checking" }}</span>
      </div>
    </header>

    <p v-if="errorMessage" class="error-banner">{{ errorMessage }}</p>
    <p v-if="feedbackMessage" class="success-banner">{{ feedbackMessage }}</p>

    <section class="stats-row">
      <div><strong>{{ stats.total }}</strong><span>总样本</span></div>
      <div><strong>{{ stats.visible }}</strong><span>当前筛选</span></div>
      <div><strong>{{ stats.labeled }}</strong><span>已标注</span></div>
      <div><strong>{{ stats.flagged }}</strong><span>存疑</span></div>
      <div><strong>{{ stats.warnings }}</strong><span>缺陷</span></div>
    </section>

    <section class="workspace-grid">
      <aside class="panel sidebar-panel">
        <h2>Keyword List</h2>
        <div class="tag-editor">
          <input v-model="tagPathDraft" type="text" placeholder="Keyword 路径，如 ecommerce/cart" />
          <input v-model="tagLabelDraft" type="text" placeholder="Keyword 显示名" />
          <input v-model="tagColorDraft" type="color" title="标签颜色" />
          <button type="button" @click="createOrUpdateTag">新建/保存 Keyword</button>
        </div>
        <div v-if="tagEditPath" class="tag-editor">
          <p class="muted">正在编辑：{{ tagEditPath }}</p>
          <input v-model="tagRenameDraft" type="text" placeholder="新路径，留空则不改路径" />
          <button type="button" @click="editSelectedTag">更新 Keyword</button>
          <button type="button" class="danger-button" @click="removeSelectedTag">级联删除</button>
        </div>
        <p class="muted keyword-help">
          先选中一张或多张图片，再点击 keyword 前的勾选框为选中图片打标签。`—` 表示部分选中图片已有该 keyword。
        </p>
        <p v-if="!tagList.length" class="muted">暂无 keywords，可在上方创建分级 keyword。</p>
        <div
          v-for="tag in tagList"
          :key="tag.path"
          class="tag-row"
          :class="{ active: selectedTags.includes(tag.path), assigned: keywordAssignmentState(tag.path) === 'checked' }"
          :style="{ paddingLeft: `${12 + tag.depth * 16}px` }"
        >
          <button
            type="button"
            class="tag-disclosure"
            :class="{ invisible: !tag.hasChildren }"
            :aria-label="tag.expanded ? '收起标签' : '展开标签'"
            @click.stop="toggleTagCollapse(tag.path)"
          >
            {{ tag.expanded ? "▾" : "▸" }}
          </button>
          <button
            type="button"
            class="keyword-check"
            :class="keywordAssignmentState(tag.path)"
            :title="`给选中图片打 keyword：${tag.path}`"
            @click.stop="toggleKeywordAssignment(tag.path)"
          >
            <span v-if="keywordAssignmentState(tag.path) === 'checked'">✓</span>
            <span v-else-if="keywordAssignmentState(tag.path) === 'mixed'">—</span>
          </button>
          <span class="tag-dot" :style="{ background: tag.color ?? '#64748b' }"></span>
          <button
            type="button"
            class="tag-label-button"
            @click="toggleTag(tag.path)"
            @dblclick="selectTagForEdit(tag)"
          >
            <span>{{ tag.label }}</span>
            <small>{{ tag.path }}</small>
          </button>
          <span class="keyword-count">{{ keywordSampleCount(tag.path) }}</span>
        </div>
      </aside>

      <section class="main-panel">
        <div class="panel filters-panel">
          <input v-model="searchText" type="search" placeholder="搜索 sample_path / image_file / cue_data_file" />
          <select v-model="statusFilter">
            <option value="">全部状态</option>
            <option value="unlabeled">未标注</option>
            <option value="labeled">已标注</option>
            <option value="flagged">存疑</option>
          </select>
          <select v-model="layoutFilter">
            <option value="">全部分栏</option>
            <option value="single">单栏</option>
            <option value="dual">双栏</option>
            <option value="triple">三栏</option>
          </select>
          <select v-model="cueFilter">
            <option value="all">控件树不限</option>
            <option value="missing">缺控件树</option>
            <option value="present">有控件树</option>
          </select>
          <select v-model="archiveFilter">
            <option value="active">默认样本</option>
            <option value="archived">归档样本</option>
            <option value="trashed">回收站</option>
            <option value="all">全部样本</option>
          </select>
        </div>

        <div class="panel batch-panel">
          <strong>已选 {{ selectedSampleIds.length }} 张</strong>
          <input v-model="batchTagDraft" type="text" placeholder="批量标签，逗号分隔" />
          <button type="button" @click="batchAddTags">追加标签</button>
          <button type="button" @click="batchRemoveTags">移除标签</button>
          <button type="button" @click="applyBatchPatch({ layout_type: 'single', boundaries: [0, 0] })">
            设为单栏
          </button>
          <button type="button" @click="applyBatchPatch({ layout_type: 'dual', boundaries: [0.5, 0] })">
            设为双栏
          </button>
          <button type="button" @click="applyBatchPatch({ layout_type: 'triple', boundaries: [0.3333, 0.6667] })">
            设为三栏
          </button>
          <button type="button" @click="applyBatchPatch({ status: 'flagged' })">标记存疑</button>
          <button type="button" @click="syncCurrentToSelection(['tags', 'status'])">同步当前标签/状态</button>
          <button type="button" @click="syncCurrentToSelection(['layout_type', 'boundaries'])">
            同步当前分栏
          </button>
        </div>

        <div v-if="loading" class="panel empty-state">正在扫描数据集...</div>

        <template v-else-if="activeView === 'grid'">
          <div v-if="!visibleSamples.length" class="panel empty-state">
            没有匹配当前筛选条件的样本。
          </div>
          <div v-else class="sample-grid" :style="{ '--grid-min-size': `${gridMinSize}px` }">
            <button
              v-for="(sample, index) in visibleSamples"
              :key="sample.sample_id"
              type="button"
              class="sample-card"
              :class="{
                selected: sample.sample_id === selectedSampleId,
                multiSelected: selectedSampleIds.includes(sample.sample_id),
              }"
              @click="handleSampleClick(sample, $event, index)"
              @dblclick="openDetail(sample)"
            >
              <img :src="imageUrl(sample.sample_id)" :alt="sample.sample_path" loading="lazy" />
              <span class="status-badge" :class="sample.status">{{ sample.status }}</span>
              <span class="layout-badge">{{ sample.layout_type }}</span>
              <strong>{{ sample.sample_path }}</strong>
              <small>{{ sample.tags.join(", ") || "无标签" }}</small>
            </button>
          </div>
        </template>

        <section v-else-if="selectedSample" class="panel detail-panel">
          <div class="detail-header">
            <button type="button" @click="backToGrid">返回 Grid</button>
            <strong>{{ selectedSample.sample_path }}</strong>
          </div>

          <div class="detail-body">
            <BoundaryCanvas
              :key="selectedSample.sample_id"
              :image-src="imageUrl(selectedSample.sample_id)"
              :layout-type="selectedSample.layout_type"
              :boundaries="selectedSample.boundaries"
              @boundaries-change="saveBoundariesDebounced"
            />
            <div class="detail-form">
              <label>
                状态
                <select
                  :value="selectedSample.status"
                  @change="setStatusFromEvent"
                >
                  <option value="unlabeled">未标注</option>
                  <option value="labeled">已标注</option>
                  <option value="flagged">存疑</option>
                </select>
              </label>

              <div>
                <p class="field-label">分栏</p>
                <div class="button-group">
                  <button type="button" @click="setLayout('single')">单栏</button>
                  <button type="button" @click="setLayout('dual')">双栏</button>
                  <button type="button" @click="setLayout('triple')">三栏</button>
                </div>
              </div>

              <label>
                Boundaries
                <input :value="selectedSample.boundaries.join(', ')" disabled />
              </label>

              <label>
                标签，逗号分隔
                <textarea v-model="tagDraft" rows="4" @input="scheduleTagAutoSave"></textarea>
              </label>
              <button type="button" @click="saveTags">立即保存标签</button>

              <dl>
                <dt>Image</dt>
                <dd>{{ selectedSample.image_file }}</dd>
                <dt>CUE Data</dt>
                <dd>{{ selectedSample.cue_data_file ?? "缺失" }}</dd>
              </dl>
            </div>
          </div>

          <div class="filmstrip" aria-label="Filmstrip">
            <button
              v-for="sample in visibleSamples"
              :key="`filmstrip-${sample.sample_id}`"
              type="button"
              class="filmstrip-frame"
              :class="{ active: sample.sample_id === selectedSampleId }"
              @click="selectedSampleId = sample.sample_id"
            >
              <img :src="imageUrl(sample.sample_id)" :alt="sample.sample_path" loading="lazy" />
              <span>{{ sample.layout_type }}</span>
            </button>
          </div>
        </section>
      </section>

      <aside class="panel defects-panel">
        <button type="button" class="panel-toggle" @click="inspectorPanelOpen = !inspectorPanelOpen">
          <span>{{ inspectorPanelOpen ? "▾" : "▸" }}</span>
          信息面板
        </button>
        <dl v-if="inspectorPanelOpen && selectedSample" class="inspector-list">
          <dt>状态</dt>
          <dd>{{ selectedSample.status }}</dd>
          <dt>分栏</dt>
          <dd>{{ selectedSample.layout_type }}</dd>
          <dt>边界</dt>
          <dd>{{ selectedSample.boundaries.join(", ") }}</dd>
          <dt>标签</dt>
          <dd>{{ selectedSample.tags.join(", ") || "无标签" }}</dd>
          <dt>路径</dt>
          <dd>{{ selectedSample.sample_path }}</dd>
        </dl>

        <button type="button" class="panel-toggle" @click="defectsPanelOpen = !defectsPanelOpen">
          <span>{{ defectsPanelOpen ? "▾" : "▸" }}</span>
          缺陷面板
        </button>
        <template v-if="defectsPanelOpen">
          <p v-if="!warnings.length" class="muted">暂无 warnings/errors。</p>
          <button
            v-for="warning in warnings"
            :key="`${warning.sample_path}-${warning.code}`"
            type="button"
            class="warning-row"
            @click="searchText = warning.sample_path"
          >
            <strong>{{ warning.code }}</strong>
            <span>{{ warning.sample_path }}</span>
            <small>{{ warning.message }}</small>
          </button>
        </template>
      </aside>
    </section>
  </main>
</template>
