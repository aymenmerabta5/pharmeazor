"use client";
import type * as React from "react";
import { ArrowRight } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";

const FOLLOW_UPS = [
  "followUpEquivalents",
  "followUpPrecautions",
  "followUpDoseDisagreement",
] as const;

export function AgentFollowUps({
  onAsk,
  busy,
}: {
  onAsk(question: string): void;
  busy: boolean;
}): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  return (
    <section className="mt-10" aria-labelledby="agent-follow-ups">
      <h3
        id="agent-follow-ups"
        className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {t("followUpTitle")}
      </h3>
      <div className="mt-3 flex flex-col gap-2">
        {FOLLOW_UPS.map((key) => {
          const question = t(key);
          return (
            <button
              key={key}
              type="button"
              disabled={busy}
              onClick={() => onAsk(question)}
              className="flex min-h-14 items-center justify-between gap-4 rounded-xl border border-border/80 bg-card px-5 py-3 text-start text-[0.9375rem] leading-6 text-foreground transition-[border-color,background-color] duration-150 hover:border-primary/30 hover:bg-accent/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50"
            >
              <span>{question}</span>
              <ArrowRight
                className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
                aria-hidden
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
