/**
 * Schema barrel — split for <300 compliance.
 * Re-exports enums + all table modules via explicit named exports (no export *).
 */
export {
  billingProviderEnum,
  subscriptionStatusEnum,
  checkoutStatusEnum,
  invoiceStatusEnum,
  licenseKeyStatusEnum,
  recurringIntervalEnum,
} from "./enums";

export { products, prices, productRelations, priceRelations } from "./tables/products";
export { plans } from "./tables/plans";
export { customers } from "./tables/customers";
export { subscriptions, subscriptionRelations } from "./tables/subscriptions";
export { checkouts, checkoutRelations } from "./tables/checkouts";
export { invoices, invoiceRelations } from "./tables/invoices";
export { license_keys, licenseKeyRelations } from "./tables/license_keys";
export { usage_events } from "./tables/usage_events";
export { webhook_events } from "./tables/webhook_events";

import { relations } from "drizzle-orm";
import { customers } from "./tables/customers";
import { subscriptions } from "./tables/subscriptions";
import { checkouts } from "./tables/checkouts";
import { invoices } from "./tables/invoices";

export const customerRelations = relations(customers, ({ many }) => ({
  subscriptions: many(subscriptions),
  checkouts: many(checkouts),
  invoices: many(invoices),
}));
