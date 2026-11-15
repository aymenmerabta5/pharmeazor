"use client";
import type * as React from "react";
import { ArrowRight } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

/** Follow-up questions proposed under an answer. */
export function FollowUps({ questions }: { questions: string[] }): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  return (
    <div className="ph-followups">
      <p className="ph-followups-heading">{t("followUpHeading")}</p>
      {questions.map((question) => (
        <button key={question} type="button" className="ph-followup-btn">
          <span>{question}</span>
          <ArrowRight className="size-4 flex-shrink-0" aria-hidden />
        </button>
      ))}
    </div>
  );
}
