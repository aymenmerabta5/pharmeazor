# storage_lab

The offline mirror between the PHARMEAZOR corpus and Cloudflare R2. It is a
maintainer batch tool: the application never imports it, and it never writes to
PostgreSQL.

The stable entry point is still `tooling/bucket_operations.py`, which
re-exports this package so every existing command, `tooling/run_pipeline.py`
and `tooling/tests` keep working unchanged:

```powershell
python tooling/bucket_operations.py status
python tooling/bucket_operations.py push --group embedding
```

## Layout

| Module         | Responsibility                                                       |
| -------------- | -------------------------------------------------------------------- |
| `paths.py`     | Repository roots, the known dataset trees, limits and file types.    |
| `config.py`    | `.env.local` parsing, endpoint normalization, `R2Config`.            |
| `keys.py`      | `Dataset` definitions, safe object keys and local upload plans.      |
| `transfer.py`  | boto3 client construction, upload, verify and download one object.   |
| `mirror.py`    | Dataset-level pull, push, sync, organize, reset and bucket manifest. |
| `reporting.py` | Console summaries and JSONL transfer reports.                        |
| `cli.py`       | Argument parser and the `main` entry point.                          |

`storage_lab` is both the importable package and its directory name. The
underscore keeps it a valid Python identifier and distinguishes it from the
hyphenated `cleaning-lab`, `retrieval-lab` and `embedding-lab` labs.

## Datasets

`status`, `pull`, `push`, `sync`, `organize` and `reset` operate on the
datasets declared in `keys.py`: the retrieval trees, `cleaning-output` and
`embedding-output`. See
[`tooling/retrieval-lab/R2_UPLOAD.md`](../retrieval-lab/R2_UPLOAD.md) for the
canonical prefixes, connection variables, safety rules and the full flag
reference.

## Tests

```powershell
python -m unittest discover -s tooling/tests -v
python -m compileall -q tooling/storage_lab tooling/bucket_operations.py tooling/run_pipeline.py
```

## Relationship to `packages/storage`

`packages/storage` is the application's TypeScript blob adapter. It is built for
runtime uploads under strict rules (10 MB maximum, a MIME allowlist, opaque
UUID keys, `UPLOADS_DIR` containment) and is not importable from Python. This
lab is a different layer: it mirrors whole maintainer-owned trees, needs
SHA-256 verification and JSONL reports, and transfers files far larger than the
runtime limit. The two share the same R2 bucket and `.env.local` keys, but not
code.
