"use client";
import type * as React from "react";
import { Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Bubble,
  BubbleContent,
  Marker,
  MarkerContent,
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/chat";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useAgentConversation } from "../use-agent-conversation";
import { messageText } from "../model";
import { AgentAnswer } from "./agent-answer";
import { AgentBrandMark } from "./agent-brand-mark";
import { AgentComposer } from "./agent-composer";

export function AgentChat({
  conversation,
}: {
  conversation: ReturnType<typeof useAgentConversation>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  let lastAssistantId: string | null = null;
  for (const message of conversation.messages) {
    if (message.role === "assistant" && messageText(message)) lastAssistantId = message.id;
  }
  return (
    <section className="flex min-h-0 flex-1 flex-col px-4 sm:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <AgentBrandMark className="size-8 rounded-lg lg:hidden" />
            <h1 className="truncate text-[0.9375rem] font-semibold">
              {conversation.title ?? t("conversationTitle")}
            </h1>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 rounded-lg lg:hidden"
            aria-label={t("newQuestion")}
            onClick={conversation.newChat}
          >
            <Plus className="size-4" aria-hidden />
          </Button>
        </header>
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport className="pt-4">
              <MessageScrollerContent
                role="log"
                aria-live="polite"
                aria-label={t("conversationLabel")}
                className="gap-10 p-0 pb-8"
              >
                {conversation.messages.map((message) => {
                  const text = messageText(message);
                  if (!text) return null;
                  if (message.role === "user") {
                    return (
                      <MessageScrollerItem
                        key={message.id}
                        id={message.id}
                        messageId={message.id}
                        scrollAnchor
                      >
                        <div className="flex w-full justify-end">
                          <Bubble
                            variant="muted"
                            align="end"
                            className="max-w-[540px] rounded-xl bg-muted px-5 py-3.5 text-[0.9375rem] leading-6 text-foreground shadow-none"
                          >
                            <BubbleContent>
                              <span dir="auto">{text}</span>
                            </BubbleContent>
                          </Bubble>
                        </div>
                      </MessageScrollerItem>
                    );
                  }
                  return (
                    <MessageScrollerItem key={message.id} id={message.id} messageId={message.id}>
                      <AgentAnswer
                        text={text}
                        isLast={message.id === lastAssistantId}
                        busy={conversation.busy}
                        onAsk={conversation.ask}
                        onRetry={conversation.retry}
                      />
                    </MessageScrollerItem>
                  );
                })}
                {conversation.streaming ? (
                  <MessageScrollerItem messageId="streaming">
                    <Marker>
                      <MarkerContent className="shimmer">{t("streaming")}</MarkerContent>
                    </Marker>
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
        {conversation.error ? (
          <Alert variant="destructive" className="mt-3">
            <AlertTitle>{t("requestError")}</AlertTitle>
            <AlertDescription className="break-all text-xs">
              {String(conversation.error)}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="shrink-0 pt-3">
          <AgentComposer
            input={conversation.input}
            onInputChange={conversation.setInput}
            onSend={conversation.submit}
            busy={conversation.busy}
          />
        </div>
        <p className="shrink-0 pb-4 pt-2 text-center text-[0.6875rem] leading-4 text-muted-foreground">
          {t("homeDisclaimer")}
        </p>
      </div>
    </section>
  );
}
