"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { AdminCreateUserFeature, useAdminUsersTranslations } from "@/features/admin-users";

export default function AdminCreateUserPage(): React.JSX.Element {
  const router = useRouter();
  const translate = useAdminUsersTranslations();
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {translate("create.shellTitle")}
          </h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
            {translate("create.shellDescription")}
          </p>
        </div>
        <Button
          className="w-auto self-start"
          variant="outline"
          size="sm"
          render={<Link href="/admin/users" />}
          nativeButton={false}
        >
          {translate("create.back")}
        </Button>
      </header>
      <div className="w-full max-w-2xl">
        <AdminCreateUserFeature onCreated={() => router.push("/admin/users")} />
      </div>
    </main>
  );
}
