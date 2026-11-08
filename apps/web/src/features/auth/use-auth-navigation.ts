"use client";
import { useRouter } from "next/navigation";

export function useAuthNavigation() {
  const router = useRouter();
  return {
    dashboard: () => router.push("/dashboard"),
    afterSignIn: (twoFactor: boolean) => router.push(twoFactor ? "/2fa" : "/dashboard"),
    afterSignUp: (hasSession: boolean) => router.push(hasSession ? "/dashboard" : "/verify-email"),
    afterPasswordReset: () => router.push("/sign-in?reset=success"),
  };
}
