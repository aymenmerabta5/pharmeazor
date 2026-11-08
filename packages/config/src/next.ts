import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).default("pk_test_REPLACE"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().min(1).default("phc_REPLACE_WITH_POSTHOG_KEY"),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().min(1).default("/ingest"),
    NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: z.enum(["true", "false"]).default("false"),
    NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: z.enum(["true", "false"]).default("true"),
    NEXT_PUBLIC_ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
  },
  runtimeEnv: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_POSTHOG_SESSION_RECORDING: process.env.NEXT_PUBLIC_POSTHOG_SESSION_RECORDING,
    NEXT_PUBLIC_POSTHOG_AUTOCAPTURE: process.env.NEXT_PUBLIC_POSTHOG_AUTOCAPTURE,
    NEXT_PUBLIC_ANALYTICS_DISABLED: process.env.NEXT_PUBLIC_ANALYTICS_DISABLED,
  },
});

export const isDevelopment = process.env.NODE_ENV !== "production";
export type NextPublicEnv = typeof env;
