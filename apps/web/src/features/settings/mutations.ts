"use client";
import { identityClient, identityPasskeyClient } from "@/lib/auth-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import {
  requestQueryAuthScopeRefresh,
  currentQueryAuthScope,
  authScopedQueryKey,
} from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";
import { identitySessionsQueryKey } from "./queries";
import {
  revokeIdentitySessionAction,
  revokeOtherIdentitySessionsAction,
} from "@/app/settings/actions";

import { identityFailure, type TwoFactorInput, type PasskeyInput } from "./model";

export function useSettingsIdentityRefresh(): () => void {
  const queryClient = useQueryClient();
  return () => requestQueryAuthScopeRefresh(queryClient);
}
export function useUpdateProfileMutation() {
  return useAuthOwnedMutation(async (input: { name: string }) => {
    const result = await identityClient.updateProfile(input);
    if (result.error) throw identityFailure(result.error);
  });
}

export function useChangePasswordMutation() {
  return useAuthOwnedMutation(async (input: { currentPassword: string; newPassword: string }) => {
    const result = await identityClient.changePassword({ ...input, revokeOtherSessions: true });
    if (result.error) throw identityFailure(result.error);
  });
}
export function useTwoFactorMutation() {
  return useAuthOwnedMutation(async (input: TwoFactorInput) => {
    if (input.kind === "enable") {
      const result = await identityClient.enableTwoFactor({ password: input.password });
      if (result.error || !result.data) throw identityFailure(result.error);
      return {
        kind: "challenge" as const,
        totpUri: result.data.totpURI,
        backupCodes: result.data.backupCodes,
      };
    }
    const result =
      input.kind === "verify"
        ? await identityClient.verifyTwoFactor({ code: input.code, trustDevice: false })
        : await identityClient.disableTwoFactor({ password: input.password });
    if (result.error) throw identityFailure(result.error);
    return { kind: "complete" as const, enabled: input.kind === "verify" };
  });
}

export function usePasskeyMutation() {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(
    async (input: PasskeyInput) => {
      const result =
        input.kind === "register"
          ? await identityPasskeyClient.register({ name: input.name })
          : input.kind === "rename"
            ? await identityPasskeyClient.rename({ id: input.id, name: input.name })
            : await identityPasskeyClient.delete({ id: input.id });
      if (result.error) throw identityFailure(result.error);
      return input.kind;
    },
    {
      onSuccess: async () => {
        const scope = currentQueryAuthScope(queryClient);
        if (scope)
          await queryClient.invalidateQueries({
            queryKey: authScopedQueryKey({ ...scope, tenantId: null, teamId: null }, [
              "identity",
              "passkeys",
            ]),
          });
      },
    },
  );
}

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(
    async (input: { sessionId: string } | { others: true }) => {
      const result =
        "others" in input
          ? await revokeOtherIdentitySessionsAction()
          : await revokeIdentitySessionAction(input);
      if (!result.ok) throw new Error(result.error);
    },
    {
      onSuccess: async () => {
        const scope = currentQueryAuthScope(queryClient);
        if (scope)
          await queryClient.invalidateQueries({ queryKey: identitySessionsQueryKey(scope) });
      },
    },
  );
}
