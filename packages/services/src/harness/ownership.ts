export interface AgentSessionActor {
  readonly authSessionId: string;
  readonly emailVerified: boolean;
  readonly organizationId: string | null;
  readonly teamId: string | null;
  readonly userId: string;
}

export interface AgentSessionOwnershipRecord {
  readonly createdAt: Date;
  readonly createdByAuthSessionId: string;
  readonly eveSessionId: string;
  readonly organizationId: string | null;
  readonly teamId: string | null;
  readonly retiredAt: Date | null;
  readonly userId: string;
}

export interface ClaimAgentSessionInput {
  readonly actor: AgentSessionActor;
  readonly createdAt: Date;
  readonly eveSessionId: string;
}

export interface AuthorizeAgentSessionInput {
  readonly actor: AgentSessionActor;
  readonly eveSessionId: string;
}

export type AgentSessionClaimResult = "created" | "existing" | "conflict";

export interface AgentSessionOwnershipPort {
  authorize(input: AuthorizeAgentSessionInput): Promise<boolean>;
  claim(input: ClaimAgentSessionInput): Promise<AgentSessionClaimResult>;
  retire(input: AuthorizeAgentSessionInput & { readonly retiredAt: Date }): Promise<boolean>;
}

const EVE_SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;

export function isValidEveSessionId(value: string): boolean {
  return EVE_SESSION_ID_PATTERN.test(value);
}

export function sameAgentSessionOwner(
  record: Pick<AgentSessionOwnershipRecord, "organizationId" | "teamId" | "userId">,
  actor: Pick<AgentSessionActor, "organizationId" | "teamId" | "userId">,
): boolean {
  return (
    record.userId === actor.userId &&
    record.organizationId === actor.organizationId &&
    record.teamId === actor.teamId
  );
}
