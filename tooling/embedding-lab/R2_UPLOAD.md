# Embedding artifact → Cloudflare R2

The embedding lab writes its artifact under `tooling/embedding-lab/output/` and
mirrors it to the `pharmeazor` bucket by the shared module
`tooling/bucket_operations.py`. It uploads, verifies every object by
downloading and hashing it, and restores the remote tree.

The whole `output/` tree is covered by the `embedding-output` dataset:

- `embeddings/` — `vectors.npy`, `chunks.jsonl`, `manifest.json` and
  `run-report.json` for the production run;
- `benchmark.json` — the eager/compiled comparison written by
  `python run.py benchmark`;
- any extra run directory created with `--output` (for example `smoke/`), which
  is mirrored as-is.

`embeddings/manifest.json` is the dataset marker: a remote tree without it is
reported as partial and never counts as a bucket hit.

## Defaults

| Setting          | Default                         |
| ---------------- | ------------------------------- |
| Dataset          | `embedding-output`              |
| Local root       | `tooling/embedding-lab/output/` |
| Object prefix    | `embedding-lab/`                |
| Environment file | repository root `.env.local`    |

`pull` restores the dataset into `output/`. The single-tree `download` command
uses `tooling/downloads/` by default.

See `tooling/retrieval-lab/R2_UPLOAD.md` for the connection variables, endpoint
normalization, dataset layout, and the full flag reference. Credentials are
read from `.env.local` (or the process environment), and secret values are
never printed.

## Install

The transfer uses the same environment as the lab; `boto3` is listed in
`requirements.txt`.

```powershell
cd tooling/embedding-lab
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## Commands

Run these from `tooling/embedding-lab/`:

```powershell
# Compare the local tree with the bucket.
.\.venv\Scripts\python.exe ..\bucket_operations.py status --group embedding

# Plan only: no objects written.
.\.venv\Scripts\python.exe ..\bucket_operations.py --dry-run --group embedding push

# Upload output/ under embedding-lab/ with SHA-256 metadata.
.\.venv\Scripts\python.exe ..\bucket_operations.py push --group embedding --report upload.report.jsonl

# Read every object back and compare hashes with the local tree.
.\.venv\Scripts\python.exe ..\bucket_operations.py verify --source output --prefix embedding-lab --report verify.report.jsonl

# Restore the remote tree into output/ and verify every file.
.\.venv\Scripts\python.exe ..\bucket_operations.py pull --group embedding --report download.report.jsonl

# Pull missing objects, then upload local ones.
.\.venv\Scripts\python.exe ..\bucket_operations.py sync --group embedding
```

The same commands are available from `tooling/embedding-lab` as
`bun run r2:status`, `bun run r2:dry-run`, `bun run r2:upload`,
`bun run r2:verify`, `bun run r2:download`, `bun run r2:organize`, and
`bun run r2:sync`.

Uploads create or overwrite objects under `embedding-lab/`. The lab has no
legacy prefix: `organize` finds nothing and `reset` only touches the canonical
prefix.

## Pull and import into PostgreSQL

`fetch_artifact.py` is the guarded pull. It reuses the shared storage module and
the lab's own `pipeline/validate.py`, so the checksums, row alignment, chunk
ids, text hashes, model revision and dimensions are checked before a single row
is written. It refuses to import when the remote tree has no
`embeddings/manifest.json` marker.

From the repository root:

```powershell
# Pull embedding-lab/ into tooling/embedding-lab/output/ and validate it.
python tooling/embedding-lab/fetch_artifact.py

# Validate an existing local artifact without touching R2.
python tooling/embedding-lab/fetch_artifact.py --validate-only

# Full pipeline: pull, validate, chunk dry run, schema, import, postflight.
bun run retrieval:import:r2

# Offline or scratch-database variants.
bun run retrieval:import:r2 --artifact ./tooling/embedding-lab/output/embeddings
bun run retrieval:import:r2 --no-pull --dry-run
$env:POSTGRES_DB = "pharmeazor_retrieval_test"; bun run retrieval:import:r2
```

`--prefix` and `--dest` on `fetch_artifact.py` are test hooks; production always
uses `embedding-lab/` and `tooling/embedding-lab/output/`. When PyYAML is
missing, the script re-execs inside `tooling/embedding-lab/.venv` or
`tooling/cleaning-lab/.venv` instead of failing after the download.

`retrieval:import:r2` is idempotent: the second run of an unchanged artifact
reports `embeddedChunks=0`, `retokenizedChunks=0`, and `reusedChunks` equal to
the chunk count. It fails before writing if the artifact predates the current
corpus (the production chunker's `contentHash` no longer matches
`text_sha256`) or if the database would mix embedding models or revisions.
`--dry-run` stops before the DDL. `--force` re-embeds and retokenizes
everything; `--prune` deletes documents that disappeared from the cleaning
manifest.

To delete the remote artifact and re-upload the local tree, run the guarded
reset. It refuses to delete unless `output/embeddings/manifest.json` exists,
and it lists every object first when `--yes` is omitted:

```powershell
.\.venv\Scripts\python.exe ..\bucket_operations.py reset --group embedding --dry-run
.\.venv\Scripts\python.exe ..\bucket_operations.py reset --group embedding --yes --report reset.report.jsonl
.\.venv\Scripts\python.exe ..\bucket_operations.py push --group embedding
```

## What is not transferred

- `models/` — the pinned BGE-M3 snapshot is downloaded by
  `python run.py download`; it is not part of the artifact.
- `profile/` traces are not special-cased: a trace written under `output/` is
  mirrored like any other file, so omit `--profile` when preparing an upload.
- `.venv/`, `__pycache__/`, `.cache/` and `.env*` files are skipped by the
  shared module.
- The lab never writes to PostgreSQL; this transfer only mirrors files. The
  separate `retrieval:import:r2` worker owns the database write.

See the shared [R2_UPLOAD.md](../retrieval-lab/R2_UPLOAD.md#organizing-a-legacy-bucket)
for the conflict and verification rules, and
[R2_UPLOAD.md](../retrieval-lab/R2_UPLOAD.md#resetting-and-re-uploading) for
the reset guard.
