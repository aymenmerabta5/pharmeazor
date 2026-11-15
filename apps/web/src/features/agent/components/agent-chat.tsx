"use client";
import type * as React from "react";
import {
  Bubble,
  BubbleContent,
  Marker,
  MarkerContent,
  Message,
  MessageAvatar,
  MessageContent,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/chat";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useSurfaceTranslations } from "@/lib/translations";
import type { useAgentConversation } from "../use-agent-conversation";
import { messageText } from "../model";
import { AgentBrandMark } from "./agent-brand-mark";
import { AgentComposer } from "./agent-composer";

export function AgentChat({
  conversation,
}: {
  conversation: ReturnType<typeof useAgentConversation>;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <section className="flex min-h-0 flex-1 flex-col px-3 sm:px-6">
      <div className="mx-auto flex min-h-0 w-full max-w-[760px] flex-1 flex-col">
        <MessageScrollerProvider autoScroll>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport className="pt-3">
              <MessageScrollerContent
                role="log"
                aria-live="polite"
                aria-label={t("conversationLabel")}
                className="min-h-full justify-end gap-6 p-0 pb-6"
              >
                {conversation.messages.map((message) => {
                  const text = messageText(message);
                  if (!text) return null;
                  const mine = message.role === "user";
                  return (
                    <MessageScrollerItem
                      key={message.id}
                      messageId={message.id}
                      scrollAnchor={mine}
                    >
                      <Message align={mine ? "end" : "start"} className="gap-2.5">
                        {mine ? null : (
                          <MessageAvatar className="mt-5">
                            <AgentBrandMark className="size-7 rounded-lg" />
                          </MessageAvatar>
                        )}
                        <MessageContent className={mine ? "max-w-[85%] items-end" : "max-w-[85%]"}>
                          <MessageHeader
                            className={
                              mine
                                ? "px-1 text-end text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                                : "px-1 text-[0.6875rem] font-medium uppercase tracking-[0.08em] text-muted-foreground"
                            }
                          >
                            {mine ? t("you") : t("pharmeazor")}
                          </MessageHeader>
                          <Bubble
                            align={mine ? "end" : "start"}
                            variant={mine ? "default" : "outline"}
                            className={
                              mine
                                ? "rounded-2xl rounded-ee-md border-0 bg-primary px-4 py-2.5 text-primary-foreground shadow-none"
                                : "rounded-2xl rounded-es-md border-border/80 bg-card px-4 py-2.5 text-card-foreground shadow-none"
                            }
                          >
                            <BubbleContent className="text-[0.9375rem] leading-7">
                              <span dir="auto">{text}</span>
                            </BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
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
            <MessageScrollerButton />
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
        <div className="shrink-0 pb-4 pt-3">
          <AgentComposer
            input={conversation.input}
            onInputChange={conversation.setInput}
            onSend={conversation.submit}
            busy={conversation.busy}
          />
        </div>
      </div>
    </section>
  );
}
