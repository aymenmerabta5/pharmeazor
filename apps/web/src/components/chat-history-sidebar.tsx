"use client";
import type * as React from "react";
import { PanelLeft } from "lucide-react";
import { BrandWordmark } from "@/components/brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";
import { groupChatHistory, type ChatHistoryEntry } from "@/lib/chat-history";

function IconPlus(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

/**
 * History sidebar content shared by the welcome and chat surfaces.
 *
 * A focused view: it renders the entries it is given and reports intent back
 * through callbacks. The brand lockup is the same one the app menu carries,
 * and the collapse control lives here, inside the panel it closes, rather
 * than in the page top bar.
 */
export function ChatHistorySidebar({
  entries,
  activeQuery,
  onSelect,
  onNewQuestion,
  onSeePlans,
  onClose,
  controlsId,
}: {
  entries: ChatHistoryEntry[];
  /** Query of the conversation currently shown, when there is one. */
  activeQuery?: string | null;
  onSelect(entry: ChatHistoryEntry): void;
  onNewQuestion(): void;
  onSeePlans(): void;
  onClose(): void;
  /** Id of the sidebar panel this content lives in. */
  controlsId: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  const common = useSurfaceTranslations("common");
  const header = useSurfaceTranslations("header");
  const { today, earlier } = groupChatHistory(entries);

  function renderGroup(label: string, group: ChatHistoryEntry[]): React.JSX.Element | null {
    if (group.length === 0) return null;
    return (
      <div className="ph-sidebar-group">
        <p className="ph-sidebar-group-label">{label}</p>
        {group.map((entry) => (
          <button
            key={entry.query}
            type="button"
            className={`ph-sidebar-convo${entry.query === activeQuery ? " ph-sidebar-convo-active" : ""}`}
            onClick={() => onSelect(entry)}
          >
            {entry.query}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="ph-chat-sidebar">
      {/* Brand header */}
      <div className="ph-chat-sidebar-header">
        <BrandWordmark />
        <button
          type="button"
          className="ph-sidebar-close"
          aria-label={common("close")}
          aria-controls={controlsId}
          aria-expanded={false}
          onClick={onClose}
        >
          <PanelLeft size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </button>
      </div>

      {/* New question button */}
      <button type="button" className="ph-new-question-btn" onClick={onNewQuestion}>
        <IconPlus />
        {t("newQuestion")}
      </button>

      {/* Conversation groups */}
      <nav className="ph-sidebar-nav" aria-label={header("primaryNavigation")}>
        {entries.length === 0 ? <p className="ph-sidebar-empty">{common("noResults")}</p> : null}
        {renderGroup(t("today"), today)}
        {renderGroup(t("earlier"), earlier)}
      </nav>

      {/* Upgrade card */}
      <div className="ph-upgrade-card">
        <p className="ph-upgrade-card-title">{t("upgradeTitle")}</p>
        <p className="ph-upgrade-card-desc">{t("upgradeDescription")}</p>
        <button type="button" className="ph-upgrade-card-btn" onClick={onSeePlans}>
          {t("seePlans")}
        </button>
      </div>

      {/* User row */}
      <div className="ph-sidebar-user">
        <span className="ph-user-avatar-sm" aria-hidden="true">
          PH
        </span>
        <div className="ph-sidebar-user-info">
          <span className="ph-sidebar-user-name">{t("userRole")}</span>
          <span className="ph-sidebar-user-plan">{t("freePlan")}</span>
        </div>
      </div>
    </div>
  );
}
