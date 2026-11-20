"""Tests for the R2 uploader's pure helpers (no boto3 or network needed)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import r2_upload  # noqa: E402


class EnvParsingTests(unittest.TestCase):
    def test_first_valid_value_wins_over_trailing_template(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env.local"
            env_file.write_text(
                "\n".join(
                    [
                        "# real block",
                        "STORAGE_BUCKET=pharmeazor",
                        "S3_ENDPOINT=https://account.r2.cloudflarestorage.com/pharmeazor",
                        "",
                        "# generated template block",
                        "STORAGE_BUCKET=REPLACE_WITH_STORAGE_BUCKET",
                        "S3_ENDPOINT=",
                    ]
                ),
                encoding="utf-8",
            )
            assignments = r2_upload.parse_env_file(env_file)

        self.assertEqual(
            r2_upload.env_value(assignments, "STORAGE_BUCKET", environ={}), "pharmeazor"
        )
        self.assertEqual(
            r2_upload.env_value(assignments, "S3_ENDPOINT", environ={}),
            "https://account.r2.cloudflarestorage.com/pharmeazor",
        )

    def test_process_environment_wins(self) -> None:
        assignments = {"STORAGE_BUCKET": ["file-bucket"]}
        self.assertEqual(
            r2_upload.env_value(
                assignments, "STORAGE_BUCKET", environ={"STORAGE_BUCKET": "env-bucket"}
            ),
            "env-bucket",
        )

    def test_quoted_comments_export_and_placeholders(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            env_file = Path(directory) / ".env"
            env_file.write_text(
                "\n".join(
                    [
                        "export BUCKET='quoted-bucket'",
                        'SECRET="value with spaces"',
                        "PLAIN=value # trailing comment",
                        "PLACEHOLDER=REPLACE_WITH_TOKEN",
                    ]
                ),
                encoding="utf-8",
            )
            assignments = r2_upload.parse_env_file(env_file)

        self.assertEqual(r2_upload.env_value(assignments, "BUCKET", environ={}), "quoted-bucket")
        self.assertEqual(
            r2_upload.env_value(assignments, "SECRET", environ={}), "value with spaces"
        )
        self.assertEqual(r2_upload.env_value(assignments, "PLAIN", environ={}), "value")
        self.assertIsNone(r2_upload.env_value(assignments, "PLACEHOLDER", environ={}))

    def test_missing_file_is_a_config_error(self) -> None:
        with self.assertRaises(r2_upload.ConfigError):
            r2_upload.parse_env_file(Path("does-not-exist.env"))


class EndpointTests(unittest.TestCase):
    def test_strips_bucket_path_suffix(self) -> None:
        self.assertEqual(
            r2_upload.normalize_endpoint(
                "https://account.r2.cloudflarestorage.com/pharmeazor", "pharmeazor"
            ),
            "https://account.r2.cloudflarestorage.com",
        )

    def test_keeps_account_endpoint(self) -> None:
        self.assertEqual(
            r2_upload.normalize_endpoint(
                "https://account.r2.cloudflarestorage.com/", "pharmeazor"
            ),
            "https://account.r2.cloudflarestorage.com",
        )

    def test_rejects_unexpected_path(self) -> None:
        with self.assertRaises(r2_upload.ConfigError):
            r2_upload.normalize_endpoint(
                "https://account.r2.cloudflarestorage.com/other", "pharmeazor"
            )

    def test_rejects_unsafe_endpoints(self) -> None:
        for endpoint in (
            "http://account.r2.cloudflarestorage.com",
            "https://user:pass@account.r2.cloudflarestorage.com",
            "https://account.r2.cloudflarestorage.com?x=1",
        ):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(r2_upload.ConfigError):
                    r2_upload.normalize_endpoint(endpoint, "pharmeazor")

    def test_resolve_config_redacts_secrets(self) -> None:
        assignments = {
            "STORAGE_BUCKET": ["pharmeazor"],
            "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com/pharmeazor"],
            "S3_REGION": ["auto"],
            "S3_ACCESS_KEY_ID": ["AKIAEXAMPLE"],
            "S3_SECRET_ACCESS_KEY": ["super-secret"],
            "S3_PUBLIC_URL": ["https://pub-example.r2.dev/"],
        }
        config = r2_upload.resolve_config(assignments, environ={})
        self.assertEqual(config.bucket, "pharmeazor")
        self.assertEqual(config.endpoint, "https://account.r2.cloudflarestorage.com")
        self.assertEqual(config.region, "auto")
        self.assertEqual(config.public_url, "https://pub-example.r2.dev/")
        self.assertNotIn("super-secret", repr(config))
        self.assertNotIn("AKIAEXAMPLE", repr(config))
        self.assertEqual(
            config.redact("failed with super-secret for AKIAEXAMPLE"),
            "failed with <redacted> for <redacted>",
        )


class KeyTests(unittest.TestCase):
    def test_preserves_relative_filename(self) -> None:
        relative = Path("enalapril") / "enalapril__bdpm-fr__doc002__notice.txt"
        self.assertEqual(
            r2_upload.object_key("corpus/raw", relative),
            "corpus/raw/enalapril/enalapril__bdpm-fr__doc002__notice.txt",
        )

    def test_normalizes_prefix(self) -> None:
        self.assertEqual(
            r2_upload.normalize_prefix(" /corpus//raw/ "), "corpus/raw"
        )

    def test_rejects_parent_traversal(self) -> None:
        with self.assertRaises(r2_upload.ConfigError):
            r2_upload.object_key("corpus/raw", Path("..") / "escape.txt")
        with self.assertRaises(r2_upload.ConfigError):
            r2_upload.normalize_prefix("corpus/../raw")

    def test_content_types(self) -> None:
        self.assertEqual(
            r2_upload.guess_content_type(Path("doc.md")), "text/markdown; charset=utf-8"
        )
        self.assertEqual(
            r2_upload.guess_content_type(Path("manifest.jsonl")),
            "application/x-ndjson; charset=utf-8",
        )
        self.assertEqual(r2_upload.guess_content_type(Path("doc.pdf")), "application/pdf")

    def test_safe_relative_key_maps_remote_keys(self) -> None:
        self.assertEqual(
            r2_upload.safe_relative_key(
                "corpus/raw/enalapril/enalapril__notice.txt", "corpus/raw"
            ),
            Path("enalapril") / "enalapril__notice.txt",
        )

    def test_safe_relative_key_rejects_unsafe_remote_keys(self) -> None:
        for key in (
            "corpus/raw/../escape.txt",
            "corpus/raw//empty-segment.txt",
            "other/prefix/file.txt",
            "corpus/raw/C:/windows.txt",
            "corpus/raw/CON",
        ):
            with self.subTest(key=key):
                with self.assertRaises(r2_upload.ConfigError):
                    r2_upload.safe_relative_key(key, "corpus/raw")

    def test_plan_skips_secrets_and_caches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "keep").mkdir()
            (root / "keep" / "doc.md").write_text("hello", encoding="utf-8")
            (root / "keep" / ".env.local").write_text("SECRET=1", encoding="utf-8")
            (root / "__pycache__").mkdir()
            (root / "__pycache__" / "x.pyc").write_bytes(b"cache")
            plan = r2_upload.build_plan(root, "corpus/test")

        self.assertEqual([item.key for item in plan], ["corpus/test/keep/doc.md"])


if __name__ == "__main__":
    unittest.main()
