"use client";

import type * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export function AuthShell({
  backLabel,
  children,
  note,
}: {
  backLabel: string;
  children: React.ReactNode;
  note?: React.ReactNode;
}): React.JSX.Element {
  return (
    <main className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden bg-background px-5 py-12 sm:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 end-[-10rem] size-[28rem] rounded-full bg-accent/70 blur-3xl" />
        <div className="absolute -bottom-48 start-[-12rem] size-[32rem] rounded-full bg-secondary/80 blur-3xl" />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-border to-transparent" />
      </div>
      <div className="relative z-10 flex w-full max-w-[430px] flex-col gap-5">
        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <ArrowLeft aria-hidden className="size-4 rtl:rotate-180" />
          {backLabel}
        </Link>
        {children}
        {note ? (
          <p className="mx-auto max-w-[48ch] text-center text-xs leading-5 text-muted-foreground">
            {note}
          </p>
        ) : null}
      </div>
    </main>
  );
}
