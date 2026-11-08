const ENGLISH_STATUS_LABELS = {
  subscriptionStatusActive: "Active",
  subscriptionStatusTrialing: "Trial",
  subscriptionStatusPastDue: "Payment overdue",
  subscriptionStatusCanceled: "Canceled",
  subscriptionStatusUnpaid: "Unpaid",
  subscriptionStatusIncomplete: "Incomplete",
  subscriptionStatusIncompleteExpired: "Incomplete, expired",
  subscriptionStatusPaused: "Paused",
  subscriptionStatusExpired: "Expired",
  subscriptionStatusOnTrial: "On trial",
  subscriptionStatusTrialEnded: "Trial ended",
  subscriptionStatusUnknown: "Unknown status",
  invoiceStatusDraft: "Draft",
  invoiceStatusOpen: "Open",
  invoiceStatusPaid: "Paid",
  invoiceStatusVoid: "Voided",
  invoiceStatusUncollectible: "Uncollectible",
  invoiceStatusUnknown: "Unknown status",
} as const;
export type BillingStatusLabelKey = keyof typeof ENGLISH_STATUS_LABELS;
export type BillingStatusTranslate = (key: BillingStatusLabelKey) => string;
const SUBSCRIPTION_STATUS_KEYS: Readonly<Record<string, BillingStatusLabelKey>> = {
  active: "subscriptionStatusActive",
  trialing: "subscriptionStatusTrialing",
  past_due: "subscriptionStatusPastDue",
  canceled: "subscriptionStatusCanceled",
  unpaid: "subscriptionStatusUnpaid",
  incomplete: "subscriptionStatusIncomplete",
  incomplete_expired: "subscriptionStatusIncompleteExpired",
  paused: "subscriptionStatusPaused",
  expired: "subscriptionStatusExpired",
  on_trial: "subscriptionStatusOnTrial",
  trial_ended: "subscriptionStatusTrialEnded",
};
const INVOICE_STATUS_KEYS: Readonly<Record<string, BillingStatusLabelKey>> = {
  draft: "invoiceStatusDraft",
  open: "invoiceStatusOpen",
  paid: "invoiceStatusPaid",
  void: "invoiceStatusVoid",
  uncollectible: "invoiceStatusUncollectible",
};

function englishStatusLabel(key: BillingStatusLabelKey): string {
  return ENGLISH_STATUS_LABELS[key];
}

export function formatBillingSubscriptionStatus(
  status: unknown,
  translate: BillingStatusTranslate = englishStatusLabel,
): string {
  const key =
    typeof status === "string" && Object.hasOwn(SUBSCRIPTION_STATUS_KEYS, status)
      ? SUBSCRIPTION_STATUS_KEYS[status]
      : undefined;
  return translate(key ?? "subscriptionStatusUnknown");
}

export function formatBillingInvoiceStatus(
  status: unknown,
  translate: BillingStatusTranslate = englishStatusLabel,
): string {
  const key =
    typeof status === "string" && Object.hasOwn(INVOICE_STATUS_KEYS, status)
      ? INVOICE_STATUS_KEYS[status]
      : undefined;
  return translate(key ?? "invoiceStatusUnknown");
}
