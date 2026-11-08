import { createAuthClient } from "better-auth/react";
import { expoClient } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import { adminClient, twoFactorClient, magicLinkClient } from "better-auth/client/plugins";
import { env } from "@repo/config/expo";

function getBaseUrl(): string {
  for (const value of [env.EXPO_PUBLIC_API_URL, env.EXPO_PUBLIC_APP_URL]) {
    if (!value) continue;
    try {
      const parsed = new URL(value);
      if (
        (parsed.protocol === "https:" || parsed.protocol === "http:") &&
        !parsed.username &&
        !parsed.password
      ) {
        return parsed.toString().replace(/\/$/, "");
      }
    } catch {}
  }
  throw new Error("EXPO_PUBLIC_API_URL must be a trusted HTTP(S) API URL");
}

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    twoFactorClient(),
    magicLinkClient(),

    adminClient(),
    expoClient({
      scheme: "pharmeazor",
      storagePrefix: "pharmeazor",
      storage: SecureStore,
    }),
  ],
});

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
  status: "unsupported",
  database: "postgres",
  target: "expo",
  operationIds: [],
  acceptanceOperationIds: [],
  reason:
    "The pinned Better Auth passkey client is browser WebAuthn-only; no audited Expo native credential binding is installed.",
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

export const identityPasskeyClient = identityPasskeyCapability;

export const identityClient = Object.freeze({
  capabilities: identityClientCapabilities,
  passkeys: identityPasskeyClient,
  useSession() {
    return authClient.useSession();
  },
  signInWithEmail(input: { email: string; password: string; callbackURL?: string }) {
    return authClient.signIn.email(input);
  },
  signUpWithEmail(input: { name: string; email: string; password: string; callbackURL?: string }) {
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
