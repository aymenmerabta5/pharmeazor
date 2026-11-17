"use client";
import * as React from "react";

const SIDEBAR_DISMISS_KEY = "Escape";

/**
 * Chat sidebar disclosure workflow.
 *
 * Owns the open/closed state the panel renders from, including the keyboard
 * dismissal the rail toggle cannot express on its own. The panel starts as the
 * narrow rail; the history list is one click away.
 */
export function useChatSidebar() {
  const [isOpen, setIsOpen] = React.useState(false);

  const toggle = React.useCallback(() => {
    setIsOpen((open) => !open);
  }, []);

  const close = React.useCallback(() => {
    setIsOpen(false);
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === SIDEBAR_DISMISS_KEY) close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close, isOpen]);

  return { isOpen, toggle, close };
}
