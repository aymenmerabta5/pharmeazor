"use client";
import type * as React from "react";
import { ArrowUp, FileText, Leaf, ShieldCheck } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * A real answer, rendered as the product renders it.
 *
 * The hero sells the citation, not a dashboard: one counter question, one
 * answer, and the three sources the answer rests on. The mock is decorative
 * because the hero copy already states the same promise in words.
 */
export function LandingAnswerPreview(): React.JSX.Element {
  const t = useSurfaceTranslations("home");
  return (
    <div className="ph-preview" aria-hidden="true">
      <div className="ph-preview-top">
        <span className="ph-preview-brand">
          <span className="ph-preview-mark">
            <Leaf className="size-3.5" strokeWidth={2.1} />
          </span>
          pharmeazor
        </span>
        <span className="ph-preview-plan">Basic</span>
      </div>

      <div className="ph-preview-thread">
        <p className="ph-preview-question">{t("previewQuestion")}</p>

        <div className="ph-preview-answer">
          <p className="ph-preview-answer-label">
            <Leaf className="size-3.5" strokeWidth={2.1} />
            {t("previewAnswerTitle")}
          </p>
          <p className="ph-preview-answer-body">{t("previewAnswerBody")}</p>

          <div className="ph-preview-sources">
            <p className="ph-preview-sources-label">{t("previewSourcesLabel")}</p>
            <div className="ph-preview-source">
              <FileText className="size-3.5" strokeWidth={1.8} />
              <span>{t("previewSourceOfficial")}</span>
              <span className="ph-preview-source-mark">1</span>
            </div>
            <div className="ph-preview-source">
              <FileText className="size-3.5" strokeWidth={1.8} />
              <span>{t("previewSourceNotice")}</span>
              <span className="ph-preview-source-mark">2</span>
            </div>
            <div className="ph-preview-source">
              <FileText className="size-3.5" strokeWidth={1.8} />
              <span>{t("previewSourceInteraction")}</span>
              <span className="ph-preview-source-mark">3</span>
            </div>
          </div>
        </div>

        <p className="ph-preview-checked">
          <ShieldCheck className="size-3.5" strokeWidth={2} />
          {t("previewChecked")}
        </p>

        <div className="ph-preview-composer">
          <span>{t("previewComposer")}</span>
          <span className="ph-preview-send">
            <ArrowUp className="size-3.5" strokeWidth={2.4} />
          </span>
        </div>
      </div>
    </div>
  );
}
