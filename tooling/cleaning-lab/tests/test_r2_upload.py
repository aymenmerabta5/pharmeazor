"""Tests for the cleaning lab's R2 defaults (no boto3 or network needed)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import r2_upload  # noqa: E402


class DefaultArgumentTests(unittest.TestCase):
    def test_upload_defaults_to_output_and_cleaning_prefix(self) -> None:
        self.assertEqual(
            r2_upload.defaulted_argv([]),
            ["--source", str(r2_upload.OUTPUT_ROOT), "--prefix", "cleaning-lab"],
        )

    def test_explicit_source_and_prefix_win(self) -> None:
        argv = r2_upload.defaulted_argv(
            ["--source", "custom", "--prefix", "custom-prefix", "verify"]
        )
        self.assertEqual(argv, ["--source", "custom", "--prefix", "custom-prefix", "verify"])

    def test_download_defaults_to_the_lab_download_folder(self) -> None:
        argv = r2_upload.defaulted_argv(["download"])
        self.assertEqual(
            argv,
            [
                "--source",
                str(r2_upload.OUTPUT_ROOT),
                "--prefix",
                "cleaning-lab",
                "--dest",
                str(r2_upload.DOWNLOAD_ROOT),
                "download",
            ],
        )

    def test_download_keeps_an_explicit_destination(self) -> None:
        argv = r2_upload.defaulted_argv(["download", "--dest", "elsewhere"])
        self.assertNotIn(str(r2_upload.DOWNLOAD_ROOT), argv)
        self.assertEqual(argv.count("--dest"), 1)

    def test_option_values_are_not_mistaken_for_commands(self) -> None:
        self.assertEqual(r2_upload._command(["--report", "download", "verify"]), "verify")
        self.assertEqual(r2_upload._command(["--report=download", "upload"]), "upload")
        self.assertEqual(r2_upload._command(["--workers", "4"]), "upload")


if __name__ == "__main__":
    unittest.main()
