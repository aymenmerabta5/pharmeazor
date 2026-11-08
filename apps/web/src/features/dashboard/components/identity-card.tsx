"use client";
import type * as React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import { DashboardIdentityStatus } from "./identity-state";
import type { DashboardIdentityState } from "../types";

export function IdentityCard({ user, pending, error }: DashboardIdentityState): React.JSX.Element {
  const t = useSurfaceTranslations("dashboard");
  if (!user)
    return <DashboardIdentityStatus pending={pending} error={error} className="lg:col-span-7" />;
  const name = String(user.name || t("identity.nameNotSet"));
  const role = user.role ?? "user";
  const roleLabel =
    role === "user"
      ? t("identity.roleUser")
      : role === "admin"
        ? t("identity.roleAdmin")
        : String(role);
  const initials = String(user.name || user.email || "U")
    .trim()
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <section
      className="min-w-0 overflow-hidden rounded-lg border bg-card shadow-surface lg:col-span-7"
      aria-labelledby="dashboard-profile-title"
    >
      <div className="flex items-center justify-between gap-3 border-b px-6 py-4">
        <h2 id="dashboard-profile-title" className="text-base font-semibold tracking-tight">
          {t("single.profileTitle")}
        </h2>
        <Badge variant="secondary" className="shrink-0">
          <bdi>{roleLabel}</bdi>
        </Badge>
      </div>
      <div className="space-y-7 p-6 sm:p-8">
        <div className="flex min-w-0 items-center gap-4">
          <div
            aria-hidden
            className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold text-primary"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="break-words text-2xl font-semibold tracking-tight">{name}</p>
            <p className="mt-1 break-all text-sm leading-6 text-muted-foreground">
              {String(user.email ?? "")}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" render={<Link href="/settings" />} nativeButton={false}>
            {t("identity.editProfile")}
          </Button>
          {user.role === "admin" ? (
            <Button
              variant="outline"
              size="sm"
              render={<Link href="/admin" />}
              nativeButton={false}
            >
              {t("identity.admin")}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
