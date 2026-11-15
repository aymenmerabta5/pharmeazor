"use client";
import * as React from "react";

const SIDEBAR_DISMISS_KEY = "Escape";

/**
 * Welcome-page sidebar disclosure workflow.
 *
 * Owns the open/closed state of the rail's history sidebar, including the
 * keyboard dismissal the rail toggle cannot express on its own.
 */
export function useWelcomeSidebar() {
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
