# PHARMEAZOR corpus → Cloudflare R2

The shared bucket module `tooling/bucket_operations.py` mirrors the corpus
between the repository and the `pharmeazor` bucket through Cloudflare R2's
S3-compatible API. It is used by the labs and by the bucket-first runner. The
implementation lives in `tooling/storage-lab/storage_lab/`; the script at
`tooling/bucket_operations.py` is the stable entry point and re-exports it.

It reads the repository's existing `.env.local`; it does not keep a second copy
of the credentials and never prints a secret value.

## Datasets

Every part of the corpus has a canonical prefix named after its lab folder.
`status`, `pull`, `push`, `sync`, `organize` and `reset` operate on these
datasets:

| Dataset                | Local tree                               | Prefix                      |
| ---------------------- | ---------------------------------------- | --------------------------- |
| `retrieval-raw`        | `tooling/retrieval-lab/data/raw/`        | `retrieval-lab/raw/`        |
| `retrieval-metadata`   | `tooling/retrieval-lab/data/metadata/`   | `retrieval-lab/metadata/`   |
| `retrieval-reports`    | `tooling/retrieval-lab/data/reports/`    | `retrieval-lab/reports/`    |
| `retrieval-input`      | `tooling/retrieval-lab/data/input/`      | `retrieval-lab/input/`      |
| `retrieval-recon`      | `tooling/retrieval-lab/data/recon/`      | `retrieval-lab/recon/`      |
| `retrieval-logs`       | `tooling/retrieval-lab/data/logs/`       | `retrieval-lab/logs/`       |
| `retrieval-quarantine` | `tooling/retrieval-lab/data/quarantine/` | `retrieval-lab/quarantine/` |
| `retrieval-evaluation` | `tooling/retrieval-lab/data/evaluation/` | `retrieval-lab/evaluation/` |
| `cleaning-output`      | `tooling/cleaning-lab/output/`           | `cleaning-lab/`             |
| `embedding-output`     | `tooling/embedding-lab/output/`          | `embedding-lab/`            |

`cleaning-output` covers the cleaned Markdown, structured tables, reports,
chunk previews (`preview/`) and the chunk context data (`context/notes.jsonl`,
`context/packets/`, `context/embed-input.jsonl`). It is considered complete
only when `manifest.jsonl` is present.

`embedding-output` covers the BGE-M3 artifact (`embeddings/vectors.npy`,
`embeddings/chunks.jsonl`, `embeddings/manifest.json`, `embeddings/run-report.json`),
`benchmark.json` and any extra run directory under `output/`. It is considered
complete only when `embeddings/manifest.json` is present.

Buckets written before this layout may hold `corpus/retrieval-lab/*`,
`corpus/raw`, `corpus/processed` or a root-level `cleaning-lab/`. Those prefixes
are read as fallbacks when the canonical prefix is empty. `organize` copies
them forward without overwriting anything; `reset` deletes them only when it is
explicitly asked to.

## Commands

| Command            | What it does                                                            |
| ------------------ | ----------------------------------------------------------------------- |
| `status`           | Compare every dataset locally and remotely.                             |
| `pull`             | Download every dataset into its local root.                             |
| `push`             | Upload every dataset under its canonical prefix.                        |
| `sync`             | Pull missing remote objects, then push local objects.                   |
| `organize`         | Copy legacy prefixes to the canonical layout (no overwrite, no delete). |
| `reset`            | Delete the selected prefixes after checking the local copy (`--yes`).   |
| `upload` (default) | Upload one local tree under `--prefix` (ad-hoc transfers).              |
| `verify`           | Read one remote prefix back and compare hashes.                         |
| `download`         | Restore one remote prefix under `--dest` (default `downloads/`).        |

`pull`, `push`, `sync`, `organize` and `reset` accept `--dataset NAME`
(repeatable) or `--group retrieval|cleaning|embedding` to limit the run.
`--dry-run` works for `upload`, `push`, `organize` and `reset`; `--force`
re-transfers objects that already match by size and SHA-256.

`reset` is the only destructive command. Without `--yes` it lists the objects
it would delete and writes nothing.

### Single-tree resolution

`upload`, `verify` and `download` keep the historical behaviour:

1. `--source` when given;
2. `tooling/cleaning-lab/output/` (processed corpus) when it exists;
3. `tooling/retrieval-lab/data/raw/` (collected corpus) as the fallback.

Object keys preserve the source tree and every filename:

| Source                           | Prefix                    | Example key                                              |
| -------------------------------- | ------------------------- | -------------------------------------------------------- |
| `tooling/cleaning-lab/output`    | `cleaning-lab`            | `cleaning-lab/documents/enalapril/MED031__…__rcp.md`     |
| `tooling/retrieval-lab/data/raw` | `retrieval-lab/raw`       | `retrieval-lab/raw/enalapril/enalapril__bdpm-fr__….html` |
| custom `--source`                | `retrieval-lab/<dirname>` | `retrieval-lab/my-corpus/<relative path>`                |

Override the prefix with `--prefix`.

## Bucket-first runner

