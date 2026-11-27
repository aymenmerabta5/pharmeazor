"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ChatMessage } from "../model";
import { AssistantMessage } from "./assistant-message";
import { UserBubble } from "./user-bubble";

/** Scrollable conversation log. */
export function ChatMessageList({
  messages,
  busy,
}: {
  messages: ChatMessage[];
  busy: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  return (
    <div
      className="ph-chat-messages"
      role="log"
      aria-live="polite"
      aria-label={t("conversationLabel")}
    >
      {messages.length === 0 ? (
        <div className="ph-chat-empty">
          <p className="ph-chat-empty-title">{t("emptyTitle")}</p>
          <p className="ph-chat-empty-desc">{t("emptyDescription")}</p>
        </div>
      ) : (
        messages.map((message) =>
          message.role === "user" ? (
            <UserBubble
              key={message.id}
              content={message.content}
              attachments={message.attachments}
            />
          ) : (
            <AssistantMessage key={message.id} message={message} />
          ),
        )
      )}
      {busy ? <div className="ph-streaming ph-shimmer">{t("streaming")}</div> : null}
    </div>
  );
}
