"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";

interface Suggestion {
  label: string;
  question: string;
}

export function WelcomeSuggestions({
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
      {suggestions.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={() => onSelect(s.question)}
          className="ph-suggestion-card"
        >
          <span className="ph-suggestion-label">{s.label}</span>
          <span className="ph-suggestion-question">{s.question}</span>
        </button>
      ))}
    </div>
  );
}
