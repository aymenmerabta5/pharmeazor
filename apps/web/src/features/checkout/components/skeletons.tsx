"use client";
import type * as React from "react";

/** The checkout page's static shell while the catalog and balance load. */
export function CheckoutLoading(): React.JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        <div className="h-9 w-full max-w-sm animate-pulse rounded bg-muted" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="h-96 animate-pulse rounded-xl bg-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    </div>
  );
}

/** The return page's static shell while the query string is read. */
export function CheckoutReturnLoading(): React.JSX.Element {
  return (
    <div
      className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 py-14 sm:px-6"
      aria-busy="true"
    >
      <div className="h-72 animate-pulse rounded-xl bg-muted" />
    </div>
  );
}
