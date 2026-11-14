#!/usr/bin/env bun
/**
 * Writes the `.env.local` that the CI jobs build against.
 *
 * The server environment schema fails closed for the providers that must be
 * reachable at runtime, so a build cannot run against the placeholder values
 * in `.env.example`. CI never talks to those providers, so it needs an
 * environment that satisfies the schema without carrying a real credential.
 *
 * Every value written here is a non-secret placeholder. The file is generated
 * per job and never committed.
 *
 * Usage: bun scripts/prepare-ci-env.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = resolve(ROOT, ".env.example");
const TARGET = resolve(ROOT, ".env.local");

/**
 * Overrides for the schema fields that reject the shipped placeholders.
 * These are deliberately obvious so a leaked file is never mistaken for a
 * real configuration.
 */
const OVERRIDES = {
  POSTGRES_PASSWORD: "ci-only-not-a-secret",
  BETTER_AUTH_SECRET: "ci-only-better-auth-secret-000000000000",
  EVE_INTERNAL_AUTH_SECRET: "ci-only-eve-internal-secret-000000000000",
  UPSTASH_REDIS_REST_URL: "https://ci.invalid",
  UPSTASH_REDIS_REST_TOKEN: "ci-only-not-a-real-token",
};

const source = readFileSync(SOURCE, "utf8");
const lines = [];
const seen = new Set();

for (const line of source.split("\n")) {
  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
  if (!match) {
    lines.push(line);
    continue;
  }
  const key = match[1];
  seen.add(key);
  lines.push(key in OVERRIDES ? `${key}=${OVERRIDES[key]}` : line);
}

for (const [key, value] of Object.entries(OVERRIDES)) {
  if (!seen.has(key)) lines.push(`${key}=${value}`);
}

writeFileSync(TARGET, lines.join("\n"), "utf8");
console.info(`Wrote ${TARGET} with ${Object.keys(OVERRIDES).length} CI-safe overrides.`);
