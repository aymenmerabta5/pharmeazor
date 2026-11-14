import "server-only";
import {
  BILLING_INTERVALS,
  BILLING_PROVIDER_DEFAULT_CURRENCY,
  DEFAULT_BILLING_PLANS,
  DEFAULT_BILLING_PRICES,
  type BillingInterval,
  type BillingPlanDefinition,
  type BillingPriceDefinition,
  type BillingProviderName,
} from "@repo/billing";

/**
 * A plan as stored in the `plans` table.
 *
 * `interval` is kept as a plain string here because it comes from a database
 * column that also allows `one_time`. The catalog narrows it to a real
 * billing interval before anyone uses it, so an unusable stored plan fails
 * loudly instead of silently granting an undefined period.
 */
export interface BillingPlanRecord {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly tier: number;
  readonly interval: string;
  readonly intervalCount: number;
}

export interface BillingPriceRecord {
  readonly planId: string;
  readonly provider: BillingProviderName;
  /** Price in the minor units of `currency`. */
  readonly amountMinor: number;
  readonly currency: string;
  /**
   * The price id on the provider itself. Null until the price has been
   * created there. Stripe and Chargily need one before a checkout can start;
   * the manual rail charges `amountMinor` directly and needs none.
   */
  readonly providerPriceId: string | null;
}

export interface BillingPlanCatalogPort {
  resolvePlan(planId: string): Promise<BillingPlanRecord & { interval: BillingInterval }>;
  /** Every active plan, ordered by tier. */
  listPlans(): Promise<BillingPlanRecord[]>;
  /** Every price of a plan, one per rail and currency. */
  listPrices(planId: string): Promise<BillingPriceRecord[]>;
  /**
   * The plan a provider price sells.
   *
   * A provider event does not always carry the plan, so the price id on the
   * provider is the fallback way to recognise which plan an event belongs to.
   */
  resolvePlanIdByProviderPrice(input: {
    provider: BillingProviderName;
    providerPriceId: string;
  }): Promise<string | null>;
}

export interface BillingPriceCatalogPort {
  resolvePrice(input: {
    provider: BillingProviderName;
    planId: string;
    currency?: string;
  }): Promise<BillingPriceRecord>;
}

export interface BillingPlanRepositoryPort {
  /** Insert the built-in plans and prices if they are missing. Never overwrites. */
  ensureDefaults(input: {
    plans: readonly BillingPlanDefinition[];
    prices: readonly BillingPriceDefinition[];
  }): Promise<void>;
  findPlanById(planId: string): Promise<BillingPlanRecord | null>;
  findPrice(input: {
    planId: string;
    provider: BillingProviderName;
    currency: string;
  }): Promise<BillingPriceRecord | null>;
  /** Every active plan, ordered by tier. */
  listPlans(): Promise<BillingPlanRecord[]>;
  /** Every price of a plan, keyed by provider. */
  listPrices(planId: string): Promise<BillingPriceRecord[]>;
  /** The plan a provider price sells. */
  findPlanIdByProviderPrice(input: {
    provider: BillingProviderName;
    providerPriceId: string;
  }): Promise<string | null>;
  /**
   * Remember the provider price id of a price row.
   *
   * The id comes from the provider's own dashboard. Storing it makes the
   * price identifiable later, which is how a provider event without a plan
   * is matched back to the plan it bought.
   */
  storeProviderPriceId(input: {
    planId: string;
    provider: BillingProviderName;
    currency: string;
    providerPriceId: string;
  }): Promise<void>;
}

/** A plan id becomes part of an environment variable name, so keep it plain. */
const PLAN_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,48}$/;

export function assertValidPlanId(planId: string): void {
  if (!PLAN_ID_PATTERN.test(planId)) {
    throw new Error(
      `BILLING_PLAN_ID_INVALID: ${planId}. Plan ids use lowercase letters, digits, "-" and "_".`,
    );
  }
}

