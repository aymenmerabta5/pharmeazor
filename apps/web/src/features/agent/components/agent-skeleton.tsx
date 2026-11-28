"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The assistant surface while the conversation and account load. */
export function AgentSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="agent-shell flex h-dvh overflow-hidden bg-background text-foreground">
      <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col items-center border-e border-border/70 bg-sidebar pb-10 pt-4 lg:w-[72px]">
        <Skeleton className="size-10 rounded-[14px]" />
        <div className="mt-6 flex flex-col items-center gap-2">
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="size-11 rounded-xl" />
          <Skeleton className="mt-2 size-10 rounded-lg" />
        </div>
        <div className="mt-auto flex flex-col items-center gap-3">
          <Skeleton className="size-10 rounded-xl" />
          <Skeleton className="size-10 rounded-full" />
        </div>
      </aside>

      <main className="flex h-dvh min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center justify-end gap-2 px-4 sm:px-6 lg:px-8">
          <Skeleton className="h-8 w-24 rounded-full" />
          <Skeleton className="h-10 w-28 rounded-xl" />
        </header>

        <div className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8 sm:px-6">
          <div className="my-auto flex w-full max-w-[760px] flex-col items-center">
            <Skeleton className="size-14 rounded-2xl" />
            <Skeleton className="mt-8 h-12 w-full max-w-[560px]" />
            <Skeleton className="mt-3 h-12 w-full max-w-[420px]" />
            <Skeleton className="mt-4 h-5 w-full max-w-[460px]" />
            <Skeleton className="mt-2 h-5 w-full max-w-[380px]" />
            <Skeleton className="mt-6 h-28 w-full rounded-2xl" />
            <div className="mt-6 grid w-full gap-3 sm:grid-cols-2">
              {[0, 1, 2, 3].map((index) => (
                <Skeleton key={index} className="h-16 w-full rounded-xl" />
              ))}
            </div>
          </div>
        </div>

        <footer className="shrink-0 px-5 pb-10 pt-4 text-center">
          <Skeleton className="mx-auto h-3 w-64 max-w-full" />
        </footer>
      </main>
    </PageSkeleton>
  );
}
