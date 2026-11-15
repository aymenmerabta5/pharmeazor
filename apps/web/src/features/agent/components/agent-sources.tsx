"use client";
import type * as React from "react";
import { ExternalLink, ShieldAlert } from "lucide-react";
import { useSurfaceTranslations } from "@/lib/translations";
import type { AgentSource } from "../model";

export function AgentSources({ sources }: { sources: readonly AgentSource[] }): React.JSX.Element {
  const t = useSurfaceTranslations("agent");
  if (sources.length === 0) {
    return (
      <div className="mt-6 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3.5 py-3 text-xs leading-5 text-muted-foreground">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
        <p>{t("noSources")}</p>
      </div>
    );
  }
  return (
    <section className="mt-8" aria-label={t("sources")}>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {t("sources")} · {sources.length}
      </p>
      <ul className="mt-2 divide-y divide-border/70 border-y border-border/70">
        {sources.map((source, index) => (
          <li key={source.key}>
            <a
              href={source.url}
              target="_blank"
              rel="noreferrer noopener"
              aria-label={t("openSource") + ": " + source.label}
              className="group flex items-center gap-4 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {source.label}
                </span>
                {source.host !== source.label ? (
                  <span className="block truncate text-xs text-muted-foreground">
                    {source.host}
                  </span>
                ) : null}
              </span>
              <span className="hidden rounded-full bg-secondary px-2.5 py-1 text-[0.6875rem] font-medium text-secondary-foreground sm:inline">
                {t("sourceLinked")}
              </span>
              <ExternalLink
                className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
