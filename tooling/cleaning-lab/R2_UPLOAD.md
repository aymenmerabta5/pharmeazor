# Cleaned corpus → Cloudflare R2

The cleaned corpus lives in `tooling/cleaning-lab/output/` and is mirrored to
the `pharmeazor` bucket by the shared module
`tooling/bucket_operations.py`. It uploads, verifies every object by
downloading and hashing it, and restores the remote tree.

The whole `output/` tree is covered by the `cleaning-output` dataset:

- `documents/` — cleaned Markdown;
- `structured/` — CSV and JSONL tables;
- `reports/` and `preview/` — chunk previews and statistics;
- `context/` — chunk context notes, packets and `embed-input.jsonl`;
- `manifest.jsonl`, `inventory.jsonl`, `excluded.jsonl`.

## Defaults

| Setting          | Default                        |
| ---------------- | ------------------------------ |
| Dataset          | `cleaning-output`              |
| Local root       | `tooling/cleaning-lab/output/` |
| Object prefix    | `cleaning-lab/`                |
| Environment file | repository root `.env.local`   |

`pull` restores the dataset into `output/`. The single-tree `download` command
uses `tooling/downloads/` by default.

See `tooling/retrieval-lab/R2_UPLOAD.md` for the connection variables, endpoint
normalization, dataset layout, and the full flag reference. Credentials are
read from `.env.local` (or the process environment), and secret values are
never printed.

## Install

```powershell
cd tooling/cleaning-lab
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`boto3` is listed in `requirements.txt` for this transfer step.

## Commands

Run these from `tooling/cleaning-lab/`:

```powershell
# Compare the local tree with the bucket.
.\.venv\Scripts\python.exe ..\bucket_operations.py status --group cleaning

# Plan only: no objects written.
.\.venv\Scripts\python.exe ..\bucket_operations.py --dry-run --group cleaning push

# Upload output/ under cleaning-lab/ with SHA-256 metadata.
.\.venv\Scripts\python.exe ..\bucket_operations.py push --group cleaning --report upload.report.jsonl

# Read every object back and compare hashes with the local tree.
.\.venv\Scripts\python.exe ..\bucket_operations.py verify --source output --prefix cleaning-lab --report verify.report.jsonl

# Restore the remote tree into output/ and verify every file.
.\.venv\Scripts\python.exe ..\bucket_operations.py pull --group cleaning --report download.report.jsonl

# Pull missing objects, then upload local ones.
.\.venv\Scripts\python.exe ..\bucket_operations.py sync --group cleaning
```

The same commands are available from `tooling/cleaning-lab` as
`bun run r2:status`, `bun run r2:dry-run`, `bun run r2:upload`,
`bun run r2:verify`, `bun run r2:download`, `bun run r2:organize`, and
`bun run r2:sync`.

Uploads create or overwrite objects under `cleaning-lab/`. The legacy
`cleaning-lab/` root and `corpus/processed/` prefixes are read as fallbacks.

To copy legacy objects into the canonical prefix without overwriting anything,
run:

```powershell
.\.venv\Scripts\python.exe ..\bucket_operations.py organize --group cleaning --dry-run
.\.venv\Scripts\python.exe ..\bucket_operations.py organize --group cleaning
```

To delete the old layout and re-upload the local tree, run the guarded reset.
It refuses to delete unless `output/manifest.jsonl` exists, and it lists every
object first when `--yes` is omitted:

```powershell
.\.venv\Scripts\python.exe ..\bucket_operations.py reset --group cleaning --dry-run
.\.venv\Scripts\python.exe ..\bucket_operations.py reset --group cleaning --yes --report reset.report.jsonl
.\.venv\Scripts\python.exe ..\bucket_operations.py push --group cleaning
```

See the shared [R2_UPLOAD.md](../retrieval-lab/R2_UPLOAD.md#organizing-a-legacy-bucket)
for the conflict and verification rules, and
[R2_UPLOAD.md](../retrieval-lab/R2_UPLOAD.md#resetting-and-re-uploading) for
the reset guard.
