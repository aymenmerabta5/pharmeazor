# Manual balance top-ups

Manual payment sells credit, not a plan. A customer transfers DZD to your receiving account, submits a receipt, and an administrator approves it. Approval credits the wallet ledger. The customer then spends that balance on any plan at `/checkout`, and the purchase is what grants the subscription.

## Configure the rail

The rail is environment-driven; there is no configuration file to edit. Set these server-only values in `.env.local`:

- `MANUAL_PAYMENTS_ENABLED=true` opens the rail.
- `MANUAL_PAYMENT_INSTRUCTIONS` is the receiving account and the steps the customer should follow. Line breaks are preserved. Signed-in customers can read it, so never put passwords or API secrets here.
- `MANUAL_PAYMENT_METHODS` is a comma-separated list such as `BaridiMob,Bank transfer`.

Submissions stay closed until the rail is enabled, the instructions are non-empty, and at least one method is listed. The top-up form tells the customer the rail is unavailable until then.

## Prepare the database

Apply the schema with your migration workflow (`bun run db:push` for local development). Wallet balance and purchases live in `manual_credit_ledger`; receipts and their decisions live in `manual_payments`. Receipt files use the configured private storage driver, so production needs durable shared storage and backups.

## Customer flow

1. The customer picks a plan on `/pricing` and continues to `/checkout?plan=<id>`.
2. "Pay by transfer" sends them to `/settings/billing#topup`.
3. They enter the amount they transferred (100 to 1,000,000 DZD) and upload a PNG, JPEG, or PDF receipt up to 5 MiB, with an optional method and transfer reference.
4. The receipt is pending. The balance does not change yet.
5. An administrator reviews it at `/admin/payments`. Only approval credits the wallet.
6. The customer returns to `/checkout?plan=<id>` and pays from the balance. The purchase debits the ledger and creates a `manual` subscription with `autoRenew: false` that ends one period later.

## Wallet ledger and idempotency

The balance is `SUM(amount_minor)` over the account's ledger rows. Top-ups are positive rows, each keyed by its payment id, so approving the same receipt twice cannot credit twice. Purchases are negative rows carrying the plan id and a client request key; replaying the same key returns the settled result instead of charging again.

The plan price is always resolved on the server from the plan's manual DZD price. The browser sends only `planId` and `requestKey`, so a tampered request cannot buy a plan at a price of its own choosing. A purchase that fails for insufficient funds leaves the balance untouched.

## Limits

- Amounts are stored as integer minor units: 100 equals 1 DZD. The minimum top-up is 100 DZD and the maximum is 1,000,000 DZD.
- An account may have up to 10 pending submissions and 1,000 retained receipts.
- Receipts must be PNG, JPEG, or PDF and no larger than 5 MiB.

## Review policy

Check the actual incoming transfer against the receipt, the amount, and the reference before approving. A receipt alone cannot establish that a transfer settled. Rejection requires a reason and leaves the balance unchanged, and administrators cannot review their own submissions. Every decision records the reviewer and the decision time.

## Operational notes

- Approval and the ledger credit are atomic. Retrying either the submission or the approval does not create a second credit.
- Manual subscriptions do not auto-renew. The customer buys another period when the current one ends.
- Refunds and withdrawals are not implemented. Retained financial records are not deleted automatically, so choose an explicit retention and reconciliation policy.
- Receipts are available only to their owner and to administrators through authenticated retrieval, never as public storage URLs.
- Stripe and Chargily are configured separately with their provider keys and price ids. The wallet settles in DZD only.
