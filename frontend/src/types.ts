export type SampleStatus = "unlabeled" | "labeled" | "flagged";
export type LayoutType = "unlabeled" | "single" | "dual" | "triple";

export interface TagNode {
  label: string;
  color?: string | null;
  children: Record<string, TagNode>;
}

export interface SampleMetadata {
  sample_id: string;
  sample_path: string;
  image_path: string;
  text_info: string | null;
  class_status: SampleStatus;
  layout_type: LayoutType;
  boundaries: [number, number];
  tags: string[];
  archived: boolean;
  trashed: boolean;
  time_updated: string;
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
  class_status?: SampleStatus;
  layout_type?: LayoutType;
  boundaries?: [number, number];
  tags?: string[];
  text_info?: string | null;
  archived?: boolean;
  trashed?: boolean;
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
