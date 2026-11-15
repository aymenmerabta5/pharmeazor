"use client";
import type * as React from "react";
import { PanelLeft } from "lucide-react";

/** Conversation top bar: sidebar toggle and active question. */
export function ChatTopbar({
  open,
  title,
  onToggle,
}: {
  open: boolean;
  title: string | null;
  onToggle(): void;
}): React.JSX.Element {
  return (
    <header className="ph-chat-topbar">
      {open ? (
        <button
          type="button"
          className="ph-chat-topbar-toggle"
          onClick={onToggle}
          aria-label="Close sidebar"
          aria-controls="chat-sidebar"
          aria-expanded
        >
          <PanelLeft size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </button>
      ) : null}
      {title ? <h1 className="ph-chat-topbar-title">{title}</h1> : null}
    </header>
  );
}
