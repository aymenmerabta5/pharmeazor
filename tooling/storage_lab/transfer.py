"""boto3 client construction, upload, verification and download."""

from __future__ import annotations

import hashlib
import os
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock
from typing import Any, Mapping, Sequence

from .config import ConfigError, R2Config
from .keys import PlannedFile, UploadResult, safe_relative_key
from .paths import STREAM_CHUNK_BYTES


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _client_error_details(error: Exception) -> tuple[str, int | None, str]:
    response = getattr(error, "response", None) or {}
    error_block = response.get("Error") or {}
    code = str(error_block.get("Code") or type(error).__name__)
    status = (response.get("ResponseMetadata") or {}).get("HTTPStatusCode")
    if not response:
        # File, socket and programming errors carry their detail in str().
        message = str(error).strip()
    else:
        message = str(error_block.get("Message") or "").strip()
    return code, status, message


def describe_error(error: Exception, config: R2Config) -> str:
    code, status, message = _client_error_details(error)
    parts = [code]
    if status is not None:
        parts.append(f"HTTP {status}")
    if message:
        parts.append(message)
    return config.redact(": ".join(parts))


def _is_not_found(error: Exception) -> bool:
    code, status, _ = _client_error_details(error)
    return code in {"404", "NoSuchKey", "NoSuchBucket", "NotFound"} or status == 404


def _is_access_denied(error: Exception) -> bool:
    code, status, _ = _client_error_details(error)
    return code in {"403", "AccessDenied", "Forbidden"} or status == 403


def load_boto3() -> tuple[Any, Any, Any]:
    try:
        import boto3
        from boto3.s3.transfer import TransferConfig
        from botocore.config import Config
    except ImportError as error:
        raise ConfigError(
            "boto3 is not installed. Create the tool's virtual environment and "
            "install requirements.txt (see README.md)"
        ) from error
    return boto3, TransferConfig, Config


def make_client(config: R2Config, *, workers: int) -> tuple[Any, Any]:
    boto3, TransferConfig, Config = load_boto3()
    client_config = Config(
        signature_version="s3v4",
        retries={"max_attempts": 5, "mode": "standard"},
        connect_timeout=15,
        read_timeout=120,
        max_pool_connections=max(10, workers + 5),
        s3={"addressing_style": "path"},
        request_checksum_calculation="when_required",
        response_checksum_validation="when_required",
    )
    client = boto3.client(
        "s3",
        endpoint_url=config.endpoint,
        region_name=config.region,
        aws_access_key_id=config.access_key_id,
        aws_secret_access_key=config.secret_access_key,
        config=client_config,
    )
    transfer_config = TransferConfig(
        multipart_threshold=16 * 1024 * 1024,
        multipart_chunksize=8 * 1024 * 1024,
        max_concurrency=max(2, workers),
        use_threads=True,
    )
    return client, transfer_config


def verify_bucket(client: Any, config: R2Config) -> None:
    try:
        client.head_bucket(Bucket=config.bucket)
    except Exception as error:  # noqa: BLE001 - translated below
        if _is_not_found(error):
            raise ConfigError(
                f"bucket '{config.bucket}' does not exist or is not visible to these credentials"
            ) from error
        if _is_access_denied(error):
            print(
                "warning: HeadBucket was denied; continuing so the first transfer "
                "can report the real permission result",
                file=sys.stderr,
            )
            return
        raise ConfigError(
            f"cannot access bucket '{config.bucket}': {describe_error(error, config)}"
        ) from error


def upload_one(
    client: Any,
    transfer_config: Any,
    config: R2Config,
    item: PlannedFile,
    *,
    skip_existing: bool,
    checksum: bool,
) -> UploadResult:
    try:
        digest = sha256_file(item.path) if checksum else None
        if skip_existing:
            try:
                head = client.head_object(Bucket=config.bucket, Key=item.key)
            except Exception as error:  # noqa: BLE001 - only 404 is expected
                if not _is_not_found(error):
                    raise
            else:
                remote_size = int(head.get("ContentLength", -1))
                remote_hash = (head.get("Metadata") or {}).get("sha256")
                if remote_size == item.size and (not checksum or remote_hash == digest):
                    return UploadResult(
                        key=item.key,
                        relative=item.relative,
                        size=item.size,
                        status="skipped",
                        sha256=digest,
                    )

        metadata = {
            "source-path": item.relative.encode("ascii", "replace").decode("ascii")[:1900],
            "uploaded-by": "pharmeazor-r2-upload",
        }
        if digest:
            metadata["sha256"] = digest
        client.upload_file(
            Filename=str(item.path),
            Bucket=config.bucket,
            Key=item.key,
            ExtraArgs={"ContentType": item.content_type, "Metadata": metadata},
            Config=transfer_config,
        )
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=item.size,
            status="uploaded",
            sha256=digest,
        )
    except Exception as error:  # noqa: BLE001 - reported per file
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=item.size,
            status="failed",
            error=describe_error(error, config),
        )


