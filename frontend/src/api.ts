import type {
  BatchMetadataResponse,
  CatalogsResponse,
  InitResponse,
  MetadataPatch,
  ProjectMetadata,
  SampleMetadata,
} from "./types";

export interface HealthResponse {
  status: string;
  service: string;
}

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`);

  if (!response.ok) {
    throw new Error(`Health check failed: ${response.status}`);
  }

  return response.json() as Promise<HealthResponse>;
}

export async function initializeWorkspace(): Promise<InitResponse> {
  return requestJson<InitResponse>("/api/workspace/init");
}

export async function listCatalogs(): Promise<CatalogsResponse> {
  return requestJson<CatalogsResponse>("/api/catalogs");
}

export async function createCatalog(name: string, datasetRoot?: string): Promise<InitResponse> {
  return requestJson<InitResponse>("/api/catalogs", {
    method: "POST",
    body: JSON.stringify({
      name,
      dataset_root: datasetRoot || null,
    }),
  });
}

export async function openCatalog(catalogId: string): Promise<InitResponse> {
  return requestJson<InitResponse>("/api/catalogs/open", {
    method: "POST",
    body: JSON.stringify({
      catalog_id: catalogId,
    }),
  });
}

export async function openCatalogPath(catalogPath: string): Promise<InitResponse> {
  return requestJson<InitResponse>("/api/catalogs/open-path", {
    method: "POST",
    body: JSON.stringify({
      catalog_path: catalogPath,
    }),
  });
}

export async function importFolder(catalogId: string, folderPath: string): Promise<InitResponse> {
  return requestJson<InitResponse>(`/api/catalogs/${encodeURIComponent(catalogId)}/import-folder`, {
    method: "POST",
    body: JSON.stringify({
      folder_path: folderPath,
    }),
  });
}

export async function updateSampleMetadata(
  sample: Pick<SampleMetadata, "sample_id">,
  patch: MetadataPatch,
): Promise<ProjectMetadata> {
  return requestJson<ProjectMetadata>("/api/metadata/update", {
    method: "POST",
    body: JSON.stringify({
      sample_id: sample.sample_id,
      patch,
    }),
  });
}

export async function batchUpdateSamples(
  sampleIds: string[],
  patch: MetadataPatch,
): Promise<BatchMetadataResponse> {
  return requestJson<BatchMetadataResponse>("/api/metadata/batch", {
    method: "POST",
    body: JSON.stringify({
      sample_ids: sampleIds,
      patch,
    }),
  });
}

export async function batchTag(
  sampleIds: string[],
  tagPath: string,
  action: "add" | "remove",
): Promise<BatchMetadataResponse> {
  return requestJson<BatchMetadataResponse>("/api/samples/batch-tag", {
    method: "POST",
    body: JSON.stringify({
      sample_ids: sampleIds,
      tag_path: tagPath,
      action,
    }),
  });
}

export async function moveFolder(
  sourceFolder: string,
  targetFolder: string,
): Promise<ProjectMetadata> {
  return requestJson<ProjectMetadata>("/api/samples/move-folder", {
    method: "POST",
    body: JSON.stringify({
      source_folder: sourceFolder,
      target_folder: targetFolder,
    }),
  });
}

export async function upsertTag(
  tagPath: string,
  label: string,
): Promise<ProjectMetadata> {
  return requestJson<ProjectMetadata>("/api/tags/upsert", {
    method: "POST",
    body: JSON.stringify({
      tag_path: tagPath,
      label,
    }),
  });
}

export async function updateTag(
  tagPath: string,
  label?: string,
): Promise<ProjectMetadata> {
  return requestJson<ProjectMetadata>("/api/tags/update", {
    method: "POST",
    body: JSON.stringify({
      tag_path: tagPath,
      label,
    }),
  });
}

export async function deleteTag(tagPath: string): Promise<ProjectMetadata> {
  return requestJson<ProjectMetadata>("/api/tags/delete", {
    method: "POST",
    body: JSON.stringify({
      tag_path: tagPath,
    }),
  });
}

export async function renameTagPath(oldTagPath: string, newTagPath: string): Promise<ProjectMetadata> {
  return requestJson<ProjectMetadata>("/api/tags/rename-path", {
    method: "POST",
    body: JSON.stringify({
      old_tag_path: oldTagPath,
      new_tag_path: newTagPath,
    }),
  });
}

export async function backupMetadata(): Promise<{ backup_file: string }> {
  return requestJson<{ backup_file: string }>("/api/metadata/backup", {
    method: "POST",
  });
}

export function imageUrl(sampleId: string): string {
  return `${API_BASE_URL}/api/images/${encodeURIComponent(sampleId)}`;
}

export function exportUrl(params: URLSearchParams): string {
  return `${API_BASE_URL}/api/metadata/export?${params.toString()}`;
}

async function requestJson<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