`tooling/run_pipeline.py` is the pipeline entry point. It asks R2 what exists
before doing any work:

```powershell
python tooling/run_pipeline.py            # pull if present, else collect → clean → chunk → push
python tooling/run_pipeline.py --stage pull
python tooling/run_pipeline.py --stage push
python tooling/run_pipeline.py --refresh  # rebuild locally, then push
python tooling/run_pipeline.py --reset    # list what would be deleted
python tooling/run_pipeline.py --reset --yes  # delete, rebuild, push
python tooling/run_pipeline.py --dry-run  # show the plan only
```

When `cleaning-output` is complete in the bucket, the runner pulls it and stops;
it only generates the chunk export when `context/embed-input.jsonl` is missing
from the pulled tree. When the cleaned corpus is absent, it restores whatever
the bucket already has and runs only the missing stages.

The root scripts wrap the same commands: `bun run bucket:run`,
`bucket:status`, `bucket:pull`, `bucket:push`, `bucket:sync`, `bucket:organize`
and `bucket:reset`.

## Organizing a legacy bucket

Buckets written before the canonical layout may hold `corpus/retrieval-lab/*`,
`corpus/raw`, `corpus/processed` or a root-level `cleaning-lab/`. The `organize`
command copies those objects to their canonical keys with a server-side copy:

```powershell
# Show what would be copied; no object is written.
python tooling/bucket_operations.py organize --dry-run

# Copy one lab at a time.
python tooling/bucket_operations.py organize --group retrieval
python tooling/bucket_operations.py organize --group cleaning

# Keep an audit trail.
python tooling/bucket_operations.py organize --report organize.report.jsonl
```

Safety rules:

- **No overwrite.** If the canonical key already exists, the command compares
  size and the stored SHA-256 metadata. A match is reported as `present`; a
  difference is reported as `conflict`, and both objects are left untouched.
- **No delete.** Legacy objects stay where they are. The command only creates
  new objects under the canonical prefix.
- **Verified copies.** After each copy the source and destination are read back
  with `HeadObject` and compared by size and, when present, stored SHA-256
  metadata. A mismatch is reported as `failed` and the source is kept.
- A conflict or failure makes the exit code `1`; the report names every object
  that needs a human decision.

Run `status` afterwards. Each dataset should show its canonical `prefix=` and
the expected object count.

## Resetting and re-uploading

Use `reset` when the bucket holds an obsolete layout and the local tree is the
complete source of truth. The command checks the local tree before it deletes
anything:

- the dataset directory must exist and contain at least one file;
- `cleaning-output` must contain `manifest.jsonl`;
- every remote object must have a local counterpart; an object that exists only
  in the bucket blocks the reset unless `--allow-remote-only` is passed;
- a dataset that cannot be rebuilt locally is skipped and its remote objects
  are left untouched.

```powershell
# 1. Inspect the exact keys that would be removed.
python tooling/bucket_operations.py reset --dry-run --report reset.plan.jsonl

# 2. Delete the selected datasets (canonical and legacy prefixes).
python tooling/bucket_operations.py reset --yes --report reset.report.jsonl

# 3. Upload the local tree into the new layout.
python tooling/bucket_operations.py push --report upload.report.jsonl
```

The same sequence in one command:

```powershell
python tooling/run_pipeline.py --reset --yes
```

`reset` deletes one object at a time. A failed deletion names the exact key and
makes the exit code `1`; the runner stops before pushing when any deletion
fails. The JSONL report records every key, its size and its result before the
upload starts.

## Connection settings

The script reuses these `.env.local` keys:

| Variable               | Role                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `STORAGE_BUCKET`       | Bucket name (`pharmeazor`).                                                                          |
| `S3_ENDPOINT`          | R2 S3 endpoint. Also accepts `S3_URL` / `R2_ENDPOINT`.                                               |
| `S3_REGION`            | `auto` for R2 (also accepts `R2_REGION`).                                                            |
| `S3_ACCESS_KEY_ID`     | R2 access key id (also accepts `R2_ACCESS_KEY_ID`).                                                  |
| `S3_SECRET_ACCESS_KEY` | R2 secret access key (also accepts `R2_SECRET_ACCESS_KEY`).                                          |
| `S3_PUBLIC_URL`        | Optional public read base (`r2.dev`); also accepts `S3_PUBLIC`; validated, never used for transfers. |

The app's `STORAGE_DRIVER=local` setting is unrelated: this tool is an explicit,
maintainer-run transfer and always uses the S3-compatible endpoint above.

Two details matter:

- **The endpoint must be account-level.** Set
  `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com`; the bucket is
  configured separately through `STORAGE_BUCKET`. The application's S3 client
  uses the value verbatim, so a trailing `/pharmeazor` would make it address the
  bucket twice and fail. The transfer tool still tolerates exactly that suffix
  and removes it, but rejects any other path instead of producing wrong keys.
- **R2 uses region `auto` and path-style addressing.** Those are set explicitly;
  the library is `boto3` (with `botocore`), not a Cloudflare-specific SDK.