def run_uploads(
    client: Any,
    transfer_config: Any,
    config: R2Config,
    plan: Sequence[PlannedFile],
    *,
    workers: int,
    skip_existing: bool,
    checksum: bool,
    fail_fast: bool,
    verbose: bool,
    quiet: bool,
) -> list[UploadResult]:
    results: list[UploadResult] = []
    total = len(plan)
    progress_lock = Lock()
    completed = 0
    effective_workers = 1 if fail_fast else max(1, workers)

    with ThreadPoolExecutor(max_workers=effective_workers) as pool:
        futures = {
            pool.submit(
                upload_one,
                client,
                transfer_config,
                config,
                item,
                skip_existing=skip_existing,
                checksum=checksum,
            ): item
            for item in plan
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            with progress_lock:
                completed += 1
                if verbose and not quiet:
                    detail = f" ({result.error})" if result.error else ""
                    print(f"  [{completed}/{total}] {result.status:<8} {result.key}{detail}")
                elif not quiet and (completed % 25 == 0 or completed == total):
                    print(f"  progress: {completed}/{total} objects")

            if fail_fast and result.status == "failed":
                for pending in futures:
                    pending.cancel()
                break

    return results


def list_remote_objects(client: Any, config: R2Config, prefix: str) -> dict[str, int]:
    """Return the remote key -> size map for every object under prefix/."""
    remote: dict[str, int] = {}
    try:
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=config.bucket, Prefix=f"{prefix}/"):
            for entry in page.get("Contents", ()):
                remote[str(entry["Key"])] = int(entry["Size"])
    except Exception as error:  # noqa: BLE001 - translated below
        raise ConfigError(
            f"cannot list objects under '{prefix}/': {describe_error(error, config)}"
        ) from error
    return remote


def verify_one(
    client: Any,
    config: R2Config,
    item: PlannedFile,
    remote_size: int,
) -> UploadResult:
    """Stream one remote object and compare it with the local file."""
    try:
        response = client.get_object(Bucket=config.bucket, Key=item.key)
        body = response["Body"]
        digest = hashlib.sha256()
        size = 0
        try:
            for chunk in iter(lambda: body.read(STREAM_CHUNK_BYTES), b""):
                digest.update(chunk)
                size += len(chunk)
        finally:
            body.close()

        remote_hash = digest.hexdigest()
        local_hash = sha256_file(item.path)
        metadata_hash = (response.get("Metadata") or {}).get("sha256")
        problems: list[str] = []
        if remote_size != item.size or size != item.size:
            problems.append(
                f"remote size {remote_size} / downloaded {size} != local size {item.size}"
            )
        if remote_hash != local_hash:
            problems.append("downloaded SHA-256 differs from the local file")
        if metadata_hash and metadata_hash != remote_hash:
            problems.append("stored SHA-256 metadata differs from the downloaded bytes")
        if problems:
            return UploadResult(
                key=item.key,
                relative=item.relative,
                size=remote_size,
                status="failed",
                sha256=remote_hash,
                error="; ".join(problems),
            )
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=remote_size,
            status="verified",
            sha256=remote_hash,
        )
    except Exception as error:  # noqa: BLE001 - reported per file
        return UploadResult(
            key=item.key,
            relative=item.relative,
            size=remote_size,
            status="failed",
            error=describe_error(error, config),
        )


