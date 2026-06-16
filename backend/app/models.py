from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import AliasChoices, BaseModel, Field, field_validator, model_validator

SampleStatus = Literal["unlabeled", "labeled"]
LayoutType = Literal["unlabeled", "single", "dual", "triple"]
WarningCode = Literal[
    "EMPTY_FOLDER",
    "MISSING_IMAGE",
    "MULTIPLE_IMAGES",
    "HAS_SUBDIRECTORY",
    "UNSUPPORTED_IMAGE_FORMAT",
    "INVALID_IMAGE_FILE",
    "UNREADABLE_IMAGE",
    "MISSING_CUE_DATA",
    "MULTIPLE_CUE_DATA_FILES",
]
MoveTarget = Literal["archive", "trash", "restore"]


def metadata_timestamp() -> str:
    return datetime.now().strftime("%Y-%m-%d-%H-%M-%S")


class TagNode(BaseModel):
    label: str
    children: dict[str, "TagNode"] = Field(default_factory=dict)


class SampleMetadata(BaseModel):
    sample_id: str
    sample_path: str
    image_path: str = Field(validation_alias=AliasChoices("image_path", "image_file"))
    text_info: str | None = Field(default=None, validation_alias=AliasChoices("text_info", "cue_data_file"))
    class_status: SampleStatus = Field(
        default="unlabeled",
        validation_alias=AliasChoices("class_status", "status"),
    )
    layout_type: LayoutType = "unlabeled"
    boundaries: list[float] = Field(default_factory=lambda: [0, 0], min_length=2, max_length=2)
    tags: list[str] = Field(default_factory=list)
    archived: bool = False
    trashed: bool = False
    flagged: bool = False
    time_updated: str = Field(default_factory=metadata_timestamp)

    @field_validator("boundaries")
    @classmethod
    def normalize_boundaries(cls, value: list[float]) -> list[float]:
        return [round(float(item), 4) for item in value]

    @model_validator(mode="after")
    def validate_layout_boundaries(self) -> "SampleMetadata":
        x1, x2 = self.boundaries

        if self.layout_type in {"unlabeled", "single"} and self.boundaries != [0, 0]:
            raise ValueError(f"{self.layout_type} layout requires boundaries [0, 0]")

        if self.layout_type == "dual" and not (0 < x1 < 1 and x2 == 0):
            raise ValueError("dual layout requires boundaries [x1_norm, 0] with 0 < x1_norm < 1")

        if self.layout_type == "triple" and not (0 < x1 < x2 < 1 and x1 <= x2 - 0.02):
            raise ValueError(
                "triple layout requires boundaries [x1_norm, x2_norm] with "
                "0 < x1_norm < x2_norm < 1 and x1_norm <= x2_norm - 0.02"
            )

        return self


class ProjectMetadata(BaseModel):
    project_name: str = "multimodal_layout_v3"
    dataset_root: str | None = None
    tag_tree: dict[str, TagNode] = Field(default_factory=dict)
    samples: dict[str, SampleMetadata] = Field(default_factory=dict)


class SampleWarning(BaseModel):
    sample_path: str
    code: WarningCode
    level: Literal["warning", "error"] = "warning"
    message: str
    details: dict[str, Any] = Field(default_factory=dict)


class InitResponse(BaseModel):
    metadata: ProjectMetadata
    samples: list[SampleMetadata]
    warnings: list[SampleWarning]


class MetadataPatch(BaseModel):
    class_status: SampleStatus | None = Field(
        default=None,
        validation_alias=AliasChoices("class_status", "status"),
    )
    layout_type: LayoutType | None = None
    boundaries: list[float] | None = Field(default=None, min_length=2, max_length=2)
    tags: list[str] | None = None
    text_info: str | None = Field(default=None, validation_alias=AliasChoices("text_info", "cue_data_file"))
    archived: bool | None = None
    trashed: bool | None = None
    flagged: bool | None = None


class MetadataUpdateRequest(BaseModel):
    sample_id: str | None = None
    sample_path: str | None = None
    patch: MetadataPatch

    @model_validator(mode="after")
    def require_identifier(self) -> "MetadataUpdateRequest":
        if not self.sample_id and not self.sample_path:
            raise ValueError("sample_id or sample_path is required")
        return self


class BatchMetadataRequest(BaseModel):
    sample_ids: list[str] = Field(default_factory=list)
    sample_paths: list[str] = Field(default_factory=list)
    patch: MetadataPatch

    @model_validator(mode="after")
    def require_targets(self) -> "BatchMetadataRequest":
        if not self.sample_ids and not self.sample_paths:
            raise ValueError("sample_ids or sample_paths is required")
        return self


class OperationResult(BaseModel):
    sample_id: str | None = None
    sample_path: str | None = None
    ok: bool
    message: str


class BatchMetadataResponse(BaseModel):
    results: list[OperationResult]
    metadata: ProjectMetadata


class MoveRequest(BaseModel):
    sample_id: str | None = None
    sample_path: str | None = None
    target: MoveTarget

    @model_validator(mode="after")
    def require_identifier(self) -> "MoveRequest":
        if not self.sample_id and not self.sample_path:
            raise ValueError("sample_id or sample_path is required")
        return self


class BackupResponse(BaseModel):
    backup_file: str


class ExportResponse(BaseModel):
    exported_at: str
    metadata: ProjectMetadata


class DeleteTagRequest(BaseModel):
    tag_path: str


class RenameTagPathRequest(BaseModel):
    old_tag_path: str
    new_tag_path: str


class UpsertTagRequest(BaseModel):
    tag_path: str
    label: str


class UpdateTagRequest(BaseModel):
    tag_path: str
    label: str | None = None


class CatalogSummary(BaseModel):
    catalog_id: str
    name: str
    dataset_root: str
    metadata_file: str
    sample_count: int = 0
    updated_at: str | None = None


class CatalogIndex(BaseModel):
    active_catalog_id: str | None = None
    catalogs: dict[str, CatalogSummary] = Field(default_factory=dict)


class CatalogsResponse(BaseModel):
    active_catalog_id: str | None
    catalogs: list[CatalogSummary]


class CatalogCreateRequest(BaseModel):
    name: str
    dataset_root: str | None = None


class CatalogOpenRequest(BaseModel):
    catalog_id: str


class CatalogOpenPathRequest(BaseModel):
    catalog_path: str


class CatalogImportRequest(BaseModel):
    folder_path: str
