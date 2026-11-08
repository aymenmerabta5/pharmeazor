"use client";
import type * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSurfaceTranslations } from "@/lib/translations";

export function BillingReturnView({
  outcome,
}: {
  outcome: "success" | "cancel";
}): React.JSX.Element {
  const t = useSurfaceTranslations("billing");
  return (
    <main className="mx-auto flex min-h-[calc(100svh-4rem)] w-full max-w-xl items-start px-5 py-10 sm:px-8 sm:py-14">
      <Card className="w-full">
        <CardHeader>
          <CardTitle as="h1" className="text-3xl tracking-tight">
            {t(outcome === "success" ? "checkoutReturnTitle" : "checkoutCancelledTitle")}
          </CardTitle>
          <CardDescription>
            {t(
              outcome === "success" ? "checkoutReturnDescription" : "checkoutCancelledDescription",
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/billing" />} nativeButton={false}>
            {t("backToBilling")}
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
