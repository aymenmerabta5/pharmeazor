import { z } from "zod";

export const serverSchema = {
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_NAME: z.string().min(1).default("GhostInit App"),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1).optional(),
  POSTGRES_USER: z.string().min(1).default("postgres"),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_HOST: z.string().min(1).default("localhost"),
  POSTGRES_PORT: z.string().regex(/^\d+$/).default("5432"),
  POSTGRES_DB: z.string().min(1).default("ghostinit"),
  DATABASE_SSL: z.enum(["true", "false"]).default("false"),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_POOL_SIZE: z
    .string()
    .regex(/^\d+$/)
    .default("20")
    .transform((value) => Number.parseInt(value, 10)),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url(),
  GOOGLE_CLIENT_ID: z.string().min(1).default("REPLACE_WITH_GOOGLE_CLIENT_ID"),
  GOOGLE_CLIENT_SECRET: z.string().min(1).default("REPLACE_WITH_GOOGLE_CLIENT_SECRET"),
  GITHUB_CLIENT_ID: z.string().min(1).default("REPLACE_WITH_GITHUB_CLIENT_ID"),
  GITHUB_CLIENT_SECRET: z.string().min(1).default("REPLACE_WITH_GITHUB_CLIENT_SECRET"),
  TRUSTED_PROXY: z.enum(["true", "false"]).default("false"),
  ANALYTICS_DISABLED: z.enum(["true", "false"]).default("false"),
  RESEND_API_KEY: z.string().min(1).default("REPLACE_WITH_RESEND_API_KEY"),
  EMAIL_FROM: z.string().min(1).default("noreply@example.com"),
  EMAIL_FROM_NAME: z.string().min(1).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_STRIPE_SECRET_KEY"),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).default("REPLACE_WITH_STRIPE_WEBHOOK_SECRET"),
  BILLING_STRIPE_PRO_PRICE_ID: z.string().min(1).default("REPLACE_WITH_STRIPE_PRO_PRICE_ID"),
  CHARGILY_API_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_API_KEY"),
  CHARGILY_SECRET_KEY: z.string().min(1).default("REPLACE_WITH_CHARGILY_SECRET_KEY"),
  CHARGILY_MODE: z.enum(["test", "live"]).default("test"),
  BILLING_CHARGILY_PRO_PRICE_ID: z.string().min(1).default("REPLACE_WITH_CHARGILY_PRO_PRICE_ID"),
  POSTHOG_HOST: z.string().min(1).optional().default("https://us.i.posthog.com"),
  POSTHOG_API_KEY: z.string().min(1).optional().default("REPLACE_WITH_POSTHOG_KEY"),
  FEATURE_FLAG_TIMEOUT_MS: z.coerce.number().int().min(100).max(30000).default(2500),
  AI_GATEWAY_API_KEY: z.string().min(1).default("REPLACE_WITH_AI_GATEWAY_API_KEY"),
  EVE_INTERNAL_AUTH_SECRET: z.string().min(32),
  EVE_NEXT_PRODUCTION_ORIGIN: z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().url().optional(),
  ),
  EVE_NEXT_PRODUCTION_PORT: z.coerce.number().int().min(1).max(65535).default(4274),
  UPSTASH_REDIS_REST_URL: z
    .string()
    .max(2_048)
    .url()
    .refine(
      (value) => value === value.trim() && !value.startsWith("REPLACE_WITH"),
      "UPSTASH_REDIS_REST_URL must be configured without surrounding whitespace",
    ),
  UPSTASH_REDIS_REST_TOKEN: z
    .string()
    .min(1)
    .max(4_096)
    .regex(/^[\x21-\x7e]+$/)
    .refine(
      (value) => !value.startsWith("REPLACE_WITH"),
      "UPSTASH_REDIS_REST_TOKEN must be configured",
    ),
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_BUCKET: z.string().min(1).default("REPLACE_WITH_STORAGE_BUCKET"),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_ENDPOINT: z.union([z.string().url(), z.literal("")]).optional(),
  S3_PUBLIC_URL: z.union([z.string().url(), z.literal("")]).optional(),
  UPLOADS_DIR: z.string().min(1).default("./data/uploads"),
} as const;
