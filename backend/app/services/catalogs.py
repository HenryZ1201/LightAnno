from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError

from app.models import CatalogIndex, CatalogSummary, ProjectMetadata, SampleWarning
from app.services.metadata import MetadataService


class CatalogService:
    def __init__(self, default_dataset_root: Path, workspace_root: Path) -> None:
        self.default_dataset_root = default_dataset_root
        self.workspace_root = workspace_root
        self.catalogs_root = workspace_root / "catalogs"
        self.index_path = self.catalogs_root / "catalogs.json"

    def list_catalogs(self) -> CatalogIndex:
        index = self._load_index()
        changed = False
        for catalog_id, catalog in list(index.catalogs.items()):
            self._ensure_named_metadata(catalog_id)
            metadata_path = self._metadata_path(catalog_id)
            if metadata_path.exists():
                metadata = self._load_metadata_file(metadata_path)
                catalog.metadata_file = str(metadata_path)
                catalog.sample_count = len(metadata.samples)
                catalog.updated_at = self._file_mtime(metadata_path)
                changed = True
        if changed:
            self._save_index(index)
        return index

    def create_catalog(self, name: str, dataset_root: str | None = None) -> tuple[CatalogSummary, ProjectMetadata]:
        index = self._load_index()
        catalog_id = self._unique_catalog_id(name, index)
        catalog_dir = self._catalog_dir(catalog_id)
        catalog_dir.mkdir(parents=True, exist_ok=True)

        resolved_dataset_root = self._resolve_import_path(dataset_root) if dataset_root else self.default_dataset_root
        metadata = ProjectMetadata(project_name=name, dataset_root=str(resolved_dataset_root), samples={})
        self._service(catalog_id, resolved_dataset_root).save(metadata)

        summary = CatalogSummary(
            catalog_id=catalog_id,
            name=name,
            dataset_root=str(resolved_dataset_root),
            metadata_file=str(self._metadata_path(catalog_id)),
            sample_count=0,
            updated_at=datetime.now(timezone.utc).isoformat(),
        )
        index.catalogs[catalog_id] = summary
        index.active_catalog_id = catalog_id
        self._save_index(index)
        return summary, metadata

    def open_catalog(self, catalog_id: str) -> tuple[CatalogSummary, ProjectMetadata]:
        index = self._load_index()
        summary = index.catalogs.get(catalog_id)
        if summary is None:
            raise HTTPException(status_code=404, detail="Catalog not found")
        self._ensure_named_metadata(catalog_id)
        index.active_catalog_id = catalog_id
        self._save_index(index)
        return summary, self.active_service().load()

    def open_catalog_path(self, catalog_path: str) -> tuple[CatalogSummary, ProjectMetadata]:
        path = self._resolve_catalog_path(catalog_path)
        metadata_path = path if path.suffix == ".json" else self._metadata_path_for_dir(path)
        if not metadata_path.exists():
            raise HTTPException(status_code=404, detail=f"Catalog JSON not found: {metadata_path}")

        metadata = self._load_metadata_file(metadata_path)
        index = self._load_index()
        existing_catalog_id = path.parent.name if path.suffix == ".json" else path.name
        if existing_catalog_id in index.catalogs and self._catalog_dir(existing_catalog_id).resolve() == metadata_path.parent.resolve():
            index.active_catalog_id = existing_catalog_id
            self._save_index(index)
            return index.catalogs[existing_catalog_id], metadata

        catalog_id = self._unique_catalog_id(path.stem if path.name == "metadata.json" else path.name, index)
        catalog_dir = self._catalog_dir(catalog_id)
        catalog_dir.mkdir(parents=True, exist_ok=True)
        target_metadata_path = self._metadata_path(catalog_id)

        if metadata_path.resolve() != target_metadata_path.resolve():
            shutil.copy2(metadata_path, target_metadata_path)

        dataset_root = Path(metadata.dataset_root).resolve() if metadata.dataset_root else self.default_dataset_root
        summary = CatalogSummary(
            catalog_id=catalog_id,
            name=metadata.project_name or catalog_id,
            dataset_root=str(dataset_root),
            metadata_file=str(target_metadata_path),
            sample_count=len(metadata.samples),
            updated_at=self._file_mtime(target_metadata_path),
        )
        index.catalogs[catalog_id] = summary
        index.active_catalog_id = catalog_id
        self._save_index(index)
        return summary, metadata

    def import_folder(self, catalog_id: str, folder_path: str) -> tuple[ProjectMetadata, list[SampleWarning]]:
        index = self._load_index()
        summary = index.catalogs.get(catalog_id)
        if summary is None:
            raise HTTPException(status_code=404, detail="Catalog not found")

        folder = self._resolve_import_path(folder_path)
        service = self._service(catalog_id, folder)
        metadata, warnings = service.initialize_workspace()
        metadata.dataset_root = str(folder)
        service.save(metadata)

        summary.dataset_root = str(folder)
        summary.sample_count = len(metadata.samples)
        summary.updated_at = datetime.now(timezone.utc).isoformat()
        index.catalogs[catalog_id] = summary
        index.active_catalog_id = catalog_id
        self._save_index(index)
        return metadata, warnings

    def active_service(self) -> MetadataService:
        index = self._load_index()
        if index.active_catalog_id is None:
            self.create_catalog("Default Catalog", str(self.default_dataset_root))
            index = self._load_index()

        assert index.active_catalog_id is not None
        summary = index.catalogs[index.active_catalog_id]
        self._ensure_named_metadata(index.active_catalog_id)
        return self._service(index.active_catalog_id, Path(summary.dataset_root))

    def active_catalog_id(self) -> str | None:
        return self._load_index().active_catalog_id

    def _load_index(self) -> CatalogIndex:
        self.catalogs_root.mkdir(parents=True, exist_ok=True)
        if not self.index_path.exists():
            index = CatalogIndex()
            self._bootstrap_default_catalog(index)
            self._save_index(index)
            return index

        try:
            index = CatalogIndex.model_validate(
                json.loads(self.index_path.read_text(encoding="utf-8"))
            )
        except (json.JSONDecodeError, ValidationError) as error:
            raise HTTPException(status_code=500, detail=f"Invalid catalogs index: {error}") from error

        if not index.catalogs:
            self._bootstrap_default_catalog(index)
            self._save_index(index)
        return index

    def _save_index(self, index: CatalogIndex) -> None:
        self.catalogs_root.mkdir(parents=True, exist_ok=True)
        tmp_path = self.index_path.with_suffix(".json.tmp")
        tmp_path.write_text(
            json.dumps(index.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        tmp_path.replace(self.index_path)

    def _bootstrap_default_catalog(self, index: CatalogIndex) -> None:
        catalog_id = "default"
        catalog_dir = self._catalog_dir(catalog_id)
        catalog_dir.mkdir(parents=True, exist_ok=True)

        metadata_path = self._metadata_path(catalog_id)
        legacy_metadata = self.workspace_root / "metadata.json"
        legacy_catalog_metadata = catalog_dir / "metadata.json"
        if legacy_metadata.exists() and not metadata_path.exists():
            shutil.copy2(legacy_metadata, metadata_path)
        elif legacy_catalog_metadata.exists() and not metadata_path.exists():
            shutil.copy2(legacy_catalog_metadata, metadata_path)
        elif not metadata_path.exists():
            self._service(catalog_id, self.default_dataset_root).save(
                ProjectMetadata(
                    project_name="Default Catalog",
                    dataset_root=str(self.default_dataset_root),
                )
            )

        metadata = self._load_metadata_file(metadata_path)
        metadata.dataset_root = metadata.dataset_root or str(self.default_dataset_root)
        metadata_path.write_text(
            json.dumps(metadata.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

        index.catalogs[catalog_id] = CatalogSummary(
            catalog_id=catalog_id,
            name=metadata.project_name or "Default Catalog",
            dataset_root=metadata.dataset_root or str(self.default_dataset_root),
            metadata_file=str(metadata_path),
            sample_count=len(metadata.samples),
            updated_at=self._file_mtime(metadata_path),
        )
        index.active_catalog_id = catalog_id

    def _service(self, catalog_id: str, dataset_root: Path) -> MetadataService:
        return MetadataService(
            dataset_root=dataset_root,
            workspace_root=self._catalog_dir(catalog_id),
            metadata_filename=f"{catalog_id}.json",
        )

    def _catalog_dir(self, catalog_id: str) -> Path:
        return self.catalogs_root / catalog_id

    def _metadata_path(self, catalog_id: str) -> Path:
        return self._catalog_dir(catalog_id) / f"{catalog_id}.json"

    def _metadata_path_for_dir(self, catalog_dir: Path) -> Path:
        named_metadata = catalog_dir / f"{catalog_dir.name}.json"
        legacy_metadata = catalog_dir / "metadata.json"
        if named_metadata.exists() or not legacy_metadata.exists():
            return named_metadata
        return legacy_metadata

    def _ensure_named_metadata(self, catalog_id: str) -> None:
        metadata_path = self._metadata_path(catalog_id)
        legacy_metadata = self._catalog_dir(catalog_id) / "metadata.json"
        if not metadata_path.exists() and legacy_metadata.exists():
            shutil.copy2(legacy_metadata, metadata_path)

    def _load_metadata_file(self, path: Path) -> ProjectMetadata:
        if not path.exists():
            return ProjectMetadata()
        return ProjectMetadata.model_validate(json.loads(path.read_text(encoding="utf-8")))

    def _resolve_import_path(self, folder_path: str | None) -> Path:
        if not folder_path:
            return self.default_dataset_root.resolve()

        raw = Path(folder_path).expanduser()
        candidates = [raw] if raw.is_absolute() else [self.workspace_root / raw, self.default_dataset_root / raw]
        for candidate in candidates:
            resolved = candidate.resolve()
            if resolved.is_dir():
                return resolved

        raise HTTPException(status_code=404, detail=f"Folder not found: {folder_path}")

    def _resolve_catalog_path(self, catalog_path: str) -> Path:
        raw = Path(catalog_path).expanduser()
        candidates = [raw] if raw.is_absolute() else [self.workspace_root / raw, self.catalogs_root / raw]
        for candidate in candidates:
            resolved = candidate.resolve()
            if resolved.exists():
                return resolved
        raise HTTPException(status_code=404, detail=f"Catalog path not found: {catalog_path}")

    def _unique_catalog_id(self, name: str, index: CatalogIndex) -> str:
        slug = re.sub(r"[^a-zA-Z0-9_-]+", "-", name.strip().lower()).strip("-") or "catalog"
        candidate = slug
        suffix = 2
        while candidate in index.catalogs:
            candidate = f"{slug}-{suffix}"
            suffix += 1
        return candidate

    def _file_mtime(self, path: Path) -> str | None:
        if not path.exists():
            return None
        return datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc).isoformat()
