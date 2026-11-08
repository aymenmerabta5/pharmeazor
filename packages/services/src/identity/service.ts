import "server-only";

import { createInvitationUseCases } from "./invitations";
import { createOrganizationUseCases } from "./organizations";
import { createSessionUseCases } from "./sessions";
import { createTeamUseCases } from "./teams";
import type { IdentityUseCaseDependencies } from "./application";

export function createIdentityService(dependencies: IdentityUseCaseDependencies) {
  return {
    sessions: createSessionUseCases(dependencies),
    organizations: createOrganizationUseCases(dependencies),
    invitations: createInvitationUseCases(dependencies),
    teams: createTeamUseCases(dependencies),
  };
}

export type IdentityService = ReturnType<typeof createIdentityService>;
