"""Entry point for the PHARMEAZOR corpus-cleaning pipeline."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from pipeline.clean_corpus import DEFAULT_CONFIG, run  # noqa: E402
from pipeline.validate import validate  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--data-root", help="Override data_root from config.yaml")
    parser.add_argument("--output-root", help="Override output_root (defaults to ./output)")
    parser.add_argument("--only-med", help="Only process one medicine id, e.g. MED031")
    parser.add_argument("--no-chunks", action="store_true", help="Skip the splitter preview")
    parser.add_argument("--no-dedupe", action="store_true", help="Disable near-duplicate removal")
    parser.add_argument("--skip-validate", action="store_true")
    args = parser.parse_args()

    output_root = Path(args.output_root) if args.output_root else (BASE_DIR / "output")
    summary = run(
        config_path=args.config,
        data_root_override=args.data_root,
        output_root_override=str(output_root),
        only_med=args.only_med,
        no_chunks=args.no_chunks,
        no_dedupe=args.no_dedupe,
    )
    result = {"summary": summary}
    if not args.skip_validate:
        validation = validate(config_path=args.config, output_root=output_root)
        result["validation"] = {
            "ok": validation["ok"],
            "errors": validation["errors"],
            "warnings": validation["warnings"][:20],
            "counts": validation["counts"],
        }
        print(json.dumps(result["validation"], ensure_ascii=False, indent=2))
        if not validation["ok"]:
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
