"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ChatSource } from "../model";
import { SourceTagBadge } from "./source-tag-badge";

/** Cited sources list rendered under an assistant answer. */
export function AnswerSources({ sources }: { sources: ChatSource[] }): React.JSX.Element {
  const t = useSurfaceTranslations("chat");
  return (
    <div className="ph-sources">
      <p className="ph-sources-heading">{t("sourceCount", { count: sources.length })}</p>
      <ul className="ph-sources-list">
        {sources.map((source) => (
          <li key={source.id} className="ph-source-row">
            <span className="ph-source-num">{source.id}</span>
            <div className="ph-source-info">
              <span className="ph-source-name">{source.name}</span>
              <span className="ph-source-excerpt">{source.excerpt}</span>
            </div>
            <div className="ph-source-meta">
              <SourceTagBadge tag={source.tag} />
              {source.retained ? null : (
                <span className="ph-source-not-retained">· {t("sourceRetained")}</span>
              )}
              <span className="ph-source-date">{source.date}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
