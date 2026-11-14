import { sql } from "drizzle-orm";
import { db, pool } from "../../index";

/**
 * Billing schema migration.
 *
 * The subscription model changed shape: a subscription is now owned by this
 * application rather than by a payment provider, it names its plan, it always
 * has a period, and it records whether it renews by itself. That changes
 * columns which cannot simply be added, so a database that already holds
 * subscriptions needs its rows carried over before the new constraints apply.
 *
 * The statements are idempotent and each one checks that the table it
 * touches exists, so the script is a no-op on a fresh database. Run it before
 * `db:push`, then run `db:push` for whatever the script could not do.
 *
 * Run it with: bun run db:migrate:billing
 */

/** The plans this application sells. */
const PLAN_SEED = `
  INSERT INTO plans (id, name, description, tier, interval, interval_count, created_at, updated_at)
  VALUES
    ('basic', 'Basic', 'The pharmacy assistant and the essential catalogue tools.', 10, 'month', 1, now(), now()),
    ('standard', 'Standard', 'Everything in Basic, plus the professional workflow tools.', 20, 'month', 1, now(), now()),
    ('pro', 'Pro', 'Every capability, including the multi-pharmacy tooling.', 30, 'month', 1, now(), now())
  ON CONFLICT (id) DO NOTHING
`;

/** The price of every plan on every rail. */
const PRICE_SEED = `
  INSERT INTO prices (plan_id, provider, amount, currency, provider_price_id, created_at, updated_at)
  VALUES
    ('basic', 'stripe', 800, 'USD', NULL, now(), now()),
    ('basic', 'chargily', 210000, 'DZD', NULL, now(), now()),
    ('basic', 'manual', 210000, 'DZD', NULL, now(), now()),
    ('standard', 'stripe', 2000, 'USD', NULL, now(), now()),
    ('standard', 'chargily', 520000, 'DZD', NULL, now(), now()),
    ('standard', 'manual', 520000, 'DZD', NULL, now(), now()),
    ('pro', 'stripe', 10000, 'USD', NULL, now(), now()),
    ('pro', 'chargily', 2590000, 'DZD', NULL, now(), now()),
    ('pro', 'manual', 2590000, 'DZD', NULL, now(), now())
  ON CONFLICT (plan_id, provider, currency) DO NOTHING
`;

