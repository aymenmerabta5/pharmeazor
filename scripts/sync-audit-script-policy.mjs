/**
 * Verifies that the audit script embedded in `scripts/security-dependencies.cjs`
 * as `policy.auditScriptContent` is byte-identical to the on-disk
 * `scripts/audit-dependencies.ts`.
 *
 * The dependency-security runtime rewrites `scripts/audit-dependencies.ts` from
 * the embedded copy during `security fix`, so the two must stay in lockstep or
 * a fix silently reverts local edits.
 *
 * Usage:
 *   bun scripts/sync-audit-script-policy.mjs            # verify only
 *   bun scripts/sync-audit-script-policy.mjs --write    # rewrite the embedded copy
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const AUDIT_SCRIPT = resolve(ROOT, "scripts/audit-dependencies.ts");
const POLICY_FILE = resolve(ROOT, "scripts/security-dependencies.cjs");
const MARKER = "auditScriptContent:";

/** The policy stores the script as a single-quoted JavaScript string literal. */
function decodeEmbedded(literal) {
  let out = "";
  for (let index = 0; index < literal.length; index += 1) {
    const character = literal[index];
    if (character !== "\\") {
      out += character;
      continue;
    }
    index += 1;
    const escaped = literal[index];
    if (escaped === "n") out += "\n";
    else if (escaped === "t") out += "\t";
    else if (escaped === "r") out += "\r";
    else if (escaped === "'") out += "'";
    else if (escaped === "\\") out += "\\";
    else out += escaped;
  }
  return out;
}

/** Reverses {@link decodeEmbedded}. */
function encodeEmbedded(source) {
  let out = "";
  for (const character of source) {
    if (character === "\\") out += "\\\\";
    else if (character === "'") out += "\\'";
    else if (character === "\n") out += "\\n";
    else if (character === "\r") out += "\\r";
    else if (character === "\t") out += "\\t";
    else out += character;
  }
  return out;
}

function readEmbedded(policySource) {
  const markerIndex = policySource.indexOf(MARKER);
  if (markerIndex === -1) throw new Error("policy has no auditScriptContent field");
  const open = policySource.indexOf("'", markerIndex);
  if (open === -1) throw new Error("policy auditScriptContent is not a single-quoted string");
  let index = open + 1;
  while (index < policySource.length) {
    const character = policySource[index];
    if (character === "\\") {
      index += 2;
      continue;
    }
    if (character === "'") break;
    index += 1;
  }
  if (index >= policySource.length) throw new Error("policy auditScriptContent is not terminated");
  return { start: open, end: index, value: decodeEmbedded(policySource.slice(open + 1, index)) };
}

const policySource = readFileSync(POLICY_FILE, "utf8");
const embedded = readEmbedded(policySource);
const onDisk = readFileSync(AUDIT_SCRIPT, "utf8");

if (embedded.value === onDisk) {
  console.log("Embedded audit script matches scripts/audit-dependencies.ts.");
  process.exit(0);
}

if (!process.argv.includes("--write")) {
  console.error("Embedded audit script does NOT match scripts/audit-dependencies.ts.");
  console.error(`embedded: ${embedded.value.length} bytes`);
  console.error(`on disk:  ${onDisk.length} bytes`);
  console.error("Run with --write to resynchronise the embedded copy.");
  process.exit(1);
}

const replacement = "'" + encodeEmbedded(onDisk) + "'";
const updated =
  policySource.slice(0, embedded.start) + replacement + policySource.slice(embedded.end + 1);
writeFileSync(POLICY_FILE, updated, "utf8");
console.log("Resynchronised the embedded audit script copy.");
