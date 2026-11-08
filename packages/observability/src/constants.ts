export const SECRET_SUBSTRINGS = [
  "secret",
  "password",
  "token",
  "auth",
  "bearer",
  "cookie",
  "credential",
  "key",
  "otp",
  "session",
  "signature",
  "private",
] as const;
export const SECRET_PATTERN =
  /\b(apikey|api_key|jwt|private_key|database_url|db_url|webhook_secret|client_secret|access_token)\b/i;
export const URL_SECRET_PARAM_PATTERN = /token|key|secret|password|auth|api|signature/i;

/** Value shapes that are secrets regardless of the key they arrive under. */
export const SECRET_VALUE_PATTERNS: RegExp[] = [
  /\b(?:sk|pk|rk|whsec|psk)_[A-Za-z0-9_]{8,}/g,
  /\bpdl_[A-Za-z0-9_]{8,}/g,
  /\bpolar_[A-Za-z0-9_]{8,}/g,
  /\b(?:phc|re)_[A-Za-z0-9_]{16,}/g,
  /\bBearer\s+[A-Za-z0-9._~+/-]{12,}=*/gi,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g,
  /\b([a-z][a-z0-9+.-]*:\/\/[^:\s/]+):[^@\s]+@/gi,
];
const SECRET_ASSIGNMENT_PATTERN =
  /\b([A-Za-z][A-Za-z0-9_.-]{0,63})(\s*(?:=|:)\s*)(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s,;&]+)/g;

export function looksLikeSecret(key: string): boolean {
  const lower = key.toLowerCase();
  for (const needle of SECRET_SUBSTRINGS) {
    if (lower.includes(needle)) return true;
  }
  return SECRET_PATTERN.test(lower);
}

export function redactSecretValues(text: string): string {
  let out = text;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    out = out.replace(pattern, (match, prefix?: string) =>
      typeof prefix === "string" ? `${prefix}:***@` : "***",
    );
  }
  out = out.replace(SECRET_ASSIGNMENT_PATTERN, (match, key: string, separator: string) =>
    looksLikeSecret(key) ? `${key}${separator}***` : match,
  );
  return out;
}
