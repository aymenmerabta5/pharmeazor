import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { recurringIntervalEnum } from "../enums";

/**
 * Subscription plans.
 *
 * A plan is the entitlement tier: what the customer bought and for how long.
 * It deliberately carries no amount. The same plan is sold in two markets at
 * two different prices, so money lives in `prices`, keyed by (plan, provider).
 *
 * The plan id is what `subscriptions.plan_id` references. It is the one field
 * all three payment rails agree on.
 */
export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    /** Ordering of the tiers, lowest first. */
    tier: integer("tier").notNull().default(0),
    /** How much time a single payment buys. */
    interval: recurringIntervalEnum("interval").notNull(),
    intervalCount: integer("interval_count").notNull().default(1),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("plans_active_idx").on(t.active),
    index("plans_tier_idx").on(t.tier),
    // A plan is bought repeatedly, so a one-time price cannot describe it.
    check("plans_interval_chk", sql`${t.interval} <> 'one_time'`),
    check("plans_interval_count_chk", sql`${t.intervalCount} between 1 and 36`),
    check("plans_tier_chk", sql`${t.tier} >= 0`),
  ],
);
