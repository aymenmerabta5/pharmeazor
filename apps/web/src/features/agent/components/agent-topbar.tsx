"use client";
import type * as React from "react";
import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";

export function AgentTopbar({
  planName,
  planPending,
  collapsed,
  onExpand,
}: {
  planName: string | null;
  planPending: boolean;
  collapsed: boolean;
  onExpand(): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  const planLabel = planPending
    ? t("loadingAccount")
    : planName
      ? t("planBadge", { plan: planName })
      : t("freePlan");
  return (
    <header className="flex h-[72px] shrink-0 items-center justify-end gap-2 px-4 sm:px-6 lg:px-8">
      {collapsed ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onExpand}
          aria-label={t("expandSidebar")}
          className="me-auto size-9 rounded-lg text-muted-foreground"
        >
          <PanelLeft className="size-5" aria-hidden />
        </Button>
      ) : null}
      <Link
        href="/settings/billing"
        className="inline-flex h-8 items-center rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {planLabel}
      </Link>
      <Button
        className="h-10 rounded-xl px-5 text-sm font-semibold"
        render={<Link href="/pricing" />}
        nativeButton={false}
      >
        {planName ? t("managePlan") : t("upgrade")}
      </Button>
    </header>
  );
}
