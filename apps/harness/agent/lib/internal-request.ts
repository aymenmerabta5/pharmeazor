import { createHmac } from "node:crypto";

/**
 * Signed request to an application-internal route.
 *
 * The application services live behind `server-only` in the Next.js process, so
 * the harness cannot import them. It signs the principal it resolved from its
 * own session with the shared `EVE_INTERNAL_AUTH_SECRET`, exactly like
 * `agent/hooks/admission-lifecycle.ts` does for lifecycle callbacks. Keep the
 * envelope and header names in sync with
 * `packages/api/src/retrieval/envelope.ts`.
 *
 * One implementation serves every internal route, so a new route cannot
 * accidentally ship with weaker authentication than the one beside it.
 */

const REQUEST_TIMEOUT_MS = 20_000;

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

function applicationOrigin(): string | null {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) return null;
  try {
    const value = new URL(configured);
    const loopback =
      value.hostname === "localhost" ||
      value.hostname === "127.0.0.1" ||
      value.hostname === "[::1]";
    if (
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      (value.protocol !== "https:" && !(value.protocol === "http:" && loopback))
    ) {
      return null;
    }
    return value.origin;
  } catch {
    return null;
  }
}

export interface SignedRequestOptions {
  readonly path: string;
  /** Human-readable name used in error messages, e.g. "Medical corpus retrieval". */
  readonly label: string;
  readonly principalId: string;
  readonly payload: Record<string, unknown>;
}

/**
 * POST a signed envelope and return the parsed JSON body.
 *
 * A proxy or cache can return a non-2xx status with a body that still says
 * `ok: true`. The status wins, because the body may be a cached success from a
 * different request.
 */
export async function signedInternalPost(options: SignedRequestOptions): Promise<unknown> {
  const origin = applicationOrigin();
  if (!origin) {
    throw new Error(
      `${options.label} is unavailable: BETTER_AUTH_URL must be an absolute http(s) URL for this deployment.`,
    );
  }
  const secret = configuredSecret();
  if (!secret) {
    throw new Error(`${options.label} is unavailable: EVE_INTERNAL_AUTH_SECRET is not configured.`);
  }

  const body = JSON.stringify({
    principal: { id: options.principalId },
    request: options.payload,
  });
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");

  let response: Response;
  try {
    response = await fetch(new URL(options.path, origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GhostInit-Eve-Signature": signature,
        "X-GhostInit-Eve-Timestamp": timestamp,
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : "network failure";
    throw new Error(`${options.label} request failed: ${detail}`);
  }

  const text = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${options.label} returned an unreadable response (HTTP ${response.status}).`);
  }

  const claimsOk =
    typeof payload === "object" && payload !== null && (payload as { ok?: unknown }).ok === true;
  if (!response.ok && claimsOk) {
    throw new Error(`${options.label} failed (HTTP ${response.status})`);
  }

  return payload;
}
