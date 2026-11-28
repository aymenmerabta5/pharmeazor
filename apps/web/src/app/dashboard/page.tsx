import type * as React from "react";
import { cache, Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestUser } from "@repo/auth";
import { DashboardSkeleton } from "@/features/dashboard/components/dashboard-skeleton";
import { DashboardView } from "@/features/dashboard/dashboard-view";

const getCachedSession = cache(async () => {
  const user = await getRequestUser(await headers());
  return user ? { user } : null;
});

async function DashboardContent(): Promise<React.JSX.Element> {
  const session = await getCachedSession();
  if (!session?.user) redirect("/auth/sign-in");
  return (
    <DashboardView
      user={{
        name: session.user.name,
        email: session.user.email,
        role: session.user.role,
      }}
    />
  );
}

export default function DashboardPage(): React.JSX.Element {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background text-foreground">
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </main>
  );
}
