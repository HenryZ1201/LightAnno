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

export interface InitProgress {
  type: "progress" | "complete" | "error";
  current?: number;
  total?: number;
  current_folder?: string;
  samples?: SampleMetadata[];
  warnings?: any[];
  metadata?: ProjectMetadata;
  message?: string;
}

export function initializeWorkspaceWithProgress(
  onProgress: (progress: InitProgress) => void,
): Promise<InitResponse> {
  return new Promise((resolve, reject) => {
    const response = fetch(`${API_BASE_URL}/api/workspace/init`);

    response.then(async (res) => {
      if (!res.ok) {
        reject(new Error(`Init failed: ${res.status}`));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        reject(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const progress = JSON.parse(data) as InitProgress;
              onProgress(progress);

              if (progress.type === "complete") {
                resolve({
                  metadata: progress.metadata!,
                  samples: progress.samples ?? [],
                  warnings: progress.warnings ?? [],
                });
              } else if (progress.type === "error") {
                reject(new Error(progress.message));
              }
            } catch (e) {
              console.error("Failed to parse progress:", e);
            }
          }
        }
      }
    }).catch(reject);
  });
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

export interface ImportProgress {
  type: "progress" | "complete" | "error";
  current?: number;
  total?: number;
  current_folder?: string;
  samples?: SampleMetadata[];
  warnings?: any[];
  metadata?: ProjectMetadata;
  message?: string;
}

export function importFolderWithProgress(
  catalogId: string,
  folderPath: string,
  onProgress: (progress: ImportProgress) => void,
): Promise<InitResponse> {
  return new Promise((resolve, reject) => {
    const response = fetch(`${API_BASE_URL}/api/catalogs/${encodeURIComponent(catalogId)}/import-folder-stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        folder_path: folderPath,
      }),
    });

    response.then(async (res) => {
      if (!res.ok) {
        reject(new Error(`Import failed: ${res.status}`));
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        reject(new Error("No response body"));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const data = line.slice(6);
            try {
              const progress = JSON.parse(data) as ImportProgress;
              onProgress(progress);

              if (progress.type === "complete") {
                resolve({
                  metadata: progress.metadata!,
                  samples: progress.samples ?? [],
                  warnings: progress.warnings!,
                });
              } else if (progress.type === "error") {
                reject(new Error(progress.message));
              }
            } catch (e) {
              console.error("Failed to parse progress:", e);
            }
          }
        }
      }
    }).catch(reject);
  });
}

export async function updateSampleMetadata(
  sample: Pick<SampleMetadata, "sample_id">,
  patch: MetadataPatch,
): Promise<SampleMetadata> {
  return requestJson<SampleMetadata>("/api/metadata/update", {
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
