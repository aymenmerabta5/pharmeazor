"use client";
import type * as React from "react";
import { Copy, RotateCcw, ThumbsUp } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

/** Answer actions: copy, mark helpful, regenerate. */
export function AnswerActions(): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  return (
    <div className="ph-answer-actions">
      <button type="button" className="ph-action-btn" aria-label={t("copyAnswer")}>
        <Copy className="size-3.5" aria-hidden />
      </button>
      <button type="button" className="ph-action-btn" aria-label={t("markHelpful")}>
        <ThumbsUp className="size-3.5" aria-hidden />
      </button>
      <button type="button" className="ph-action-btn" aria-label={t("regenerate")}>
        <RotateCcw className="size-3.5" aria-hidden />
      </button>
    </div>
  );
}
