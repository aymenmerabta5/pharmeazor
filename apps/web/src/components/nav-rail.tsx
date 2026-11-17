"use client";
import type * as React from "react";
import Link from "next/link";
import { Clock, PanelLeft, Plus, Star } from "lucide-react";
import { BrandMark } from "@/components/brand-wordmark";
import { useSurfaceTranslations } from "@/lib/translations";

/**
 * Narrow navigation rail shown while the history sidebar is closed.
 *
 * The rail is the closed state of the sidebar panel, so it renders the
 * buttons only; the panel owns the width, the background and the open/closed
 * transition. The mark is the same `BrandMark` the app menu uses.
 */
export function NavRail({
  open,
  onToggle,
  onNewQuestion,
  controlsId,
}: {
  /** True when the history sidebar took over the panel. */
  open: boolean;
  onToggle(): void;
  onNewQuestion(): void;
  /** Id of the history panel this rail opens. */
  controlsId: string;
}): React.JSX.Element {
  const t = useSurfaceTranslations("welcome");
  const header = useSurfaceTranslations("header");

  return (
    <div className="ph-rail">
      <div className="ph-rail-top">
        <Link href="/" className="ph-rail-logo" aria-label="pharmeazor home">
          <BrandMark />
        </Link>

        <button
          type="button"
          className="ph-rail-btn"
          aria-label={header("openNavigation")}
          aria-expanded={open}
          aria-controls={controlsId}
          onClick={onToggle}
        >
          <PanelLeft size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </button>

        <button
          type="button"
          className="ph-rail-btn ph-rail-btn-new"
          aria-label={t("navNewQuestion")}
          onClick={onNewQuestion}
        >
          <Plus size={18} strokeWidth={2} strokeLinecap="round" />
        </button>

        <button type="button" className="ph-rail-btn" aria-label={t("navLibrary")}>
          <Clock size={18} strokeWidth={2} strokeLinecap="round" />
        </button>
      </div>

      <div className="ph-rail-bottom">
        <button type="button" className="ph-rail-btn" aria-label={t("navAssistant")}>
          <Star size={18} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        </button>
        <span className="ph-user-avatar" aria-label="User account">
          PH
        </span>
      </div>
    </div>
  );
}
