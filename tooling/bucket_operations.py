#!/usr/bin/env python3
"""Mirror the PHARMEAZOR corpus between the local tree and Cloudflare R2.

This is the single shared bucket module for the labs. The R2 API is
S3-compatible, so boto3/botocore provides signing, retries and multipart
transfers.

Dataset commands (the normal entry point):

* ``status`` - compare every known dataset locally and remotely;
* ``pull``   - download every dataset into its local root;
* ``push``   - upload every dataset under its canonical prefix;
* ``sync``   - pull missing remote objects, then push local objects;
* ``organize`` - copy legacy prefixes to the canonical layout;
* ``reset``  - delete the selected prefixes, but only after confirming that a
  complete local copy exists (requires ``--yes``; ``--dry-run`` lists first).

Single-tree commands (compatibility and ad-hoc transfers):

* ``upload`` (default) - upload one local tree under ``--prefix``;
* ``verify`` - read one remote prefix back and compare hashes;
* ``download`` - restore one remote prefix under ``--dest``.

The implementation lives in ``tooling/storage_lab/``. This module keeps the
historical path and public names so ``run_pipeline.py`` and the tests load it
unchanged.

Design notes
------------
* Configuration is read from the repository's ``.env.local`` (or ``--env-file``).
  The file is parsed locally; secret values are never printed, logged or copied
  into a report. Process environment variables win over the file.
* ``S3_ENDPOINT`` in this project currently points at
  ``https://<account>.r2.cloudflarestorage.com/<bucket>``. The endpoint boto3
  needs is the account-level origin, so a trailing path equal to the bucket name
  is removed. Any other path is rejected instead of being guessed at.
* R2 uses region ``auto`` and path-style addressing; no Cloudflare-specific SDK
  is needed.
* ``S3_PUBLIC_URL`` is the public read base URL (``r2.dev``). It is validated as
  optional configuration and is deliberately not used for transfers.

Every command except ``reset`` only creates or overwrites objects. ``reset`` is
the single destructive command: it refuses to delete a dataset unless the local
tree is present, non-empty and (for ``cleaning-output`` and
``embedding-output``) carries its manifest. Legacy prefixes are read as fallbacks
by every other command and are deleted only when ``reset`` is explicitly asked
to include them.
"""

from __future__ import annotations

import sys
from pathlib import Path

# This module is executed directly (`python tooling/bucket_operations.py`) and
# loaded by path from `run_pipeline.py`; make the `storage_lab` package
# importable in both cases. The package sits next to this file under tooling/.
_TOOL_ROOT = Path(__file__).resolve().parent
if str(_TOOL_ROOT) not in sys.path:
    sys.path.insert(0, str(_TOOL_ROOT))

from storage_lab import *  # noqa: E402,F401,F403
from storage_lab.cli import main  # noqa: E402

if __name__ == "__main__":
    raise SystemExit(main())
