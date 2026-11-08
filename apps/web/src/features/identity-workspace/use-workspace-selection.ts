"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { useIdentityWorkspaceQueries } from "./queries";
import { workspaceAccess } from "./access";
import type { IdentityWorkspaceInitialData } from "./types";

export function useWorkspaceSelection(initialData?: IdentityWorkspaceInitialData) {
  const [selection, setSelection] = useState<{
    organizationId: string | null;
    teamId: string | null;
  }>({ organizationId: null, teamId: null });
  const queries = useIdentityWorkspaceQueries(
    selection.organizationId,
    selection.teamId,
    initialData,
  );
  const revision = useRef(0);
  useLayoutEffect(() => {
    revision.current += 1;
  }, [queries.organizationId, queries.teamId]);
  const access = workspaceAccess({
    ...queries.permissions,
    organizationId: queries.organizationId,
    teamId: queries.teamId,
    members: queries.members.data ?? [],
    membersReady: queries.members.isSuccess,
    teamMembers: queries.teamMembers.data ?? [],
    teamMembersReady: queries.teamMembers.isSuccess,
  });
  const selectOrganization = (organizationId: string) => {
    revision.current += 1;
    setSelection({ organizationId, teamId: null });
  };
  const selectTeam = (teamId: string) => {
    revision.current += 1;
    setSelection({ organizationId: queries.organizationId, teamId });
  };
  const captureSelection = () => {
    const initial = revision.current;
    return () => revision.current === initial;
  };
  return { queries, access, selectOrganization, selectTeam, captureSelection };
}
export type WorkspaceSelection = ReturnType<typeof useWorkspaceSelection>;
