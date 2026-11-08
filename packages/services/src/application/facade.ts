import "server-only";
import type { admin as adminCapability, identity as identityCapability } from "@repo/services";
type AdminActor = adminCapability.AdminActor;
type AdminService = adminCapability.AdminService;
type IdentityActor = identityCapability.IdentityActor;
type IdentityService = identityCapability.IdentityService;
type IdentitySession = identityCapability.IdentitySession;
type Organization = identityCapability.Organization;
type OrganizationInvitation = identityCapability.OrganizationInvitation;
type OrganizationMembership = identityCapability.OrganizationMembership;
type OrganizationTeam = identityCapability.OrganizationTeam;
type TeamMembership = identityCapability.TeamMembership;

import type { manualPaymentServiceContract } from "@repo/services";
type ManualPaymentService = typeof manualPaymentServiceContract;
import { RequestApplicationError } from "./errors";
import type {
  BillingCheckoutDto,
  BillingCheckoutInput,
  BillingPaymentLinkInput,
  BillingPortalInput,
  CurrentRequestDto,
  RequestPrincipal,
} from "./types";

export interface BillingApplicationPort {
  subscriptions(userId: string): Promise<{
    subscriptions: readonly unknown[];
    invoices: readonly unknown[];
    usageEvents: readonly unknown[];
    licenseKeys: readonly unknown[];
  }>;
  createCheckout(
    principal: RequestPrincipal,
    input: BillingCheckoutInput,
  ): Promise<BillingCheckoutDto>;
  createPortalSession(
    principal: RequestPrincipal,
    input: BillingPortalInput,
  ): Promise<{ url: string }>;
  createPaymentLink(
    principal: RequestPrincipal,
    input: BillingPaymentLinkInput,
  ): Promise<{ id: string; url: string }>;
}

export interface RequestApplicationDependencies {
  readonly principal: RequestPrincipal | null;
  readonly rateLimit: (key: string, limit: number, windowMs: number) => Promise<void>;
  readonly admin: AdminService;
  readonly identity: IdentityService;
  readonly billing: BillingApplicationPort;
  readonly manualBilling: ManualPaymentService;
}

function requireActivePrincipal(principal: RequestPrincipal | null): RequestPrincipal {
  if (!principal)
    throw new RequestApplicationError("APPLICATION_UNAUTHENTICATED", "Authentication is required");
  if (principal.banned)
    throw new RequestApplicationError("APPLICATION_ACCOUNT_SUSPENDED", "Account suspended");
  return principal;
}

function requireVerifiedPrincipal(principal: RequestPrincipal | null): RequestPrincipal {
  const active = requireActivePrincipal(principal);
  if (!active.emailVerified)
    throw new RequestApplicationError("APPLICATION_EMAIL_NOT_VERIFIED", "Verified email required");
  return active;
}

function requireAdminPrincipal(principal: RequestPrincipal): RequestPrincipal {
  if (principal.role !== "admin" && principal.role !== "superAdmin") {
    throw new RequestApplicationError(
      "APPLICATION_ADMIN_REQUIRED",
      "Administrator access is required",
    );
  }
  return principal;
}

function adminActor(principal: RequestPrincipal): AdminActor {
  return {
    id: principal.identityUserId,
    role: principal.role === "admin" || principal.role === "superAdmin" ? "admin" : "user",
    banned: principal.banned,
  };
}

function identityActor(principal: RequestPrincipal): IdentityActor {
  return {
    userId: principal.userId,
    sessionId: principal.sessionId,
    email: principal.email,
    emailVerified: principal.emailVerified,
    authenticatedAt: principal.authenticatedAt,
    activeOrganizationId: principal.activeOrganizationId,
    activeTeamId: principal.activeTeamId,
  };
}

function publicValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(publicValue);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const result: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(source)) {
    if (key === "userId" || key === "pushToken" || key === "tokenFingerprint") continue;
    result[key === "_id" && !("id" in source) ? "id" : key] = publicValue(entry);
  }
  return result;
}

function publicRecord(value: unknown): Readonly<Record<string, unknown>> {
  const result = publicValue(value);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new RequestApplicationError("APPLICATION_INTERNAL_ERROR", "Application data is invalid");
  }
  return result as Readonly<Record<string, unknown>>;
}

