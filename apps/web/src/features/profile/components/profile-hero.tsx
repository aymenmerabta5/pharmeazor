"use client";
import type * as React from "react";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * The identity panel, before any account detail.
 *
 * The name, address, and role are the three facts every other part of the page
 * assumes. Putting them in one quiet brand surface keeps the page from opening
 * with a wall of settings rows.
 */
export function ProfileHero({
  name,
  email,
  initials,
  roleLabel,
  emailVerified,
}: {
  name: string;
  email: string;
  initials: string;
  roleLabel: string;
  emailVerified: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("profile");
  return (
    <section
      aria-labelledby="profile-identity-title"
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-card to-card p-6 sm:p-8"
    >
      <div
        className="pointer-events-none absolute -end-16 -top-24 size-64 rounded-full bg-primary/10 blur-2xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4 sm:gap-5">
          <Avatar className="size-16 shrink-0 border-0 sm:size-20">
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary sm:text-2xl">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2
              id="profile-identity-title"
              className="break-words text-2xl font-semibold tracking-tight"
            >
              {name}
            </h2>
            <p className="mt-1 break-all text-sm leading-6 text-muted-foreground">
              <bdi dir="ltr">{email}</bdi>
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                <bdi>{roleLabel}</bdi>
              </Badge>
              <Badge variant={emailVerified ? "default" : "outline"}>
                {emailVerified ? t("verified") : t("unverified")}
              </Badge>
            </div>
          </div>
        </div>
        <Button
          className="w-full sm:w-auto"
          render={<Link href="/settings" />}
          nativeButton={false}
        >
          <Pencil aria-hidden />
          {t("editProfile")}
        </Button>
      </div>
    </section>
  );
}
