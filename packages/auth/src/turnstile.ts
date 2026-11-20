/**
 * Cloudflare Turnstile configuration for the Better Auth captcha plugin.
 *
 * The challenge is opt-in: a missing or placeholder secret disables it, so a
 * checkout that has not provisioned Cloudflare keys keeps every email flow
 * working instead of locking users out. The site key is public and travels to
 * the web and mobile clients through their `NEXT_PUBLIC_` / `EXPO_PUBLIC_`
 * environment entrypoints.
 */

/** Action attached to every widget and checked again by the server. */
export const TURNSTILE_ACTION = "auth";

/**
 * Auth endpoints that need a human behind the request.
 *
 * Password completion is intentionally absent: it already requires a valid
 * single-use token delivered to the account inbox. The protected paths are the
 * ones that mint sessions or send email to an arbitrary address.
 */
export const TURNSTILE_PROTECTED_ENDPOINTS = [
  "/sign-up/email",
  "/sign-in/email",
  "/sign-in/magic-link",
  "/request-password-reset",
  "/send-verification-email",
] as const;

/** True when an operator supplied a real secret instead of the placeholder. */
export function isTurnstileSecretConfigured(secret: string | undefined): secret is string {
  return (
    typeof secret === "string" && secret.trim().length > 0 && !secret.startsWith("REPLACE_WITH")
  );
}

/** Options for the Better Auth `captcha` plugin, Cloudflare flavour. */
export function createTurnstileCaptchaOptions(secretKey: string) {
  return {
    provider: "cloudflare-turnstile" as const,
    secretKey,
    endpoints: [...TURNSTILE_PROTECTED_ENDPOINTS],
    expectedAction: TURNSTILE_ACTION,
  };
}

/**
 * Options that keep the plugin registered while enforcing nothing.
 *
 * Better Auth derives the whole auth type from the literal plugin tuple, so a
 * conditionally spread plugin widens the array and erases every plugin's
 * inferred fields. Registering an inert plugin instead keeps the tuple intact;
 * the sentinel endpoint matches no real auth request, so the challenge never
 * runs until an operator supplies both keys.
 */
export function createInertCaptchaOptions() {
  return {
    provider: "cloudflare-turnstile" as const,
    secretKey: "turnstile-not-configured",
    endpoints: ["/__turnstile-not-configured__"],
  };
}
