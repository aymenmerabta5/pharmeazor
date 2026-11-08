# Manual balance top-ups

Manual payments accept DZD transfers such as BaridiMob or a bank transfer. They can be selected alone, with Chargily, and with at most one of Stripe, Paddle, or Polar.

## Configure the recipient

Edit `packages/billing/src/manual-payment-config.ts`: provide the real receiving account and payment instructions in `receiverInstructions`, choose `allowedMethods`, then set `enabled: true`. Do not put passwords or API secrets in these instructions; signed-in customers can read them. Submissions remain disabled until configured.

Apply the generated database schema with your migration workflow (bun run db:push for local development). Receipt files use the configured private storage driver; production needs durable shared storage and backups.

## Submit and review

A signed-in, active verified customer enters an amount and uploads a PNG, JPEG, or PDF receipt up to 5 MiB. Amounts are stored as integer minor units: 100 equals 1 DZD. The supported maximum per request is 1,000,000 DZD. Each account may have up to 10 pending submissions and 1,000 retained receipts.

Administrators review pending requests from Billing, inspect the private receipt, and approve or reject. Check the actual incoming transfer and reference against your account before approving; a receipt alone cannot establish that a transfer settled. Rejection requires a reason. Administrators cannot review their own submissions. Review history records the reviewer and decision time.

Only approval credits the saved amount. The decision and ledger credit are atomic; retrying a submission or approval does not add a second credit. The balance is a DZD wallet balance. This starter does not automatically exchange it for a subscription or define spending, refunds, or withdrawals.

Receipts are available only to their owner and administrators through authenticated retrieval. They are not public storage URLs. Retention limits do not automatically delete financial records; choose an explicit retention and reconciliation policy for your application.
