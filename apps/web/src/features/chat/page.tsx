"use client";
import type * as React from "react";
import { useRouter } from "next/navigation";
import { HistorySidebarPanel } from "@/components/history-sidebar-panel";
import { SurfaceHeaderControls } from "@/features/app-shell/components/surface-header-controls";
import { useAppShell } from "@/features/app-shell/use-app-shell";
import { useSurfaceTranslations } from "@/lib/translations";
import { ChatHero } from "./components/chat-hero";
import { ChatInputBar } from "./components/chat-input-bar";
import { ChatMessageList } from "./components/chat-message-list";
import { useChatSession } from "./use-chat-session";
import { useChatSidebar } from "./use-chat-sidebar";

/**
 * The single agent surface.
 *
 * One route carries both states: the welcome hero before the first question and
 * the transcript afterwards. The sidebar and the header stay mounted across
 * the change, so asking a question no longer navigates to a second page.
 */
export function ChatPage({
  initialQuestion,
}: {
  /** Deep-link question from the route, if the visitor arrived with one. */
  initialQuestion?: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  const welcome = useSurfaceTranslations("welcome");
  const router = useRouter();
  const shell = useAppShell();
  const sidebar = useChatSidebar();
  const session = useChatSession(initialQuestion);
  const inConversation = session.activeQuery !== null || session.messages.length > 0;
  // The saved entry supplies the title once history resolves; the live query
  // covers the moment before that, so a deep link never opens untitled.
  const title = session.activeTitle ?? session.activeQuery;

  return (
    <div className="ph-surface ph-welcome-layout">
      <HistorySidebarPanel
        open={sidebar.isOpen}
        id="chat-sidebar"
        entries={session.entries}
        activeQuery={session.activeQuery}
        onSelect={session.selectEntry}
        onNewQuestion={session.newQuestion}
        onSeePlans={() => router.push("/pricing")}
        onToggle={sidebar.toggle}
        onClose={sidebar.close}
      />

      <div className="ph-chat-main">
        <header className="ph-welcome-topbar">
          {inConversation && title ? <h1 className="ph-chat-topbar-title">{title}</h1> : null}
          <div className="ph-welcome-topbar-controls">
            <SurfaceHeaderControls
              identity={shell.identity}
              onNavigate={shell.onNavigate}
              onSignOut={shell.onSignOut}
              menuClassName="ph-menu-trigger"
            />
          </div>
        </header>

        {inConversation ? (
          <>
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
          </>
        ) : (
          <>
            <ChatHero
              value={session.input}
              onChange={session.setInput}
              onSend={() => session.send()}
              onSuggest={(question) => session.send(question)}
              busy={session.busy}
            />

            <footer className="ph-welcome-footer">
              <p className="ph-welcome-disclaimer">{welcome("disclaimer")}</p>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
