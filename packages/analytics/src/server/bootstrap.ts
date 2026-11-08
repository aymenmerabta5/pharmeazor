/**
 * Server-side bootstrap for PostHog feature flags.
 */

import { getAllFlags, getFeatureFlagPayload, getPostHogServer } from "./posthog-server";

export interface BootstrapPayload {
  distinctId: string;
  flags: Record<string, string | boolean>;
  payloads: Record<string, unknown>;
}

export async function getBootstrapFeatureFlags(
  distinctId: string,
  options?: {
    groups?: Record<string, string>;
    personProperties?: Record<string, string>;
    evaluatePayloads?: string[];
  },
): Promise<BootstrapPayload> {
  const client = getPostHogServer();
  if (!client) {
    return { distinctId, flags: {}, payloads: {} };
  }

  try {
    const flags = await getAllFlags(distinctId, {
      groups: options?.groups,
      personProperties: options?.personProperties,
    });

    const payloads: Record<string, unknown> = {};
    const toEvaluate = options?.evaluatePayloads ?? Object.keys(flags);

    await Promise.all(
      toEvaluate.map(async (key) => {
        try {
          const p = await getFeatureFlagPayload(key, distinctId, {
            groups: options?.groups,
            personProperties: options?.personProperties,
          });
          if (p !== undefined) payloads[key] = p;
        } catch {}
      }),
    );

    return { distinctId, flags, payloads };
  } catch (err) {
    console.warn("[analytics:bootstrap] getBootstrapFeatureFlags failed", err);
    return { distinctId, flags: {}, payloads: {} };
  }
}

export async function getBootstrapForUser(
  distinctId: string,
  groups?: Record<string, string>,
): Promise<BootstrapPayload> {
  return getBootstrapFeatureFlags(distinctId, { groups });
}

export async function getBootstrapForAnonymous(): Promise<BootstrapPayload> {
  const anonId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return getBootstrapFeatureFlags(anonId);
}
