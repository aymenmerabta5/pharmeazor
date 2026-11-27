"use client";
import * as React from "react";
import { usePathname, useRouter } from "expo-router";
import { useBilling } from "@/hooks/use-billing";
import { findLiveSubscription } from "@/lib/billing-liveness";

/**
 * Public entry routes render for anonymous visitors. Once the authenticated
 * query scope is committed, the protected stack is available, so a visitor who
 * signed in from one of these routes must be moved into the application.
 */
const AUTHENTICATED_ENTRY_PATHS = new Set([
  "/",
  "/2fa",
  "/auth/forgot-password",
  "/auth/magic-link",
  "/auth/reset-password",
  "/auth/sign-in",
  "/auth/sign-up",
  "/auth/verify-email",
]);

/**
 * Land a signed-in visitor on the surface their account can use.
 *
 * The assistant is the product, so a live subscription opens it first. An
 * account without one goes to the home tab, where the plan is one tap away.
 * The billing read is held until the session exists, and a failed read lands
 * on the home tab instead of trapping the visitor on the entry route.
 */
export function useAuthenticatedLanding(isAuthenticated: boolean): void {
  const pathname = usePathname();
  const router = useRouter();
  const billing = useBilling(isAuthenticated);
  const shouldLand = isAuthenticated && AUTHENTICATED_ENTRY_PATHS.has(pathname);
  const settled = !billing.loading || Boolean(billing.error);

  React.useEffect(() => {
    if (!shouldLand || !settled) return;
    router.replace(findLiveSubscription(billing.subscriptions) ? "/assistant" : "/home");
  }, [router, shouldLand, settled, billing.subscriptions]);
}
