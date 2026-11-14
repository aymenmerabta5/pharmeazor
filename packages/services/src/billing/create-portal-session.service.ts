import "server-only";
import type { Result } from "@repo/kernel";
import { err } from "@repo/kernel";
import { ServiceError } from "../errors";
import type { BillingPortalProviderName } from "@repo/billing";
export type { BillingPortalProviderName };
export type BillingProviderName = BillingPortalProviderName;
export type BillingPortalErrorCode =
  | "NOT_SUPPORTED"
  | "CUSTOMER_NOT_FOUND"
  | "PORTAL_FAILED"
  | "INVALID_REDIRECT";
/**
 * Rails that host a self-service portal.
 *
 * Stripe is the only one. Chargily is checkout-only and manual transfer has
 * no provider at all, so neither can offer a portal.
 */
const PORTAL_PROVIDERS: readonly BillingPortalProviderName[] = ["stripe"];
export interface PortalSessionRecord {
  url: string;
}
export interface PortalProviderPort {
  createPortalSession?(input: {
    customerId: string;
    returnUrl: string;
  }): Promise<PortalSessionRecord>;
}
export interface PortalCustomerRepositoryPort {
  findProviderCustomerId(input: {
    actorId: string;
    provider: BillingProviderName;
  }): Promise<string | null>;
}
export interface CreatePortalSessionInput {
  provider: BillingProviderName;
  actorId: string;
  returnUrl: string;
}
export interface CreatePortalSessionDeps {
  billingProvider: PortalProviderPort;
  customerRepository: PortalCustomerRepositoryPort;
}
export type CreatePortalSessionOutput = Result<
  PortalSessionRecord,
  ServiceError<BillingPortalErrorCode>
>;
export async function createPortalSessionService(
  input: CreatePortalSessionInput,
  deps: CreatePortalSessionDeps,
): Promise<CreatePortalSessionOutput> {
  if (!PORTAL_PROVIDERS.includes(input.provider) || !deps.billingProvider.createPortalSession) {
    return err(
      new ServiceError("NOT_SUPPORTED", `${input.provider} does not support a customer portal`),
    );
  }
  try {
    const customerId = await deps.customerRepository.findProviderCustomerId({
      actorId: input.actorId,
      provider: input.provider,
    });
    if (!customerId) {
      return err(
        new ServiceError(
          "CUSTOMER_NOT_FOUND",
          `No ${input.provider} customer belongs to the authenticated user`,
        ),
      );
    }
    const session = await deps.billingProvider.createPortalSession({
      customerId,
      returnUrl: input.returnUrl,
    });
    return { ok: true, value: session };
  } catch (e) {
    return err(
      new ServiceError("PORTAL_FAILED", "Unable to create customer portal session", { cause: e }),
    );
  }
}
