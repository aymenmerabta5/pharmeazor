"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { groupChatHistory, type ChatHistoryEntry } from "@/lib/chat-history";

/* ── Shared SVG icons ────────────────────────────────────────────────── */

function LeafIcon({ size = 20 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
      <path
        d="M10 3.5C10 3.5 5 5.5 5 10.5C5 13.5 7.2 16 10 16C12.8 16 15 13.5 15 10.5C15 7.5 12.5 5 10 3.5Z"
        fill="white"
        fillOpacity="0.95"
      />
      <line
        x1="10"
        y1="16"
        x2="10"
        y2="11"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

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

/* ── Sidebar ─────────────────────────────────────────────────────────── */

/**
 * Chat history sidebar shared by the welcome and chat surfaces.
 *
 * A focused view: it renders the entries it is given and reports intent back
 * through callbacks. The entries themselves come from the `useChatHistory`
 * workflow each page composes, so the list reflects what was actually
 * searched for instead of example data.
 */
export function ChatHistorySidebar({
  entries,
  activeQuery,
  onSelect,
  onNewQuestion,
  onSeePlans,
  id,
  hidden,
}: {
  entries: ChatHistoryEntry[];
  /** Query of the conversation currently shown, when there is one. */
  activeQuery?: string | null;
  onSelect(entry: ChatHistoryEntry): void;
  onNewQuestion(): void;
  onSeePlans(): void;
  /** Lets a host toggle keep `aria-controls` pointing at a mounted panel. */
  id?: string;
  /** Keeps the panel mounted while it is visually closed. */
  hidden?: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  const common = useSurfaceTranslations("common");
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
    <aside id={id} className="ph-chat-sidebar" hidden={hidden}>
      {/* Brand header */}
      <div className="ph-chat-sidebar-header">
        <span className="ph-leaf-sm" aria-hidden="true">
          <LeafIcon />
        </span>
        <span className="ph-chat-brand">pharmeazor</span>
      </div>

      {/* New question button */}
      <button type="button" className="ph-new-question-btn" onClick={onNewQuestion}>
        <IconPlus />
        {t("newQuestion")}
      </button>

      {/* Conversation groups */}
      <nav className="ph-sidebar-nav" aria-label="Conversations">
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
    </aside>
  );
}
