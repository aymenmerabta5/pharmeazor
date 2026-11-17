"use client";
import type * as React from "react";
import { motion, useReducedMotion, type Transition } from "motion/react";
import { useLocale } from "next-intl";
import { isRtl } from "@/i18n/config";
import { useSurfaceTranslations } from "@/lib/translations";
import type { ChatHistoryEntry } from "@/lib/chat-history";
import { ChatHistorySidebar } from "./chat-history-sidebar";
import { NavRail } from "./nav-rail";

const RAIL_WIDTH = 56;
const PANEL_WIDTH = 232;
const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/**
 * One panel, two states: the icon rail and the open history list.
 *
 * The panel animates its own width, so the content beside it follows frame by
 * frame instead of jumping between two layouts, and the rail and the full list
 * cross-fade inside the same surface. The collapse control is part of the open
 * content, so closing is always an action of the panel itself.
 */
export function HistorySidebarPanel({
  open,
  id,
  entries,
  activeQuery,
  onSelect,
  onNewQuestion,
  onSeePlans,
  onToggle,
  onClose,
}: {
  open: boolean;
  /** Id the rail and close controls point at. */
  id: string;
  entries: ChatHistoryEntry[];
  activeQuery?: string | null;
  onSelect(entry: ChatHistoryEntry): void;
  onNewQuestion(): void;
  onSeePlans(): void;
  onToggle(): void;
  onClose(): void;
}): React.JSX.Element {
  const header = useSurfaceTranslations("header");
  const locale = useLocale();
  const reduced = useReducedMotion() ?? false;
  const closedOffset = isRtl(locale) ? 14 : -14;

  const widthTransition: Transition = reduced
    ? { duration: 0 }
    : { type: "spring", stiffness: 420, damping: 42, mass: 0.9 };
  const fadeTransition: Transition = reduced
    ? { duration: 0 }
    : { duration: open ? 0.3 : 0.14, ease: EASE, delay: open ? 0.06 : 0 };

  return (
    <motion.aside
      id={id}
      aria-label={header("primaryNavigation")}
      className="ph-sidebar-panel"
      initial={false}
      animate={{ width: open ? PANEL_WIDTH : RAIL_WIDTH }}
      transition={widthTransition}
    >
      <motion.div
        className="ph-sidebar-rail"
        aria-hidden={open}
        inert={open}
        initial={false}
        animate={{ opacity: open ? 0 : 1 }}
        transition={fadeTransition}
      >
        <NavRail open={open} onToggle={onToggle} onNewQuestion={onNewQuestion} controlsId={id} />
      </motion.div>

      <motion.div
        className="ph-sidebar-body"
        aria-hidden={!open}
        inert={!open}
        initial={false}
        animate={{ opacity: open ? 1 : 0, x: open ? 0 : closedOffset }}
        transition={fadeTransition}
      >
        <ChatHistorySidebar
          controlsId={id}
          entries={entries}
          activeQuery={activeQuery}
          onSelect={onSelect}
          onNewQuestion={onNewQuestion}
          onSeePlans={onSeePlans}
          onClose={onClose}
        />
      </motion.div>
    </motion.aside>
  );
}
