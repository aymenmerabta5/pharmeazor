"""Tests for the shared bucket module's pure helpers (no boto3 or network needed)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import bucket_operations as bucket  # noqa: E402


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
            assignments = bucket.parse_env_file(env_file)

        self.assertEqual(bucket.env_value(assignments, "STORAGE_BUCKET", environ={}), "pharmeazor")
        self.assertEqual(
            bucket.env_value(assignments, "S3_ENDPOINT", environ={}),
            "https://account.r2.cloudflarestorage.com/pharmeazor",
        )

    def test_process_environment_wins(self) -> None:
        assignments = {"STORAGE_BUCKET": ["file-bucket"]}
        self.assertEqual(
            bucket.env_value(
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
            assignments = bucket.parse_env_file(env_file)

        self.assertEqual(bucket.env_value(assignments, "BUCKET", environ={}), "quoted-bucket")
        self.assertEqual(
            bucket.env_value(assignments, "SECRET", environ={}), "value with spaces"
        )
        self.assertEqual(bucket.env_value(assignments, "PLAIN", environ={}), "value")
        self.assertIsNone(bucket.env_value(assignments, "PLACEHOLDER", environ={}))

    def test_missing_file_is_a_config_error(self) -> None:
        with self.assertRaises(bucket.ConfigError):
            bucket.parse_env_file(Path("does-not-exist.env"))


class EndpointTests(unittest.TestCase):
    def test_strips_bucket_path_suffix(self) -> None:
        self.assertEqual(
            bucket.normalize_endpoint(
                "https://account.r2.cloudflarestorage.com/pharmeazor", "pharmeazor"
            ),
            "https://account.r2.cloudflarestorage.com",
        )

    def test_keeps_account_endpoint(self) -> None:
        self.assertEqual(
            bucket.normalize_endpoint(
                "https://account.r2.cloudflarestorage.com/", "pharmeazor"
            ),
            "https://account.r2.cloudflarestorage.com",
        )

    def test_rejects_unexpected_path(self) -> None:
        with self.assertRaises(bucket.ConfigError):
            bucket.normalize_endpoint(
                "https://account.r2.cloudflarestorage.com/other", "pharmeazor"
            )

    def test_rejects_unsafe_endpoints(self) -> None:
        for endpoint in (
            "http://account.r2.cloudflarestorage.com",
            "https://user:pass@account.r2.cloudflarestorage.com",
            "https://account.r2.cloudflarestorage.com?x=1",
        ):
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(bucket.ConfigError):
                    bucket.normalize_endpoint(endpoint, "pharmeazor")

    def test_resolve_config_redacts_secrets(self) -> None:
        assignments = {
            "STORAGE_BUCKET": ["pharmeazor"],
            "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com/pharmeazor"],
            "S3_REGION": ["auto"],
            "S3_ACCESS_KEY_ID": ["AKIAEXAMPLE"],
            "S3_SECRET_ACCESS_KEY": ["super-secret"],
            "S3_PUBLIC_URL": ["https://pub-example.r2.dev/"],
        }
        config = bucket.resolve_config(assignments, environ={})
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

    def test_derives_bucket_from_endpoint_when_storage_bucket_is_a_placeholder(self) -> None:
        config = bucket.resolve_config(
            {
                "STORAGE_BUCKET": ["REPLACE_WITH_BUCKET"],
                "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com/pharmeazor"],
                "S3_REGION": ["auto"],
                "S3_ACCESS_KEY_ID": ["key"],
                "S3_SECRET_ACCESS_KEY": ["secret"],
            },
            environ={},
        )
        self.assertEqual(config.bucket, "pharmeazor")

    def test_requires_a_bucket_when_the_endpoint_has_no_bucket_path(self) -> None:
        with self.assertRaises(bucket.ConfigError):
            bucket.resolve_config(
                {
                    "STORAGE_BUCKET": ["REPLACE_WITH_BUCKET"],
                    "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com"],
                    "S3_ACCESS_KEY_ID": ["key"],
                    "S3_SECRET_ACCESS_KEY": ["secret"],
                },
                environ={},
            )


class KeyTests(unittest.TestCase):
    def test_preserves_relative_filename(self) -> None:
        relative = Path("enalapril") / "enalapril__bdpm-fr__doc002__notice.txt"
        self.assertEqual(
            bucket.object_key("corpus/raw", relative),
            "corpus/raw/enalapril/enalapril__bdpm-fr__doc002__notice.txt",
        )

    def test_normalizes_prefix(self) -> None:
        self.assertEqual(bucket.normalize_prefix(" /corpus//raw/ "), "corpus/raw")

    def test_rejects_parent_traversal(self) -> None:
        with self.assertRaises(bucket.ConfigError):
            bucket.object_key("corpus/raw", Path("..") / "escape.txt")
        with self.assertRaises(bucket.ConfigError):
            bucket.normalize_prefix("corpus/../raw")

    def test_content_types(self) -> None:
        self.assertEqual(
            bucket.guess_content_type(Path("doc.md")), "text/markdown; charset=utf-8"
        )
        self.assertEqual(
            bucket.guess_content_type(Path("manifest.jsonl")),
            "application/x-ndjson; charset=utf-8",
        )
        self.assertEqual(bucket.guess_content_type(Path("doc.pdf")), "application/pdf")

    def test_safe_relative_key_maps_remote_keys(self) -> None:
        self.assertEqual(
            bucket.safe_relative_key(
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
                with self.assertRaises(bucket.ConfigError):
                    bucket.safe_relative_key(key, "corpus/raw")

    def test_plan_skips_secrets_and_caches(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "keep").mkdir()
            (root / "keep" / "doc.md").write_text("hello", encoding="utf-8")
            (root / "keep" / ".env.local").write_text("SECRET=1", encoding="utf-8")
            (root / "__pycache__").mkdir()
            (root / "__pycache__" / "x.pyc").write_bytes(b"cache")
            (root / ".cache").mkdir()
            (root / ".cache" / "http.bin").write_bytes(b"cache")
            plan = bucket.build_plan(root, "corpus/test")

        self.assertEqual([item.key for item in plan], ["corpus/test/keep/doc.md"])


class DatasetTests(unittest.TestCase):
    def test_every_retrieval_tree_is_covered(self) -> None:
        names = {dataset.name for dataset in bucket.DATASETS}
        self.assertTrue(
            {
                "retrieval-raw",
                "retrieval-metadata",
                "retrieval-reports",
                "retrieval-input",
                "retrieval-recon",
                "retrieval-logs",
                "retrieval-quarantine",
                "cleaning-output",
                "embedding-output",
            }.issubset(names)
        )

    def test_cleaning_output_covers_context_and_chunks(self) -> None:
        dataset = bucket.DATASETS_BY_NAME["cleaning-output"]
        self.assertEqual(dataset.local_root, bucket.PROCESSED_ROOT)
        self.assertEqual(dataset.prefix, "cleaning-lab")
        self.assertEqual(dataset.marker, "manifest.jsonl")

    def test_embedding_output_covers_the_vector_artifact(self) -> None:
        dataset = bucket.DATASETS_BY_NAME["embedding-output"]
        self.assertEqual(dataset.local_root, bucket.EMBEDDING_OUTPUT)
        self.assertEqual(dataset.prefix, "embedding-lab")
        self.assertEqual(dataset.marker, "embeddings/manifest.json")
        self.assertEqual(dataset.group, "embedding")

    def test_select_datasets_defaults_to_all_and_rejects_unknown(self) -> None:
        self.assertEqual(bucket.select_datasets(), list(bucket.DATASETS))
        self.assertEqual(
            [dataset.name for dataset in bucket.select_datasets(["cleaning-output"])],
            ["cleaning-output"],
        )
        with self.assertRaises(bucket.ConfigError):
            bucket.select_datasets(["nope"])

    def test_groups_select_every_tree_in_a_lab(self) -> None:
        self.assertEqual(
            bucket.DATASET_GROUPS, ("cleaning", "embedding", "retrieval")
        )
        retrieval = bucket.select_datasets(groups=["retrieval"])
        self.assertEqual(len(retrieval), 8)
        self.assertTrue(all(dataset.group == "retrieval" for dataset in retrieval))
        cleaning = bucket.select_datasets(groups=["cleaning"])
        self.assertEqual([dataset.name for dataset in cleaning], ["cleaning-output"])
        embedding = bucket.select_datasets(groups=["embedding"])
        self.assertEqual(
            [dataset.name for dataset in embedding], ["embedding-output"]
        )
        self.assertEqual(
            [dataset.name for dataset in bucket.select_datasets(["cleaning-output"], ["retrieval"])],
            ["cleaning-output"],
        )
        with self.assertRaises(bucket.ConfigError):
            bucket.select_datasets(groups=["nope"])

    def test_state_requires_the_marker_for_a_complete_dataset(self) -> None:
        dataset = bucket.DATASETS_BY_NAME["cleaning-output"]
        partial = bucket.DatasetState(
            dataset=dataset,
            remote_prefix="cleaning-lab",
            remote={"cleaning-lab/documents/a.md": 3},
            local=[],
        )
        self.assertFalse(partial.complete)
        self.assertEqual(partial.state, "remote partial")

        complete = bucket.DatasetState(
            dataset=dataset,
            remote_prefix="cleaning-lab",
            remote={
                "cleaning-lab/documents/a.md": 3,
                "cleaning-lab/manifest.jsonl": 10,
            },
            local=[],
        )
        self.assertTrue(complete.complete)
        self.assertEqual(complete.state, "remote only")

    def test_embedding_state_requires_the_nested_manifest(self) -> None:
        dataset = bucket.DATASETS_BY_NAME["embedding-output"]
        partial = bucket.DatasetState(
            dataset=dataset,
            remote_prefix="embedding-lab",
            remote={"embedding-lab/embeddings/vectors.npy": 3},
            local=[],
        )
        self.assertFalse(partial.complete)
        self.assertEqual(partial.state, "remote partial")

        complete = bucket.DatasetState(
            dataset=dataset,
            remote_prefix="embedding-lab",
            remote={
                "embedding-lab/embeddings/vectors.npy": 3,
                "embedding-lab/embeddings/manifest.json": 10,
            },
            local=[],
        )
        self.assertTrue(complete.complete)
        self.assertEqual(complete.state, "remote only")

    def test_legacy_prefix_is_a_read_fallback_only(self) -> None:
        dataset = bucket.DATASETS_BY_NAME["retrieval-raw"]
        self.assertEqual(dataset.prefix, "retrieval-lab/raw")
        self.assertIn("corpus/raw", dataset.legacy_prefixes)

        class Paginator:
            def __init__(self, objects):
                self.objects = objects

            def paginate(self, **kwargs):
                prefix = kwargs["Prefix"]
                return [
                    {
                        "Contents": [
                            {"Key": key, "Size": 1}
                            for key in self.objects
                            if key.startswith(prefix)
                        ]
                    }
                ]

        class Client:
            def __init__(self, objects):
                self.objects = objects

            def get_paginator(self, _name):
                return Paginator(self.objects)

        config = bucket.resolve_config(
            {
                "STORAGE_BUCKET": ["pharmeazor"],
                "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com/pharmeazor"],
                "S3_REGION": ["auto"],
                "S3_ACCESS_KEY_ID": ["key"],
                "S3_SECRET_ACCESS_KEY": ["secret"],
            },
            environ={},
        )
        prefix, remote = bucket.find_remote_objects(
            Client({"corpus/raw/enalapril/doc.txt": 1}), config, dataset
        )
        self.assertEqual(prefix, "corpus/raw")
        self.assertIn("corpus/raw/enalapril/doc.txt", remote)


class OrganizeTests(unittest.TestCase):
    def _config(self):
        return bucket.resolve_config(
            {
                "STORAGE_BUCKET": ["pharmeazor"],
                "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com/pharmeazor"],
                "S3_REGION": ["auto"],
                "S3_ACCESS_KEY_ID": ["key"],
                "S3_SECRET_ACCESS_KEY": ["secret"],
            },
            environ={},
        )

    def _client(self, objects):
        class Paginator:
            def __init__(self, items):
                self.items = items

            def paginate(self, **kwargs):
                prefix = kwargs["Prefix"]
                return [
                    {
                        "Contents": [
                            {"Key": key, "Size": size}
                            for key, size in self.items.items()
                            if key.startswith(prefix)
                        ]
                    }
                ]

        class Client:
            def __init__(self, items):
                self.items = dict(items)
                self.copied: list[tuple[str, str]] = []

            def get_paginator(self, _name):
                return Paginator(self.items)

            def head_object(self, Bucket, Key):  # noqa: N803 - boto3 signature
                return {"ContentLength": self.items[Key], "Metadata": {}}

            def copy_object(self, Bucket, Key, CopySource):  # noqa: N803
                self.copied.append((CopySource["Key"], Key))
                self.items[Key] = self.items[CopySource["Key"]]

        return Client(objects)

    def test_dry_run_plans_without_writing(self) -> None:
        client = self._client({"corpus/old/a.md": 3})
        dataset = bucket.Dataset(
            "test", Path("unused"), "corpus/new", legacy_prefixes=("corpus/old",)
        )
        results = bucket.organize_dataset(
            client, self._config(), dataset, dry_run=True
        )
        self.assertEqual([result.status for result in results], ["planned"])
        self.assertEqual(client.copied, [])
        self.assertNotIn("corpus/new/a.md", client.items)

    def test_copies_only_missing_objects_and_never_deletes(self) -> None:
        client = self._client(
            {
                "corpus/old/a.md": 3,
                "corpus/old/b.md": 4,
                "corpus/old/c.md": 5,
                "corpus/new/b.md": 9,
                "corpus/new/c.md": 5,
            }
        )
        dataset = bucket.Dataset(
            "test", Path("unused"), "corpus/new", legacy_prefixes=("corpus/old",)
        )
        results = bucket.organize_dataset(client, self._config(), dataset)
        by_source = {result.source_key: result for result in results}

        self.assertEqual(by_source["corpus/old/a.md"].status, "copied")
        self.assertEqual(by_source["corpus/old/b.md"].status, "conflict")
        self.assertEqual(by_source["corpus/old/c.md"].status, "present")
        self.assertEqual(client.copied, [("corpus/old/a.md", "corpus/new/a.md")])
        # The source objects and the conflicting destination are untouched.
        for key in ("corpus/old/a.md", "corpus/old/b.md", "corpus/old/c.md"):
            self.assertIn(key, client.items)
        self.assertEqual(client.items["corpus/new/b.md"], 9)


class ResetTests(unittest.TestCase):
    def _config(self):
        return bucket.resolve_config(
            {
                "STORAGE_BUCKET": ["pharmeazor"],
                "S3_ENDPOINT": ["https://account.r2.cloudflarestorage.com/pharmeazor"],
                "S3_REGION": ["auto"],
                "S3_ACCESS_KEY_ID": ["key"],
                "S3_SECRET_ACCESS_KEY": ["secret"],
            },
            environ={},
        )

    def _client(self, objects):
        class Paginator:
            def __init__(self, items):
                self.items = items

            def paginate(self, **kwargs):
                prefix = kwargs["Prefix"]
                return [
                    {
                        "Contents": [
                            {"Key": key, "Size": size}
                            for key, size in self.items.items()
                            if key.startswith(prefix)
                        ]
                    }
                ]

        class Client:
            def __init__(self, items):
                self.items = dict(items)
                self.deleted: list[str] = []

            def get_paginator(self, _name):
                return Paginator(self.items)

            def delete_object(self, Bucket, Key):  # noqa: N803 - boto3 signature
                self.deleted.append(Key)
                del self.items[Key]

        return Client(objects)

    def test_guard_requires_a_complete_local_copy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dataset = bucket.Dataset(
                "test", root, "test-lab", marker="manifest.jsonl"
            )

            allowed, reason = bucket.dataset_reset_guard(dataset)
            self.assertFalse(allowed)
            self.assertIn("empty", reason)

            (root / "a.md").write_text("x", encoding="utf-8")
            allowed, reason = bucket.dataset_reset_guard(dataset)
            self.assertFalse(allowed)
            self.assertIn("manifest.jsonl", reason)

            (root / "manifest.jsonl").write_text("{}", encoding="utf-8")
            allowed, _ = bucket.dataset_reset_guard(dataset)
            self.assertTrue(allowed)

    def test_guard_rejects_remote_objects_without_a_local_copy(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "documents").mkdir()
            (root / "documents" / "a.md").write_text("x", encoding="utf-8")
            (root / "manifest.jsonl").write_text("{}", encoding="utf-8")
            dataset = bucket.Dataset(
                "test",
                root,
                "test-lab",
                marker="manifest.jsonl",
                legacy_prefixes=("legacy",),
            )
            remote = {
                "test-lab/documents/a.md": ("test-lab", 1),
                "legacy/documents/a.md": ("legacy", 1),
                "legacy/documents/extra.md": ("legacy", 2),
            }

            allowed, reason = bucket.dataset_reset_guard(dataset, remote)
            self.assertFalse(allowed)
            self.assertIn("extra.md", reason)

            allowed, _ = bucket.dataset_reset_guard(
                dataset, remote, allow_remote_only=True
            )
            self.assertTrue(allowed)

    def test_dry_run_lists_both_prefixes_without_deleting(self) -> None:
        client = self._client({"lab/new/a.md": 3, "legacy/b.md": 4})
        dataset = bucket.Dataset(
            "test", Path("unused"), "lab/new", legacy_prefixes=("legacy",)
        )
        results = bucket.reset_dataset(client, self._config(), dataset, dry_run=True)

        self.assertEqual([result.status for result in results], ["planned", "planned"])
        self.assertEqual(client.deleted, [])
        self.assertEqual(len(client.items), 2)

    def test_reset_deletes_canonical_and_legacy_objects(self) -> None:
        client = self._client(
            {"lab/new/a.md": 3, "legacy/b.md": 4, "other/c.md": 5}
        )
        dataset = bucket.Dataset(
            "test", Path("unused"), "lab/new", legacy_prefixes=("legacy",)
        )
        results = bucket.reset_dataset(client, self._config(), dataset)

        self.assertEqual(
            {result.key for result in results}, {"lab/new/a.md", "legacy/b.md"}
        )
        self.assertTrue(all(result.status == "deleted" for result in results))
        self.assertEqual(client.items, {"other/c.md": 5})


if __name__ == "__main__":
    unittest.main()
