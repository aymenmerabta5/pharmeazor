"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The settings body while the profile, security, and session data load. */
export function SettingsSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="flex min-w-0 flex-col gap-6">
      <SettingsBodySkeleton />
    </PageSkeleton>
  );
}

/** The settings cards without their loading-status frame. */
export function SettingsBodySkeleton(): React.JSX.Element {
  return (
    <>
      <section className="grid gap-0 overflow-hidden rounded-lg border bg-card xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="border-b border-border/70 bg-muted/20 p-5 sm:p-6 xl:border-b-0 xl:border-e">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-3 h-4 w-64 max-w-full" />
        </div>
        <div className="flex min-w-0 flex-col gap-5 p-5 sm:p-6">
          <Skeleton className="h-10 w-full max-w-xl" />
          <Skeleton className="h-9 w-32" />
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        {[0, 1].map((index) => (
          <section key={index} className="rounded-lg border bg-card">
            <div className="space-y-2 p-5 sm:p-6">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-full max-w-sm" />
            </div>
            <div className="space-y-4 border-t p-5 sm:p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-9 w-36" />
            </div>
          </section>
        ))}
      </div>

      <section className="rounded-lg border bg-card">
        <div className="space-y-2 p-5 sm:p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-3 border-t p-5 sm:p-6">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-9 w-40" />
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6">
          <div className="space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full max-w-md" />
          </div>
          <Skeleton className="h-9 w-28" />
        </div>
        <div className="space-y-3 border-t p-5 sm:p-6">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-destructive/30 bg-card">
        <div className="space-y-2 p-5 sm:p-6">
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-full max-w-md" />
          <Skeleton className="mt-2 h-9 w-40" />
        </div>
      </section>
    </>
  );
}

/** The settings layout chrome and the page body for the auth-boundary fallback. */
export function SettingsRouteSkeleton({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <PageSkeleton className="mx-auto w-full max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <div className="flex min-w-0 flex-col gap-7">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-40" />
          <Skeleton className="h-4 w-full max-w-[65ch]" />
        </div>
        <nav className="flex flex-wrap items-center gap-1 border-b border-border/70 pb-3">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
        </nav>
        <section className="min-w-0">{children}</section>
      </div>
    </PageSkeleton>
  );
}
