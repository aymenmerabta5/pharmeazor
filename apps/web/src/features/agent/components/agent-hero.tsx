"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useAgentConversation } from "../use-agent-conversation";
import { AgentBrandMark } from "./agent-brand-mark";
import { AgentComposer } from "./agent-composer";
import { AgentSuggestionGrid } from "./agent-suggestion-grid";

export function AgentHero({
  conversation,
}: {
  conversation: ReturnType<typeof useAgentConversation>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <section className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:px-6">
        <div className="agent-column my-auto flex w-full max-w-[760px] flex-col items-center">
          <AgentBrandMark className="size-14 rounded-2xl" />
          <h1 className="mt-8 max-w-[760px] text-center text-[1.8rem] font-bold leading-[1.14] tracking-[-0.035em] text-foreground sm:text-[2.7rem] sm:leading-[1.12]">
            {t("homeTitle")}
          </h1>
          <p className="mt-4 max-w-[460px] text-center text-base leading-7 text-muted-foreground">
            {t("homeDescription")}
          </p>
          <div className="mt-6 w-full">
            <AgentComposer
              input={conversation.input}
              onInputChange={conversation.setInput}
              onSend={conversation.submit}
              busy={conversation.busy}
            />
          </div>
          {conversation.error ? (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>{t("requestError")}</AlertTitle>
              <AlertDescription className="break-all text-xs">
                {String(conversation.error)}
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="mt-6 w-full">
            <AgentSuggestionGrid onSelect={conversation.draftSuggestion} />
          </div>
        </div>
      </section>
      <footer className="shrink-0 px-5 pb-10 pt-4 text-center text-xs leading-5 text-muted-foreground">
        {t("homeDisclaimer")}
      </footer>
    </div>
  );
}
