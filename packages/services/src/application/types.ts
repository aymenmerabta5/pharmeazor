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
}

export interface BillingCheckoutInput {
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly planId: "pro";
  readonly successUrl: string;
  readonly failureUrl?: string;
  readonly cancelUrl?: string;
  readonly quantity?: number;
  readonly requestKey: string;
}

export interface BillingCheckoutDto {
  readonly id: string;
  readonly url: string;
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly status: string;
}

export interface BillingPortalInput {
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly returnUrl: string;
}

export interface BillingPaymentLinkInput {
  readonly provider: "stripe" | "chargily" | "paddle" | "polar";
  readonly name: string;
  readonly items: readonly { readonly price: string; readonly quantity: number }[];
  readonly afterCompletionMessage?: string;
}
