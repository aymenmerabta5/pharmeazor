"""One-time, no-deletion migration of the corpus to human-readable names.

The provenance tables keep the machine identifiers (`MED001`,
`MED001__SRC_DAILYMED__DOC002`); the files on disk carry the medicine name::

    data/raw/paracetamol/paracetamol__daily-med__doc002__ac-fast.pdf
    data/raw/_shared/bdpm-fr__cis-bdpm-txt.txt
    data/raw/paracetamol/notices/paracetamol__bdpm-fr__doc002__notice.txt

Rules enforced here:

* a file is **moved**, never deleted;
* a shared physical file (nomenclature register, composition register, a
  product document used by two medicines) is moved once, to `_shared/`;
* every move is written to `data/metadata/file_renames.csv` with its old and
  new path, the document ids and the SHA-256, so provenance survives;
* the command is idempotent: a second run finds nothing to move;
* an existing target is never overwritten (`__2`, `__3`, ... suffix).
"""
import os
import re
import time
from collections import defaultdict
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

from config import (
    DOCUMENTS_CSV, FILE_RENAMES_CSV, MEDICINES_CSV, META_DIR, QUARANTINE_DIR,
    RAW_DIR, REPORTS_DIR, ROOT, DOCUMENT_COLUMNS, MEDICINE_COLUMNS,
)
from src.storage import naming
from src.storage.store import read_table, write_table
from src.utils.hashing import sha256_file

MANIFEST_COLUMNS = [
    "moved_at", "kind", "old_path", "new_path", "medicine_ids",
    "document_ids", "sha256", "status", "note",
]

REPORT_FILES = [
    "coverage_report.csv",
    "notice_report.csv",
    "usage_report.csv",
    "pending_review.csv",
    "needs_attention.csv",
    "manual_actions.csv",
    "source_health.csv",
    "brand_gap.csv",
    "section_coverage.csv",
    "professors_list.csv",
]

# document types that are registers, not documents about one medicine
REGISTER_TYPES = {"nomenclature", "composition", "register"}

OLD_ID = re.compile(r"^(MED\d+)__SRC_(.+?)__(DOC\d+|NOTICE_\d+)(?:__NOTICE)?$")


@dataclass
class Move:
    kind: str
    old: Path
    new: Path
    medicine_ids: list = field(default_factory=list)
    document_ids: list = field(default_factory=list)
    note: str = ""


# ------------------------------------------------------------------ helpers
def _abs(value) -> Path:
    path = Path(str(value))
    return path if path.is_absolute() else ROOT / path


def _key(value) -> str:
    return os.path.normcase(os.path.normpath(str(_abs(value))))


def _rel(value) -> str:
    path = _abs(value)
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def _suffix(value) -> str:
    suffix = Path(str(value)).suffix.lower()
    return suffix or ".bin"


def _read_any(path: Path) -> pd.DataFrame:
    if path.exists() and path.stat().st_size:
        return pd.read_csv(path, dtype=str, keep_default_na=False)
    return pd.DataFrame()


def _reserve(target: Path, current_key: str, taken: set) -> Path:
    """Keep the target if it is the current path, otherwise never collide."""
    if _key(target) == current_key:
        return target
    if _key(target) in taken or target.exists():
        return _next_free(target, taken)
    return target


def _next_free(target: Path, taken: set) -> Path:
    for index in range(2, 10000):
        candidate = target.with_name(f"{target.stem}__{index}{target.suffix}")
        if _key(candidate) not in taken and not candidate.exists():
            return candidate
    return target.with_name(f"{target.stem}__copy{target.suffix}")


def _medicine(med_by_id: dict, medicine_id: str) -> dict:
    return med_by_id.get(medicine_id) or {"medicine_id": medicine_id, "name": medicine_id}


def _is_register(rows: list, owners: list) -> bool:
    types = {str(row.get("document_type") or "").strip().lower() for row in rows}
    return bool(types & REGISTER_TYPES) or len(owners) >= 5


