"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

interface Suggestion {
  label: string;
  question: string;
}

/** The four example questions that start a conversation. */
export function ChatSuggestions({
  onSelect,
}: {
  onSelect(question: string): void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("welcome");

  const suggestions: Suggestion[] = [
    {
      label: t("suggestions.interactions.label"),
      question: t("suggestions.interactions.question"),
    },
    {
      label: t("suggestions.equivalents.label"),
      question: t("suggestions.equivalents.question"),
    },
    {
      label: t("suggestions.dosage.label"),
      question: t("suggestions.dosage.question"),
    },
    {
      label: t("suggestions.safety.label"),
      question: t("suggestions.safety.question"),
    },
  ];

  return (
    <div className="ph-suggestions-grid">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.label}
          type="button"
          onClick={() => onSelect(suggestion.question)}
          className="ph-suggestion-card"
        >
          <span className="ph-suggestion-label">{suggestion.label}</span>
          <span className="ph-suggestion-question">{suggestion.question}</span>
        </button>
      ))}
    </div>
  );
}
