import type * as React from "react";
import { cache, Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getRequestUser } from "@repo/auth";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardView } from "@/features/dashboard/dashboard-view";

const getCachedSession = cache(async () => {
  const user = await getRequestUser(await headers());
  return user ? { user } : null;
});

async function DashboardContent(): Promise<React.JSX.Element> {
  const session = await getCachedSession();
  if (!session?.user) redirect("/sign-in");
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

function DashboardSkeleton(): React.JSX.Element {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
    </div>
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
