import {
  createPortalSessionService,
  validateBillingRedirectUrl,
  type BillingPortalProviderName,
  type PortalCustomerRepositoryPort,
  type PortalProviderPort,
  type PortalSessionRecord,
  type CreatePortalSessionOutput,
} from "@repo/services/billing";

export interface CreatePortalSessionUseCaseInput {
  provider: BillingPortalProviderName;
  actorId: string;
  returnUrl: string;
}

export type { PortalSessionRecord };

export async function createPortalSessionUseCase(
  input: CreatePortalSessionUseCaseInput,
  deps: {
    billingProvider: PortalProviderPort;
    customerRepository: PortalCustomerRepositoryPort;
  },
): Promise<CreatePortalSessionOutput> {
  const returnUrl = validateBillingRedirectUrl(
    input.returnUrl,
    "Portal return URL",
    (name) => process.env[name],
  );
  if (!returnUrl.ok) return returnUrl;
  return createPortalSessionService({ ...input, returnUrl: returnUrl.value }, deps);
}