# --------------------------------------------------------------- planning
def plan_document_moves(meds: pd.DataFrame, docs: pd.DataFrame):
    """Return (moves, targets) for every physical file in documents.csv."""
    med_by_id = {row["medicine_id"]: row for row in meds.to_dict("records")}
    grouped = defaultdict(list)
    for row in docs.to_dict("records"):
        if row.get("file_path"):
            grouped[_key(row["file_path"])].append(row)

    moves, targets, taken = [], {}, set()
    for key, rows in sorted(grouped.items()):
        source_id = rows[0].get("source_id", "")
        suffix = _suffix(rows[0]["file_path"])
        owners = sorted({row.get("medicine_id", "") for row in rows if row.get("medicine_id")})
        rep = min(rows, key=lambda row: row.get("document_id", ""))
        label = naming.document_label(rep)
        kind = "document"

        if "quarantine" in key:
            medicine_id = owners[0] if owners else rep.get("medicine_id", "")
            target = naming.quarantine_path(
                _medicine(med_by_id, medicine_id), source_id,
                rep.get("document_id", ""), suffix, label)
            kind = "quarantine"
        elif len(owners) > 1 and _is_register(rows, owners):
            target = naming.shared_register_path(source_id, rep.get("title", ""), suffix)
            kind = "register"
        elif len(owners) > 1:
            target = naming.shared_product_path(
                [_medicine(med_by_id, mid) for mid in owners], source_id,
                rep.get("document_id", ""), suffix, label)
            kind = "shared-document"
        else:
            medicine_id = owners[0] if owners else rep.get("medicine_id", "")
            target = naming.document_path(
                _medicine(med_by_id, medicine_id), source_id,
                rep.get("document_id", ""), suffix, label)

        target = _reserve(target, key, taken)
        taken.add(_key(target))
        targets[key] = target
        if _key(target) == key:
            continue
        moves.append(Move(
            kind=kind,
            old=_abs(rows[0]["file_path"]),
            new=target,
            medicine_ids=owners,
            document_ids=sorted({row.get("document_id", "") for row in rows}),
        ))
    return moves, targets


def plan_notice_moves(meds: pd.DataFrame, notices: pd.DataFrame):
    """Return (moves, targets) for every notice text/binary file."""
    med_by_id = {row["medicine_id"]: row for row in meds.to_dict("records")}
    moves, targets, taken = [], {}, set()
    if notices.empty:
        return moves, targets

    for row in notices.to_dict("records"):
        old = row.get("local_file_path", "")
        if not old:
            continue
        key = _key(old)
        medicine_id = row.get("medication_id", "")
        target = naming.notice_path(
            _medicine(med_by_id, medicine_id), row.get("source_id", ""),
            row.get("document_id", ""), _suffix(old))
        target = _reserve(target, key, taken)
        taken.add(_key(target))
        targets[key] = target
        if _key(target) == key:
            continue
        moves.append(Move(
            kind="notice",
            old=_abs(old),
            new=target,
            medicine_ids=[medicine_id] if medicine_id else [],
            document_ids=[row.get("document_id", "")],
        ))
    return moves, targets


def plan_report_moves():
    """Generated reports leave data/metadata/ for data/reports/."""
    moves = []
    for name in REPORT_FILES:
        old = META_DIR / name
        if not old.exists():
            continue
        new = REPORTS_DIR / name
        if _key(old) == _key(new):
            continue
        if new.exists():
            new = _next_free(new, set())
        moves.append(Move(kind="report", old=old, new=new,
                          note="generated report moved out of the provenance folder"))
    return moves


def _orphan_target(path: Path, med_by_id: dict, quarantine: bool) -> Path:
    """A human-readable target for a file that has no provenance row."""
    match = OLD_ID.match(path.stem)
    if match:
        medicine_id, source_id, token = match.groups()
        med = _medicine(med_by_id, medicine_id)
        if quarantine:
            return naming.quarantine_path(med, source_id, token, path.suffix.lower())
        if token.startswith("NOTICE"):
            return naming.notice_path(med, source_id, token, path.suffix.lower())
        return naming.document_path(med, source_id, token, path.suffix.lower())

    if path.parent.name.upper() == "SANTE_MSP":
        return naming.shared_register_path("SANTE_MSP", path.stem, path.suffix.lower())
    if quarantine:
        return QUARANTINE_DIR / "_unreferenced" / path.name
    return RAW_DIR / "_unreferenced" / path.name


