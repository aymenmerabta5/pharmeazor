"""CSV-backed provenance store (small-scale, atomic, idempotent).

One row per *source-document record*: the same file (same SHA-256) coming from
two different source URLs keeps two rows but only one physical file.
"""
from pathlib import Path

import pandas as pd

from config import DOCUMENTS_CSV, DOCUMENT_COLUMNS, ROOT


def read_table(path: Path, columns: list) -> pd.DataFrame:
    if path.exists() and path.stat().st_size > 0:
        try:
            df = pd.read_csv(path, dtype=str, keep_default_na=False)
        except pd.errors.EmptyDataError:
            return pd.DataFrame(columns=columns)
        for c in columns:
            if c not in df.columns:
                df[c] = ""
        return df[columns]
    return pd.DataFrame(columns=columns)


def write_table(path: Path, df: pd.DataFrame):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    df.to_csv(tmp, index=False)
    tmp.replace(path)


def resolve_path(stored: str) -> Path:
    """Stored paths are relative to the project root; make them absolute."""
    if not stored:
        return Path()
    p = Path(stored)
    return p if p.is_absolute() else (ROOT / p)


class DocumentStore:
    def __init__(self, path: Path = DOCUMENTS_CSV):
        self.path = path
        self.df = read_table(path, DOCUMENT_COLUMNS)

    # -- identifiers -------------------------------------------------------
    def next_document_id(self, medicine_id: str, source_id: str) -> str:
        """MED001__SRC_ANPP__DOC001 (naming convention from the workflow doc).

        The counter is monotonic (highest existing number + 1), so an id is
        never handed out twice - even when a row is not stored because the
        document had already been collected (a rerun with --refresh).
        """
        prefix = f"{medicine_id}__SRC_{source_id}__DOC"
        numbers = []
        for value in self.df["document_id"]:
            if value and value.startswith(prefix):
                tail = value[len(prefix):]
                if tail.isdigit():
                    numbers.append(int(tail))
        return f"{prefix}{max(numbers) + 1 if numbers else 1:03d}"

    # -- lookups -----------------------------------------------------------
    def find_same(self, medicine_id, source_id, source_url) -> pd.DataFrame:
        m = (
            (self.df["medicine_id"] == medicine_id)
            & (self.df["source_id"] == source_id)
            & (self.df["source_url"] == source_url)
        )
        return self.df[m]

    def find_file_by_hash(self, sha: str):
        """Any already-stored physical file with this content hash."""
        if not sha:
            return None
        sub = self.df[(self.df["sha256"] == sha) & (self.df["file_path"] != "")]
        for _, row in sub.iterrows():
            p = resolve_path(row["file_path"])
            if p.exists():
                return p
        return None

    def rows_for(self, medicine_id: str) -> pd.DataFrame:
        return self.df[self.df["medicine_id"] == medicine_id]

    # -- writes ------------------------------------------------------------
    def drop_where(self, medicine_id: str, source_id: str, statuses: list) -> int:
        """Remove superseded placeholder rows (the history stays in the audit log)."""
        if self.df.empty:
            return 0
        mask = (
            (self.df["medicine_id"] == medicine_id)
            & (self.df["source_id"] == source_id)
            & (self.df["collection_status"].isin(statuses))
        )
        removed = int(mask.sum())
        if removed:
            self.df = self.df[~mask].reset_index(drop=True)
            write_table(self.path, self.df)
        return removed

    def drop_where_any(self, source_id: str, statuses: list) -> int:
        """Remove placeholder rows of a source for every medicine."""
        if self.df.empty:
            return 0
        mask = ((self.df["source_id"] == source_id)
                & (self.df["collection_status"].isin(statuses)))
        removed = int(mask.sum())
        if removed:
            self.df = self.df[~mask].reset_index(drop=True)
            write_table(self.path, self.df)
        return removed

    def add(self, row: dict) -> str:
        self.df = pd.concat([self.df, pd.DataFrame([row])], ignore_index=True)
        write_table(self.path, self.df)
        return row.get("document_id", "")

    def update(self, document_id: str, **fields):
        m = self.df["document_id"] == document_id
        if not m.any():
            return
        for k, v in fields.items():
            if k in self.df.columns:
                self.df.loc[m, k] = v
        write_table(self.path, self.df)