const STATEMENTS: readonly string[] = [
  // The recurring interval the plans use. The schema declares the same enum.
  `DO $$
     BEGIN
       IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_recurring_interval') THEN
         CREATE TYPE billing_recurring_interval AS ENUM ('month', 'year', 'week', 'day', 'one_time');
       END IF;
     END $$`,

  // The plan catalog.
  `CREATE TABLE IF NOT EXISTS plans (
     id text PRIMARY KEY,
     name text NOT NULL,
     description text,
     tier integer NOT NULL DEFAULT 0,
     interval billing_recurring_interval NOT NULL,
     interval_count integer NOT NULL DEFAULT 1,
     active boolean NOT NULL DEFAULT true,
     created_at timestamp with time zone NOT NULL DEFAULT now(),
     updated_at timestamp with time zone NOT NULL DEFAULT now(),
     CONSTRAINT plans_interval_chk CHECK (interval <> 'one_time'),
     CONSTRAINT plans_interval_count_chk CHECK (interval_count between 1 and 36),
     CONSTRAINT plans_tier_chk CHECK (tier >= 0)
   )`,

  // The subscription of record.
  `DO $$
     BEGIN
       IF to_regclass('public.subscriptions') IS NOT NULL THEN
         ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id text;
         ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_start timestamp;
         ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS current_period_end timestamp;
         ALTER TABLE subscriptions
           ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;
         ALTER TABLE subscriptions
           ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
       END IF;
     END $$`,

  // The provider price of a plan.
  `DO $$
     BEGIN
       IF to_regclass('public.prices') IS NOT NULL THEN
         ALTER TABLE prices ADD COLUMN IF NOT EXISTS plan_id text;
         ALTER TABLE prices ADD COLUMN IF NOT EXISTS recurring text;
         ALTER TABLE prices ALTER COLUMN provider_price_id DROP NOT NULL;
       END IF;
     END $$`,

  // The manual rail buys a plan.
  `DO $$
     BEGIN
       IF to_regclass('public.manual_payments') IS NOT NULL THEN
         ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS plan_id text;
         ALTER TABLE manual_payments ADD COLUMN IF NOT EXISTS subscription_granted_at timestamp;
       END IF;
     END $$`,

  // The Chargily rail buys a plan, and a checkout may be reported twice.
  `DO $$
     BEGIN
       IF to_regclass('public.checkouts') IS NOT NULL THEN
         ALTER TABLE checkouts ADD COLUMN IF NOT EXISTS subscription_granted_at timestamp;
       END IF;
     END $$`,

  // The index the price seed conflicts on has to exist before the seed runs.
  `DO $$
     BEGIN
       IF to_regclass('public.prices') IS NOT NULL THEN
         CREATE UNIQUE INDEX IF NOT EXISTS prices_plan_provider_currency_unique
           ON prices (plan_id, provider, currency);
       END IF;
     END $$`,

  // The catalog the new columns point at.
  PLAN_SEED,
  `DO $$
     BEGIN
       IF to_regclass('public.prices') IS NOT NULL THEN
         ${PRICE_SEED}
       END IF;
     END $$`,

  // Carry the plan over from the metadata the old code wrote. A plan this
  // application does not sell falls back to the top tier, because the
  // foreign key would otherwise reject the row.
  `DO $$
     BEGIN
       IF to_regclass('public.subscriptions') IS NOT NULL THEN
         UPDATE subscriptions
            SET plan_id = CASE
              WHEN NULLIF(metadata->>'planId', '') IN ('basic', 'standard', 'pro')
                THEN metadata->>'planId'
              ELSE 'pro'
            END
          WHERE plan_id IS NULL OR plan_id = '';
       END IF;
     END $$`,
  `DO $$
     BEGIN
       IF to_regclass('public.manual_payments') IS NOT NULL THEN
         UPDATE manual_payments SET plan_id = 'pro' WHERE plan_id IS NULL OR plan_id = '';
       END IF;
     END $$`,

  // The price of a plan on one rail. A legacy row has no plan, and one price
  // per rail and currency is all the new model keeps.
  `DO $$
     BEGIN
       IF to_regclass('public.prices') IS NOT NULL THEN
         DELETE FROM prices p
          USING prices q
          WHERE p.provider = q.provider
            AND p.currency = q.currency
            AND p.id <> q.id
            AND (p.plan_id IS NULL OR q.plan_id IS NULL);
         UPDATE prices SET plan_id = 'pro' WHERE plan_id IS NULL OR plan_id = '';
       END IF;
     END $$`,

  // A legacy subscription has no period. Its coverage is carried over from
  // the day it was created, and it expires there: the old model let a single
  // payment grant unlimited access, which is exactly what must not survive.
  `DO $$
     BEGIN
       IF to_regclass('public.subscriptions') IS NOT NULL THEN
         UPDATE subscriptions
            SET current_period_start = COALESCE(current_period_start, created_at, now())
          WHERE current_period_start IS NULL;
         UPDATE subscriptions
            SET current_period_end = COALESCE(current_period_end, current_period_start, now())
          WHERE current_period_end IS NULL;
       END IF;
     END $$`,

  // One subscription per customer and plan. The row that covers the longest
  // period is the one that survives. The rows that are dropped are reported
  // before they go, because a dropped row can be a live provider
  // subscription that keeps charging the customer.
  `DO $$
     BEGIN
       IF to_regclass('public.subscriptions') IS NOT NULL THEN
         RAISE NOTICE 'subscriptions dropped by the billing migration: %', (
           SELECT coalesce(json_agg(json_build_object(
             'id', a.id,
             'user_id', a.user_id,
             'provider', a.provider,
             'provider_subscription_id', a.provider_subscription_id,
             'period_end', a.current_period_end
           )), '[]'::json)
             FROM subscriptions a
             JOIN subscriptions b
               ON a.user_id = b.user_id AND a.plan_id = b.plan_id AND a.id <> b.id
            WHERE COALESCE(a.current_period_end, '-infinity'::timestamp)
                < COALESCE(b.current_period_end, '-infinity'::timestamp)
               OR (COALESCE(a.current_period_end, '-infinity'::timestamp)
                   = COALESCE(b.current_period_end, '-infinity'::timestamp)
                   AND a.created_at < b.created_at)
         );
         DELETE FROM subscriptions a
          USING subscriptions b
          WHERE a.user_id = b.user_id
            AND a.plan_id = b.plan_id
            AND a.id <> b.id
            AND (COALESCE(a.current_period_end, '-infinity'::timestamp)
                 < COALESCE(b.current_period_end, '-infinity'::timestamp)
                OR (COALESCE(a.current_period_end, '-infinity'::timestamp)
                    = COALESCE(b.current_period_end, '-infinity'::timestamp)
                    AND a.created_at < b.created_at));
       END IF;
     END $$`,
  `CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_plan_unique
     ON subscriptions (user_id, plan_id)`,

  // The constraints the new model relies on.
  `DO $$
     BEGIN
       IF to_regclass('public.subscriptions') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_plan_id_fkey'
          ) THEN
         ALTER TABLE subscriptions ALTER COLUMN plan_id SET NOT NULL;
         ALTER TABLE subscriptions ALTER COLUMN current_period_start SET NOT NULL;
         ALTER TABLE subscriptions ALTER COLUMN current_period_end SET NOT NULL;
         ALTER TABLE subscriptions
           ADD CONSTRAINT subscriptions_plan_id_fkey
           FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT;
       END IF;
     END $$`,
  `DO $$
     BEGIN
       IF to_regclass('public.manual_payments') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'manual_payments_plan_id_fkey'
          ) THEN
         ALTER TABLE manual_payments ALTER COLUMN plan_id SET NOT NULL;
         ALTER TABLE manual_payments
           ADD CONSTRAINT manual_payments_plan_id_fkey
           FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE RESTRICT;
       END IF;
     END $$`,
  `DO $$
     BEGIN
       IF to_regclass('public.prices') IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM pg_constraint WHERE conname = 'prices_plan_id_fkey'
          ) THEN
         ALTER TABLE prices
           ADD CONSTRAINT prices_plan_id_fkey
           FOREIGN KEY (plan_id) REFERENCES plans (id) ON DELETE CASCADE;
       END IF;
     END $$`,

  // The rails this application does not offer are removed from the enum.
  `DO $$
     BEGIN
       IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'billing_provider')
          AND EXISTS (
            SELECT 1 FROM pg_enum
             WHERE enumtypid = 'billing_provider'::regtype
               AND enumlabel IN ('paddle', 'polar')
          ) THEN
         UPDATE subscriptions SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         UPDATE checkouts SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         UPDATE customers SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         UPDATE invoices SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         UPDATE prices SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         UPDATE usage_events SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         UPDATE license_keys SET provider = 'stripe' WHERE provider IN ('paddle', 'polar');
         ALTER TABLE subscriptions
           ALTER COLUMN provider TYPE text USING provider::text;
         ALTER TABLE checkouts
           ALTER COLUMN provider TYPE text USING provider::text;
         ALTER TABLE customers
           ALTER COLUMN provider TYPE text USING provider::text;
         ALTER TABLE invoices
           ALTER COLUMN provider TYPE text USING provider::text;
         ALTER TABLE prices
           ALTER COLUMN provider TYPE text USING provider::text;
         ALTER TABLE usage_events
           ALTER COLUMN provider TYPE text USING provider::text;
         ALTER TABLE license_keys
           ALTER COLUMN provider TYPE text USING provider::text;
         DROP TYPE billing_provider;
         CREATE TYPE billing_provider AS ENUM ('stripe', 'chargily', 'manual');
         ALTER TABLE subscriptions
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
         ALTER TABLE checkouts
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
         ALTER TABLE customers
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
         ALTER TABLE invoices
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
         ALTER TABLE prices
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
         ALTER TABLE usage_events
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
         ALTER TABLE license_keys
           ALTER COLUMN provider TYPE billing_provider USING provider::billing_provider;
       END IF;
     END $$`,
];

/**
 * Carry an existing database over to the subscription model.
 *
 * The statements are idempotent, so running the script twice is safe.
 */
export async function migrateBillingSubscriptions(): Promise<void> {
  for (const statement of STATEMENTS) {
    await db.execute(sql.raw(statement));
  }
}

function isDirectExecution(): boolean {
  return process.argv.includes("--ghostinit-billing-migration");
}

if (isDirectExecution()) {
  await migrateBillingSubscriptions();
  console.info(JSON.stringify({ scope: "billing-migration", event: "completed" }));
  await pool.end();
}
