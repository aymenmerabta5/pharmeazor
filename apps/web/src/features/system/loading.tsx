import * as React from "react";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingScreen(): React.JSX.Element {
  return (
    <main className="min-h-[calc(100dvh-4rem)] bg-background" aria-busy="true">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="space-y-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 max-w-full" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>
    </main>
  );
}
