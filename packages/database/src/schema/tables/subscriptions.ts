import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, subscriptionStatusEnum } from "../enums";
import { prices } from "./products";
import { customers } from "./customers";
import { plans } from "./plans";

/**
 * The subscription of record.
 *
 * There is exactly one row per (user, plan). It is owned by this application,
 * not by a payment provider: Stripe, Chargily and manual transfer all write
 * into this same row, so switching payment method updates the row instead of
 * creating a second subscription.
 *
 * `current_period_end` is the expiry and is never null. A lapsed subscription
 * is a row with a past expiry, not a row with no expiry — that distinction is
 * what stops a single paid checkout from granting permanent access.
 *
 * `auto_renew` records whether the rail charges the customer again without a
 * fresh authorization. Stripe renews on its own; Chargily and manual transfer
 * cannot, so their rows carry `false` and a renewal needs a new payment.
 */
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    /** The plan this row grants. */
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    /** Which rail currently funds this subscription. */
    provider: billingProviderEnum("provider").notNull(),
    /**
     * The rail's own reference for this subscription: the Stripe subscription
     * id, the charged Chargily checkout id, or the approved manual payment id.
     */
    providerSubscriptionId: text("provider_subscription_id").notNull(),
    status: subscriptionStatusEnum("status").notNull(),
    /** Start of the currently covered window. */
    currentPeriodStart: timestamp("current_period_start").notNull(),
    /** End of the currently covered window. This is the expiry. */
    currentPeriodEnd: timestamp("current_period_end").notNull(),
    /**
     * True only when the rail charges the customer again without a fresh
     * authorization.
     */
    autoRenew: boolean("auto_renew").notNull().default(false),
    /** True when the customer asked to stop renewing at the end of the period. */
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    trialEnd: timestamp("trial_end"),
    priceId: uuid("price_id").references(() => prices.id, { onDelete: "set null" }),
    productId: text("product_id"),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    providerEventAt: timestamp("provider_event_at"),
    // Monotonic fencing token for provider-state reads. Every Stripe handler
    // claims a new version before its remote retrieve; a stale fetch can no
    // longer commit after a concurrent cancellation claimed a newer version.
    providerStateVersion: integer("provider_state_version").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    // One subscription per user per plan. Every rail writes into this row.
    uniqueIndex("subscriptions_user_plan_unique").on(t.userId, t.planId),
    uniqueIndex("subscriptions_provider_id_unique").on(t.provider, t.providerSubscriptionId),
    index("subscriptions_user_idx").on(t.userId),
    index("subscriptions_provider_idx").on(t.provider),
    index("subscriptions_status_idx").on(t.status),
    index("subscriptions_plan_idx").on(t.planId),
    index("subscriptions_price_idx").on(t.priceId),
    index("subscriptions_period_end_idx").on(t.currentPeriodEnd),
  ],
);

export const subscriptionRelations = relations(subscriptions, ({ one }) => ({
  price: one(prices, { fields: [subscriptions.priceId], references: [prices.id] }),
  customer: one(customers, { fields: [subscriptions.customerId], references: [customers.id] }),
  plan: one(plans, { fields: [subscriptions.planId], references: [plans.id] }),
}));
