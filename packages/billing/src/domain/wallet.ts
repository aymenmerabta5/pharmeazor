/**
 * The wallet contract.
 *
 * Credit is bought by transfer and spent on a plan. The ledger is the source
 * of truth: a top-up is a positive row, a purchase is a negative row, and the
 * balance is their sum. Nothing here touches a provider SDK.
 */

/** The idempotency key a purchase uses. It is also the debit row's unique key. */
export const WALLET_REQUEST_KEY_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

export function isWalletRequestKey(value: string): boolean {
  return WALLET_REQUEST_KEY_PATTERN.test(value);
}

export interface WalletPurchaseCommand {
  readonly ownerId: string;
  readonly planId: string;
  /** The plan's manual price in DZD minor units. Resolved server-side. */
  readonly amountMinor: number;
  readonly requestKey: string;
}

export interface WalletPurchaseResult {
  /** The balance after the purchase, or the current balance on a replay. */
  readonly balanceMinor: number;
  /** True when this request key had already been settled. */
  readonly duplicate: boolean;
  /** The end of the period the purchase bought; null on a replay. */
  readonly periodEnd: string | null;
}

/**
 * Grant the subscription inside the ledger transaction.
 *
 * The repository owns the transaction, so it hands the connection to this
 * callback. A throw rolls the debit back, which is what keeps the balance and
 * the access consistent.
 */
export type WalletGrant = (executor: unknown) => Promise<string>;

export interface WalletRepositoryPort {
  purchase(command: WalletPurchaseCommand, grant: WalletGrant): Promise<WalletPurchaseResult>;
  /** The sum of the signed ledger for one account. */
  balance(ownerId: string): Promise<number>;
}
