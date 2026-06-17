from typing import Annotated

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.models import (
    BackupResponse,
    BatchMetadataRequest,
    BatchMetadataResponse,
    BatchTagRequest,
    CatalogCreateRequest,
    CatalogImportRequest,
    CatalogOpenRequest,
    CatalogOpenPathRequest,
    CatalogsResponse,
    DeleteTagRequest,
    ExportResponse,
    InitResponse,
    MetadataUpdateRequest,
    MoveFolderRequest,
    MoveRequest,
    ProjectMetadata,
    RenameTagPathRequest,
    UpdateTagRequest,
    UpsertTagRequest,
)
from app.services.catalogs import CatalogService
from app.services.metadata import MetadataService

settings = get_settings()
catalog_service = CatalogService(
    default_dataset_root=settings.dataset_root,
    workspace_root=settings.workspace_root,
)


def metadata_service() -> MetadataService:
    return catalog_service.active_service()

app = FastAPI(
    title="LightAnno API",
    description="Local-first multimodal UI layout annotation backend.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "lightanno-backend"}


@app.get("/api/catalogs", response_model=CatalogsResponse)
async def list_catalogs() -> CatalogsResponse:
    index = catalog_service.list_catalogs()
    return CatalogsResponse(
        active_catalog_id=index.active_catalog_id,
        catalogs=list(index.catalogs.values()),
    )


@app.post("/api/catalogs", response_model=InitResponse)
async def create_catalog(request: CatalogCreateRequest) -> InitResponse:
    _, metadata = catalog_service.create_catalog(request.name, request.dataset_root)
    return InitResponse(metadata=metadata, samples=list(metadata.samples.values()), warnings=[])


@app.post("/api/catalogs/open", response_model=InitResponse)
async def open_catalog(request: CatalogOpenRequest) -> InitResponse:
    _, metadata = catalog_service.open_catalog(request.catalog_id)
    return InitResponse(metadata=metadata, samples=list(metadata.samples.values()), warnings=[])


@app.post("/api/catalogs/open-path", response_model=InitResponse)
async def open_catalog_path(request: CatalogOpenPathRequest) -> InitResponse:
    _, metadata = catalog_service.open_catalog_path(request.catalog_path)
    return InitResponse(metadata=metadata, samples=list(metadata.samples.values()), warnings=[])


@app.post("/api/catalogs/{catalog_id}/import-folder", response_model=InitResponse)
async def import_folder(catalog_id: str, request: CatalogImportRequest) -> InitResponse:
    metadata, warnings = catalog_service.import_folder(catalog_id, request.folder_path)
    return InitResponse(metadata=metadata, samples=list(metadata.samples.values()), warnings=warnings)


@app.get("/api/workspace/init", response_model=InitResponse)
async def initialize_workspace() -> InitResponse:
    metadata, warnings = metadata_service().initialize_workspace()
    return InitResponse(
        metadata=metadata,
        samples=list(metadata.samples.values()),
        warnings=warnings,
    )


@app.get("/api/images/{sample_id}")
async def get_image(sample_id: str) -> FileResponse:
    image_path = metadata_service().resolve_image_path(sample_id)
    return FileResponse(image_path)


@app.get("/api/metadata", response_model=ProjectMetadata)
async def get_metadata() -> ProjectMetadata:
    return metadata_service().load()


@app.post("/api/metadata/update", response_model=ProjectMetadata)
async def update_metadata(request: MetadataUpdateRequest) -> ProjectMetadata:
    return metadata_service().update_sample(
        request.patch,
        sample_id=request.sample_id,
        sample_path=request.sample_path,
    )


@app.post("/api/metadata/batch", response_model=BatchMetadataResponse)
async def batch_update_metadata(request: BatchMetadataRequest) -> BatchMetadataResponse:
    return metadata_service().batch_update(request)


@app.post("/api/samples/batch-tag", response_model=BatchMetadataResponse)
async def batch_tag(request: BatchTagRequest) -> BatchMetadataResponse:
    return metadata_service().batch_tag(
        sample_ids=request.sample_ids,
        tag_path=request.tag_path,
        action=request.action,
    )


@app.post("/api/workspace/move", response_model=ProjectMetadata)
async def move_sample(request: MoveRequest) -> ProjectMetadata:
    return metadata_service().move_sample(
        target=request.target,
        sample_id=request.sample_id,
        sample_path=request.sample_path,
    )


@app.post("/api/tags/delete", response_model=ProjectMetadata)
async def delete_tag(request: DeleteTagRequest) -> ProjectMetadata:
    return metadata_service().delete_tag_cascade(request.tag_path)


@app.post("/api/tags/upsert", response_model=ProjectMetadata)
async def upsert_tag(request: UpsertTagRequest) -> ProjectMetadata:
    return metadata_service().upsert_tag(request.tag_path, request.label)


@app.post("/api/tags/update", response_model=ProjectMetadata)
async def update_tag(request: UpdateTagRequest) -> ProjectMetadata:
    return metadata_service().update_tag(request.tag_path, request.label)


@app.post("/api/tags/rename-path", response_model=ProjectMetadata)
async def rename_tag_path(request: RenameTagPathRequest) -> ProjectMetadata:
    return metadata_service().rename_tag_path(request.old_tag_path, request.new_tag_path)


@app.post("/api/samples/move-folder", response_model=ProjectMetadata)
async def move_folder(request: MoveFolderRequest) -> ProjectMetadata:
    return metadata_service().move_folder(request.source_folder, request.target_folder)


@app.post("/api/metadata/backup", response_model=BackupResponse)
async def backup_metadata() -> BackupResponse:
    backup_file = metadata_service().create_timestamped_backup()
    return BackupResponse(backup_file=backup_file.name)


@app.get("/api/metadata/export", response_model=ExportResponse)
async def export_metadata(
    class_status: str | None = None,
    status: str | None = None,
    layout_type: str | None = None,
    tags: Annotated[list[str], Query()] = [],
    search: str | None = None,
    missing_cue_data: bool | None = None,
    include_archived: bool = False,
    include_trashed: bool = False,
) -> ExportResponse:
    return metadata_service().export_metadata(
        class_status=class_status or status,
        layout_type=layout_type,
        tags=tags,
        search=search,
        missing_cue_data=missing_cue_data,
        include_archived=include_archived,
        include_trashed=include_trashed,
    )
