/**
 * Billing schema surface.
 *
 * These tables are DEFINED in the database layer and re-exported here so billing
 * code can import them from one place. Do not redeclare them — a second pgTable
 * for the same physical table drifts from the first and confuses drizzle-kit.
 */
export {
  billingProviderEnum,
  subscriptionStatusEnum,
  checkoutStatusEnum,
  invoiceStatusEnum,
  licenseKeyStatusEnum,
  recurringIntervalEnum,
  products,
  prices,
  productRelations,
  priceRelations,
  plans,
  customers,
  customerRelations,
  subscriptions,
  subscriptionRelations,
  checkouts,
  checkoutRelations,
  invoices,
  invoiceRelations,
  license_keys,
  licenseKeyRelations,
  usage_events,
  webhook_events,
} from "@repo/database/schema";
