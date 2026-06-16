from pathlib import Path


def relative_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def safe_join(root: Path, relative_path: str) -> Path:
    root_resolved = root.resolve()
    candidate = (root_resolved / relative_path).resolve()

    if root_resolved != candidate and root_resolved not in candidate.parents:
        raise ValueError(f"path escapes root: {relative_path}")

    return candidate
