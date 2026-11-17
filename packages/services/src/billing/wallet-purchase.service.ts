import "server-only";
import type { Result } from "@repo/kernel";
import { err, ok } from "@repo/kernel";
import { ManualPaymentError } from "@repo/billing/manual";
import { isWalletRequestKey, type WalletRepositoryPort } from "@repo/billing/wallet";
import type { BillingPlanCatalogPort } from "./billing-price-catalog";
import type { BillingExecutor, SubscriptionLifecyclePort } from "./subscription-lifecycle.service";

/**
 * What a customer asks to buy with the balance they already hold.
 *
 * The amount is deliberately absent: the price comes from the catalog, so a
 * caller can never choose how much a plan costs. The request key is the only
 * thing that travels from the client, and it exists so a double submit buys
 * one period rather than two.
 */
export interface WalletPurchaseInput {
  readonly ownerId: string;
  readonly planId: string;
  readonly requestKey: string;
}

export interface WalletPurchaseDto {
  readonly planId: string;
  /** The spendable balance after the purchase. */
  readonly balanceMinor: number;
  /** True when this key had already been settled; nothing was charged again. */
  readonly duplicate: boolean;
  /** The end of the covered period, as an ISO timestamp. */
  readonly periodEnd: string | null;
}

export interface WalletPurchaseDeps {
  readonly repository: WalletRepositoryPort;
  readonly planCatalog: Pick<BillingPlanCatalogPort, "resolvePlan" | "listPrices">;
  readonly lifecycle: SubscriptionLifecyclePort;
}

/**
 * The connection the ledger transaction runs on.
 *
 * The wallet repository owns that transaction, so the subscription a purchase
 * buys has to be written on it. The shape is opaque in the billing package, so
 * it is checked here before it is used.
 */
function asBillingExecutor(executor: unknown): BillingExecutor {
  const candidate = executor as Partial<BillingExecutor> | null;
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    typeof candidate.select !== "function" ||
    typeof candidate.insert !== "function" ||
    typeof candidate.update !== "function"
  ) {
    throw new Error("BILLING_EXECUTOR_INVALID: the wallet connection cannot write subscriptions");
  }
  return executor as BillingExecutor;
}

/**
 * The DZD price of a plan on the balance rail.
 *
 * The wallet settles in DZD, so the manual price is the one the balance pays.
 * `listPrices` is used rather than `resolvePrice` because the latter also
 * insists on a provider price id, which a transfer never has.
 */
function walletPrice(
  prices: Awaited<ReturnType<BillingPlanCatalogPort["listPrices"]>>,
  planId: string,
): number {
  const price = prices.find((entry) => entry.provider === "manual" && entry.currency === "DZD");
  if (!price || !Number.isSafeInteger(price.amountMinor) || price.amountMinor < 1) {
    throw new ManualPaymentError(
      "NOT_CONFIGURED",
      `The balance cannot buy plan ${planId}: no DZD price is configured`,
    );
  }
  return price.amountMinor;
}

/**
 * Buy one period of a plan with the wallet balance.
 *
 * The debit and the subscription are written in one transaction: a failure to
 * grant rolls the debit back, so credit is never spent without the access it
 * paid for. A replayed request key returns the current balance instead of
 * charging again.
 */
export async function purchasePlanWithBalanceService(
  input: WalletPurchaseInput,
  deps: WalletPurchaseDeps,
): Promise<Result<WalletPurchaseDto, Error>> {
  try {
    if (!isWalletRequestKey(input.requestKey)) {
      throw new ManualPaymentError("INVALID_INPUT", "A valid purchase key is required");
    }
    const plan = await deps.planCatalog.resolvePlan(input.planId);
    const amountMinor = walletPrice(await deps.planCatalog.listPrices(plan.id), plan.id);
    const paidAt = new Date();
    const result = await deps.repository.purchase(
      {
        ownerId: input.ownerId,
        planId: plan.id,
        amountMinor,
        requestKey: input.requestKey,
      },
      async (executor) => {
        const outcome = await deps.lifecycle.grantPaidPeriod({
          userId: input.ownerId,
          planId: plan.id,
          provider: "manual",
          // A wallet purchase has no provider record of its own, so the
          // request key is the durable reference an audit can follow back.
          providerSubscriptionId: `wallet-${input.requestKey}`,
          paidAt,
          providerEventAt: paidAt,
          metadata: { walletRequestKey: input.requestKey, rail: "wallet" },
          executor: asBillingExecutor(executor),
        });
        if (outcome.outcome !== "applied") {
          throw new Error(
            `BILLING_WALLET_GRANT_${outcome.outcome.toUpperCase()}: the purchase could not grant its period`,
          );
        }
        return outcome.subscription.periodEnd.toISOString();
      },
    );
    return ok({
      planId: plan.id,
      balanceMinor: result.balanceMinor,
      duplicate: result.duplicate,
      periodEnd: result.periodEnd,
    });
  } catch (error) {
    return err(error instanceof Error ? error : new Error(String(error)));
  }
}
