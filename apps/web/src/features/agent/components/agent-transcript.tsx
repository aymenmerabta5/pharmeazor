"use client";
import type * as React from "react";
import {
  Bubble,
  BubbleContent,
  Marker,
  MarkerContent,
  Message,
  MessageContent,
  MessageHeader,
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/chat";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { useSurfaceTranslations } from "@/lib/translations";

interface AgentMessage {
  id: string;
  role: string;
  parts: readonly { type: string; text?: string }[];
}

export function AgentTranscript({
  messages,
  streaming,
}: {
  messages: readonly AgentMessage[];
  streaming: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <MessageScrollerProvider autoScroll>
      <MessageScroller className="min-h-64 max-h-[52svh]">
        <MessageScrollerViewport>
          <MessageScrollerContent role="log" aria-live="polite" aria-label={t("conversationLabel")}>
            {messages.length === 0 ? (
              <Empty>
                <EmptyHeader>
                  <EmptyTitle>{t("empty")}</EmptyTitle>
                  <EmptyDescription>{t("conversationDescription")}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            ) : (
              messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <Message align={message.role === "user" ? "end" : "start"}>
                    <MessageContent>
                      <MessageHeader>{message.role}</MessageHeader>
                      <Bubble
                        align={message.role === "user" ? "end" : "start"}
                        variant={message.role === "user" ? "default" : "muted"}
                      >
                        <BubbleContent>
                          {message.parts.map((part, index) =>
                            part.type === "text" ? (
                              <p dir="auto" key={message.id + "-text-" + String(index)}>
                                {part.text}
                              </p>
                            ) : null,
                          )}
                        </BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>
              ))
            )}
            {streaming ? (
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
  );
}
