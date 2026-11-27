"use client";
import type * as React from "react";
import Link from "next/link";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useAgentAccount } from "../use-agent-account";

/**
 * The account card behind the rail avatar.
 *
 * The collapsed rail has room for initials only, so the name, address and the
 * plan the account is actually on live one tap away. The plan comes from the
 * same live subscription the server used to open the surface.
 */
export function AgentAccountSheet({
  account,
  trigger,
}: {
  account: ReturnType<typeof useAgentAccount>;
  trigger: React.ReactNode;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  const planLabel = account.planPending
    ? t("loadingAccount")
    : account.planName
      ? t("planBadge", { plan: account.planName })
      : t("freePlan");
  return (
    <Sheet>
      <SheetTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full"
            aria-label={t("accountSettings")}
          />
        }
      >
        {trigger}
      </SheetTrigger>
      <SheetContent
        side="start"
        className="agent-shell flex w-[min(320px,calc(100%-24px))] flex-col gap-5 bg-sidebar p-5"
      >
        <SheetHeader>
          <div className="flex items-center gap-3">
            <Avatar className="size-12 border-0">
              <AvatarFallback className="bg-secondary text-sm font-semibold text-primary">
                {account.initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <SheetTitle className="truncate">
                {account.name ?? account.email ?? t("pharmacist")}
              </SheetTitle>
              {account.name && account.email ? (
                <SheetDescription className="truncate">{account.email}</SheetDescription>
              ) : null}
            </div>
          </div>
        </SheetHeader>
        <div className="rounded-xl border border-border/80 bg-card p-4 shadow-control">
          <p className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t("planLabel")}
          </p>
          <p className="mt-2 text-base font-semibold">{planLabel}</p>
        </div>
        <div className="mt-auto flex flex-col gap-2">
          <Button
            className="h-11 rounded-xl text-sm font-semibold"
            render={<Link href="/settings/billing" />}
            nativeButton={false}
          >
            {t("managePlan")}
          </Button>
          <Button
            variant="outline"
            className="h-11 rounded-xl text-sm font-semibold"
            render={<Link href="/settings" />}
            nativeButton={false}
          >
            {t("accountSettings")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
