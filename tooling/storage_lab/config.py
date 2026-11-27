"""Environment-file parsing and R2 connection settings."""

from __future__ import annotations

import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Mapping, Sequence
from urllib.parse import urlsplit, urlunsplit

from .paths import _ASSIGNMENT, PLACEHOLDER_PREFIX


class ConfigError(RuntimeError):
    """Configuration is missing, inconsistent or unsafe."""


def _parse_env_value(raw: str) -> str:
    """Parse one dotenv-style value without ever logging it."""
    value = raw.strip()
    if not value:
        return ""
    if value[0] in {'"', "'"}:
        quote = value[0]
        end = value.find(quote, 1)
        return value[1:end] if end != -1 else value[1:]
    # Unquoted values may carry a trailing comment: KEY=value # note
    return re.split(r"\s+#", value, maxsplit=1)[0].strip()


def parse_env_file(path: Path) -> dict[str, list[str]]:
    """Return every assignment per key, in file order.

    Keeping all assignments (instead of a last-wins dict) lets the caller prefer
    the first configured value when a file contains a trailing template block
    with ``REPLACE_WITH_*`` placeholders.
    """
    try:
        text = path.read_text(encoding="utf-8-sig")
    except FileNotFoundError as error:
        raise ConfigError(f"environment file not found: {path}") from error
    except OSError as error:
        raise ConfigError(f"cannot read environment file {path}: {error.strerror}") from error

    assignments: dict[str, list[str]] = {}
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        match = _ASSIGNMENT.match(stripped)
        if match is None:
            continue
        key, raw_value = match.groups()
        assignments.setdefault(key, []).append(_parse_env_value(raw_value))
    return assignments


def env_value(
    assignments: Mapping[str, Sequence[str]],
    *names: str,
    environ: Mapping[str, str] | None = None,
) -> str | None:
    """Resolve a key from the process environment, then from the env file.

    Within each source the first non-empty, non-placeholder value wins. Values
    are returned to the caller and must never be printed.
    """
    environment = os.environ if environ is None else environ
    for name in names:
        candidate = environment.get(name)
        if candidate and candidate.strip() and not candidate.strip().startswith(PLACEHOLDER_PREFIX):
            return candidate.strip()
    for name in names:
        for candidate in assignments.get(name, ()):
            if candidate and not candidate.startswith(PLACEHOLDER_PREFIX):
                return candidate
    return None


def duplicate_keys(assignments: Mapping[str, Sequence[str]]) -> list[str]:
    """Keys assigned more than once with different non-empty values."""
    return sorted(
        key
        for key, values in assignments.items()
        if len({value for value in values if value}) > 1
    )


@dataclass(frozen=True)
class R2Config:
    bucket: str
    endpoint: str
    region: str
    access_key_id: str = field(repr=False)
    secret_access_key: str = field(repr=False)
    public_url: str | None = None

    def redact(self, message: str) -> str:
        for secret in (self.access_key_id, self.secret_access_key):
            if secret:
                message = message.replace(secret, "<redacted>")
        return message


def normalize_endpoint(endpoint: str, bucket: str) -> str:
    """Return the account-level S3 endpoint boto3 expects.

    ``S3_ENDPOINT`` may include the bucket as a path suffix (as it does in this
    repository). boto3 addresses the bucket itself, so that suffix is removed.
    A different path is rejected rather than silently producing wrong keys.
    """
    candidate = endpoint.strip()
    parsed = urlsplit(candidate)
    if parsed.scheme != "https":
        raise ConfigError("S3_ENDPOINT must use HTTPS (Cloudflare R2 requires TLS)")
    if not parsed.netloc:
        raise ConfigError("S3_ENDPOINT has no host")
    if parsed.username or parsed.password:
        raise ConfigError("S3_ENDPOINT must not embed credentials")
    if parsed.query or parsed.fragment:
        raise ConfigError("S3_ENDPOINT must not carry a query string or fragment")

    path = parsed.path.rstrip("/")
    if path in {"", "/"}:
        path = ""
    elif path == f"/{bucket}":
        path = ""
    else:
        raise ConfigError(
            "S3_ENDPOINT contains an unexpected path; use the account-level "
            "R2 endpoint (optionally ending in /<bucket>)"
        )
    return urlunsplit(("https", parsed.netloc, path, "", ""))


def resolve_config(
    assignments: Mapping[str, Sequence[str]],
    *,
    bucket_override: str | None = None,
    environ: Mapping[str, str] | None = None,
) -> R2Config:
    bucket = (bucket_override or env_value(
        assignments, "STORAGE_BUCKET", "R2_BUCKET", "S3_BUCKET", environ=environ
    ))
    if not bucket:
        # The repository's S3_ENDPOINT ends in /<bucket>. When STORAGE_BUCKET is
        # missing or still a placeholder, take the name from that path instead
        # of forcing the operator to repeat it.
        endpoint_hint = env_value(
            assignments, "S3_ENDPOINT", "S3_URL", "R2_ENDPOINT", environ=environ
        )
        if endpoint_hint:
            path = urlsplit(endpoint_hint.strip()).path.strip("/")
            if path and "/" not in path:
                bucket = path
    if not bucket:
        raise ConfigError("STORAGE_BUCKET is not configured")
    bucket = bucket.strip()
    if bucket.startswith(PLACEHOLDER_PREFIX) or "/" in bucket or any(char.isspace() for char in bucket):
        raise ConfigError("STORAGE_BUCKET is invalid or still a placeholder")

    access_key_id = env_value(
        assignments, "S3_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID", "AWS_ACCESS_KEY_ID", environ=environ
    )
    secret_access_key = env_value(
        assignments,
        "S3_SECRET_ACCESS_KEY",
        "R2_SECRET_ACCESS_KEY",
        "AWS_SECRET_ACCESS_KEY",
        environ=environ,
    )
    if not access_key_id or not secret_access_key:
        raise ConfigError(
            "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must both be configured"
        )

    raw_endpoint = env_value(
        assignments, "S3_ENDPOINT", "S3_URL", "R2_ENDPOINT", environ=environ
    )
    if not raw_endpoint:
        raise ConfigError("S3_ENDPOINT (or S3_URL) is not configured")
    endpoint = normalize_endpoint(raw_endpoint, bucket)

    region = (
        env_value(assignments, "S3_REGION", "R2_REGION", environ=environ) or "auto"
    ).strip()
    if region.startswith(PLACEHOLDER_PREFIX):
        region = "auto"

    public_url = env_value(
        assignments, "S3_PUBLIC_URL", "S3_PUBLIC", "R2_PUBLIC_URL", environ=environ
    )
    if public_url:
        parsed_public = urlsplit(public_url)
        if parsed_public.scheme not in {"http", "https"} or not parsed_public.netloc:
            raise ConfigError("S3_PUBLIC_URL is not a valid HTTP(S) URL")
        public_url = public_url.rstrip("/") + "/"

    return R2Config(
        bucket=bucket,
        endpoint=endpoint,
        region=region,
        access_key_id=access_key_id,
        secret_access_key=secret_access_key,
        public_url=public_url,
    )
