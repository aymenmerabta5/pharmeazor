"use client";
import type * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useAgentAccount } from "../use-agent-account";
import type { useAgentConversation } from "../use-agent-conversation";
import { AgentBrandMark } from "./agent-brand-mark";
import { AgentConversationLink } from "./agent-conversation-link";

export function AgentConversationSidebar({
  conversation,
  account,
}: {
  conversation: ReturnType<typeof useAgentConversation>;
  account: ReturnType<typeof useAgentAccount>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  const { activeId, conversations, groups } = conversation.history;
  const planLabel = account.planPending
    ? t("loadingAccount")
    : account.planName
      ? t("planBadge", { plan: account.planName })
      : t("freePlan");
  return (
    <aside className="sticky top-0 hidden h-dvh w-[272px] shrink-0 flex-col border-e border-border/70 bg-sidebar px-5 pb-5 pt-5 lg:flex">
      <Link
        href="/agent"
        className="flex items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <AgentBrandMark className="size-10 rounded-xl" />
        <span className="text-[1.5rem] font-semibold tracking-[-0.04em]">pharmeazor</span>
      </Link>
      <Button
        type="button"
        className="mt-6 h-11 w-full rounded-xl text-[0.9375rem] font-semibold"
        onClick={conversation.newChat}
      >
        <Plus className="size-4" aria-hidden /> {t("newQuestion")}
      </Button>
      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <div className="px-3">
            <p className="text-sm font-medium">{t("historyEmpty")}</p>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">
              {t("historyEmptyDescription")}
            </p>
          </div>
        ) : (
          <>
            {groups.today.length > 0 ? (
              <>
                <p className="px-3 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("today")}
                </p>
                <nav aria-label={t("today")} className="mt-2 flex flex-col gap-0.5">
                  {groups.today.map((item) => (
                    <AgentConversationLink
                      key={item.id}
                      conversation={item}
                      selected={item.id === activeId}
                      label={item.title ?? t("conversationTitle")}
                    />
                  ))}
                </nav>
              </>
            ) : null}
            {groups.earlier.length > 0 ? (
              <>
                <p className="mt-5 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t("earlier")}
                </p>
                <nav aria-label={t("earlier")} className="mt-2 flex flex-col gap-0.5">
                  {groups.earlier.map((item) => (
                    <AgentConversationLink
                      key={item.id}
                      conversation={item}
                      selected={item.id === activeId}
                      label={item.title ?? t("conversationTitle")}
                    />
                  ))}
                </nav>
              </>
            ) : null}
          </>
        )}
      </div>
      {account.planTier !== "pro" && account.planId !== "sponsored" ? (
        <div className="mt-4 rounded-2xl border border-border/80 bg-card p-4 shadow-control">
          <p className="text-base font-semibold tracking-tight">{t("upgradeTitle")}</p>
          <p className="mt-2 text-sm leading-5 text-muted-foreground">{t("upgradeDescription")}</p>
          <Button
            className="mt-4 h-10 w-full rounded-xl text-sm font-semibold"
            render={<Link href="/pricing" />}
            nativeButton={false}
          >
            {t("seePlans")}
          </Button>
        </div>
      ) : null}
      <div className="mt-4 flex items-center gap-2 border-t border-border/70 pt-4">
        <Link
          href="/settings"
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <Avatar className="size-10 border-0">
            <AvatarFallback className="bg-secondary text-[0.8rem] font-semibold text-primary">
              {account.initials}
            </AvatarFallback>
          </Avatar>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {account.name ?? t("pharmacist")}
            </span>
            <span className="block truncate text-xs text-muted-foreground">{planLabel}</span>
          </span>
        </Link>
        <div className="shrink-0 [&_button]:size-9 [&_button]:rounded-lg [&_button]:border [&_button]:border-border/70 [&_button]:bg-card [&_button]:text-muted-foreground [&_svg]:size-4">
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
