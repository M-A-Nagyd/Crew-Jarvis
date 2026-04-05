"""
Validate AI-produced file mappings before writing them to disk.

Currently focuses on Python syntax correctness because earlier failures showed
Markdown being written into `*.py` files.
"""

from __future__ import annotations

from typing import Mapping


def _py_compile_works(path: str, content: str) -> tuple[bool, str]:
    try:
        # Compile as exec to validate syntax.
        compile(content, path, "exec")
        return True, ""
    except SyntaxError as e:
        details = f"SyntaxError: {e.msg} (line {e.lineno}, offset {e.offset})"
        return False, details
    except Exception as e:  # pragma: no cover
        return False, f"Compile error: {type(e).__name__}: {e}"


def validate_files_dict(files_dict: Mapping[str, str]) -> list[str]:
    """
    Returns a list of validation error strings.
    """
    errors: list[str] = []
    for raw_path, content in (files_dict or {}).items():
        if not isinstance(raw_path, str):
            errors.append(f"Invalid file path key type: {type(raw_path).__name__}")
            continue
        if not isinstance(content, str):
            errors.append(f"Invalid file contents type for {raw_path!r}: {type(content).__name__}")
            continue

        path = raw_path.strip()
        if path.lower().endswith(".py"):
            ok, details = _py_compile_works(path, content)
            if not ok:
                errors.append(f"{path}: {details}")

    return errors

