"""
File validation service.

Validates uploaded files BEFORE they touch disk or Supabase Storage.
All checks run on the raw bytes received from the HTTP request.

Design rules:
  - Python measures, this module never calls the LLM.
  - Never materialise a full DataFrame — use stdlib csv for header peek.
  - Raises HTTPException with a clear 4xx code on every validation failure.
"""

from __future__ import annotations
import csv
import io
import mimetypes
from dataclasses import dataclass

from fastapi import HTTPException, status

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# ── Allowed file types ────────────────────────────────────────────
ALLOWED_EXTENSIONS = {"csv", "json", "parquet"}

# MIME types we accept for each extension
_MIME_WHITELIST: dict[str, set[str]] = {
    "csv": {
        "text/csv",
        "text/plain",
        "application/csv",
        "application/octet-stream",  # some browsers send this for csv
    },
    "json": {
        "application/json",
        "text/json",
        "text/plain",
        "application/octet-stream",
    },
    "parquet": {
        "application/octet-stream",
        "application/parquet",
        "application/vnd.apache.parquet",
    },
}

# Magic bytes for format detection (more reliable than MIME)
_MAGIC: dict[str, bytes] = {
    "parquet": b"PAR1",
    "json_obj": b"{",
    "json_arr": b"[",
}


@dataclass(frozen=True)
class FileMetadata:
    """Result of a successful validation pass."""
    original_filename: str
    extension: str          # normalised: csv | json | parquet
    file_size: int          # bytes
    column_count: int | None
    estimated_row_count: int | None
    content_type: str


def validate_upload(
    filename: str,
    content_type: str,
    file_bytes: bytes,
) -> FileMetadata:
    """
    Validate an uploaded file against all constraints.

    Raises HTTPException (4xx) on any failure.
    Returns FileMetadata on success.
    """
    settings = get_settings()

    # 1 ── Extension check ──────────────────────────────────────────
    ext = _extract_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail={
                "error": "unsupported_file_type",
                "message": (
                    f"File type '.{ext}' is not supported. "
                    f"Accepted types: {', '.join(sorted(ALLOWED_EXTENSIONS))}."
                ),
            },
        )

    # 2 ── Size check ───────────────────────────────────────────────
    file_size = len(file_bytes)
    max_bytes = settings.max_upload_size_bytes
    if file_size == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "empty_file", "message": "The uploaded file is empty."},
        )
    if file_size > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={
                "error": "file_too_large",
                "message": (
                    f"File size {file_size / 1_048_576:.1f} MB exceeds the "
                    f"{settings.max_upload_size_mb} MB limit. "
                    "This limit is set to ensure stable processing on our free-tier infrastructure."
                ),
                "max_mb": settings.max_upload_size_mb,
                "received_mb": round(file_size / 1_048_576, 2),
            },
        )

    # 3 ── Format-specific validation + metadata extraction ─────────
    column_count: int | None = None
    estimated_row_count: int | None = None

    if ext == "csv":
        column_count, estimated_row_count = _validate_csv(file_bytes, settings)
    elif ext == "json":
        _validate_json_structure(file_bytes)
    elif ext == "parquet":
        _validate_parquet_magic(file_bytes)

    logger.info(
        f"File validated: name={filename!r} ext={ext} "
        f"size={file_size:,}B cols={column_count} rows≈{estimated_row_count}"
    )

    return FileMetadata(
        original_filename=filename,
        extension=ext,
        file_size=file_size,
        column_count=column_count,
        estimated_row_count=estimated_row_count,
        content_type=content_type or f"text/{ext}",
    )


# ── Private helpers ────────────────────────────────────────────────

def _extract_extension(filename: str) -> str:
    """Return lowercased extension without the dot, or empty string."""
    if "." not in filename:
        return ""
    return filename.rsplit(".", 1)[-1].lower()


def _validate_csv(file_bytes: bytes, settings) -> tuple[int | None, int | None]:
    """
    Validate CSV structure and extract column/row counts cheaply.

    Uses stdlib csv — no Polars dependency needed at this phase.
    Row count is done by counting newlines in the raw bytes (fast, no parse).
    """
    try:
        # Detect encoding and decode
        text = file_bytes.decode("utf-8-sig", errors="replace")
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "encoding_error", "message": f"Could not decode CSV: {exc}"},
        )

    reader = csv.reader(io.StringIO(text))
    try:
        header = next(reader)
    except StopIteration:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "empty_csv", "message": "CSV file has no header row."},
        )

    column_count = len(header)

    if column_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "no_columns", "message": "CSV file has no columns."},
        )

    if column_count > settings.max_columns:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "too_many_columns",
                "message": (
                    f"CSV has {column_count} columns; maximum allowed is {settings.max_columns}."
                ),
                "column_count": column_count,
                "max_columns": settings.max_columns,
            },
        )

    # Fast row count: newlines in raw bytes minus header line
    # -1 because we don't count the header; files ending with \n won't over-count
    # due to strip. This is an estimate, not exact.
    newline_count = file_bytes.count(b"\n")
    estimated_rows = max(0, newline_count - 1)  # subtract header line

    if estimated_rows > settings.max_rows:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "too_many_rows",
                "message": (
                    f"CSV has approximately {estimated_rows:,} rows; "
                    f"maximum allowed is {settings.max_rows:,}."
                ),
                "estimated_row_count": estimated_rows,
                "max_rows": settings.max_rows,
            },
        )

    return column_count, estimated_rows


def _validate_json_structure(file_bytes: bytes) -> None:
    """Confirm the JSON is parseable. Raises HTTPException on failure."""
    import json
    try:
        data = json.loads(file_bytes.decode("utf-8-sig", errors="replace"))
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_json",
                "message": f"File is not valid JSON: {exc}",
            },
        )
    if not isinstance(data, (list, dict)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "unsupported_json_structure",
                "message": "JSON must be an array of objects or a dict.",
            },
        )


def _validate_parquet_magic(file_bytes: bytes) -> None:
    """Check Parquet magic bytes (PAR1 at start and end)."""
    if len(file_bytes) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"error": "invalid_parquet", "message": "File is too small to be a valid Parquet file."},
        )
    if not (file_bytes[:4] == b"PAR1" and file_bytes[-4:] == b"PAR1"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "invalid_parquet",
                "message": "File does not appear to be a valid Parquet file (magic bytes mismatch).",
            },
        )