function toIdentitySessionDto(value: IdentitySession) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    authenticatedAt: value.authenticatedAt.toISOString(),
    expiresAt: value.expiresAt.toISOString(),
    revokedAt: value.revokedAt?.toISOString() ?? null,
    activeOrganizationId: value.activeOrganizationId ?? null,
    activeTeamId: value.activeTeamId ?? null,
  };
}
function toOrganizationDto(value: Organization) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function toOrganizationMembershipDto(value: OrganizationMembership) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function toOrganizationInvitationDto(value: OrganizationInvitation) {
  return {
    ...value,
    expiresAt: value.expiresAt.toISOString(),
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function toOrganizationTeamDto(value: OrganizationTeam) {
  return {
    ...value,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  };
}
function toTeamMembershipDto(value: TeamMembership) {
  return { ...value, createdAt: value.createdAt.toISOString() };
}

export function createRequestApplication(dependencies: RequestApplicationDependencies) {
  return {
    principal: dependencies.principal,
    async me(): Promise<CurrentRequestDto> {
      const principal = dependencies.principal;
      return {
        user: principal
          ? {
              id: principal.userId,
              email: principal.email,
              name: principal.name,
              role: principal.role,
              banned: principal.banned,
            }
          : null,
        sessionId: principal?.sessionId ?? null,
        activeOrganizationId: principal?.activeOrganizationId ?? null,
        activeTeamId: principal?.activeTeamId ?? null,
      };
    },
    admin: {
      listUsers: async (input: Parameters<AdminService["listUsers"]>[1]) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:list:" + principal.userId, 20, 60_000);
        return await dependencies.admin.listUsers(adminActor(principal), input);
      },
      createUser: async (input: Parameters<AdminService["createUser"]>[1]) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:create:" + principal.userId, 20, 60_000);
        return await dependencies.admin.createUser(adminActor(principal), input);
      },
      changeRole: async (input: { userId: string; role: "user" | "admin" }) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:role:" + principal.userId, 20, 60_000);
        return await dependencies.admin.changeRole(adminActor(principal), input.userId, input.role);
      },
      setBanned: async (input: { userId: string; banned: boolean; reason?: string }) => {
        const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
        await dependencies.rateLimit("admin:ban:" + principal.userId, 20, 60_000);
        return await dependencies.admin.setBanned(
          adminActor(principal),
          input.userId,
          input.banned,
          input.reason,
        );
      },
    },
    identity: {
      workspace: {
        snapshot: async () => {
          const principal = requireActivePrincipal(dependencies.principal);
          await dependencies.rateLimit("identity:workspace:" + principal.userId, 60, 60_000);
          const actor = identityActor(principal);
          const organizations = (await dependencies.identity.organizations.list(actor)).map(
            toOrganizationDto,
          );
          const organizationId = organizations.some(
            (organization) => organization.id === principal.activeOrganizationId,
          )
            ? principal.activeOrganizationId
            : (organizations[0]?.id ?? null);
          if (!organizationId) {
            return {
              organizations,
              organizationId: null,
              teams: [],
              members: [],
              invitations: [],
              teamId: null,
              teamMembers: [],
            };
          }
          const canReadInvitations = await dependencies.identity.organizations.hasPermission(
            actor,
            organizationId,
            "invitation:read",
          );
          const [teams, members, invitations] = await Promise.all([
            dependencies.identity.teams
              .list(actor, organizationId)
              .then((values) => values.map(toOrganizationTeamDto)),
            dependencies.identity.organizations
              .listMembers(actor, organizationId)
              .then((values) => values.map(toOrganizationMembershipDto)),
            canReadInvitations
              ? dependencies.identity.invitations
                  .list(actor, organizationId)
                  .then((values) => values.map(toOrganizationInvitationDto))
              : Promise.resolve([]),
          ]);
          const teamId = teams.some((team) => team.id === principal.activeTeamId)
            ? principal.activeTeamId
            : (teams[0]?.id ?? null);
          const teamMembers = teamId
            ? (await dependencies.identity.teams.listMembers(actor, organizationId, teamId)).map(
                toTeamMembershipDto,
              )
            : [];
          return {
            organizations,
            organizationId,
            teams,
            members,
            invitations,
            teamId,
            teamMembers,
          };
        },
      },
      sessions: {
        list: async () =>
          (
            await dependencies.identity.sessions.list(
              identityActor(requireActivePrincipal(dependencies.principal)),
            )
          ).map(toIdentitySessionDto),
        revoke: async (input: { sessionId: string }) => {
          const result = await dependencies.identity.sessions.revoke(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.sessionId,
          );
          return { ...result, value: toIdentitySessionDto(result.value) };
        },
        revokeOthers: async () =>
          await dependencies.identity.sessions.revokeOthers(
            identityActor(requireActivePrincipal(dependencies.principal)),
          ),
      },
      organizations: {
        list: async () =>
          (
            await dependencies.identity.organizations.list(
              identityActor(requireActivePrincipal(dependencies.principal)),
            )
          ).map(toOrganizationDto),
        create: async (input: { name: string; slug: string }) => {
          const result = await dependencies.identity.organizations.create(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input,
          );
          return { ...result, organization: toOrganizationDto(result.organization) };
        },
        setActive: async (input: { organizationId: string }) =>
          await dependencies.identity.organizations.setActive(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.organizationId,
          ),
        listMembers: async (input: { organizationId: string }) =>
          (
            await dependencies.identity.organizations.listMembers(
              identityActor(requireActivePrincipal(dependencies.principal)),
              input.organizationId,
            )
          ).map(toOrganizationMembershipDto),
        changeMemberRole: async (
          input: Parameters<IdentityService["organizations"]["changeMemberRole"]>[1],
        ) => {
          const result = await dependencies.identity.organizations.changeMemberRole(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input,
          );
          return { ...result, value: toOrganizationMembershipDto(result.value) };
        },
        removeMember: async (
          input: Parameters<IdentityService["organizations"]["removeMember"]>[1],
        ) =>
          await dependencies.identity.organizations.removeMember(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input,
          ),
        hasPermission: async (input: {
          organizationId: string;
          permission: Parameters<IdentityService["organizations"]["hasPermission"]>[2];
        }) => ({
          allowed: await dependencies.identity.organizations.hasPermission(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.organizationId,
            input.permission,
          ),
        }),
      },
      invitations: {
        list: async (input: { organizationId: string }) =>
          (
            await dependencies.identity.invitations.list(
              identityActor(requireActivePrincipal(dependencies.principal)),
              input.organizationId,
            )
          ).map(toOrganizationInvitationDto),
        create: async (input: Parameters<IdentityService["invitations"]["create"]>[1]) => {
          const result = await dependencies.identity.invitations.create(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input,
          );
          return { ...result, invitation: toOrganizationInvitationDto(result.invitation) };
        },
        cancel: async (input: { invitationId: string }) => {
          const result = await dependencies.identity.invitations.cancel(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.invitationId,
          );
          return { ...result, value: toOrganizationInvitationDto(result.value) };
        },
        accept: async (input: { invitationId: string }) => {
          const result = await dependencies.identity.invitations.accept(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.invitationId,
          );
          return { ...result, value: toOrganizationMembershipDto(result.value) };
        },
      },
      teams: {
        list: async (input: { organizationId: string }) =>
          (
            await dependencies.identity.teams.list(
              identityActor(requireActivePrincipal(dependencies.principal)),
              input.organizationId,
            )
          ).map(toOrganizationTeamDto),
        create: async (input: { organizationId: string; name: string }) => {
          const result = await dependencies.identity.teams.create(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.organizationId,
            input.name,
          );
          return { ...result, team: toOrganizationTeamDto(result.team) };
        },
        setActive: async (input: { organizationId: string; teamId: string }) =>
          await dependencies.identity.teams.setActive(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input.organizationId,
            input.teamId,
          ),
        listMembers: async (input: { organizationId: string; teamId: string }) =>
          (
            await dependencies.identity.teams.listMembers(
              identityActor(requireActivePrincipal(dependencies.principal)),
              input.organizationId,
              input.teamId,
            )
          ).map(toTeamMembershipDto),
        addMember: async (input: Parameters<IdentityService["teams"]["addMember"]>[1]) => {
          const result = await dependencies.identity.teams.addMember(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input,
          );
          return { ...result, value: toTeamMembershipDto(result.value) };
        },
        removeMember: async (input: Parameters<IdentityService["teams"]["removeMember"]>[1]) =>
          await dependencies.identity.teams.removeMember(
            identityActor(requireActivePrincipal(dependencies.principal)),
            input,
          ),
      },
    },
    billing: {
      subscriptions: async () => {
        const principal = requireVerifiedPrincipal(dependencies.principal);
        await dependencies.rateLimit("billing:subscriptions:" + principal.userId, 60, 60_000);
        const snapshot = await dependencies.billing.subscriptions(principal.userId);
        return {
          subscriptions: snapshot.subscriptions.map(publicRecord),
          invoices: snapshot.invoices.map(publicRecord),
          usageEvents: snapshot.usageEvents.map(publicRecord),
          licenseKeys: snapshot.licenseKeys.map(publicRecord),
        };
      },
      createCheckout: async (input: BillingCheckoutInput) => {
        const principal = requireVerifiedPrincipal(dependencies.principal);
        await dependencies.rateLimit("billing:checkout:" + principal.userId, 10, 60_000);
        return await dependencies.billing.createCheckout(principal, input);
      },
      createPortalSession: async (input: BillingPortalInput) => {
        const principal = requireVerifiedPrincipal(dependencies.principal);
        await dependencies.rateLimit("billing:portal:" + principal.userId, 20, 60_000);
        return await dependencies.billing.createPortalSession(principal, input);
      },
      createPaymentLink: async (input: BillingPaymentLinkInput) => {
        const principal = requireAdminPrincipal(requireVerifiedPrincipal(dependencies.principal));
        await dependencies.rateLimit("billing:payment-link:" + principal.userId, 10, 60_000);
        return await dependencies.billing.createPaymentLink(principal, input);
      },
      manual: {
        summary: async () => {
          const principal = requireActivePrincipal(dependencies.principal);
          await dependencies.rateLimit("manual:summary:" + principal.userId, 60, 60_000);
          const summary = await dependencies.manualBilling.summary({
            id: principal.userId,
            role: principal.role ?? "user",
          });
          return {
            ...summary,
            allowedMethods: [...summary.allowedMethods],
            canReview: principal.role === "admin" || principal.role === "superAdmin",
          };
        },
        list: async () => {
          const principal = requireActivePrincipal(dependencies.principal);
          await dependencies.rateLimit("manual:list:" + principal.userId, 60, 60_000);
          return await dependencies.manualBilling.list({
            id: principal.userId,
            role: principal.role ?? "user",
          });
        },
        submit: async (input: Parameters<ManualPaymentService["submit"]>[1]) => {
          const principal = requireActivePrincipal(dependencies.principal);
          await dependencies.rateLimit("manual:submit:" + principal.userId, 5, 60_000);
          return await dependencies.manualBilling.submit(
            { id: principal.userId, role: principal.role ?? "user" },
            input,
          );
        },
        reviewQueue: async () => {
          const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
          await dependencies.rateLimit("manual:queue:" + principal.userId, 60, 60_000);
          return await dependencies.manualBilling.reviewQueue({
            id: principal.userId,
            role: principal.role ?? "user",
          });
        },
        receipt: async (input: { id: string }) => {
          const principal = requireActivePrincipal(dependencies.principal);
          await dependencies.rateLimit("manual:receipt:" + principal.userId, 30, 60_000);
          return await dependencies.manualBilling.receipt(
            { id: principal.userId, role: principal.role ?? "user" },
            input.id,
          );
        },
        review: async (input: Parameters<ManualPaymentService["review"]>[1]) => {
          const principal = requireAdminPrincipal(requireActivePrincipal(dependencies.principal));
          await dependencies.rateLimit("manual:review:" + principal.userId, 30, 60_000);
          return await dependencies.manualBilling.review(
            { id: principal.userId, role: principal.role ?? "user" },
            input,
          );
        },
      },
    },
  } as const;
}

export type RequestApplication = ReturnType<typeof createRequestApplication>;
