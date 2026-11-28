import type * as React from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createRequestApplicationForRequest } from "@repo/services/application";
import { RequestOwnedSnapshot } from "@/components/request-owned-snapshot";
import { Skeleton } from "@/components/ui/skeleton";
import { ProfilePage } from "@/features/profile/page";
import { getSurfaceTranslations } from "@/lib/translations.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getSurfaceTranslations("metadata");
  return { title: t("profileTitle"), description: t("profileDescription") };
}

/**
 * The signed-in account's profile.
 *
 * The principal is resolved on the server, so the route never renders another
 * account's identity while a client cache hydrates. The scope wrapper keeps the
 * profile and the rest of the authenticated query cache attached to that same
 * user.
 */
async function ProfileData(): Promise<React.JSX.Element> {
  const application = await createRequestApplicationForRequest(new Headers(await headers()));
  const principal = application.principal;
  if (!principal) redirect("/auth/sign-in");
  return (
    <RequestOwnedSnapshot
      scope={{
        userId: principal.identityUserId,
        sessionId: principal.sessionId,
        tenantId: principal.activeOrganizationId,
        teamId: principal.activeTeamId,
      }}
    >
      <ProfilePage
        user={{
          id: principal.userId,
          name: principal.name,
          email: principal.email,
          role: principal.role,
          emailVerified: principal.emailVerified,
        }}
      />
    </RequestOwnedSnapshot>
  );
}

function ProfileLoading(): React.JSX.Element {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background text-foreground" aria-busy="true">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-4 w-full max-w-lg" />
        </div>
        <Skeleton className="h-44 w-full rounded-2xl" />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    </main>
  );
}

export default function ProfileRoute(): React.JSX.Element {
  return (
    <Suspense fallback={<ProfileLoading />}>
      <ProfileData />
    </Suspense>
  );
}
