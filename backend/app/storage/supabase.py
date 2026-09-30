"""
Supabase Storage helpers.

All dataset files live in Supabase Storage under the 'datasets' bucket.
The backend never stores files permanently on disk — /tmp/ is ephemeral only.

Storage path convention:
    datasets/{user_id}/{project_id}/{dataset_id}/original/dataset.{ext}
    datasets/{user_id}/{project_id}/{dataset_id}/working/dataset.parquet
    datasets/{user_id}/{project_id}/{dataset_id}/versions/v{n}.parquet
    datasets/{user_id}/{project_id}/{dataset_id}/final/cleaned.csv
    datasets/{user_id}/{project_id}/{dataset_id}/reports/audit.json
"""

from app.database.client import get_service_client
from app.core.logging import get_logger

logger = get_logger(__name__)

BUCKET_NAME = "datasets"


def build_storage_path(
    user_id: str,
    project_id: str,
    dataset_id: str,
    subfolder: str,
    filename: str,
) -> str:
    """Build a canonical Supabase Storage path for a dataset file."""
    return f"{user_id}/{project_id}/{dataset_id}/{subfolder}/{filename}"


def upload_file(storage_path: str, file_bytes: bytes, content_type: str = "application/octet-stream") -> str:
    """
    Upload bytes to Supabase Storage.

    Returns the full storage path on success.
    Raises RuntimeError on failure.
    """
    client = get_service_client()
    try:
        client.storage.from_(BUCKET_NAME).upload(
            path=storage_path,
            file=file_bytes,
            file_options={"content-type": content_type, "upsert": "true"},
        )
        logger.info(f"Uploaded to storage: {BUCKET_NAME}/{storage_path}")
        return storage_path
    except Exception as e:
        raise RuntimeError(f"Storage upload failed for '{storage_path}': {e}") from e


def download_file(storage_path: str) -> bytes:
    """
    Download a file from Supabase Storage.

    Returns raw bytes.
    Raises RuntimeError on failure.
    """
    client = get_service_client()
    try:
        data = client.storage.from_(BUCKET_NAME).download(storage_path)
        logger.info(f"Downloaded from storage: {BUCKET_NAME}/{storage_path}")
        return data
    except Exception as e:
        raise RuntimeError(f"Storage download failed for '{storage_path}': {e}") from e


def delete_file(storage_path: str) -> None:
    """Delete a file from Supabase Storage. Logs but does not raise on missing file."""
    client = get_service_client()
    try:
        client.storage.from_(BUCKET_NAME).remove([storage_path])
        logger.info(f"Deleted from storage: {BUCKET_NAME}/{storage_path}")
    except Exception as e:
        logger.warning(f"Storage delete warning for '{storage_path}': {e}")


def get_public_url(storage_path: str) -> str:
    """Return the public URL for a storage path (requires bucket to be public)."""
    client = get_service_client()
    return client.storage.from_(BUCKET_NAME).get_public_url(storage_path)


def ensure_bucket_exists() -> None:
    """
    Ensure the 'datasets' bucket exists in Supabase Storage.

    Called once at application startup. Safe to call multiple times.
    """
    client = get_service_client()
    try:
        buckets = client.storage.list_buckets()
        bucket_names = [b.name for b in buckets]
        if BUCKET_NAME not in bucket_names:
            client.storage.create_bucket(BUCKET_NAME, options={"public": False})
            logger.info(f"Created Supabase Storage bucket: '{BUCKET_NAME}'")
        else:
            logger.info(f"Storage bucket '{BUCKET_NAME}' already exists [OK]")
    except Exception as e:
        logger.error(f"Failed to ensure storage bucket exists: {e}")
        raise
