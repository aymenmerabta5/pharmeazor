import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { plans } from "./tables/plans";

/** Receipts belong only to this table. No public storage-object row or URL is created. */
export const manualPayments = pgTable(
  "manual_payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /**
     * The plan a legacy payment bought; null for a wallet top-up.
     *
     * The wallet no longer sells a plan through a receipt. The column stays so
     * an approved pre-wallet payment keeps its audit trail.
     */
    planId: text("plan_id").references(() => plans.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("DZD"),
    status: text("status").notNull().default("uploading"),
    method: text("method").notNull(),
    reference: text("reference"),
    requestKey: text("request_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    receiptKey: text("receipt_key").notNull().unique(),
    receiptHash: text("receipt_hash").notNull().unique(),
    receiptMimeType: text("receipt_mime_type").notNull(),
    receiptOriginalName: text("receipt_original_name").notNull(),
    receiptByteSize: integer("receipt_byte_size").notNull(),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "restrict" }),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("manual_payments_owner_request_unique").on(table.ownerId, table.requestKey),
    index("manual_payments_owner_created_idx").on(table.ownerId, table.createdAt),
    index("manual_payments_status_created_idx").on(table.status, table.createdAt),
    check("manual_payments_amount_chk", sql`${table.amountMinor} between 10000 and 100000000`),
    check("manual_payments_currency_chk", sql`${table.currency} = 'DZD'`),
    check("manual_payments_receipt_size_chk", sql`${table.receiptByteSize} between 8 and 5242880`),
    check(
      "manual_payments_receipt_mime_chk",
      sql`${table.receiptMimeType} in ('image/png', 'image/jpeg', 'application/pdf')`,
    ),
    check(
      "manual_payments_review_chk",
      sql`(${table.status} in ('uploading', 'pending') and ${table.reviewerId} is null and ${table.reviewedAt} is null and ${table.reason} is null) or (${table.status} in ('approved', 'rejected') and ${table.reviewerId} is not null and ${table.reviewerId} <> ${table.ownerId} and ${table.reviewedAt} is not null and (${table.status} <> 'rejected' or (${table.reason} is not null and length(trim(${table.reason})) > 0)))`,
    ),
    check(
      "manual_payments_reason_length_chk",
      sql`${table.reason} is null or length(${table.reason}) <= 500`,
    ),
  ],
);

/**
 * Append-only wallet ledger.
 *
 * A top-up credits the balance and a plan purchase debits it. The balance is
 * always the sum of this table, never a mutable column, so the history and the
 * spendable amount cannot disagree. A payment can create exactly one credit,
 * and a purchase key can create exactly one debit.
 */
export const manualCreditLedger = pgTable(
  "manual_credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** The approved top-up that created this credit; null for a purchase. */
    paymentId: uuid("payment_id")
      .unique()
      .references(() => manualPayments.id, { onDelete: "restrict" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    /** Signed minor units: positive credits, negative debits. */
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("DZD"),
    /** `topup`, `purchase`, or `adjustment` for an operator correction. */
    kind: text("kind").notNull().default("topup"),
    /** The plan a purchase bought; null for a top-up. */
    planId: text("plan_id").references(() => plans.id, { onDelete: "restrict" }),
    /** The idempotency key of a purchase; null on a top-up. */
    requestKey: text("request_key"),
    /** Human-readable audit note for an operator adjustment. */
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("manual_credit_ledger_owner_idx").on(table.ownerId),
    uniqueIndex("manual_credit_ledger_owner_request_unique").on(table.ownerId, table.requestKey),
    check(
      "manual_credit_ledger_amount_chk",
      sql`${table.amountMinor} <> 0 and ${table.amountMinor} between -100000000 and 100000000`,
    ),
    check("manual_credit_ledger_currency_chk", sql`${table.currency} = 'DZD'`),
    check(
      "manual_credit_ledger_kind_chk",
      sql`${table.kind} in ('topup', 'purchase', 'adjustment')`,
    ),
    check(
      "manual_credit_ledger_shape_chk",
      sql`(${table.kind} = 'topup' and ${table.paymentId} is not null and ${table.amountMinor} > 0 and ${table.requestKey} is null) or (${table.kind} = 'purchase' and ${table.paymentId} is null and ${table.amountMinor} < 0 and ${table.requestKey} is not null and ${table.planId} is not null) or (${table.kind} = 'adjustment' and ${table.paymentId} is null and ${table.requestKey} is null and ${table.note} is not null)`,
    ),
    check(
      "manual_credit_ledger_note_length_chk",
      sql`${table.note} is null or length(${table.note}) <= 500`,
    ),
  ],
);
