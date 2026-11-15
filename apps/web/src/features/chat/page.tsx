"use client";
import type * as React from "react";
import { useRouter } from "next/navigation";
import { ChatHistorySidebar } from "@/components/chat-history-sidebar";
import { NavRail } from "@/components/nav-rail";
import { useSurfaceTranslations } from "@/lib/translations";
import { ChatInputBar } from "./components/chat-input-bar";
import { ChatMessageList } from "./components/chat-message-list";
import { ChatTopbar } from "./components/chat-topbar";
import { useChatSession } from "./use-chat-session";
import { useChatSidebar } from "./use-chat-sidebar";

/** Conversation surface: history panel, transcript and composer. */
export function ChatPage(): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  const router = useRouter();
  const sidebar = useChatSidebar();
  const session = useChatSession();

  return (
    <div className={`ph-surface ph-chat-layout${sidebar.isOpen ? " ph-sidebar-open" : ""}`}>
      <NavRail
        open={sidebar.isOpen}
        onToggle={sidebar.toggle}
        onNewQuestion={session.newQuestion}
        controlsId="chat-sidebar"
      />

      <ChatHistorySidebar
        id="chat-sidebar"
        hidden={!sidebar.isOpen}
        entries={session.entries}
        activeQuery={session.activeQuery}
        onSelect={session.selectEntry}
        onNewQuestion={session.newQuestion}
        onSeePlans={() => router.push("/pricing")}
      />

      <div className="ph-chat-main">
        <ChatTopbar open={sidebar.isOpen} title={session.activeTitle} onToggle={sidebar.toggle} />

        <ChatMessageList messages={session.messages} busy={session.busy} />

        <div className="ph-chat-input-area">
          <ChatInputBar
            value={session.input}
            onChange={session.setInput}
            onSend={() => session.send()}
            busy={session.busy}
            placeholder={t("inputPlaceholder")}
            sendLabel={t("send")}
          />
          <p className="ph-chat-disclaimer">{t("disclaimer")}</p>
        </div>
      </div>
    </div>
  );
}
