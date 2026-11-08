import {
  looksLikeSecret as looksLikeSecretFromConstants,
  redactSecretValues,
  SECRET_SUBSTRINGS,
  SECRET_PATTERN,
} from "./constants";

export const SECRET_REGEX = SECRET_PATTERN;
export { SECRET_SUBSTRINGS, redactSecretValues };
export function looksLikeSecret(key: string): boolean {
  return looksLikeSecretFromConstants(key);
}

const EMBEDDED_URL_PATTERN = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCTUATION = /[),.;!?]+$/;
function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    let changed = false;
    if (url.username) {
      url.username = "***";
      changed = true;
    }
    if (url.password) {
      url.password = "***";
      changed = true;
    }
    for (const param of Array.from(url.searchParams.keys())) {
      if (looksLikeSecretFromConstants(param)) {
        url.searchParams.set(param, "***");
        changed = true;
      }
    }
    if (url.hash.length > 1) {
      const fragment = new URLSearchParams(url.hash.slice(1));
      let fragmentChanged = false;
      for (const param of Array.from(fragment.keys())) {
        if (looksLikeSecretFromConstants(param)) {
          fragment.set(param, "***");
          fragmentChanged = true;
        }
      }
      if (fragmentChanged) {
        url.hash = fragment.toString();
        changed = true;
      }
    }
    return changed ? url.toString() : value;
  } catch {
    return value;
  }
}
function redactUrlToken(value: string): string {
  return value.replace(EMBEDDED_URL_PATTERN, (candidate) => {
    const trailing = candidate.match(TRAILING_URL_PUNCTUATION)?.[0] ?? "";
    const url = trailing ? candidate.slice(0, -trailing.length) : candidate;
    return `${redactUrl(url)}${trailing}`;
  });
}

export function redact(value: unknown, key = "", seen = new WeakSet<object>()): unknown {
  if (typeof value === "string") {
    if (looksLikeSecret(key)) return "***";
    return redactSecretValues(redactUrlToken(value));
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    return value.map((v, i) => redact(v, String(i), seen));
  }
  if (value && typeof value === "object" && !(value instanceof Date)) {
    if (seen.has(value)) return "[Circular]";
    seen.add(value);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redact(v, k, seen);
    }
    return out;
  }
  return value;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
}

function defaultLog(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
  const safeMeta = meta ? redact(meta) : undefined;
  // Messages routinely interpolate provider error text and URLs — scan them too.
  const safeMessage = redactSecretValues(redactUrlToken(message));
  const line = JSON.stringify({
    level,
    message: safeMessage,
    time: new Date().toISOString(),
    ...(safeMeta ? { meta: safeMeta } : {}),
  });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger: Logger = {
  debug: (msg, meta) => defaultLog("debug", msg, meta),
  info: (msg, meta) => defaultLog("info", msg, meta),
  warn: (msg, meta) => defaultLog("warn", msg, meta),
  error: (msg, meta) => defaultLog("error", msg, meta),
};
