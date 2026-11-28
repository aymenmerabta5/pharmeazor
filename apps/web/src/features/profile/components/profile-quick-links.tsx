"use client";
import type * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  Building2,
  CreditCard,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Settings2,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ProfileQuickLink, ProfileQuickLinkKey } from "../model";

const LINK_ICONS: Record<ProfileQuickLinkKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  agent: Bot,
  billing: CreditCard,
  storage: FolderOpen,
  pdf: FileText,
  settings: Settings2,
  workspace: Building2,
  admin: ShieldCheck,
};

export function ProfileQuickLinks({
  links,
}: {
  links: readonly ProfileQuickLink[];
}): React.JSX.Element {
  const header = useSurfaceTranslations("header");
  const t = useSurfaceTranslations("profile");
  const labels: Record<ProfileQuickLinkKey, string> = {
    dashboard: header("dashboard"),
    agent: header("agent"),
    billing: header("billing"),
    storage: header("storage"),
    pdf: header("pdf"),
    settings: header("settings"),
    workspace: header("workspace"),
    admin: header("admin"),
  };
  const descriptions: Record<ProfileQuickLinkKey, string> = {
    dashboard: t("quickLinks.dashboardDescription"),
    agent: t("quickLinks.agentDescription"),
    billing: t("quickLinks.billingDescription"),
    storage: t("quickLinks.storageDescription"),
    pdf: t("quickLinks.pdfDescription"),
    settings: t("quickLinks.settingsDescription"),
    workspace: t("quickLinks.workspaceDescription"),
    admin: t("quickLinks.adminDescription"),
  };

  return (
    <Card aria-labelledby="profile-quick-links-title">
      <CardHeader>
        <CardTitle as="h2" id="profile-quick-links-title">
          {t("quickLinksTitle")}
        </CardTitle>
        <CardDescription>{t("quickLinksDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-2 sm:grid-cols-2">
          {links.map((link) => {
            const Icon = LINK_ICONS[link.key];
            return (
              <Link
                key={link.key}
                href={link.href}
                className="group flex min-h-16 items-center gap-3 rounded-lg border border-border/70 p-3.5 transition-colors hover:border-primary/30 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                  <Icon className="size-5" strokeWidth={1.75} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{labels[link.key]}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-muted-foreground">
                    {descriptions[link.key]}
                  </span>
                </span>
                <ArrowUpRight
                  className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 rtl:-rotate-90"
                  aria-hidden
                />
              </Link>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
