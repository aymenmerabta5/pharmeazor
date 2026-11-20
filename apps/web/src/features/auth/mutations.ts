import { identityClient } from "@/lib/auth-client";
import type { IdentityOAuthProvider } from "@/lib/auth-model";

export function signInWithOAuth(provider: IdentityOAuthProvider) {
  return identityClient.signInWithOAuth({ provider, callbackURL: "/dashboard" });
}
export function signInWithEmail(input: { email: string; password: string; captchaToken?: string }) {
  return identityClient.signInWithEmail({ ...input, callbackURL: "/dashboard" });
}
export function signUpWithEmail(input: {
  name: string;
  email: string;
  password: string;
  captchaToken?: string;
}) {
  return identityClient.signUpWithEmail({ ...input, callbackURL: "/dashboard" });
}
export function verifyAuthChallenge(
  method: "authenticator" | "backup",
  input: { code: string; trustDevice: boolean },
) {
  return method === "backup"
    ? identityClient.verifyBackupCode(input)
    : identityClient.verifyTwoFactor(input);
}
export function requestPasswordReset(email: string, captchaToken?: string) {
  return identityClient.requestPasswordReset({
    email,
    redirectTo: "/auth/reset-password",
    captchaToken,
  });
}
export function resetPassword(input: { newPassword: string; token: string }) {
  return identityClient.resetPassword(input);
}
export function requestMagicLink(email: string, captchaToken?: string) {
  return identityClient.requestMagicLink({ email, callbackURL: "/dashboard", captchaToken });
}
export function requestEmailVerification(email: string, captchaToken?: string) {
  return identityClient.requestEmailVerification({
    email,
    callbackURL: "/dashboard",
    captchaToken,
  });
}
