"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The admin account list while the first page of users loads. */
export function AdminUsersSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          <Skeleton className="h-9 w-28" />
          <Skeleton className="h-9 w-32" />
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-3 gap-y-2 sm:grid-cols-[minmax(0,24rem)_1fr]">
        <div className="space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-10 w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:col-start-2 sm:row-start-2 sm:self-start">
          <Skeleton className="h-9 w-24" />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="grid grid-cols-[minmax(12rem,1fr)_6rem_6rem_10rem] gap-4 border-b px-4 py-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-4 w-full" />
          ))}
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[minmax(12rem,1fr)_6rem_6rem_10rem] items-center gap-4 px-4 py-4"
          >
            <div className="flex min-w-0 flex-col gap-2">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-52" />
            </div>
            <Skeleton className="h-5 w-14" />
            <Skeleton className="h-5 w-16" />
            <Skeleton className="h-8 w-36 justify-self-end" />
          </div>
        ))}
      </div>
    </PageSkeleton>
  );
}

/** The create-account form while its client workflow mounts. */
export function CreateUserSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <Skeleton className="h-8 w-24 self-start" />
      </header>

      <div className="w-full max-w-2xl rounded-lg border bg-card">
        <div className="space-y-2 border-b p-5 sm:p-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-5 p-5 sm:p-6">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="space-y-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-10 w-full" />
            </div>
          ))}
          <Skeleton className="h-9 w-36" />
        </div>
      </div>
    </PageSkeleton>
  );
}
