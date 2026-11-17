import "server-only";

export interface RequestPrincipal {
  readonly userId: string;
  readonly identityUserId: string;
  readonly sessionId: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string | null;
  readonly role: string | null;
  readonly banned: boolean;
  readonly authenticatedAt: Date;
  readonly activeOrganizationId: string | null;
  readonly activeTeamId: string | null;
}

export interface CurrentUserDto {
  readonly id: string;
  readonly email: string;
  readonly name: string | null;
  readonly role: string | null;
  readonly banned: boolean;
}

export interface CurrentRequestDto {
  readonly user: CurrentUserDto | null;
  readonly sessionId: string | null;
  readonly activeOrganizationId: string | null;
  readonly activeTeamId: string | null;
}

export interface ConversationDto {
  readonly id: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublicRecord = Readonly<Record<string, unknown>>;
export interface BillingSnapshotDto {
  readonly subscriptions: readonly PublicRecord[];
  readonly invoices: readonly PublicRecord[];
  readonly usageEvents: readonly PublicRecord[];
  readonly licenseKeys: readonly PublicRecord[];
  readonly plans: readonly PublicRecord[];
}

export interface BillingCheckoutInput {
  readonly provider: "stripe" | "chargily";
  readonly planId: string;
  readonly successUrl: string;
  readonly failureUrl?: string;
  readonly cancelUrl?: string;
  readonly quantity?: number;
  readonly requestKey: string;
  readonly currency?: string;
}

export interface BillingCheckoutDto {
  readonly id: string;
  readonly url: string;
  readonly provider: "stripe" | "chargily";
  readonly status: string;
  readonly planId: string;
}

/**
 * Paying for a plan with the balance the customer already holds.
 *
 * Only the plan and a replay key come from the client. The amount is read from
 * the catalog, so a caller cannot decide how much a plan costs.
 */
export interface BillingBalancePurchaseInput {
  readonly planId: string;
  readonly requestKey: string;
}

export interface BillingBalancePurchaseDto {
  readonly planId: string;
  readonly balanceMinor: number;
  readonly duplicate: boolean;
  readonly periodEnd: string | null;
}

export interface BillingPortalInput {
  readonly provider: "stripe";
  readonly returnUrl: string;
}

export interface BillingPaymentLinkInput {
  readonly provider: "chargily";
  /** The plan the link sells. */
  readonly planId: string;
  readonly name: string;
  readonly quantity?: number;
  readonly afterCompletionMessage?: string;
}
