"use client";

import type * as React from "react";
import { PageSkeleton } from "@/components/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The public landing page while the session-aware shell resolves. */
export function LandingSkeleton(): React.JSX.Element {
  return (
    <PageSkeleton className="ph-surface ph-landing">
      <header className="ph-landing-header">
        <div className="ph-landing-header-inner">
          <Skeleton className="h-6 w-36" />
          <div className="ph-landing-nav">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="ph-landing-header-actions">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-8 rounded-full" />
          </div>
        </div>
      </header>

      <main>
        <section className="ph-landing-section ph-landing-hero">
          <div className="ph-landing-wrap ph-landing-hero-grid">
            <div className="ph-landing-hero-copy">
              <Skeleton className="mb-4 h-3 w-36" />
              <Skeleton className="h-[clamp(4.5rem,9vw,8rem)] w-full max-w-[15ch]" />
              <Skeleton className="mt-5 h-5 w-full max-w-[58ch]" />
              <Skeleton className="mt-2 h-5 w-full max-w-[48ch]" />
              <div className="mt-8 flex flex-wrap gap-3">
                <Skeleton className="h-12 w-44 rounded-xl" />
                <Skeleton className="h-12 w-36 rounded-xl" />
              </div>
              <Skeleton className="mt-6 h-4 w-72 max-w-full" />
            </div>
            <div className="ph-landing-hero-visual">
              <Skeleton className="h-[26rem] w-full rounded-2xl" />
            </div>
          </div>
        </section>

        <section className="ph-landing-section">
          <div className="ph-landing-wrap">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-4 h-12 w-full max-w-[21ch]" />
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {[0, 1].map((index) => (
                <Skeleton key={index} className="h-56 rounded-2xl" />
              ))}
            </div>
          </div>
        </section>
      </main>
    </PageSkeleton>
  );
}
