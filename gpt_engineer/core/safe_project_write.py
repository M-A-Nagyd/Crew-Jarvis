"""
Write LLM-produced file trees under a project directory with:
- path traversal prevention
- safe project folder names
- atomic per-file replace (crash-safe partial writes)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Dict, List, Tuple

# Windows device names (without extension) that cannot be used as file names
_WIN_RESERVED = frozenset(
    {"CON", "PRN", "AUX", "NUL", *[f"COM{i}" for i in range(1, 10)], *[f"LPT{i}" for i in range(1, 10)]}
)


def sanitize_project_name(name: str) -> str:
    """Single-segment folder name under projects/. Falls back if unsafe or empty."""
    raw = (name or "").strip()
    if not raw or raw in (".", ".."):
        return "generated-project"
    safe = "".join(c for c in raw if c.isalnum() or c in "-_")
    if not safe:
        return "generated-project"
    return safe[:80]


def _reject_reserved_win_stem(stem: str) -> None:
    if sys.platform != "win32":
        return
    base = stem.split(".")[0].upper()
    if base in _WIN_RESERVED:
        raise ValueError(f"Reserved Windows device name: {stem!r}")


def normalize_relative_path(rel: str) -> str:
    """
    Validate a relative path from the LLM; reject traversal and absolute paths.
    Returns a POSIX-style path using forward slashes.
    """
    if not rel or not isinstance(rel, str):
        raise ValueError("Invalid path: empty or not a string")
    s = rel.strip().replace("\\", "/")
    if s.startswith("/") or (len(s) > 1 and s[1] == ":"):  # POSIX abs or Windows drive
        raise ValueError(f"Absolute paths are not allowed: {rel!r}")
    parts: List[str] = []
    for part in s.split("/"):
        if not part or part == ".":
            continue
        if part == "..":
            raise ValueError(f"Path traversal is not allowed: {rel!r}")
        _reject_reserved_win_stem(part)
        parts.append(part)
    if not parts:
        raise ValueError(f"Invalid path after normalization: {rel!r}")
    return "/".join(parts)


def resolved_targets(
    project_root: Path, files_dict: Dict[str, str]
) -> List[Tuple[Path, str]]:
    """
    Build (absolute Path, content) pairs; each path is guaranteed under project_root.
    """
    root = project_root.resolve()
    out: List[Tuple[Path, str]] = []
    for raw_key, content in files_dict.items():
        key = str(raw_key)
        rel = normalize_relative_path(key)
        target = (root / rel).resolve()
        try:
            target.relative_to(root)
        except ValueError as e:
            raise ValueError(f"Path escapes project directory: {key!r}") from e
        if not isinstance(content, str):
            raise TypeError(f"File contents must be str for {key!r}")
        out.append((target, content))
    return out


def atomic_write_text(path: Path, content: str) -> None:
    """Write UTF-8 text atomically (temp + replace)."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".~tmp")
    try:
        tmp.write_text(content, encoding="utf-8", newline="\n")
        os.replace(tmp, path)
    except Exception:
        try:
            if tmp.exists():
                tmp.unlink()
        except OSError:
            pass
        raise


def write_files_dict(project_dir: str, files_dict: Dict[str, str]) -> List[str]:
    """
    Write all files under project_dir. Returns sorted list of relative paths (POSIX) written.

    Raises:
        ValueError: empty dict, bad paths, or traversal
        OSError: filesystem errors
    """
    if not files_dict:
        raise ValueError(
            "No files were produced. The model output may be missing "
            "'File: path' blocks with fenced code."
        )

    root = Path(project_dir).resolve()
    root.mkdir(parents=True, exist_ok=True)

    targets = resolved_targets(root, files_dict)
    written: List[str] = []
    root_resolved = root.resolve()

    for abs_path, content in targets:
        atomic_write_text(abs_path, content)
        rel = abs_path.relative_to(root_resolved)
        written.append(rel.as_posix())

    return sorted(set(written))