`.env.local` contains a trailing template block with `REPLACE_WITH_*` values.
The parser scans assignments in file order and takes the **first** non-empty,
non-placeholder value, so the real R2 block wins. It prints a note when a key is
duplicated, without printing any value. Process environment variables, when set,
take precedence over the file.

## Install and run

Python 3.11+ is required. `boto3` is part of the collection lab requirements.

```powershell
cd tooling/retrieval-lab
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt

# Compare the local trees with the bucket.
.\.venv\Scripts\python.exe ..\bucket_operations.py status

# Restore anything the bucket already holds.
.\.venv\Scripts\python.exe ..\bucket_operations.py pull --group retrieval

# Upload every retrieval dataset.
.\.venv\Scripts\python.exe ..\bucket_operations.py push --group retrieval --report upload.report.jsonl

# Ad-hoc single-tree transfer (historical interface).
.\.venv\Scripts\python.exe ..\bucket_operations.py --source ..\cleaning-lab\output --prefix cleaning-lab --checksum
```

Useful flags:

| Flag                  | Effect                                                                            |
| --------------------- | --------------------------------------------------------------------------------- |
| `--dry-run`           | `upload`/`push`/`organize`/`reset`: build and print the plan; no objects written. |
| `--skip-existing`     | Upload/download: skip objects already matching size and SHA-256.                  |
| `--force`             | `pull`/`push`/`sync`: re-transfer even when size and SHA-256 already match.       |
| `--checksum`          | Upload only: compute SHA-256 and store it as object metadata.                     |
| `--dest PATH`         | Download only: destination directory (default `tooling/downloads`).               |
| `--dataset NAME`      | `status`/`pull`/`push`/`sync`/`organize`/`reset`: limit to one dataset.           |
| `--group NAME`        | Same commands: limit to `retrieval`, `cleaning` or `embedding`.                   |
| `--yes`               | `reset` only: confirm the permanent deletion.                                     |
| `--allow-remote-only` | `reset` only: also delete remote objects that have no local copy.                 |
| `--workers N`         | Parallel transfers (default 4).                                                   |
| `--limit N`           | Process only the first N objects per dataset.                                     |
| `--fail-fast`         | Upload only: stop at the first failure (runs sequentially).                       |
| `--report PATH`       | Write a JSONL report of every object and its result.                              |
| `--verbose`           | Print every object.                                                               |
| `--quiet`             | Print only the final summary.                                                     |
| `--env-file PATH`     | Use another dotenv file.                                                          |
| `--bucket NAME`       | Override `STORAGE_BUCKET`.                                                        |

## What pull, verify and download check

The commands list the bucket first, then compare the remote key set with the
local tree:

- **missing** local key: the object is absent from the bucket;
- **extra** remote key: an object exists that is not in the local tree;
- size mismatch between the bucket listing and the local file;
- SHA-256 mismatch between the downloaded bytes and the local file;
- SHA-256 mismatch between the downloaded bytes and the stored metadata.

`verify` streams every object through SHA-256 without writing it to disk.
`pull` and `download` write each object atomically (`.part` then rename), check
the hashes before publishing it, and refuse destination paths outside the
destination root. Downloading to a directory that overlaps the source tree is
rejected.

The default download root is `tooling/downloads/`, which is gitignored. The
layout mirrors the prefix, so `retrieval-lab/raw/enalapril/x.pdf` becomes
`downloads/enalapril/x.pdf`. `pull` is different: it restores each dataset into
its own local root (for example `tooling/retrieval-lab/data/raw/`).

## Error handling and safety

- Missing, placeholder or incomplete credentials fail before any network call.
- The endpoint must be HTTPS, credential-free and query-free.
- `HeadBucket` is checked first. A missing bucket or invalid credentials stop the
  run; a denied `HeadBucket` continues with a warning so the real transfer result
  is reported.
- boto3 retries transient failures (5 attempts, standard mode); multipart
  uploads use 16 MiB threshold / 8 MiB parts.
- A failed object does not stop the run by default; failures are collected,
  printed, written to the optional report, and make the exit code `1`.
- `.env*` files, symlinks, `node_modules`, `.git`, `.venv`, `.cache` and Python
  caches are never uploaded.
- Remote keys are treated as untrusted paths: traversal, absolute paths, Windows
  drive syntax and reserved device names are rejected before any write.
- Errors are sanitized: access key id and secret are replaced with `<redacted>`
  if they ever appear in a message.
- Reports contain object keys, sizes, statuses and SHA-256 hashes — never
  credentials.
- `reset` refuses to delete a dataset that has no complete local copy.

Exit codes: `0` success, `1` one or more transfer/report failures, `2` invalid
configuration or source, `130` interrupted.

## Verify the tool itself

```powershell
python -m unittest discover -s tooling/tests -v
python -m compileall -q tooling/storage-lab tooling/bucket_operations.py tooling/run_pipeline.py
```

After an upload, the public read base (when the bucket has public access) is
`S3_PUBLIC_URL` + object key. This is a read-only convenience; the tool does not
depend on public access and does not modify bucket permissions.
