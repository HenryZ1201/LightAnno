export type SampleStatus = "unlabeled" | "labeled";
export type LayoutType = "unlabeled" | "single" | "dual" | "triple";

export interface TagNode {
  label: string;
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
  flagged: boolean;
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
  flagged?: boolean;
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

export interface OperationResult {
  sample_id: string | null;
  sample_path: string | null;
  ok: boolean;
  message: string;
}

export interface BatchMetadataResponse {
  results: OperationResult[];
  metadata: ProjectMetadata;
}

export interface ContextMenuItem {
  label: string;
  action?: () => void;
  disabled?: boolean;
  separator?: boolean;
}

export interface FlatTag {
  path: string;
  label: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
}

export interface FlatFolder {
  path: string;
  name: string;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  sampleCount: number;
}
