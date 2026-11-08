import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "EXPO_PUBLIC_",
  client: {
    EXPO_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    EXPO_PUBLIC_API_URL: z.string().url().optional(),
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),
    EXPO_PUBLIC_POSTHOG_KEY: z.string().min(1).optional(),
    EXPO_PUBLIC_POSTHOG_HOST: z.string().min(1).optional(),
    EXPO_PUBLIC_POSTHOG_SESSION_RECORDING: z.enum(["true", "false"]).default("false"),
    EXPO_PUBLIC_POSTHOG_AUTOCAPTURE: z.enum(["true", "false"]).default("true"),
    EXPO_PUBLIC_ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
  },
  runtimeEnv: {
    EXPO_PUBLIC_APP_URL: process.env.EXPO_PUBLIC_APP_URL,
    EXPO_PUBLIC_API_URL: process.env.EXPO_PUBLIC_API_URL,
    EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    EXPO_PUBLIC_POSTHOG_KEY: process.env.EXPO_PUBLIC_POSTHOG_KEY,
    EXPO_PUBLIC_POSTHOG_HOST: process.env.EXPO_PUBLIC_POSTHOG_HOST,
    EXPO_PUBLIC_POSTHOG_SESSION_RECORDING: process.env.EXPO_PUBLIC_POSTHOG_SESSION_RECORDING,
    EXPO_PUBLIC_POSTHOG_AUTOCAPTURE: process.env.EXPO_PUBLIC_POSTHOG_AUTOCAPTURE,
    EXPO_PUBLIC_ANALYTICS_DISABLED: process.env.EXPO_PUBLIC_ANALYTICS_DISABLED,
  },
});

export const isDevelopment = process.env.NODE_ENV !== "production";
export type ExpoPublicEnv = typeof env;
