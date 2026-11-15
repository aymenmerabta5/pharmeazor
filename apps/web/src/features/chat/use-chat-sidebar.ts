"use client";
import * as React from "react";

/**
 * Chat-page sidebar disclosure workflow.
 *
 * Owns the open/closed state the layout class and the sidebar render from, so
 * the composition file only wires the toggle to a view.
 */
export function useChatSidebar() {
  const [isOpen, setIsOpen] = React.useState(true);

  const toggle = React.useCallback(() => {
    setIsOpen((open) => !open);
  }, []);

  return { isOpen, toggle };
}