def plan_orphan_moves(doc_targets: dict, notice_targets: dict, meds: pd.DataFrame):
    """Move files that exist on disk but no provenance row references."""
    med_by_id = {row["medicine_id"]: row for row in meds.to_dict("records")}
    known = set(doc_targets) | set(notice_targets)
    known |= {_key(target) for target in doc_targets.values()}
    known |= {_key(target) for target in notice_targets.values()}

    moves, taken = [], set()
    for root, quarantine in ((RAW_DIR, False), (QUARANTINE_DIR, True)):
        if not root.exists():
            continue
        for path in sorted(p for p in root.rglob("*") if p.is_file()):
            if _key(path) in known:
                continue
            target = _orphan_target(path, med_by_id, quarantine)
            target = _reserve(target, _key(path), taken)
            taken.add(_key(target))
            moves.append(Move(
                kind="quarantine" if quarantine else "orphan",
                old=path, new=target,
                note="file was not referenced by documents.csv or notices.csv",
            ))
    return moves


# ---------------------------------------------------------------- applying
def apply_moves(moves: list, dry_run: bool = False):
    """Move files and return (results, final target by old-path key)."""
    results, finals = [], {}
    for move in moves:
        old, new = move.old, move.new
        old_exists, new_exists = old.exists(), new.exists()
        sha = sha256_file(old) if old_exists else ""
        target = new
        status = "moved"

        if old_exists and new_exists:
            if sha and sha256_file(new) == sha:
                status = "duplicate"
                target = naming.free_path(
                    new.with_name(f"{new.stem}__legacy{new.suffix}"))
            else:
                status = "collision"
                target = _next_free(new, set())
            if not dry_run:
                target.parent.mkdir(parents=True, exist_ok=True)
                old.replace(target)
        elif old_exists:
            if not dry_run:
                new.parent.mkdir(parents=True, exist_ok=True)
                old.replace(new)
                if sha and sha256_file(new) != sha:
                    raise RuntimeError(f"hash changed while moving {old} -> {new}")
        elif new_exists:
            status = "already-in-place"
        else:
            status = "missing"

        finals[_key(old)] = target
        results.append({"move": move, "target": target, "status": status, "sha256": sha})
    return results, finals


def _repoint(value: str, targets: dict, finals: dict) -> str:
    if not value:
        return value
    key = _key(value)
    target = finals.get(key) or targets.get(key)
    return _rel(target) if target else value


def update_tables(doc_targets: dict, doc_finals: dict,
                  notice_targets: dict, notice_finals: dict):
    """Rewrite the path columns of the provenance and report tables."""
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    if not docs.empty:
        docs["file_path"] = [_repoint(value, doc_targets, doc_finals)
                             for value in docs["file_path"]]
        write_table(DOCUMENTS_CSV, docs)

    notices = _read_any(META_DIR / "notices.csv")
    if not notices.empty:
        if "local_file_path" in notices.columns:
            notices["local_file_path"] = [
                _repoint(value, notice_targets, notice_finals)
                for value in notices["local_file_path"]]
        if "original_file_path" in notices.columns:
            notices["original_file_path"] = [
                _repoint(value, doc_targets, doc_finals) if _key(value) in doc_targets
                or _key(value) in doc_finals else _repoint(value, notice_targets, notice_finals)
                for value in notices["original_file_path"]]
        write_table(META_DIR / "notices.csv", notices)

    for name in ("pending_review.csv", "needs_attention.csv", "usage_report.csv"):
        path = REPORTS_DIR / name
        if not path.exists():
            continue
        frame = _read_any(path)
        if frame.empty or "file_path" not in frame.columns:
            continue
        frame["file_path"] = [_repoint(value, doc_targets, doc_finals)
                              for value in frame["file_path"]]
        write_table(path, frame)


