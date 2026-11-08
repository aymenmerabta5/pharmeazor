import type * as React from "react";

import { getSurfaceTranslations } from "@/lib/translations.server";

export async function MarketingQuickStart(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("marketing");
  return (
    <section id="quick-start" className="space-y-7">
      <div className="max-w-2xl space-y-4">
        <h2 className="text-2xl font-semibold leading-tight tracking-tight sm:text-3xl">
          {t("single.quickStartTitle")}
        </h2>
        <p className="max-w-[58ch] text-base leading-7 text-muted-foreground">
          {t("single.quickStartDescriptionNext")}
        </p>
      </div>
      <ol
        className="grid gap-5 rounded-lg border border-border bg-code p-6 font-mono text-sm leading-6 text-code-foreground md:grid-cols-[1fr_1.35fr_1fr] sm:p-8"
        dir="ltr"
      >
        <li className="min-w-0 break-all">
          <code>cd pharmeazor</code>
        </li>
        <li className="min-w-0 break-all">
          <code>bun run install:bootstrap</code>
        </li>
        <li className="min-w-0">
          <code>bun run dev</code>
        </li>
      </ol>
      <p className="max-w-[65ch] text-sm leading-6 text-muted-foreground">
        {t("single.quickStartServices")}
      </p>
    </section>
  );
}
