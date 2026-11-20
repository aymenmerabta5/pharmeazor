# PHARMEAZOR → Cloudflare R2: upload, verify, download

Maintainer-side tool in the collection lab that transfers the corpus to the
`pharmeazor` bucket through Cloudflare R2's S3-compatible API, then proves the
round trip by downloading and hashing the objects.

It reads the repository's existing `.env.local`; it does not keep a second copy
of the credentials and never prints a secret value.

## Commands

| Command            | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `upload` (default) | Upload the local corpus under the selected prefix.                    |
| `verify`           | Download every object, hash it, and compare with the local source.    |
| `download`         | Restore the remote tree under `downloads/` and hash-check every file. |

All three commands use the same source resolution and prefix:

1. `--source` when given;
2. `tooling/cleaning-lab/output/` (processed corpus) when it exists;
3. `tooling/retrieval-lab/data/raw/` (collected corpus) as the fallback.

Object keys preserve the source tree and every filename:

| Source                           | Prefix             | Example key                                               |
| -------------------------------- | ------------------ | --------------------------------------------------------- |
| `tooling/cleaning-lab/output`    | `corpus/processed` | `corpus/processed/documents/enalapril/MED031__…__rcp.md`  |
| `tooling/retrieval-lab/data/raw` | `corpus/raw`       | `corpus/raw/enalapril/enalapril__bdpm-fr__doc002__….html` |
| custom `--source`                | `corpus/<dirname>` | `corpus/my-corpus/<relative path>`                        |

Override the prefix with `--prefix`. Uploads only create or overwrite objects;
nothing in this tool deletes objects from the bucket.

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

- **The endpoint must be account-level.** The repository currently sets
  `S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com/pharmeazor`. The
  trailing `/pharmeazor` is the bucket, not part of the S3 endpoint; boto3
  addresses the bucket separately. The script removes exactly that suffix and
  rejects any other path instead of producing wrong keys.
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

# Always start with a dry run: no network calls, no writes.
.\.venv\Scripts\python.exe r2_upload.py --dry-run

# Upload the processed corpus (or the raw fallback) under its clear prefix.
.\.venv\Scripts\python.exe r2_upload.py --checksum --report upload.report.jsonl

# Prove the round trip: read every object back and compare hashes.
.\.venv\Scripts\python.exe r2_upload.py verify --report verify.report.jsonl

# Restore the remote tree locally under downloads/ and verify every file.
.\.venv\Scripts\python.exe r2_upload.py download --skip-existing --report download.report.jsonl

# Smoke-test a few objects first.
.\.venv\Scripts\python.exe r2_upload.py --limit 3
.\.venv\Scripts\python.exe r2_upload.py verify --limit 3
```

Useful flags:

| Flag              | Effect                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `--dry-run`       | Upload only: build and print the plan; no R2 client is created.                   |
| `--skip-existing` | Upload/download: skip objects already matching size and SHA-256.                  |
| `--checksum`      | Upload only: compute SHA-256 and store it as object metadata.                     |
| `--dest PATH`     | Download only: destination directory (default `tooling/retrieval-lab/downloads`). |
| `--workers N`     | Parallel transfers (default 4).                                                   |
| `--limit N`       | Process only the first N objects.                                                 |
| `--fail-fast`     | Upload only: stop at the first failure (runs sequentially).                       |
| `--report PATH`   | Write a JSONL report of every object and its result.                              |
| `--verbose`       | Print every object.                                                               |
| `--quiet`         | Print only the final summary.                                                     |
| `--env-file PATH` | Use another dotenv file.                                                          |
| `--bucket NAME`   | Override `STORAGE_BUCKET`.                                                        |

## What verify and download check

Both commands list the bucket first, then compare the remote key set with the
local source tree:

- **missing** local key: the object is absent from the bucket;
- **extra** remote key: an object exists that is not in the local tree;
- size mismatch between the bucket listing and the local file;
- SHA-256 mismatch between the downloaded bytes and the local file;
- SHA-256 mismatch between the downloaded bytes and the stored metadata.

`verify` streams every object through SHA-256 without writing it to disk.
`download` writes each object atomically (`.part` then rename), checks the
hashes before publishing it, and refuses destination paths outside `--dest`.
Downloading to a directory that overlaps the source tree is rejected.

The default download root is `tooling/retrieval-lab/downloads/`, which is
gitignored. The layout mirrors the prefix, so `corpus/raw/enalapril/x.pdf`
becomes `downloads/enalapril/x.pdf`.

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
- `.env*` files, symlinks, `node_modules`, `.git`, `.venv` and Python caches are
  never uploaded.
- Remote keys are treated as untrusted paths: traversal, absolute paths, Windows
  drive syntax and reserved device names are rejected before any write.
- Errors are sanitized: access key id and secret are replaced with `<redacted>`
  if they ever appear in a message.
- Reports contain object keys, sizes, statuses and SHA-256 hashes — never
  credentials.

Exit codes: `0` success, `1` one or more transfer/report failures, `2` invalid
configuration or source, `130` interrupted.

## Verify the tool itself

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_r2_upload.py" -v
.\.venv\Scripts\python.exe -m compileall -q r2_upload.py
```

After an upload, the public read base (when the bucket has public access) is
`S3_PUBLIC_URL` + object key. This is a read-only convenience; the tool does not
depend on public access and does not modify bucket permissions.
