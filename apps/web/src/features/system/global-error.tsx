"use client";

import * as React from "react";
import { useReportError } from "./use-report-error";
import { Button } from "@/components/ui/button";
import {
  standaloneSurfaceDirection,
  useStandaloneSurfaceLocale,
  useStandaloneSurfaceTranslations,
} from "@/lib/translations.standalone";

export function GlobalErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const locale = useStandaloneSurfaceLocale();
  const t = useStandaloneSurfaceTranslations("errors");
  useReportError(error);

  return (
    <html lang={locale} dir={standaloneSurfaceDirection(locale)} suppressHydrationWarning>
      <body className="antialiased bg-background text-foreground">
        <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10 sm:px-8">
          <div className="w-full max-w-[440px] space-y-3">
            <h1 className="text-3xl font-semibold tracking-tight">{t("global.title")}</h1>
            <p className="text-sm text-muted-foreground max-w-[65ch] mt-2">
              {t("global.description")}
            </p>
            <Button onClick={() => reset()} className="mt-6">
              {t("global.retry")}
            </Button>
          </div>
        </main>
      </body>
    </html>
  );
}
