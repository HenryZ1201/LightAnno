from __future__ import annotations

import hashlib
from pathlib import Path

from PIL import Image, UnidentifiedImageError

from app.models import SampleMetadata, SampleWarning
from app.services.paths import relative_posix

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp"}
CUE_DATA_EXTENSIONS = {".json", ".jsonl"}


def sample_id_from_path(sample_path: str) -> str:
    digest = hashlib.sha1(sample_path.encode("utf-8")).hexdigest()[:12]
    return f"sample_{digest}"


def scan_dataset(dataset_root: Path) -> tuple[dict[str, SampleMetadata], list[SampleWarning]]:
    dataset_root.mkdir(parents=True, exist_ok=True)

    samples: dict[str, SampleMetadata] = {}
    warnings: list[SampleWarning] = []

    for folder in sorted(path for path in dataset_root.rglob("*") if path.is_dir()):
        child_dirs = sorted(path for path in folder.iterdir() if path.is_dir())
        files = sorted(path for path in folder.iterdir() if path.is_file())

        # Directories containing only subdirectories are treated as grouping folders.
        if child_dirs and not files:
            continue

        sample_path = relative_posix(folder, dataset_root)

        if child_dirs:
            warnings.append(
                SampleWarning(
                    sample_path=sample_path,
                    code="HAS_SUBDIRECTORY",
                    message="Sample 文件夹内存在子文件夹，已跳过该样本。",
                    details={"subdirectories": [path.name for path in child_dirs]},
                )
            )
            continue

        if not files:
            warnings.append(
                SampleWarning(
                    sample_path=sample_path,
                    code="EMPTY_FOLDER",
                    message="Sample 文件夹为空，已跳过该样本。",
                )
            )
            continue

        image_files = [path for path in files if path.suffix.lower() in SUPPORTED_IMAGE_EXTENSIONS]
        if not image_files:
            warnings.append(
                SampleWarning(
                    sample_path=sample_path,
                    code="INVALID_IMAGE_FILE",
                    message="Sample 文件夹内没有受支持格式的图片，已跳过该样本。",
                    details={"files": [path.name for path in files]},
                )
            )
            continue

        if len(image_files) > 1:
            warnings.append(
                SampleWarning(
                    sample_path=sample_path,
                    code="MULTIPLE_IMAGES",
                    message="Sample 文件夹内存在多张图片，已跳过该样本。",
                    details={"image_files": [path.name for path in image_files]},
                )
            )
            continue

        image_file = image_files[0]
        if not _is_readable_image(image_file):
            warnings.append(
                SampleWarning(
                    sample_path=sample_path,
                    code="UNREADABLE_IMAGE",
                    message="图片文件无法读取或解析，已跳过该样本。",
                    details={"image_file": image_file.name},
                )
            )
            continue

        cue_candidates = [
            path
            for path in files
            if path.suffix.lower() in CUE_DATA_EXTENSIONS and "cuedata" in path.name.lower()
        ]
        cue_data_file: str | None = None

        if not cue_candidates:
            warnings.append(
                SampleWarning(
                    sample_path=sample_path,
                    code="MISSING_CUE_DATA",
                    message="Sample 文件夹内未找到控件树文件，样本仍进入正常标注流。",
                )
            )
        else:
            if len(cue_candidates) > 1:
                warnings.append(
                    SampleWarning(
                        sample_path=sample_path,
                        code="MULTIPLE_CUE_DATA_FILES",
                        message="Sample 文件夹内存在多个控件树候选文件，将使用排序后的第一个文件。",
                        details={"cue_data_files": [path.name for path in cue_candidates]},
                    )
                )
            cue_data_file = relative_posix(cue_candidates[0], dataset_root)

        image_relative_path = relative_posix(image_file, dataset_root)
        sample_id = sample_id_from_path(sample_path)
        samples[sample_id] = SampleMetadata(
            sample_id=sample_id,
            sample_path=sample_path,
            image_file=image_relative_path,
            cue_data_file=cue_data_file,
            status="unlabeled",
            layout_type="single",
            boundaries=[0, 0],
            tags=[],
        )

    return samples, warnings


def _is_readable_image(path: Path) -> bool:
    try:
        with Image.open(path) as image:
            image.verify()
        return True
    except (OSError, UnidentifiedImageError):
        return False
