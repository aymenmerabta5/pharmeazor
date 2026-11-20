"use client";

import * as React from "react";
import type { TurnstileInstance } from "@marsidev/react-turnstile";
import { turnstileSiteKey } from "./turnstile";

export interface AuthCaptchaState {
  /** False when the deployment has no site key, so forms stay usable. */
  enabled: boolean;
  /** Single-use token handed to Better Auth in `x-captcha-response`. */
  token: string | null;
  /** True when the widget failed to load or the challenge errored. */
  error: boolean;
  /** Widget handle owned by `<Turnstile>` in the field component. */
  widgetRef: React.RefObject<TurnstileInstance | undefined>;
  acceptToken(token: string): void;
  expireToken(): void;
  rejectChallenge(): void;
  /** Clears the spent token and asks Cloudflare for a fresh challenge. */
  reset(): void;
}

/**
 * Owns one Turnstile token for an authentication form.
 *
 * Tokens are single-use: every submit path must call `reset()` when the
 * request settles, whether it succeeded, failed, or was superseded.
 */
export function useAuthCaptcha(): AuthCaptchaState {
  const enabled = turnstileSiteKey !== null;
  const [token, setToken] = React.useState<string | null>(null);
  const [error, setError] = React.useState(false);
  const widgetRef = React.useRef<TurnstileInstance | undefined>(undefined);

  const acceptToken = React.useCallback((value: string) => {
    setToken(value);
    setError(false);
  }, []);

  const expireToken = React.useCallback(() => setToken(null), []);

  const rejectChallenge = React.useCallback(() => {
    setToken(null);
    setError(true);
  }, []);

  const reset = React.useCallback(() => {
    setToken(null);
    widgetRef.current?.reset();
  }, []);

  return { enabled, token, error, widgetRef, acceptToken, expireToken, rejectChallenge, reset };
}
