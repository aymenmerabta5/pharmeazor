"use client";
import type * as React from "react";
import { LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function ProfileAccountCard({
  name,
  email,
  roleLabel,
  emailVerified,
  signOutPending,
  onSignOut,
}: {
  name: string;
  email: string;
  roleLabel: string;
  emailVerified: boolean;
  signOutPending: boolean;
  onSignOut(): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("profile");
  return (
    <Card aria-labelledby="profile-account-title">
      <CardHeader>
        <CardTitle as="h2" id="profile-account-title">
          {t("accountTitle")}
        </CardTitle>
        <CardDescription>{t("accountDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border/70 overflow-hidden rounded-lg border border-border/70">
          <div className="grid gap-1 p-4 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] sm:items-center sm:gap-3">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("nameLabel")}
            </dt>
            <dd className="min-w-0 break-words text-sm font-medium">
              <bdi>{name}</bdi>
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] sm:items-center sm:gap-3">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("emailLabel")}
            </dt>
            <dd className="min-w-0 break-all text-sm">
              <bdi dir="ltr">{email}</bdi>
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] sm:items-center sm:gap-3">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("roleLabel")}
            </dt>
            <dd className="text-sm">
              <bdi>{roleLabel}</bdi>
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)] sm:items-center sm:gap-3">
            <dt className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              {t("emailStatusLabel")}
            </dt>
            <dd>
              <Badge variant={emailVerified ? "default" : "outline"}>
                {emailVerified ? t("verified") : t("unverified")}
              </Badge>
            </dd>
          </div>
        </dl>
      </CardContent>
      <CardFooter className="flex-col items-start gap-3 border-t pt-5">
        <p className="text-xs leading-5 text-muted-foreground">{t("signOutDescription")}</p>
        <Button variant="outline" onClick={onSignOut} disabled={signOutPending}>
          <LogOut aria-hidden />
          {signOutPending ? t("signingOut") : t("signOut")}
        </Button>
      </CardFooter>
    </Card>
  );
}
