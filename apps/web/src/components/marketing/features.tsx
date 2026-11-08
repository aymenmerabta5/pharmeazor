import type * as React from "react";

import { getSurfaceTranslations } from "@/lib/translations.server";

export async function MarketingFeatures(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("marketing");
  return (
    <section className="space-y-10 border-t border-border pt-12 sm:pt-16">
      <div className="max-w-2xl space-y-4">
        <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {t("features.title")}
        </h2>
        <p className="max-w-[58ch] text-base leading-7 text-muted-foreground">
          {t("features.description")}
        </p>
      </div>
      <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div className="space-y-7">
          <article>
            <h3 className="text-xl font-semibold leading-snug tracking-tight">
              {t("features.architectureTitle")}
            </h3>
            <p className="mt-3 max-w-[48ch] text-sm leading-6 text-muted-foreground">
              {t("features.architectureDescription")}
            </p>
          </article>
          <dl className="space-y-5 border-t border-border pt-6">
            {[
              { title: t("single.authTitle"), description: t("single.authDescriptionNext") },
              { title: t("features.apiTitle"), description: t("features.apiDescriptionNext") },
              { title: t("single.billingTitle"), description: t("single.billingDescription") },
            ].map(({ title, description }) => (
              <div key={title} className="space-y-1.5">
                <dt className="text-sm font-semibold text-foreground">{title}</dt>
                <dd className="max-w-[48ch] text-sm leading-6 text-muted-foreground">
                  {description}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <figure className="flex flex-col justify-between gap-6 rounded-xl border border-border bg-card p-6 shadow-surface sm:p-8">
          <figcaption className="space-y-3">
            <h3 className="text-xl font-semibold leading-snug tracking-tight">
              {t("single.tokensTitle")}
            </h3>
            <p className="max-w-[44ch] text-sm leading-6 text-muted-foreground">
              {t("single.tokensDescription")}
            </p>
          </figcaption>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-2.5">
              <div className="h-20 rounded-md border border-border bg-background" />
              <p className="text-xs text-muted-foreground">{t("preview.canvas")}</p>
              <code dir="ltr" className="block text-xs text-foreground">
                --background
              </code>
            </div>
            <div className="space-y-2.5">
              <div className="h-20 rounded-md border border-border bg-card" />
              <p className="text-xs text-muted-foreground">{t("preview.surface")}</p>
              <code dir="ltr" className="block text-xs text-foreground">
                --card
              </code>
            </div>
            <div className="space-y-2.5">
              <div className="h-20 rounded-md border border-primary bg-primary" />
              <p className="text-xs text-muted-foreground">{t("preview.accent")}</p>
              <code dir="ltr" className="block text-xs text-foreground">
                --primary
              </code>
            </div>
          </div>
        </figure>
      </div>
    </section>
  );
}
