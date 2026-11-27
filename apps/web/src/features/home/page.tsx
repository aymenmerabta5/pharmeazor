"use client";
import type * as React from "react";
import { useAppShell } from "@/features/app-shell/use-app-shell";
import { LandingClose } from "./components/landing-close";
import { LandingCounter } from "./components/landing-counter";
import { LandingEvidence } from "./components/landing-evidence";
import { LandingFooter } from "./components/landing-footer";
import { LandingHeader } from "./components/landing-header";
import { LandingHero } from "./components/landing-hero";
import { LandingPlans } from "./components/landing-plans";
import { LandingScope } from "./components/landing-scope";

/**
 * The public home page.
 *
 * Six screens: the promise and the product, the anatomy of a cited answer,
 * the counter questions, the limits, the plans, and one closing action. The
 * header and footer are the only shared chrome; every section owns its own
 * composition.
 */
export function HomePage({ signedIn }: { signedIn: boolean }): React.JSX.Element {
  const shell = useAppShell();
  return (
    <div className="ph-surface ph-landing">
      <LandingHeader
        identity={shell.identity}
        onNavigate={shell.onNavigate}
        onSignOut={shell.onSignOut}
      />
      <main>
        <LandingHero signedIn={signedIn} />
        <LandingEvidence />
        <LandingCounter />
        <LandingScope />
        <LandingPlans />
        <LandingClose />
      </main>
      <LandingFooter signedIn={signedIn} />
    </div>
  );
}
