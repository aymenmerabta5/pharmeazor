import { capture, identify, alias } from "../server/posthog-server";
import type { UserTraits } from "../types";

export interface TrackAuthEvent {
  userId: string;
  email?: string;
  name?: string;
  method?: string;
  traits?: UserTraits;
}

export function trackSignedUp(input: TrackAuthEvent): void {
  const distinctId = input.userId;
  const props = {
    email: input.email,
    method: input.method ?? "email",
    $set: {
      email: input.email,
      name: input.name,
      ...input.traits,
    } as Record<string, unknown>,
  };
  capture({ distinctId, event: "signed_up", properties: props });
  identify({ distinctId, properties: { email: input.email, name: input.name, ...input.traits } });
}

export function trackSignedIn(input: TrackAuthEvent): void {
  capture({
    distinctId: input.userId,
    event: "signed_in",
    properties: { method: input.method ?? "email", email: input.email },
  });
  if (input.email || input.name) {
    identify({
      distinctId: input.userId,
      properties: { email: input.email, name: input.name, ...input.traits },
    });
  }
}

export function trackSignedOut(input: { userId: string }): void {
  capture({ distinctId: input.userId, event: "signed_out" });
}

export function trackOnboardingStarted(input: { userId: string; step?: string }): void {
  capture({
    distinctId: input.userId,
    event: "onboarding_started",
    properties: { step: input.step ?? "start" },
  });
}

export function trackOnboardingCompleted(input: { userId: string; durationMs?: number }): void {
  capture({
    distinctId: input.userId,
    event: "onboarding_completed",
    properties: { durationMs: input.durationMs },
  });
}

export function linkAnonymousToUser(opts: { anonymousId: string; userId: string }): void {
  try {
    alias({ distinctId: opts.userId, alias: opts.anonymousId });
  } catch {}
}

export const authAnalytics = {
  signedUp: trackSignedUp,
  signedIn: trackSignedIn,
  signedOut: trackSignedOut,
  onboardingStarted: trackOnboardingStarted,
  onboardingCompleted: trackOnboardingCompleted,
  linkAnonymous: linkAnonymousToUser,
};
