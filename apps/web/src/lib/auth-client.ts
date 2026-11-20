import { authClient } from "@repo/auth/client";

export { authClient };
import {
  IDENTITY_OAUTH_PROVIDERS,
  isIdentityOAuthProvider,
  type IdentityOAuthProvider,
} from "./auth-model";
export {
  IDENTITY_OAUTH_PROVIDERS,
  isIdentityOAuthProvider,
  isIdentityRecentAuthenticationError,
} from "./auth-model";
export type { IdentityOAuthProvider } from "./auth-model";
export {
  createSignInSchema,
  createSignUpSchema,
  createEmailSchema,
  createResetPasswordSchema,
  createProfileSchema,
  createChangePasswordSchema,
  createRequiredPasswordSchema,
  createTotpSchema,
  createTwoFactorChallengeSchema,
} from "./auth-validation";
export type { EmailPasswordMessages, NameMessages } from "./auth-validation";

export const identityPasskeyCapability = Object.freeze({
  status: "supported",
  database: "postgres",
  target: "nextjs",
  operationIds: [
    "identity.passkey.authenticate",
    "identity.passkey.delete",
    "identity.passkey.list",
    "identity.passkey.register",
    "identity.passkey.rename",
  ],
  acceptanceOperationIds: [
    "identity.passkey.authenticate.v1",
    "identity.passkey.delete.v1",
    "identity.passkey.list.v1",
    "identity.passkey.register.v1",
    "identity.passkey.rename.v1",
  ],
} as const);
export const identityClientCapabilities = Object.freeze({
  emailPassword: true,
  oauthProviders: IDENTITY_OAUTH_PROVIDERS,
  passkey: identityPasskeyCapability,
});

export interface IdentityEmailFlowResult {
  data?: unknown;
  error?: { message?: string } | null;
}

interface CaptchaFetchOptions {
  headers: { "x-captcha-response": string };
}

/**
 * Attaches the Cloudflare Turnstile token to a Better Auth request.
 *
 * The captcha plugin reads `x-captcha-response`; omitting it leaves the
 * request untouched so a deployment without Turnstile keys keeps working.
 */
function withCaptcha<T extends object>(
  input: T,
  captchaToken: string | undefined,
): T | (T & { fetchOptions: CaptchaFetchOptions }) {
  if (!captchaToken) return input;
  return { ...input, fetchOptions: { headers: { "x-captcha-response": captchaToken } } };
}

interface IdentityEmailFlowClient {
  signIn: {
    magicLink(input: {
      email: string;
      callbackURL: string;
      fetchOptions?: CaptchaFetchOptions;
    }): Promise<IdentityEmailFlowResult>;
  };
  sendVerificationEmail(input: {
    email: string;
    callbackURL: string;
    fetchOptions?: CaptchaFetchOptions;
  }): Promise<IdentityEmailFlowResult>;
}

const identityEmailFlowClient = authClient as typeof authClient & IdentityEmailFlowClient;

export const identityPasskeyClient = Object.freeze({
  supported: true as const,
  capability: identityPasskeyCapability,
  authenticate() {
    return authClient.signIn.passkey();
  },
  register(input: { name?: string } = {}) {
    return authClient.passkey.addPasskey(input);
  },
  list(options: { signal?: AbortSignal } = {}) {
    return authClient.passkey.listUserPasskeys({ fetchOptions: options });
  },
  rename(input: { id: string; name: string }) {
    return authClient.passkey.updatePasskey(input);
  },
  delete(input: { id: string }) {
    return authClient.passkey.deletePasskey(input);
  },
});

export const identityClient = Object.freeze({
  capabilities: identityClientCapabilities,
  passkeys: identityPasskeyClient,
  useSession() {
    return authClient.useSession();
  },
  signInWithEmail(input: {
    email: string;
    password: string;
    callbackURL: string;
    captchaToken?: string;
  }) {
    const { captchaToken, ...credentials } = input;
    return authClient.signIn.email(withCaptcha(credentials, captchaToken));
  },
  signUpWithEmail(input: {
    name: string;
    email: string;
    password: string;
    callbackURL: string;
    captchaToken?: string;
  }) {
    const { captchaToken, ...credentials } = input;
    return authClient.signUp.email(withCaptcha(credentials, captchaToken));
  },

  signInWithOAuth(input: { provider: IdentityOAuthProvider; callbackURL: string }) {
    if (!isIdentityOAuthProvider(input.provider)) {
      throw new TypeError("Unsupported OAuth provider");
    }
    return authClient.signIn.social(input);
  },
  requestPasswordReset(input: { email: string; redirectTo: string; captchaToken?: string }) {
    const { captchaToken, ...request } = input;
    return authClient.requestPasswordReset(withCaptcha(request, captchaToken));
  },
  requestMagicLink(input: { email: string; callbackURL: string; captchaToken?: string }) {
    const { captchaToken, ...request } = input;
    return identityEmailFlowClient.signIn.magicLink(withCaptcha(request, captchaToken));
  },
  requestEmailVerification(input: { email: string; callbackURL: string; captchaToken?: string }) {
    const { captchaToken, ...request } = input;
    return identityEmailFlowClient.sendVerificationEmail(withCaptcha(request, captchaToken));
  },
  resetPassword(input: { newPassword: string; token: string }) {
    return authClient.resetPassword(input);
  },

  updateProfile(input: { name: string }) {
    return authClient.updateUser(input);
  },
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    revokeOtherSessions: boolean;
  }) {
    return authClient.changePassword(input);
  },
  enableTwoFactor(input: { password: string }) {
    return authClient.twoFactor.enable(input);
  },
  verifyTwoFactor(input: { code: string; trustDevice: boolean }) {
    return authClient.twoFactor.verifyTotp(input);
  },
  verifyBackupCode(input: { code: string; trustDevice: boolean }) {
    return authClient.twoFactor.verifyBackupCode(input);
  },
  disableTwoFactor(input: { password: string }) {
    return authClient.twoFactor.disable(input);
  },

  deleteAccount(input?: { password: string }) {
    // OAuth-only accounts omit a password; Better Auth then requires a recent session.
    return authClient.deleteUser(input ?? {});
  },
});
