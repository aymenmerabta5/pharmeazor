"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { AGENT_SUGGESTIONS } from "../model";

export function AgentSuggestionGrid({
  onSelect,
}: {
  onSelect(question: string): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <div className="grid w-full gap-3 sm:grid-cols-2 sm:gap-4">
      {AGENT_SUGGESTIONS.map((suggestion) => {
        const question = t(suggestion.questionKey);
        return (
          <button
            key={suggestion.id}
            type="button"
            onClick={() => onSelect(question)}
            className="group min-h-[108px] rounded-xl border border-border/80 bg-card p-5 text-start transition-[border-color,background-color,box-shadow] duration-150 hover:border-primary/30 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="block text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-primary/90">
              {t(suggestion.labelKey)}
            </span>
            <span className="mt-2 block text-[0.9375rem] leading-6 text-card-foreground">
              {question}
            </span>
          </button>
        );
      })}
    </div>
  );
}
