"use client";
import type * as React from "react";
import Link from "next/link";
import { History, PanelLeft, Plus } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
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
import type { useAgentConversation } from "../use-agent-conversation";
import { AgentBrandMark } from "./agent-brand-mark";

export function AgentRail({
  conversation,
  account,
  onCollapse,
}: {
  conversation: ReturnType<typeof useAgentConversation>;
  account: ReturnType<typeof useAgentAccount>;
  onCollapse(): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col items-center border-e border-border/70 bg-sidebar pb-10 pt-4 lg:w-[72px]">
      <Link
        href="/dashboard"
        aria-label="pharmeazor"
        className="rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
      >
        <AgentBrandMark />
      </Link>
      <div className="mt-6 flex flex-col items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onCollapse}
          aria-label={t("collapseSidebar")}
          className="size-10 rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
        >
          <PanelLeft className="size-5" strokeWidth={1.75} aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon"
          onClick={conversation.newChat}
          aria-label={t("newChat")}
          className="size-11 rounded-xl border-0 bg-secondary text-secondary-foreground shadow-none hover:bg-accent hover:text-accent-foreground"
        >
          <Plus className="size-5" strokeWidth={2} aria-hidden />
        </Button>
        <Sheet>
          <SheetTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={t("conversationHistory")}
                className="mt-2 size-10 rounded-lg text-muted-foreground hover:bg-accent hover:text-primary"
              />
            }
          >
            <History className="size-5" strokeWidth={1.75} aria-hidden />
          </SheetTrigger>
          <SheetContent
            side="start"
            className="agent-shell flex w-[min(340px,calc(100%-24px))] flex-col gap-5 bg-sidebar p-5"
          >
            <SheetHeader>
              <SheetTitle>{t("historyTitle")}</SheetTitle>
              <SheetDescription>{t("historyDescription")}</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto">
              {conversation.title ? (
                <div className="rounded-xl border border-border/80 bg-card p-4 shadow-control">
                  <p className="break-words text-sm font-medium leading-6">{conversation.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("historyItemMeta", { count: conversation.messages.length })}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-5">
                  <p className="text-sm font-medium">{t("historyEmpty")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t("historyEmptyDescription")}
                  </p>
                </div>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
      <div className="mt-auto flex flex-col items-center gap-3">
        <div className="[&_button]:size-10 [&_button]:rounded-xl [&_button]:border [&_button]:border-border/70 [&_button]:bg-card [&_button]:text-muted-foreground [&_button]:shadow-control [&_button:hover]:bg-card/80 [&_svg]:size-[18px]">
          <ThemeToggle />
        </div>
        <Link
          href="/settings"
          aria-label={t("accountSettings")}
          className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar"
        >
          <Avatar className="size-10 border-0">
            <AvatarFallback className="bg-secondary text-[0.8rem] font-semibold text-primary">
              {account.initials}
            </AvatarFallback>
          </Avatar>
        </Link>
      </div>
    </aside>
  );
}
