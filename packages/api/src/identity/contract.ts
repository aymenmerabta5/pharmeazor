import { identityInvitationContracts } from "./invitation-contracts";
import { identityOrganizationContracts } from "./organization-contracts";
import { identitySessionContracts } from "./session-contracts";
import { identityTeamContracts } from "./team-contracts";

export const identityContract = {
  sessions: identitySessionContracts,
  organizations: identityOrganizationContracts,
  invitations: identityInvitationContracts,
  teams: identityTeamContracts,
};
