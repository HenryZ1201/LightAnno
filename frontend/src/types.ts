export type SampleStatus = "unlabeled" | "labeled" | "flagged";
export type LayoutType = "single" | "dual" | "triple";

export interface TagNode {
  label: string;
  color?: string | null;
  children: Record<string, TagNode>;
}

export interface SampleMetadata {
  sample_id: string;
  sample_path: string;
  image_file: string;
  cue_data_file: string | null;
  status: SampleStatus;
  layout_type: LayoutType;
  boundaries: [number, number];
  tags: string[];
  archived: boolean;
  trashed: boolean;
}

export interface ProjectMetadata {
  project_name: string;
  dataset_root?: string | null;
  tag_tree: Record<string, TagNode>;
  samples: Record<string, SampleMetadata>;
}

export interface SampleWarning {
  sample_path: string;
  code: string;
  level: "warning" | "error";
  message: string;
  details: Record<string, unknown>;
}

export interface InitResponse {
  metadata: ProjectMetadata;
  samples: SampleMetadata[];
  warnings: SampleWarning[];
}

export interface MetadataPatch {
  status?: SampleStatus;
  layout_type?: LayoutType;
  boundaries?: [number, number];
  tags?: string[];
  cue_data_file?: string | null;
  archived?: boolean;
  trashed?: boolean;
}

export interface BatchMetadataResponse {
  results: Array<{
    sample_id: string | null;
    sample_path: string | null;
    ok: boolean;
    message: string;
  }>;
  metadata: ProjectMetadata;
}

export interface CatalogSummary {
  catalog_id: string;
  name: string;
  dataset_root: string;
  metadata_file: string;
  sample_count: number;
  updated_at: string | null;
}

export interface CatalogsResponse {
  active_catalog_id: string | null;
  catalogs: CatalogSummary[];
}
