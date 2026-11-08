import type * as React from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Folder, FolderTree } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSurfaceTranslations } from "@/lib/translations.server";

export async function MarketingHero(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("marketing");
  return (
    <section className="grid items-center gap-10 pt-6 sm:pt-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16 lg:pt-16">
      <div className="flex min-w-0 flex-col items-start gap-7">
        <h1 className="text-[2.625rem] font-semibold leading-[1.08] tracking-[-0.045em] sm:text-5xl lg:text-[3.5rem]">
          <span className="block">{t("hero.title")}</span>
          <span className="block text-primary">{t("hero.titleAccent")}</span>
        </h1>
        <p className="max-w-[43ch] text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          {t("hero.descriptionNext")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" render={<Link href="/sign-up" />} nativeButton={false}>
            {t("hero.primaryCta")}
            <ArrowRight className="rtl:rotate-180" data-icon="inline-end" aria-hidden />
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={
              <a
                href="https://github.com/aymenmerabta5/ghostinit"
                target="_blank"
                rel="noreferrer"
              />
            }
            nativeButton={false}
          >
            {t("hero.secondaryCta")}
            <ArrowUpRight data-icon="inline-end" aria-hidden />
          </Button>
        </div>
      </div>
      <figure className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-surface">
        <figcaption className="flex items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
          <FolderTree className="size-4 text-primary" aria-hidden />
          <span className="text-sm font-medium">{t("preview.title")}</span>
        </figcaption>
        <div className="px-5 pb-2 pt-5 sm:px-6">
          <p
            className="mb-2 truncate font-mono text-xs font-medium text-muted-foreground"
            dir="ltr"
          >
            pharmeazor/
          </p>
          <dl className="divide-y divide-border/70">
            {[
              { path: "apps/web/src/app/", label: t("preview.routes") },
              { path: "apps/web/src/components/", label: t("preview.components") },
              { path: "packages/ui/", label: t("preview.design") },
              { path: "packages/modules/", label: t("preview.server") },
              { path: "apps/eve/", label: t("preview.agent") },
            ].map(({ path, label }) => (
              <div key={path} className="flex items-start gap-3 py-3.5">
                <dt className="flex min-w-0 flex-1 items-start gap-3">
                  <Folder className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <code dir="ltr" className="block min-w-0 break-all text-sm text-foreground">
                    {path}
                  </code>
                </dt>
                <dd className="max-w-28 text-end text-xs leading-5 text-muted-foreground">
                  {label}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="border-t border-border bg-muted/40 px-5 py-3 text-xs leading-5 text-muted-foreground sm:px-6">
          {t("preview.source")}
        </p>
      </figure>
    </section>
  );
}
