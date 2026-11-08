import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type * as React from "react";
import { Suspense } from "react";
import { auth } from "@repo/auth";
import { isAdminRole } from "@repo/auth/access";

async function AuthorizedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user || !isAdminRole(session.user.role) || session.user.banned === true)
    redirect("/");
  return <div className="min-w-0">{children}</div>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <Suspense fallback={<div className="min-h-64" aria-busy="true" />}>
      <AuthorizedAdminLayout>{children}</AuthorizedAdminLayout>
    </Suspense>
  );
}
