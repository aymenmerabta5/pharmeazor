"use client";
import type * as React from "react";
import Link from "next/link";
import type { AgentConversationSummary } from "../model";

/** One saved conversation in the history list. */
export function AgentConversationLink({
  conversation,
  selected,
  label,
}: {
  conversation: AgentConversationSummary;
  selected: boolean;
  label: string;
}): React.JSX.Element {
  return (
    <Link
      href={"/agent?c=" + encodeURIComponent(conversation.id)}
      aria-current={selected ? "true" : undefined}
      className={
        "block truncate rounded-lg px-3 py-2.5 text-sm leading-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 " +
        (selected
          ? "bg-secondary font-medium text-secondary-foreground"
          : "text-foreground/80 hover:bg-accent/50 hover:text-foreground")
      }
    >
      {label}
    </Link>
  );
}