export function providerPriceEnvironmentName(
  provider: BillingProviderName,
  planId: string,
): string {
  return `BILLING_${provider.toUpperCase()}_${planId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_PRICE_ID`;
}

export function defaultCurrencyForProvider(provider: BillingProviderName): string {
  return BILLING_PROVIDER_DEFAULT_CURRENCY[provider];
}

export function createBillingPlanCatalog(deps: {
  repository: BillingPlanRepositoryPort;
  readEnvironment: (name: string) => string | undefined;
}): BillingPlanCatalogPort & BillingPriceCatalogPort {
  async function ensureDefaults(): Promise<void> {
    await deps.repository.ensureDefaults({
      plans: DEFAULT_BILLING_PLANS,
      prices: DEFAULT_BILLING_PRICES,
    });
  }

  return {
    async resolvePlan(planId: string) {
      assertValidPlanId(planId);
      await ensureDefaults();
      const stored = await deps.repository.findPlanById(planId);
      if (!stored) {
        throw new Error(`BILLING_PLAN_NOT_FOUND: ${planId}`);
      }
      if (!BILLING_INTERVALS.includes(stored.interval as BillingInterval)) {
        throw new Error(
          `BILLING_PLAN_INTERVAL_INVALID: plan ${planId} has interval "${stored.interval}"`,
        );
      }
      if (!Number.isInteger(stored.intervalCount) || stored.intervalCount < 1) {
        throw new Error(`BILLING_PLAN_INTERVAL_COUNT_INVALID: plan ${planId}`);
      }
      return { ...stored, interval: stored.interval as BillingInterval };
    },

    async resolvePrice(input) {
      assertValidPlanId(input.planId);
      await ensureDefaults();
      const currency = (input.currency ?? defaultCurrencyForProvider(input.provider)).toUpperCase();
      const stored = await deps.repository.findPrice({
        planId: input.planId,
        provider: input.provider,
        currency,
      });
      if (!stored) {
        throw new Error(
          `BILLING_PRICE_NOT_FOUND: plan ${input.planId} has no ${input.provider} price in ${currency}.`,
        );
      }
      if (!Number.isSafeInteger(stored.amountMinor) || stored.amountMinor < 1) {
        throw new Error(`BILLING_PRICE_AMOUNT_INVALID: plan ${input.planId}`);
      }
      // The provider price id comes from the provider's own dashboard. It is
      // stored on the price row once it exists, and configured through the
      // environment until then.
      let providerPriceId = stored.providerPriceId;
      if (!providerPriceId || providerPriceId.startsWith("REPLACE_WITH")) {
        const environmentName = providerPriceEnvironmentName(input.provider, input.planId);
        const configured = deps.readEnvironment(environmentName);
        if (!configured || configured.startsWith("REPLACE_WITH")) {
          throw new Error(
            `BILLING_PRICE_NOT_PROVISIONED: ${input.provider} has no price for plan ${input.planId}. ` +
              `Set ${environmentName} or store the provider price id on the prices row.`,
          );
        }
        providerPriceId = configured;
        // Remember the id so the price can be recognised on a provider event
        // that does not carry the plan.
        try {
          await deps.repository.storeProviderPriceId({
            planId: input.planId,
            provider: input.provider,
            currency,
            providerPriceId: configured,
          });
        } catch {
          // The checkout can proceed without it. The id is still configured
          // through the environment, so the price keeps working.
        }
      }
      return { ...stored, providerPriceId };
    },

    async listPlans() {
      await ensureDefaults();
      return deps.repository.listPlans();
    },

    async listPrices(planId: string) {
      assertValidPlanId(planId);
      await ensureDefaults();
      return deps.repository.listPrices(planId);
    },

    async resolvePlanIdByProviderPrice(input) {
      const providerPriceId = input.providerPriceId.trim();
      if (!providerPriceId) return null;
      await ensureDefaults();
      return deps.repository.findPlanIdByProviderPrice({
        provider: input.provider,
        providerPriceId,
      });
    },
  };
}
