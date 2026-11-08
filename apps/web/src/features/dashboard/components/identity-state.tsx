"use client";
import type * as React from "react";
import { useSurfaceTranslations } from "@/lib/translations";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export function DashboardIdentityStatus({
  pending,
  error,
  className,
}: {
  pending: boolean;
  error: unknown;
  className?: string;
}): React.JSX.Element {
  const common = useSurfaceTranslations("common");
  const errors = useSurfaceTranslations("errors");
  if (pending)
    return (
      <Card className={className} role="status" aria-busy={true} aria-label={common("loading")}>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent className="space-y-7">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 shrink-0 rounded-2xl" />
            <div className="min-w-0 flex-1 space-y-3">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-9 w-28" />
        </CardContent>
      </Card>
    );
  return (
    <Alert className={className} role="alert" variant={error ? "destructive" : "default"}>
      <AlertTitle>{errors(error ? "genericTitle" : "unauthorizedTitle")}</AlertTitle>
      <AlertDescription>
        {errors(error ? "genericDescription" : "unauthorizedDescription")}
      </AlertDescription>
    </Alert>
  );
}
