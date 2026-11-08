# pharmeazor

Generated with ghostinit. Runtime: bun

Dependency installs reject package versions published less than 604800 seconds ago. The generated `bunfig.toml` has no minimum-release-age exclusions.

For a committed clone, run `bun run install:verified`. For fresh output created
with `--no-install`, run `bun run install:bootstrap` once to resolve without
lifecycle scripts, attest the public-registry lock, and then install frozen.

## Dependency security

`bun run install:verified` and `bun run install:bootstrap` automatically apply compatible security fixes that satisfy the release-age and integrity policy, then verify the installed graph. `ghostinit upgrade` also repairs dependencies unless `--no-install` is explicit.

Use `bun run security:audit` for a read-only report, `bun run security:fix --dry-run` to preview, and `bun run security:fix` to repair and run the installed audit plus `typecheck`, `lint:all`, and `test`. Add `--json` for machine output. These scripts do not require GhostInit as a dependency; the CLI provides `ghostinit security audit|fix` too.

Fixes retain the seven-day delay and empty exclusions. High/critical or unknown unresolved findings block repair; unreviewed low/moderate findings remain visible and explicit audit/fix exits nonzero. Keep the verified security floors in `ghostinit.config.json.dependencySecurity` so later reconciliation preserves repaired versions.

After a failed install, source changes may already be applied. Inspect `.ghostinit/security-installation.json` and retry the fix after resolving the reported cause; installed dependencies are not rolled back. A `CLEANUP_UNVERIFIED` journal blocks mutation until process cleanup is independently verified and the journal is explicitly reconciled.
If `init` fails after attempting installation in an initially empty directory, it preserves the incomplete project and its recovery record. A dependency fix alone does not finish creation state or local secrets; resolve the cause, repeat the original `init` selections with `--force`, and follow any bootstrap instruction.

- Browser Eve traffic must use `/api/agent/eve/v1/*`; raw `/eve/v1/*` routes accept only the generated server-side proxy credential, and every durable session operation is owner/tenant checked.
