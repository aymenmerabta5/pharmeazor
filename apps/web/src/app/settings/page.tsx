import type * as React from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { QueryAuthStatus } from "@/components/query-auth-boundary";
import { ProfileCard } from "@/features/settings/profile-card";
import { PasswordCard } from "@/features/settings/password-card";
import { TwoFactorCard } from "@/features/settings/two-factor-card";
import { PasskeyCard } from "@/features/settings/passkey-card";
import { DangerZoneCard } from "@/features/account-deletion/account-deletion";
import { SessionsCard } from "@/features/settings/sessions-card";

async function SettingsData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const me = await application.me();
  const principal = application.principal;
  if (!me.user || !principal) redirect("/sign-in");
  const initialScope = {
    userId: principal.identityUserId,
    sessionId: principal.sessionId,
    tenantId: principal.activeOrganizationId,
    teamId: principal.activeTeamId,
  };
  const initialSessions = await application.identity.sessions.list();
  return (
    <RequestOwnedSnapshot scope={initialScope}>
      <div className="flex min-w-0 flex-col gap-6">
        <ProfileCard initialUser={me.user} />
        <div className="grid items-start gap-6 xl:grid-cols-2">
          <PasswordCard />
          <TwoFactorCard />
        </div>
        <PasskeyCard />
        <SessionsCard initialSessions={initialSessions} initialScope={initialScope} />
        <DangerZoneCard />
      </div>
    </RequestOwnedSnapshot>
  );
}

export default function SettingsPage(): React.JSX.Element {
  return (
    <Suspense fallback={<QueryAuthStatus />}>
      <SettingsData />
    </Suspense>
  );
}
