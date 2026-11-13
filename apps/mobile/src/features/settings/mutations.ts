"use client";
import { identityClient } from "@/lib/auth-client";
import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { requestQueryAuthScopeRefresh, currentQueryAuthScope } from "@/lib/query-client";
import { useQueryClient } from "@tanstack/react-query";
import { identitySessionsQueryKey } from "./queries";

import { orpc } from "@/lib/orpc";
import { identityFailure, type TwoFactorInput } from "./model";

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
      // better-auth returns a discriminated union: it either hands back the
      // TOTP enrolment payload or delegates the challenge to an OTP channel.
      // The server only enables TOTP, so anything else is a configuration
      // change the settings screen cannot complete yet.
      if (result.data.method !== "totp") {
        throw new Error("Two-factor enrolment did not return a TOTP challenge");
      }
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

export function useRevokeSessionMutation() {
  const queryClient = useQueryClient();
  return useAuthOwnedMutation(
    async (input: { sessionId: string } | { others: true }) => {
      if ("others" in input) await orpc.identity.sessions.revokeOthers.call({});
      else await orpc.identity.sessions.revoke.call(input);
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
