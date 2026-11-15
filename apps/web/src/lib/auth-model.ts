export const IDENTITY_OAUTH_PROVIDERS = ["google", "apple"] as const;
export type IdentityOAuthProvider = (typeof IDENTITY_OAUTH_PROVIDERS)[number];
export function isIdentityOAuthProvider(value: string): value is IdentityOAuthProvider {
  return (IDENTITY_OAUTH_PROVIDERS as readonly string[]).includes(value);
}
export function isIdentityRecentAuthenticationError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = Reflect.get(error, "code");
  return code === "SESSION_NOT_FRESH" || code === "SESSION_EXPIRED";
}

export function isEmailNotVerifiedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  return Reflect.get(error, "code") === "EMAIL_NOT_VERIFIED";
}
