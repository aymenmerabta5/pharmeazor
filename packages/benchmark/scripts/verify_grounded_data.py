"""Verify that the v1 benchmark remains grounded in the embedding-lab corpus.

Run from the repository root:

    python packages/benchmark/scripts/verify_grounded_data.py

The script is intentionally dependency-free. It checks that every cited chunk
exists, every evidence passage is a verbatim substring of that chunk, provenance
matches the chunk, answers cite supplied markers, and numeric claims are either
present in the evidence or explicitly allowed as arithmetic derived from the
question. It also verifies that pharmacist sign-off metadata was carried into
the strict JSONL fields.
"""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CHUNKS_PATH = ROOT / "tooling/embedding-lab/output/embeddings/chunks.jsonl"
DATA = ROOT / "packages/benchmark/data/v1"
SIGNATURE = "pharmacist sign-off reconciled"

NUM = r"(\d{1,3}(?:[ \u00a0]\d{3})*|\d+)(?:[.,](\d+))?"
UNIT = r"(mg|g|\u00b5g|mcg|ug|ml|l|ui|iu|%|kg)"
PATTERN = re.compile(rf"{NUM}\s*{UNIT}", re.I)
UNIT_NORMALIZE = {
    "mg": "mg",
    "g": "g",
    "\u00b5g": "\u00b5g",
    "mcg": "\u00b5g",
    "ug": "\u00b5g",
    "ml": "ml",
    "l": "l",
    "ui": "ui",
    "iu": "ui",
    "%": "%",
    "kg": "kg",
}

# Values computed from the question, not claimed as corpus text. Q-TOS-001 asks
# about 2 g every 4 hours: 2 g x 6 daily doses = 12 g/day, versus the label's
# 4 g/day ceiling. The operands and ceiling are in the supplied passages.
DERIVED_NUMBERS = {
    "Q-TOS-001": {("g", 2.0), ("g", 12.0)},
}


def numbers(text: str) -> set[tuple[str, float]]:
    out: set[tuple[str, float]] = set()
    for match in PATTERN.finditer(text):
        integer = (match.group(1) or "").replace(" ", "").replace("\u00a0", "")
        decimal = match.group(2) or ""
        value = float(f"{integer}.{decimal}" if decimal else integer)
        unit = UNIT_NORMALIZE[match.group(3).lower()]
        out.add((unit, value))
    return out


