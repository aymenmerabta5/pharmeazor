"use client";

import * as React from "react";
import { useReportError } from "./use-report-error";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function UnexpectedErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): React.JSX.Element {
  const t = useSurfaceTranslations("errors");
  useReportError(error);

  return (
    <main className="flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-background px-5 py-10 sm:px-8">
      <Card className="w-full max-w-[440px] border-0 bg-transparent shadow-none">
        <CardHeader>
          <CardTitle as="h1" className="text-3xl tracking-tight">
            {t("unexpected.title")}
          </CardTitle>
          <CardDescription className="max-w-[60ch]">{t("unexpected.description")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button onClick={() => reset()}>{t("unexpected.retry")}</Button>
        </CardContent>
      </Card>
    </main>
  );
}
