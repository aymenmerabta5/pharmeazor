"use client";
import type * as React from "react";

/** Leaf glyph drawn inside the answer dot. */
function LeafIcon({ size = 14 }: { size?: number }): React.JSX.Element {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none">
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
  );
}

/** Round badge that marks the start of an assistant answer. */
export function AnswerDot(): React.JSX.Element {
  return (
    <span className="ph-answer-dot" aria-hidden="true">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="10" fill="var(--ph-green)" />
        <LeafIcon />
      </svg>
    </span>
  );
}
