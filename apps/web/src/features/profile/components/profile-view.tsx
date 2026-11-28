"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { profileInitials, profileQuickLinks, profileRole, type ProfileUser } from "../model";
import type { ProfileActions } from "../use-profile-actions";
import { ProfileAccountCard } from "./profile-account-card";
import { ProfileHero } from "./profile-hero";
import { ProfileQuickLinks } from "./profile-quick-links";

export function ProfileView({
  user,
  actions,
}: {
  user: ProfileUser;
  actions: ProfileActions;
}): React.JSX.Element {
  const t = useSurfaceTranslations("profile");
  const role = profileRole(user.role);
  const roleLabels: Record<typeof role, string> = {
    user: t("roles.user"),
    admin: t("roles.admin"),
    superAdmin: t("roles.superAdmin"),
  };
  const roleLabel = roleLabels[role];
  const name = user.name?.trim() || t("nameNotSet");
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            {t("kicker")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">{t("description")}</p>
        </header>
        <ProfileHero
          name={name}
          email={user.email}
          initials={profileInitials(user.name, user.email)}
          roleLabel={roleLabel}
          emailVerified={user.emailVerified}
        />
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
          <ProfileQuickLinks links={profileQuickLinks(role)} />
          <ProfileAccountCard
            name={name}
            email={user.email}
            roleLabel={roleLabel}
            emailVerified={user.emailVerified}
            signOutPending={actions.pending}
            onSignOut={actions.signOut}
          />
        </div>
      </div>
    </main>
  );
}
