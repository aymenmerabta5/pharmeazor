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

interface IdentityEmailFlowClient {
  signIn: {
    magicLink(input: { email: string; callbackURL: string }): Promise<IdentityEmailFlowResult>;
  };
  sendVerificationEmail(input: {
    email: string;
    callbackURL: string;
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
  signInWithEmail(input: { email: string; password: string; callbackURL: string }) {
    return authClient.signIn.email(input);
  },
  signUpWithEmail(input: { name: string; email: string; password: string; callbackURL: string }) {
    return authClient.signUp.email(input);
  },

  signInWithOAuth(input: { provider: IdentityOAuthProvider; callbackURL: string }) {
    if (!isIdentityOAuthProvider(input.provider)) {
      throw new TypeError("Unsupported OAuth provider");
    }
    return authClient.signIn.social(input);
  },
  requestPasswordReset(input: { email: string; redirectTo: string }) {
    return authClient.requestPasswordReset(input);
  },
  requestMagicLink(input: { email: string; callbackURL: string }) {
    return identityEmailFlowClient.signIn.magicLink(input);
  },
  requestEmailVerification(input: { email: string; callbackURL: string }) {
    return identityEmailFlowClient.sendVerificationEmail(input);
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
