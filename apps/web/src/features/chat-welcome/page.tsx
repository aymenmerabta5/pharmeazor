"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import { WelcomePrompt } from "./components/welcome-prompt";
import { WelcomeSuggestions } from "./components/welcome-suggestions";
import { useWelcomeChat } from "./use-welcome-chat";
import { useWelcomeSidebar } from "./use-welcome-sidebar";
import { ChatHistorySidebar } from "@/components/chat-history-sidebar";
import { NavRail } from "@/components/nav-rail";
import { useChatHistory } from "@/hooks/use-chat-history";

/** Leaf logo — larger version for page center */
function LeafLogoLarge(): React.JSX.Element {
  return (
    <span className="ph-leaf-lg" aria-hidden="true">
      <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
        <path
          d="M20 7C20 7 10 11 10 21C10 27 14.5 32 20 32C25.5 32 30 27 30 21C30 15 25 9 20 7Z"
          fill="white"
          fillOpacity="0.95"
        />
        <line
          x1="20"
          y1="32"
          x2="20"
          y2="22"
          stroke="white"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function WelcomePage(): React.JSX.Element {
  const t = useSurfaceTranslations("welcome");
  const router = useRouter();
  const chat = useWelcomeChat();
  const sidebar = useWelcomeSidebar();
  const history = useChatHistory();

  return (
    <div
      className={`ph-surface ph-welcome-layout${sidebar.isOpen ? " ph-welcome-layout--open" : ""}`}
    >
      {/* ── Closed state: narrow navigation rail ── */}
      <NavRail
        open={sidebar.isOpen}
        onToggle={sidebar.toggle}
        onNewQuestion={chat.startNew}
        controlsId="welcome-sidebar"
      />

      {/* ── Open state: history sidebar (same panel as the chat page) ── */}
      <ChatHistorySidebar
        id="welcome-sidebar"
        hidden={!sidebar.isOpen}
        entries={history.entries}
        onSelect={(entry) => chat.suggest(entry.query)}
        onNewQuestion={chat.startNew}
        onSeePlans={() => router.push("/pricing")}
      />

      {/* ── Right panel (top-bar + content + footer) ── */}
      <div className="ph-welcome-right">
        <header className="ph-welcome-topbar">
          {sidebar.isOpen ? (
            <button
              type="button"
              className="ph-chat-topbar-toggle"
              aria-label="Close sidebar"
              aria-controls="welcome-sidebar"
              aria-expanded
              onClick={sidebar.toggle}
            >
              <PanelLeft size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
            </button>
          ) : null}
          <div className="ph-welcome-topbar-actions">
            <span className="ph-badge-free">{t("freePlan")}</span>
            <button
              type="button"
              className="ph-btn-upgrade"
              onClick={() => router.push("/pricing")}
            >
              {t("upgrade")}
            </button>
          </div>
        </header>

        {/* Center content */}
        <main className="ph-welcome-main">
          <div className="ph-welcome-center">
            {/* Large leaf icon */}
            <div className="ph-welcome-logo-wrap">
              <LeafLogoLarge />
            </div>

            <h1 className="ph-welcome-title">{t("title")}</h1>
            <p className="ph-welcome-description">{t("description")}</p>

            <WelcomePrompt
              value={chat.query}
              onChange={chat.setQuery}
              onSend={chat.send}
              busy={chat.busy}
            />

            <WelcomeSuggestions onSelect={chat.suggest} />
          </div>
        </main>

        {/* Footer disclaimer */}
        <footer className="ph-welcome-footer">
          <p className="ph-welcome-disclaimer">{t("disclaimer")}</p>
        </footer>
      </div>
    </div>
  );
}
