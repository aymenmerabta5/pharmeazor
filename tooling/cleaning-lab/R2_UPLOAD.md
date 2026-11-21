# Cleaned corpus -> Cloudflare R2

`r2_upload.py` transfers `tooling/cleaning-lab/output/` to the `pharmeazor`
bucket through Cloudflare R2's S3-compatible API. It uploads, verifies every
object by downloading and hashing it, and restores the remote tree under
`downloads/`.

The transfer engine and the `.env.local` connection handling are shared with
the collection lab (`tooling/retrieval-lab/r2_upload.py`). The cleaning lab only
fixes the defaults:

| Setting          | Default                           |
| ---------------- | --------------------------------- |
| Source           | `tooling/cleaning-lab/output/`    |
| Object prefix    | `cleaning-lab/`                   |
| Download root    | `tooling/cleaning-lab/downloads/` |
| Environment file | repository root `.env.local`      |

See `tooling/retrieval-lab/R2_UPLOAD.md` for the connection variables, endpoint
normalization, and the full flag reference. Credentials are read from
`.env.local` (or the process environment), and secret values are never printed.

## Install

```powershell
cd tooling/cleaning-lab
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

`boto3` is listed in `requirements.txt` for this transfer step.

## Commands

```powershell
# Plan only: no network calls and no objects written.
.\.venv\Scripts\python.exe r2_upload.py --dry-run

# Upload output/ under cleaning-lab/ with SHA-256 metadata.
.\.venv\Scripts\python.exe r2_upload.py --checksum --report upload.report.jsonl

# Read every object back and compare it with the local tree.
.\.venv\Scripts\python.exe r2_upload.py verify --report verify.report.jsonl

# Restore the remote tree under downloads/ and verify every file.
.\.venv\Scripts\python.exe r2_upload.py download --skip-existing --report download.report.jsonl
```

The same commands are available from `tooling/cleaning-lab` as
`bun run r2:dry-run`, `bun run r2:upload`, `bun run r2:verify`, and
`bun run r2:download`.

Uploads only create or overwrite objects under `cleaning-lab/`. Nothing in this
tool deletes objects from the bucket.
