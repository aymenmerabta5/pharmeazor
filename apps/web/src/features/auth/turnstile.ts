/**
 * Cloudflare Turnstile configuration for the web authentication surface.
 *
 * The site key is public and injected at build time from `NEXT_PUBLIC_*`. A
 * placeholder key disables the widget so local development keeps working
 * without a Cloudflare account; the server disables its half the same way.
 */

import { env } from "@repo/config/next";

/** Must match `TURNSTILE_ACTION` in `@repo/auth`'s server configuration. */
export const TURNSTILE_ACTION = "auth";

/** Returns the usable site key, or `null` when Turnstile is not provisioned. */
function readTurnstileSiteKey(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.startsWith("REPLACE_WITH")) return null;
  return trimmed;
}

export const turnstileSiteKey = readTurnstileSiteKey(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
