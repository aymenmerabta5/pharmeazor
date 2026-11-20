"""Splitter preview over the cleaned Markdown corpus.

This is deliberately *only* a preview: the retrieval pipeline owns the final
chunk table and the chunk identifiers. Here we prove that every clean document
splits into sane, section-aware chunks with the intended settings, and write a
small sample for inspection.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import tiktoken
from langchain_core.documents import Document
from langchain_text_splitters import (
    MarkdownHeaderTextSplitter,
    RecursiveCharacterTextSplitter,
)

from .sections import classify_heading, normalize_key


@dataclass
class ChunkRecord:
    artifact_id: str
    chunk_index: int
    section: str
    tokens: int
    text: str
    metadata: dict[str, Any]


def split_markdown(
    body: str,
    *,
    artifact_id: str,
    metadata: dict[str, Any],
    tokenizer_name: str,
    chunk_size: int,
    chunk_overlap: int,
) -> list[ChunkRecord]:
    body = strip_front_matter(body)
    header_splitter = MarkdownHeaderTextSplitter(
        headers_to_split_on=[
            ("#", "h1"),
            ("##", "h2"),
            ("###", "h3"),
            ("####", "h4"),
            ("#####", "h5"),
        ],
        strip_headers=False,
    )
    recursive = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        encoding_name=tokenizer_name,
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
    )
    encoding = tiktoken.get_encoding(tokenizer_name)
    section_documents: list[Document] = header_splitter.split_text(body)
    chunks: list[ChunkRecord] = []
    for section_document in section_documents:
        deepest = ""
        for key in ("h5", "h4", "h3", "h2", "h1"):
            if section_document.metadata.get(key):
                deepest = section_document.metadata[key]
                break
        code = classify_heading(deepest) if deepest else "other"
        for piece in recursive.split_documents([section_document]):
            text = piece.page_content.strip()
            if not text:
                continue
            merged_metadata = dict(metadata)
            merged_metadata.update(piece.metadata)
            merged_metadata["section"] = code
            merged_metadata["section_heading"] = deepest
            chunks.append(
                ChunkRecord(
                    artifact_id=artifact_id,
                    chunk_index=len(chunks),
                    section=code,
                    tokens=len(encoding.encode(text)),
                    text=text,
                    metadata=merged_metadata,
                )
            )
    return chunks


def merge_small_chunks(
    chunks: list[ChunkRecord],
    *,
    min_tokens: int = 80,
    max_tokens: int = 900,
) -> list[ChunkRecord]:
    """Attach tiny heading-only chunks to a neighbour before embedding.

    Markdown section-aware splitting produces some 5-20 token fragments
    (headings with a one-line section). They are valid text but poor embedding
    units, so the preview merges them while it still can.
    """
    merged: list[ChunkRecord] = []
    for chunk in chunks:
        if (
            merged
            and min(merged[-1].tokens, chunk.tokens) < min_tokens
            and merged[-1].tokens + chunk.tokens <= max_tokens
        ):
            previous = merged[-1]
            section = previous.section if previous.section != "other" else chunk.section
            section_heading = previous.metadata.get("section_heading") or chunk.metadata.get(
                "section_heading", ""
            )
            metadata = dict(previous.metadata)
            metadata["section"] = section
            metadata["section_heading"] = section_heading
            merged[-1] = ChunkRecord(
                artifact_id=previous.artifact_id,
                chunk_index=previous.chunk_index,
                section=section,
                tokens=previous.tokens + chunk.tokens,
                text=previous.text + "\n\n" + chunk.text,
                metadata=metadata,
            )
        else:
            merged.append(chunk)
    for index, chunk in enumerate(merged):
        chunk.chunk_index = index
    return merged


def strip_front_matter(text: str) -> str:
    if text.startswith("---"):
        match = re.match(r"^---\n.*?\n---\n", text, re.DOTALL)
        if match:
            return text[match.end() :].lstrip("\n")
    return text


def preview(
    documents: list[tuple[str, str, dict[str, Any]]],
    output_dir: Path,
    *,
    tokenizer_name: str,
    chunk_size: int,
    chunk_overlap: int,
    sample_per_document: int = 2,
    merge_min_tokens: int = 80,
) -> dict[str, Any]:
    """Split every document, write a sample, and return corpus-level stats."""
    output_dir.mkdir(parents=True, exist_ok=True)
    sample_path = output_dir / "chunks_sample.jsonl"
    per_document: list[dict[str, Any]] = []
    all_chunks: list[ChunkRecord] = []
    with sample_path.open("w", encoding="utf-8") as handle:
        for artifact_id, body, metadata in documents:
            chunks = split_markdown(
                body,
                artifact_id=artifact_id,
                metadata=metadata,
                tokenizer_name=tokenizer_name,
                chunk_size=chunk_size,
                chunk_overlap=chunk_overlap,
            )
            chunks = merge_small_chunks(
                chunks, min_tokens=merge_min_tokens, max_tokens=chunk_size
            )
            all_chunks.extend(chunks)
            token_counts = [chunk.tokens for chunk in chunks]
            per_document.append(
                {
                    "artifact_id": artifact_id,
                    "chunks": len(chunks),
                    "min_tokens": min(token_counts) if token_counts else 0,
                    "median_tokens": sorted(token_counts)[len(token_counts) // 2] if token_counts else 0,
                    "max_tokens": max(token_counts) if token_counts else 0,
                    "sections": sorted({chunk.section for chunk in chunks}),
                }
            )
            for chunk in chunks[:sample_per_document]:
                handle.write(
                    json.dumps(
                        {
                            "artifact_id": chunk.artifact_id,
                            "chunk_index": chunk.chunk_index,
                            "section": chunk.section,
                            "section_heading": chunk.metadata.get("section_heading", ""),
                            "tokens": chunk.tokens,
                            "text": chunk.text,
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
    token_counts = [chunk.tokens for chunk in all_chunks]
    stats = {
        "documents": len(documents),
        "chunks": len(all_chunks),
        "tokens": {
            "min": min(token_counts) if token_counts else 0,
            "median": sorted(token_counts)[len(token_counts) // 2] if token_counts else 0,
            "max": max(token_counts) if token_counts else 0,
        },
        "too_small": sum(1 for count in token_counts if count < 40),
        "too_large": sum(1 for count in token_counts if count > 1100),
        "per_document": per_document,
        "settings": {
            "tokenizer": tokenizer_name,
            "chunk_size_tokens": chunk_size,
            "chunk_overlap_tokens": chunk_overlap,
        },
    }
    (output_dir / "chunk_stats.json").write_text(
        json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return stats
