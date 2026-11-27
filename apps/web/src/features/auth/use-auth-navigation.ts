"use client";
import { useRouter } from "next/navigation";

export function useAuthNavigation() {
  const router = useRouter();
  return {
    dashboard: () => router.push("/dashboard"),
    // `/` decides between the landing page and `/agent` from the live
    // subscription, so a signed-in subscriber lands in the assistant and an
    // unsubscribed account sees the plans.
    afterSignIn: (twoFactor: boolean) => router.push(twoFactor ? "/2fa" : "/"),
    afterSignUp: (hasSession: boolean) => router.push(hasSession ? "/" : "/auth/verify-email"),
    afterPasswordReset: () => router.push("/auth/sign-in?reset=success"),
  };
}
