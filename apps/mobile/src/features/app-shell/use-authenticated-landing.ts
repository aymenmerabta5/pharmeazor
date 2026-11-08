"use client";
import * as React from "react";
import { usePathname, useRouter } from "expo-router";

/**
 * Public entry routes render for anonymous visitors. Once the authenticated
 * query scope is committed, the protected stack is available, so a visitor who
 * signed in from one of these routes must be moved into the application.
 */
const AUTHENTICATED_ENTRY_PATHS = new Set([
  "/",
  "/2fa",
  "/forgot-password",
  "/magic-link",
  "/reset-password",
  "/sign-in",
  "/sign-up",
  "/verify-email",
]);

export function useAuthenticatedLanding(isAuthenticated: boolean): void {
  const pathname = usePathname();
  const router = useRouter();
  const shouldLand = isAuthenticated && AUTHENTICATED_ENTRY_PATHS.has(pathname);

  React.useEffect(() => {
    if (!shouldLand) return;
    router.replace("/dashboard");
  }, [router, shouldLand]);
}
