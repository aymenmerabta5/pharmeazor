"use client";
import * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { IdentityOAuthProvider } from "@/lib/auth-model";
import { signInWithOAuth, authenticatePasskey } from "./mutations";
import type { AuthIntent } from "./use-auth-intent";

type MethodState = { phase: "idle" } | { phase: "running" } | { phase: "failed"; message: string };
export function useAuthMethods(
  intent: AuthIntent,
  onAuthenticated: () => void | Promise<void>,
  scope: "signIn" | "signUp",
  onStart: () => void = () => {},
) {
  const t = useSurfaceTranslations("auth");
  const [state, dispatch] = React.useReducer((_state: MethodState, next: MethodState) => next, {
    phase: "idle",
  } as MethodState);
  async function onOAuth(provider: IdentityOAuthProvider): Promise<void> {
    const ticket = intent.begin();
    if (!ticket) return;
    onStart();
    dispatch({ phase: "running" });
    try {
      const result = await signInWithOAuth(provider);
      if (ticket.isCurrent())
        dispatch(
          result.error
            ? {
                phase: "failed",
                message: t(scope === "signIn" ? "signIn.genericError" : "signUp.genericError"),
              }
            : { phase: "idle" },
        );
    } catch {
      if (ticket.isCurrent())
        dispatch({
          phase: "failed",
          message: t(scope === "signIn" ? "signIn.genericError" : "signUp.genericError"),
        });
    } finally {
      ticket.finish();
    }
  }
  async function onPasskey(): Promise<void> {
    const ticket = intent.begin();
    if (!ticket) return;
    onStart();
    dispatch({ phase: "running" });
    try {
      const result = await authenticatePasskey();
      if (!ticket.isCurrent()) return;
      if (result.error) dispatch({ phase: "failed", message: t("signIn.passkeyError") });
      else {
        dispatch({ phase: "idle" });
        await onAuthenticated();
      }
    } catch {
      if (ticket.isCurrent()) dispatch({ phase: "failed", message: t("signIn.passkeyError") });
    } finally {
      ticket.finish();
    }
  }

  return {
    onOAuth,
    onPasskey,
    pending: state.phase === "running",
    error: state.phase === "failed" ? state.message : null,
    reset: () => dispatch({ phase: "idle" }),
  };
}
