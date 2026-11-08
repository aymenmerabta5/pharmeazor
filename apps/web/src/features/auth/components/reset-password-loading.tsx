"use client";
import type * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
export function ResetPasswordLoadingView(): React.JSX.Element {
  const t = useSurfaceTranslations("recovery");
  return (
    <main className="flex min-h-[calc(100svh-4rem)] items-start justify-center bg-background px-5 py-10 sm:px-8 sm:py-14">
      <div className="w-full max-w-[440px]" role="status" aria-busy={true}>
        <Card className="border-0 bg-transparent p-0 shadow-none">
          <CardHeader className="p-0 pb-6 sm:p-0 sm:pb-6">
            <CardTitle as="h1" className="text-3xl tracking-tight">
              {t("resetPassword.title")}
            </CardTitle>
            <CardDescription>{t("resetPassword.loading")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-0 sm:p-0" aria-hidden={true}>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