def download_one(
    client: Any,
    config: R2Config,
    key: str,
    *,
    prefix: str,
    dest_root: Path,
    local_item: PlannedFile | None,
    remote_size: int,
    skip_existing: bool,
) -> UploadResult:
    """Download one object atomically and verify its bytes before publishing."""
    relative_path: Path | None = None
    temp: Path | None = None
    try:
        relative_path = safe_relative_key(key, prefix)
        destination = dest_root / relative_path
        response = client.get_object(Bucket=config.bucket, Key=key)
        body = response["Body"]
        try:
            expected_size = int(response.get("ContentLength", -1))
            metadata_hash = (response.get("Metadata") or {}).get("sha256")
            if skip_existing and destination.is_file():
                existing_size = destination.stat().st_size
                if (
                    existing_size == expected_size
                    and metadata_hash
                    and sha256_file(destination) == metadata_hash
                ):
                    return UploadResult(
                        key=key,
                        relative=relative_path.as_posix(),
                        size=remote_size,
                        status="skipped",
                        sha256=metadata_hash,
                    )

            destination.parent.mkdir(parents=True, exist_ok=True)
            temp = destination.with_name(destination.name + ".part")
            digest = hashlib.sha256()
            size = 0
            with temp.open("wb") as handle:
                for chunk in iter(lambda: body.read(STREAM_CHUNK_BYTES), b""):
                    handle.write(chunk)
                    digest.update(chunk)
                    size += len(chunk)
                handle.flush()
                os.fsync(handle.fileno())
        finally:
            body.close()

        remote_hash = digest.hexdigest()
        problems: list[str] = []
        if expected_size >= 0 and size != expected_size:
            problems.append(f"downloaded {size} bytes, expected {expected_size}")
        if metadata_hash and metadata_hash != remote_hash:
            problems.append("downloaded SHA-256 differs from the stored metadata")
        if local_item is not None:
            if local_item.size != size:
                problems.append(
                    f"downloaded size {size} differs from local size {local_item.size}"
                )
            elif sha256_file(local_item.path) != remote_hash:
                problems.append("downloaded bytes differ from the local source")
        if problems:
            temp.unlink(missing_ok=True)
            temp = None
            return UploadResult(
                key=key,
                relative=relative_path.as_posix(),
                size=remote_size,
                status="failed",
                sha256=remote_hash,
                error="; ".join(problems),
            )

        os.replace(temp, destination)
        temp = None
        return UploadResult(
            key=key,
            relative=relative_path.as_posix(),
            size=remote_size,
            status="downloaded",
            sha256=remote_hash,
        )
    except Exception as error:  # noqa: BLE001 - reported per file
        if temp is not None:
            temp.unlink(missing_ok=True)
        return UploadResult(
            key=key,
            relative=relative_path.as_posix() if relative_path else key,
            size=remote_size,
            status="failed",
            error=describe_error(error, config),
        )


def run_verify(
    client: Any,
    config: R2Config,
    plan: Sequence[PlannedFile],
    remote: Mapping[str, int],
    *,
    workers: int,
    limit: int | None,
    verbose: bool,
    quiet: bool,
) -> list[UploadResult]:
    results: list[UploadResult] = []
    local_by_key = {item.key: item for item in plan}
    remote_keys = set(remote)
    local_keys = set(local_by_key)

    for key in sorted(local_keys - remote_keys):
        results.append(
            UploadResult(
                key=key,
                relative="",
                size=0,
                status="failed",
                error="object is missing from the bucket",
            )
        )
    for key in sorted(remote_keys - local_keys):
        results.append(
            UploadResult(
                key=key,
                relative=key,
                size=remote[key],
                status="failed",
                error="remote object is not present in the local source tree",
            )
        )

    targets = [local_by_key[key] for key in sorted(local_keys & remote_keys)]
    if limit is not None:
        targets = targets[:limit]
    total = len(targets)
    progress_lock = Lock()
    completed = 0

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(verify_one, client, config, item, remote[item.key]): item
            for item in targets
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            with progress_lock:
                completed += 1
                if verbose and not quiet:
                    detail = f" ({result.error})" if result.error else ""
                    print(f"  [{completed}/{total}] {result.status:<8} {result.key}{detail}")
                elif not quiet and (completed % 25 == 0 or completed == total):
                    print(f"  progress: {completed}/{total} objects")

    return results


def run_download(
    client: Any,
    config: R2Config,
    remote: Mapping[str, int],
    *,
    prefix: str,
    dest_root: Path,
    local_by_key: Mapping[str, PlannedFile],
    workers: int,
    limit: int | None,
    skip_existing: bool,
    verbose: bool,
    quiet: bool,
) -> list[UploadResult]:
    keys = sorted(remote)
    if limit is not None:
        keys = keys[:limit]
    total = len(keys)
    progress_lock = Lock()
    completed = 0
    results: list[UploadResult] = []

    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        futures = {
            pool.submit(
                download_one,
                client,
                config,
                key,
                prefix=prefix,
                dest_root=dest_root,
                local_item=local_by_key.get(key),
                remote_size=remote[key],
                skip_existing=skip_existing,
            ): key
            for key in keys
        }
        for future in as_completed(futures):
            result = future.result()
            results.append(result)
            with progress_lock:
                completed += 1
                if verbose and not quiet:
                    detail = f" ({result.error})" if result.error else ""
                    print(f"  [{completed}/{total}] {result.status:<10} {result.key}{detail}")
                elif not quiet and (completed % 25 == 0 or completed == total):
                    print(f"  progress: {completed}/{total} objects")

    return results
