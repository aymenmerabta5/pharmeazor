"use client";
import { useState } from "react";

/** The wide agent rail can be tucked away to give the conversation the full canvas. */
export function useAgentRail() {
  const [collapsed, setCollapsed] = useState(false);
  return {
    collapsed,
    toggle: () => setCollapsed((value) => !value),
  };
}