def write_manifest(results: list):
    """Append the physical moves to the tracked old -> new manifest."""
    existing = read_table(FILE_RENAMES_CSV, MANIFEST_COLUMNS)
    known = set(zip(existing["old_path"], existing["new_path"])) if not existing.empty else set()
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S")
    rows = []
    for result in results:
        move, target, status = result["move"], result["target"], result["status"]
        if status == "already-in-place" or _key(move.old) == _key(move.new):
            continue
        old_path, new_path = _rel(move.old), _rel(target)
        if (old_path, new_path) in known:
            continue
        rows.append({
            "moved_at": stamp,
            "kind": move.kind,
            "old_path": old_path,
            "new_path": new_path,
            "medicine_ids": ";".join(sorted(set(move.medicine_ids))),
            "document_ids": ";".join(sorted(set(move.document_ids))),
            "sha256": result["sha256"],
            "status": status,
            "note": move.note,
        })
    if not rows:
        return 0
    frame = pd.concat([existing, pd.DataFrame(rows)], ignore_index=True)
    write_table(FILE_RENAMES_CSV, frame)
    return len(rows)


def remove_empty_legacy_dirs():
    """Remove only empty legacy folders; no file is touched."""
    removed = []
    if not RAW_DIR.exists():
        return removed
    for path in sorted(RAW_DIR.rglob("*"), key=lambda p: len(p.parts), reverse=True):
        if not path.is_dir():
            continue
        if not (re.fullmatch(r"MED\d+", path.name)
                or path.name in ("SANTE_MSP", "notices")):
            continue
        try:
            if not any(path.iterdir()):
                path.rmdir()
                removed.append(path)
        except OSError:
            continue
    return removed


def organize(dry_run: bool = False) -> dict:
    """Plan (and unless dry_run, apply) the whole file migration."""
    meds = read_table(MEDICINES_CSV, MEDICINE_COLUMNS)
    docs = read_table(DOCUMENTS_CSV, DOCUMENT_COLUMNS)
    notices = _read_any(META_DIR / "notices.csv")

    doc_moves, doc_targets = plan_document_moves(meds, docs)
    notice_moves, notice_targets = plan_notice_moves(meds, notices)
    report_moves = plan_report_moves()
    orphan_moves = plan_orphan_moves(doc_targets, notice_targets, meds)
    moves = doc_moves + notice_moves + report_moves + orphan_moves

    results, doc_finals = apply_moves(doc_moves, dry_run=dry_run)
    notice_results, notice_finals = apply_moves(notice_moves, dry_run=dry_run)
    report_results, _ = apply_moves(report_moves, dry_run=dry_run)
    orphan_results, _ = apply_moves(orphan_moves, dry_run=dry_run)
    results += notice_results + report_results + orphan_results

    if not dry_run:
        update_tables(doc_targets, doc_finals, notice_targets, notice_finals)
        write_manifest(results)
        remove_empty_legacy_dirs()

    counts = defaultdict(int)
    for result in results:
        counts[(result["move"].kind, result["status"])] += 1
    missing = [result for result in results if result["status"] == "missing"]

    print("PHARMEAZOR - corpus file organisation")
    print("=" * 62)
    print(f"  mode                 {'DRY RUN (nothing changed)' if dry_run else 'applied'}")
    print(f"  files to move        {len(moves)}")
    for (kind, status), count in sorted(counts.items()):
        print(f"  {kind:<20} {status:<18} {count}")
    print()
    for result in results[:25]:
        move = result["move"]
        print(f"  {result['status']:<16} {_rel(move.old)}")
        print(f"  {'':<16} -> {_rel(result['target'])}")
    if len(results) > 25:
        print(f"  ... and {len(results) - 25} more (see data/metadata/file_renames.csv)")
    if missing:
        print()
        print(f"  {len(missing)} file(s) are missing on disk and were only repointed:")
        for result in missing[:10]:
            print(f"    {_rel(result['move'].old)}")
    if dry_run:
        print()
        print("Dry run: re-run without --dry-run to move the files.")
    else:
        print()
        print("Manifest: data/metadata/file_renames.csv")
        print("Reports : data/reports/")
    return {
        "moves": len(moves),
        "results": results,
        "missing": len(missing),
        "dry_run": dry_run,
    }
