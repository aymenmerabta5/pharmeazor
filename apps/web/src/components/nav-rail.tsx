"use client";
import type * as React from "react";
import { Clock, PanelLeft, Plus, Star } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

/** Leaf logo — rounded-square green bg + white leaf */
function LeafLogoSmall(): React.JSX.Element {
  return (
    <span className="ph-leaf-sm" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path
          d="M10 3.5C10 3.5 5 5.5 5 10.5C5 13.5 7.2 16 10 16C12.8 16 15 13.5 15 10.5C15 7.5 12.5 5 10 3.5Z"
          fill="white"
          fillOpacity="0.95"
        />
        <line
          x1="10"
          y1="16"
          x2="10"
          y2="11"
          stroke="white"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * Narrow navigation rail shown while the history sidebar is closed.
 *
 * A focused view shared by the welcome and chat surfaces: it renders the
 * rail and reports intent through callbacks. The rail and the history
 * sidebar are the two states of the same panel, so only one of them is
 * ever visible.
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
    <aside className="ph-rail" aria-label={header("openNavigation")} hidden={open}>
      <div className="ph-rail-top">
        <button type="button" className="ph-rail-logo" aria-label="pharmeazor home">
          <LeafLogoSmall />
        </button>

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
    </aside>
  );
}
