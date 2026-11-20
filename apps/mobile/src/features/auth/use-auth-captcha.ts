"use client";

import * as React from "react";
import { turnstileSiteKey } from "./turnstile";

export interface AuthCaptchaState {
  /** False when the deployment has no site key, so forms stay usable. */
  enabled: boolean;
  /** Single-use token handed to Better Auth in `x-captcha-response`. */
  token: string | null;
  /** True when the widget failed to load or the challenge errored. */
  error: boolean;
  /** Changes on reset so the WebView remounts with a fresh widget. */
  attempt: number;
  acceptToken(token: string): void;
  rejectChallenge(): void;
  /** Clears the spent token and asks Cloudflare for a fresh challenge. */
  reset(): void;
}

/**
 * Owns one Turnstile WebView for an authentication form.
 *
 * Tokens are single-use: every submit path must call `reset()` when the
 * request settles, whether it succeeded, failed, or was superseded.
 */
export function useAuthCaptcha(): AuthCaptchaState {
  const enabled = turnstileSiteKey !== null;
  const [token, setToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  const [attempt, setAttempt] = React.useState(0);

  const acceptToken = React.useCallback((value: string) => {
    setToken(value);
    setError(false);
  }, []);

  const rejectChallenge = React.useCallback(() => {
    setToken(null);
    setError(true);
  }, []);

  const reset = React.useCallback(() => {
    setToken(null);
    setAttempt((value) => value + 1);
  }, []);

  return { enabled, token, error, attempt, acceptToken, rejectChallenge, reset };
}
