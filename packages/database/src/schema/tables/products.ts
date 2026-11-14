import {
  pgTable,
  uuid,
  text,
  varchar,
  bigint,
  timestamp,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { billingProviderEnum, recurringIntervalEnum } from "../enums";
import { plans } from "./plans";

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  provider: billingProviderEnum("provider").notNull(),
  providerProductId: text("provider_product_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/**
 * What a plan costs on one rail.
 *
 * A plan is sold in two markets: USD for the international card rails and DZD
 * for the Algerian market. The same plan therefore has one price row per
 * provider, and the currency is a property of the rail rather than of the
 * plan.
 *
 * `providerPriceId` is null until the price exists on the provider itself.
 * Stripe and Chargily need a real provider price id before a checkout can be
 * created; the manual rail needs none and charges the amount below directly.
 */
export const prices = pgTable(
  "prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
    /** The plan this price sells. */
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    amount: bigint("amount", { mode: "number" }).notNull(),
    currency: varchar("currency", { length: 10 }).notNull(),
    provider: billingProviderEnum("provider").notNull(),
    providerPriceId: text("provider_price_id"),
    recurring: recurringIntervalEnum("recurring"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("prices_plan_provider_currency_unique").on(t.planId, t.provider, t.currency),
    index("prices_provider_idx").on(t.provider),
    index("prices_plan_idx").on(t.planId),
    index("prices_product_idx").on(t.productId),
  ],
);

export const productRelations = relations(products, ({ many }) => ({
  prices: many(prices),
}));

export const priceRelations = relations(prices, ({ one }) => ({
  product: one(products, { fields: [prices.productId], references: [products.id] }),
  plan: one(plans, { fields: [prices.planId], references: [plans.id] }),
}));