def load_jsonl(path: Path) -> list[dict]:
    with open(path, encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


chunks: dict[str, dict] = {}
with open(CHUNKS_PATH, encoding="utf-8") as handle:
    for line in handle:
        row = json.loads(line)
        chunks[row["chunk_id"]] = row

with open(DATA / "PHARMACIST_SIGNOFF_SHEET.csv", encoding="utf-8") as handle:
    signoff = {row["question_id"]: row for row in csv.DictReader(handle)}

questions = load_jsonl(DATA / "questions.jsonl")
annotations = load_jsonl(DATA / "gold_annotations.jsonl")
with open(DATA / "dataset.meta.json", encoding="utf-8") as handle:
    meta = json.load(handle)

errors: list[str] = []
if len(questions) != 50 or len(annotations) != 50:
    errors.append(f"row counts: {len(questions)}/{len(annotations)}")
q_by_id = {row["question_id"]: row for row in questions}
a_by_id = {row["question_id"]: row for row in annotations}
if set(q_by_id) != set(a_by_id) or set(q_by_id) != set(signoff):
    errors.append("question/annotation/signoff id mismatch")

wanted: set[str] = set()
for ann in annotations:
    wanted.update(ann["relevant_chunk_ids"])
    wanted.update(p["chunk_id"] for p in ann["evidence_bundle"] if p.get("chunk_id"))
missing_chunks = sorted(wanted - set(chunks))
if missing_chunks:
    errors.append(f"unknown chunk ids: {missing_chunks}")
    raise SystemExit("\n".join(errors))

for q in questions:
    qid = q["question_id"]
    ann = a_by_id[qid]
    row = signoff[qid]
    if q["review_status"] != "APPROVED":
        errors.append(f"{qid}: question not APPROVED")
    if ann["verification_status"] != "VERIFIED":
        errors.append(f"{qid}: annotation not VERIFIED")
    if SIGNATURE not in ann["reviewer_notes"]:
        errors.append(f"{qid}: sign-off reconciliation missing from reviewer_notes")
    if ann["reviewed_by"] != row["signoff_reviewer"]:
        errors.append(f"{qid}: reviewed_by does not match sign-off sheet")
    if ann["reviewed_at"] != row["signoff_at"]:
        errors.append(f"{qid}: reviewed_at does not match sign-off sheet")
    if not ann["reference_answer"]:
        errors.append(f"{qid}: empty reference answer")
    if not ann["expected_facts"]:
        errors.append(f"{qid}: empty expected facts")
    if ann["answerable_without_corpus"] is not False:
        errors.append(f"{qid}: answerability not false")
    if ann["difficulty"] not in {"EASY", "MEDIUM", "HARD"}:
        errors.append(f"{qid}: difficulty {ann['difficulty']!r}")
    if ann["expected_behavior"] != q["expected_raw_behavior"]:
        errors.append(f"{qid}: behavior mismatch")
    if not ann["relevant_chunk_ids"] or not ann["evidence_bundle"]:
        errors.append(f"{qid}: missing chunks or evidence")

    evidence_ids = [p["evidence_id"] for p in ann["evidence_bundle"]]
    if len(evidence_ids) != len(set(evidence_ids)):
        errors.append(f"{qid}: duplicate evidence ids")
    evidence_chunk_ids = [p["chunk_id"] for p in ann["evidence_bundle"]]
    if len(evidence_chunk_ids) != len(set(evidence_chunk_ids)):
        errors.append(f"{qid}: duplicate evidence chunk ids")
    if len(ann["relevant_chunk_ids"]) != len(set(ann["relevant_chunk_ids"])):
        errors.append(f"{qid}: duplicate relevant chunks")

    evidence_text = "\n".join(p["text"] for p in ann["evidence_bundle"])
    supplied = set(evidence_ids)
    for marker in re.findall(r"\[E(\d{1,2})\]", ann["reference_answer"]):
        if f"E{marker}" not in supplied:
            errors.append(f"{qid}: bad citation [E{marker}]")
    unsupported = numbers(ann["reference_answer"]) - numbers(evidence_text) - DERIVED_NUMBERS.get(qid, set())
    if unsupported:
        errors.append(f"{qid}: reference numbers not in evidence: {sorted(unsupported)}")

    for passage in ann["evidence_bundle"]:
        cid = passage["chunk_id"]
        if cid not in chunks:
            errors.append(f"{qid}: unknown evidence chunk {cid!r}")
            continue
        chunk = chunks[cid]
        if passage["text"] not in chunk["text"]:
            errors.append(f"{qid}: evidence text not verbatim in {cid}")
        expected_source = cid.split("__")[1] if "__" in cid else None
        if passage["source_id"] != expected_source:
            errors.append(f"{qid}: source_id {passage['source_id']} != {expected_source}")
        if passage["section_code"] != chunk["section_code"]:
            errors.append(f"{qid}: section_code mismatch for {cid}")
        if cid not in ann["relevant_chunk_ids"]:
            errors.append(f"{qid}: evidence chunk not relevant-labelled: {cid}")

if meta["question_count"] != 50 or meta["status"] != "APPROVED":
    errors.append("meta count/status")
expected_categories = {
    "GENERAL_MEDICATION_KNOWLEDGE": 7,
    "MEDICATION_IDENTIFICATION": 9,
    "DOSAGE_AND_NUMERICAL_KNOWLEDGE": 7,
    "CONTRAINDICATIONS_AND_WARNINGS": 9,
    "DRUG_INTERACTIONS": 9,
    "TRAP_AND_OUT_OF_SCOPE": 9,
}
if meta["category_counts"] != expected_categories:
    errors.append("meta categories")
if meta["language_counts"] != {"fr": 30, "en": 10, "ar": 10}:
    errors.append("meta languages")

actual_languages: dict[str, int] = {}
actual_categories: dict[str, int] = {}
for q in questions:
    actual_languages[q["language"]] = actual_languages.get(q["language"], 0) + 1
    actual_categories[q["category"]] = actual_categories.get(q["category"], 0) + 1
if actual_languages != meta["language_counts"]:
    errors.append("actual languages")
if actual_categories != expected_categories:
    errors.append("actual categories")

print(f"questions={len(questions)} annotations={len(annotations)} chunks={len(wanted)}")
print(f"language_counts={actual_languages}")
print(f"category_counts={actual_categories}")
print(f"errors={len(errors)}")
for error in errors:
    print(error)
raise SystemExit(1 if errors else 0)
