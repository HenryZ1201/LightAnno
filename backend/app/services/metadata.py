from __future__ import annotations

import json
import os
import shutil
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from fastapi import HTTPException
from pydantic import ValidationError

from app.models import (
    BatchMetadataRequest,
    BatchMetadataResponse,
    ExportResponse,
    MetadataPatch,
    OperationResult,
    ProjectMetadata,
    SampleMetadata,
    SampleWarning,
    TagNode,
    metadata_timestamp,
)
from app.services.paths import relative_posix, safe_join
from app.services.scanner import scan_dataset


class MetadataService:
    def __init__(
        self,
        dataset_root: Path,
        workspace_root: Path,
        metadata_filename: str = "metadata.json",
    ) -> None:
        self.dataset_root = dataset_root
        self.workspace_root = workspace_root
        self.metadata_path = workspace_root / metadata_filename
        self.backup_path = workspace_root / f"{self.metadata_path.stem}.backup.json"
        self.exports_root = workspace_root / "exports"
        self._metadata_cache: ProjectMetadata | None = None
        self._metadata_cache_mtime_ns: int | None = None
        self._session_backup_created = False

    def load(self) -> ProjectMetadata:
        if not self.metadata_path.exists():
            return ProjectMetadata()

        try:
            mtime_ns = self.metadata_path.stat().st_mtime_ns
            if self._metadata_cache is not None and self._metadata_cache_mtime_ns == mtime_ns:
                return self._metadata_cache
            data = json.loads(self.metadata_path.read_text(encoding="utf-8"))
            metadata = ProjectMetadata.model_validate(data)
            self._sync_class_status_with_tags(metadata)
            self._metadata_cache = metadata
            self._metadata_cache_mtime_ns = mtime_ns
            return metadata
        except (json.JSONDecodeError, ValidationError) as error:
            raise HTTPException(status_code=500, detail=f"Invalid metadata.json: {error}") from error

    def save(self, metadata: ProjectMetadata) -> None:
        self._sync_class_status_with_tags(metadata)
        self.workspace_root.mkdir(parents=True, exist_ok=True)

        if self.metadata_path.exists() and not self._session_backup_created:
            shutil.copy2(self.metadata_path, self.backup_path)
            self._session_backup_created = True

        tmp_path = self.metadata_path.with_suffix(".json.tmp")
        payload = metadata.model_dump(mode="json")
        tmp_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp_path, self.metadata_path)
        self._metadata_cache = metadata
        self._metadata_cache_mtime_ns = self.metadata_path.stat().st_mtime_ns

    def _sync_class_status_with_tags(self, metadata: ProjectMetadata) -> None:
        for sample in metadata.samples.values():
            if sample.tags and sample.class_status != "labeled":
                sample.class_status = "labeled"
            elif not sample.tags and sample.class_status == "labeled":
                sample.class_status = "unlabeled"

    def initialize_workspace_with_progress(self):
        """Initialize workspace and yield progress updates."""
        from app.services.scanner import scan_dataset_with_progress

        existing = self.load()

        # Use the generator to get progress updates and final results
        generator = scan_dataset_with_progress(self.dataset_root)

        while True:
            try:
                progress = next(generator)
                yield progress
            except StopIteration as e:
                scanned_samples, warnings = e.value
                break

        merged = self._merge_scanned_samples(existing, scanned_samples)
        merged.dataset_root = str(self.dataset_root)
        self.save(merged)

        yield {
            "type": "complete",
            "samples": [],
            "warnings": warnings,
            "metadata": merged,
        }

    def initialize_workspace(self) -> tuple[ProjectMetadata, list[SampleWarning]]:
        existing = self.load()
        scanned_samples, warnings = scan_dataset(self.dataset_root)
        merged = self._merge_scanned_samples(existing, scanned_samples)
        merged.dataset_root = str(self.dataset_root)
        self.save(merged)
        return merged, warnings

    def update_sample(
        self,
        patch: MetadataPatch,
        sample_id: str | None = None,
        sample_path: str | None = None,
    ) -> SampleMetadata:
        metadata = self.load()
        target_id = self.find_sample_id(metadata, sample_id=sample_id, sample_path=sample_path)
        try:
            metadata.samples[target_id] = self._apply_patch(metadata.samples[target_id], patch)
        except ValueError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        self.save(metadata)
        return metadata.samples[target_id]

    def batch_update(self, request: BatchMetadataRequest) -> BatchMetadataResponse:
        metadata = self.load()
        results: list[OperationResult] = []
        target_ids = self._resolve_many(metadata, request.sample_ids, request.sample_paths)

        for target_id in target_ids:
            sample = metadata.samples.get(target_id)
            if sample is None:
                results.append(OperationResult(sample_id=target_id, ok=False, message="Sample not found"))
                continue

            try:
                metadata.samples[target_id] = self._apply_patch(sample, request.patch)
                results.append(
                    OperationResult(
                        sample_id=target_id,
                        sample_path=sample.sample_path,
                        ok=True,
                        message="Updated",
                    )
                )
            except ValueError as error:
                results.append(
                    OperationResult(
                        sample_id=target_id,
                        sample_path=sample.sample_path,
                        ok=False,
                        message=str(error),
                    )
                )

        self.save(metadata)
        return BatchMetadataResponse(results=results, metadata=metadata)

    def batch_tag(
        self,
        sample_ids: list[str],
        tag_path: str,
        action: str,
    ) -> BatchMetadataResponse:
        """批量添加或删除标签"""
        metadata = self.load()
        results: list[OperationResult] = []

        for sample_id in sample_ids:
            sample = metadata.samples.get(sample_id)
            if sample is None:
                results.append(OperationResult(sample_id=sample_id, ok=False, message="Sample not found"))
                continue

            try:
                if action == "add":
                    if tag_path not in sample.tags:
                        sample.tags.append(tag_path)
                        sample.tags.sort()
                elif action == "remove":
                    if tag_path in sample.tags:
                        sample.tags.remove(tag_path)

                # 自动更新类别状态
                self._sync_class_status_with_tags_for_sample(sample)
                sample.time_updated = metadata_timestamp()
                metadata.samples[sample_id] = sample

                results.append(
                    OperationResult(
                        sample_id=sample_id,
                        sample_path=sample.sample_path,
                        ok=True,
                        message="Updated",
                    )
                )
            except Exception as error:
                results.append(
                    OperationResult(
                        sample_id=sample_id,
                        sample_path=sample.sample_path,
                        ok=False,
                        message=str(error),
                    )
                )

        self.save(metadata)
        return BatchMetadataResponse(results=results, metadata=metadata)

    def _sync_class_status_with_tags_for_sample(self, sample: SampleMetadata) -> None:
        """根据样本的标签同步类别状态"""
        if sample.tags and sample.class_status != "labeled":
            sample.class_status = "labeled"
        elif not sample.tags and sample.class_status == "labeled":
            sample.class_status = "unlabeled"

    def move_sample(
        self,
        target: str,
        sample_id: str | None = None,
        sample_path: str | None = None,
    ) -> ProjectMetadata:
        metadata = self.load()
        target_id = self.find_sample_id(metadata, sample_id=sample_id, sample_path=sample_path)
        sample = metadata.samples[target_id]

        source_dir = safe_join(self.dataset_root, sample.sample_path)
        destination_dir = self._move_destination(source_dir, sample.sample_path, target)

        if not source_dir.exists():
            raise HTTPException(status_code=404, detail=f"Sample folder not found: {sample.sample_path}")
        if destination_dir.exists():
            raise HTTPException(status_code=409, detail=f"Destination already exists: {destination_dir}")

        destination_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(source_dir), str(destination_dir))

        new_sample_path = relative_posix(destination_dir, self.dataset_root)
        image_name = Path(sample.image_path).name
        cue_name = Path(sample.text_info).name if sample.text_info else None

        sample.sample_path = new_sample_path
        sample.image_path = f"{new_sample_path}/{image_name}"
        sample.text_info = f"{new_sample_path}/{cue_name}" if cue_name else None
        sample.archived = target == "archive"
        sample.trashed = target == "trash"
        sample.time_updated = metadata_timestamp()

        if target == "restore":
            sample.archived = False
            sample.trashed = False

        metadata.samples[target_id] = SampleMetadata.model_validate(sample.model_dump())
        self.save(metadata)
        return metadata

    def delete_tag_cascade(self, tag_path: str) -> ProjectMetadata:
        metadata = self.load()
        self._delete_tag_from_tree(metadata.tag_tree, tag_path.split("/"))

        for sample_id, sample in metadata.samples.items():
            next_tags = [tag for tag in sample.tags if tag != tag_path and not tag.startswith(f"{tag_path}/")]
            if next_tags != sample.tags:
                sample.tags = next_tags
                sample.time_updated = metadata_timestamp()
                metadata.samples[sample_id] = sample

        self.save(metadata)
        return metadata

    def upsert_tag(self, tag_path: str, label: str) -> ProjectMetadata:
        metadata = self.load()
        parts = self._validate_tag_path(tag_path)
        parent = self._ensure_tag_parent(metadata.tag_tree, parts[:-1])
        existing = parent.get(parts[-1])
        parent[parts[-1]] = TagNode(
            label=label,
            children=existing.children if existing else {},
        )
        self.save(metadata)
        return metadata

    def update_tag(self, tag_path: str, label: str | None = None) -> ProjectMetadata:
        metadata = self.load()
        node = self._get_tag_node(metadata.tag_tree, self._validate_tag_path(tag_path))
        if label is not None:
            node.label = label
        self.save(metadata)
        return metadata

    def rename_tag_path(self, old_tag_path: str, new_tag_path: str) -> ProjectMetadata:
        metadata = self.load()
        old_parts = self._validate_tag_path(old_tag_path)
        new_parts = self._validate_tag_path(new_tag_path)
        node = self._pop_tag_node(metadata.tag_tree, old_parts)
        parent = self._ensure_tag_parent(metadata.tag_tree, new_parts[:-1])
        parent[new_parts[-1]] = node

        for sample_id, sample in metadata.samples.items():
            renamed_tags: list[str] = []
            for tag in sample.tags:
                if tag == old_tag_path:
                    renamed_tags.append(new_tag_path)
                elif tag.startswith(f"{old_tag_path}/"):
                    renamed_tags.append(tag.replace(old_tag_path, new_tag_path, 1))
                else:
                    renamed_tags.append(tag)
            if renamed_tags != sample.tags:
                sample.tags = renamed_tags
                sample.time_updated = metadata_timestamp()
                metadata.samples[sample_id] = sample

        self.save(metadata)
        return metadata

    def create_timestamped_backup(self) -> Path:
        metadata = self.load()
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        backup_file = self.workspace_root / f"{self.metadata_path.stem}.backup.{timestamp}.json"
        backup_file.parent.mkdir(parents=True, exist_ok=True)
        backup_file.write_text(
            json.dumps(metadata.model_dump(mode="json"), ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return backup_file

    def export_metadata(
        self,
        *,
        class_status: str | None = None,
        layout_type: str | None = None,
        tags: Iterable[str] = (),
        search: str | None = None,
        missing_cue_data: bool | None = None,
        include_archived: bool = False,
        include_trashed: bool = False,
    ) -> ExportResponse:
        metadata = self.load()
        tag_filters = set(tags)
        search_text = search.lower() if search else None
        filtered_samples: dict[str, SampleMetadata] = {}

        for sample_id, sample in metadata.samples.items():
            if not include_archived and sample.archived:
                continue
            if not include_trashed and sample.trashed:
                continue
            if class_status and sample.class_status != class_status:
                continue
            if layout_type and sample.layout_type != layout_type:
                continue
            if missing_cue_data is not None and (sample.text_info is None) != missing_cue_data:
                continue
            if tag_filters and not tag_filters.issubset(set(sample.tags)):
                continue
            if search_text and not self._sample_matches_search(sample, search_text):
                continue
            filtered_samples[sample_id] = sample

        exported_metadata = metadata.model_copy(update={"samples": filtered_samples})
        return ExportResponse(
            exported_at=datetime.now(timezone.utc).isoformat(),
            metadata=exported_metadata,
        )

    def find_sample_id(
        self,
        metadata: ProjectMetadata,
        sample_id: str | None = None,
        sample_path: str | None = None,
    ) -> str:
        if sample_id and sample_id in metadata.samples:
            return sample_id

        if sample_path:
            for candidate_id, sample in metadata.samples.items():
                if sample.sample_path == sample_path:
                    return candidate_id

        raise HTTPException(status_code=404, detail="Sample not found")

    def resolve_image_path(self, sample_id: str) -> Path:
        metadata = self.load()
        sample = metadata.samples.get(sample_id)
        if sample is None:
            raise HTTPException(status_code=404, detail="Sample not found")

        image_path = safe_join(self.dataset_root, sample.image_path)
        if not image_path.exists():
            raise HTTPException(status_code=404, detail="Image file not found")
        return image_path

    def _merge_scanned_samples(
        self,
        existing: ProjectMetadata,
        scanned_samples: dict[str, SampleMetadata],
    ) -> ProjectMetadata:
        existing_by_path = {sample.sample_path: sample for sample in existing.samples.values()}
        merged_samples: dict[str, SampleMetadata] = {}

        for scanned_id, scanned_sample in scanned_samples.items():
            existing_sample = existing_by_path.get(scanned_sample.sample_path)
            if existing_sample:
                path_metadata_changed = (
                    existing_sample.image_path != scanned_sample.image_path
                    or existing_sample.text_info != scanned_sample.text_info
                )
                updated = existing_sample.model_copy(
                    update={
                        "sample_path": scanned_sample.sample_path,
                        "image_path": scanned_sample.image_path,
                        "text_info": scanned_sample.text_info,
                        "time_updated": metadata_timestamp() if path_metadata_changed else existing_sample.time_updated,
                    }
                )
                merged_samples[existing_sample.sample_id] = SampleMetadata.model_validate(
                    updated.model_dump()
                )
            else:
                merged_samples[scanned_id] = scanned_sample

        for sample_id, sample in existing.samples.items():
            if sample_id not in merged_samples and (sample.archived or sample.trashed):
                merged_samples[sample_id] = sample

        return existing.model_copy(update={"samples": merged_samples})

    def _apply_patch(self, sample: SampleMetadata, patch: MetadataPatch) -> SampleMetadata:
        patch_data = patch.model_dump(exclude_unset=True)
        if patch_data:
            patch_data["time_updated"] = metadata_timestamp()
        candidate = sample.model_copy(update=patch_data)

        try:
            return SampleMetadata.model_validate(candidate.model_dump())
        except ValidationError as error:
            raise ValueError(str(error)) from error

    def _resolve_many(
        self,
        metadata: ProjectMetadata,
        sample_ids: list[str],
        sample_paths: list[str],
    ) -> list[str]:
        resolved: list[str] = []
        for sample_id in sample_ids:
            if sample_id not in resolved:
                resolved.append(sample_id)
        for sample_path in sample_paths:
            try:
                sample_id = self.find_sample_id(metadata, sample_path=sample_path)
                if sample_id not in resolved:
                    resolved.append(sample_id)
            except HTTPException:
                resolved.append(sample_path)
        return resolved

    def _move_destination(self, source_dir: Path, sample_path: str, target: str) -> Path:
        relative = Path(sample_path)

        if target == "archive":
            return self.dataset_root / "_archive" / relative

        if target == "trash":
            return self.dataset_root / "_trash" / relative

        if target == "restore":
            parts = relative.parts
            if parts and parts[0] in {"_archive", "_trash"}:
                return self.dataset_root.joinpath(*parts[1:])
            return source_dir

        raise HTTPException(status_code=400, detail=f"Unsupported move target: {target}")

    def _delete_tag_from_tree(self, tree: dict, parts: list[str]) -> bool:
        if not parts:
            return False

        head = parts[0]
        if head not in tree:
            return False

        if len(parts) == 1:
            del tree[head]
            return True

        node = tree[head]
        return self._delete_tag_from_tree(node.children, parts[1:])

    def _validate_tag_path(self, tag_path: str) -> list[str]:
        parts = [part.strip() for part in tag_path.split("/") if part.strip()]
        if not parts:
            raise HTTPException(status_code=422, detail="tag_path is required")
        return parts

    def _ensure_tag_parent(self, tree: dict[str, TagNode], parts: list[str]) -> dict[str, TagNode]:
        current = tree
        for part in parts:
            if part not in current:
                current[part] = TagNode(label=part, children={})
            current = current[part].children
        return current

    def _get_tag_node(self, tree: dict[str, TagNode], parts: list[str]) -> TagNode:
        current = tree
        for index, part in enumerate(parts):
            node = current.get(part)
            if node is None:
                raise HTTPException(status_code=404, detail="Tag not found")
            if index == len(parts) - 1:
                return node
            current = node.children
        raise HTTPException(status_code=404, detail="Tag not found")

    def _pop_tag_node(self, tree: dict[str, TagNode], parts: list[str]) -> TagNode:
        current = tree
        for part in parts[:-1]:
            node = current.get(part)
            if node is None:
                raise HTTPException(status_code=404, detail="Tag not found")
            current = node.children

        node = current.pop(parts[-1], None)
        if node is None:
            raise HTTPException(status_code=404, detail="Tag not found")
        return node

    def _sample_matches_search(self, sample: SampleMetadata, search_text: str) -> bool:
        fields = [sample.sample_path, sample.image_path, sample.text_info or ""]
        return any(search_text in field.lower() for field in fields)

    def move_folder(self, source_folder: str, target_folder: str) -> ProjectMetadata:
        """Move all samples from source_folder to target_folder, updating paths and regenerating IDs."""
        from app.services.scanner import sample_id_from_path

        metadata = self.load()

        # Normalize paths (remove trailing slashes)
        source_folder = source_folder.rstrip("/")
        target_folder = target_folder.rstrip("/")

        if source_folder == target_folder:
            raise HTTPException(status_code=400, detail="源文件夹和目标文件夹相同")

        # Find all samples in the source folder (including subfolders)
        samples_to_move = []
        for sample_id, sample in list(metadata.samples.items()):
            if sample.sample_path == source_folder or sample.sample_path.startswith(f"{source_folder}/"):
                samples_to_move.append((sample_id, sample))

        if not samples_to_move:
            raise HTTPException(status_code=404, detail=f"文件夹 '{source_folder}' 下没有样本")

        # Move each sample
        for old_id, sample in samples_to_move:
            # Calculate new paths
            if sample.sample_path == source_folder:
                new_sample_path = target_folder
            else:
                # Subfolder: replace the source prefix with target
                relative = sample.sample_path[len(source_folder):]  # e.g., "/subfolder/sample"
                new_sample_path = target_folder + relative

            # Update image_path
            if sample.image_path.startswith(f"{sample.sample_path}/"):
                relative_image = sample.image_path[len(sample.sample_path):]
                new_image_path = new_sample_path + relative_image
            else:
                new_image_path = sample.image_path

            # Update text_info if present
            new_text_info = sample.text_info
            if new_text_info and new_text_info.startswith(f"{sample.sample_path}/"):
                relative_text = new_text_info[len(sample.sample_path):]
                new_text_info = new_sample_path + relative_text

            # Generate new sample_id from new path
            new_id = sample_id_from_path(new_sample_path)

            # Check if new ID already exists (and is not the same sample)
            if new_id in metadata.samples and new_id != old_id:
                raise HTTPException(
                    status_code=409,
                    detail=f"目标位置已存在样本 '{new_sample_path}'"
                )

            # Remove old sample and add new one
            del metadata.samples[old_id]
            metadata.samples[new_id] = SampleMetadata(
                sample_id=new_id,
                sample_path=new_sample_path,
                image_path=new_image_path,
                text_info=new_text_info,
                class_status=sample.class_status,
                layout_type=sample.layout_type,
                boundaries=sample.boundaries,
                tags=sample.tags,
                archived=sample.archived,
                trashed=sample.trashed,
                flagged=sample.flagged,
                time_updated=metadata_timestamp(),
            )

        self.save(metadata)
        return metadata
