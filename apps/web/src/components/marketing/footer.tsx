import type * as React from "react";
import Link from "next/link";
import { getSurfaceTranslations } from "@/lib/translations.server";

export async function MarketingFooter(): Promise<React.JSX.Element> {
  const t = await getSurfaceTranslations("marketing");
  return (
    <footer className="flex flex-col gap-5 border-t border-border py-8 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">{t("footer.tagline")}</p>
      <nav
        aria-label={t("preview.footerNavigation")}
        className="flex flex-wrap items-center gap-x-6 gap-y-3"
      >
        <Link
          href="/sign-in"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("footer.signIn")}
        </Link>
        <Link
          href="/billing"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("footer.billing")}
        </Link>
      </nav>
    </footer>
  );
}
