import { useRouter } from "expo-router";
export function useAuthNavigation() {
  const router = useRouter();
  return {
    dashboard: () => router.replace("/dashboard"),
    afterSignIn: (twoFactor: boolean) => router.replace(twoFactor ? "/2fa" : "/dashboard"),
    afterSignUp: (hasSession: boolean) =>
      router.replace(hasSession ? "/dashboard" : "/auth/verify-email"),
    afterPasswordReset: () =>
      router.replace({ pathname: "/auth/sign-in", params: { reset: "success" } }),
  };
}
