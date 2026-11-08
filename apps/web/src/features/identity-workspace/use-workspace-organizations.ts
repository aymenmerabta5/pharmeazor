"use client";
import { useAppForm as useForm } from "@/components/ui/form";
import { organizationSchema } from "./schema";
import { useActivateOrganizationMutation, useCreateOrganizationMutation } from "./mutations";
import type { WorkspaceSelection } from "./use-workspace-selection";

export function useWorkspaceOrganizations(selection: WorkspaceSelection) {
  const create = useCreateOrganizationMutation();
  const activate = useActivateOrganizationMutation();
  const organizations = selection.queries.organizations;
  const mutationError = create.error ?? activate.error;
  const form = useForm({
    defaultValues: { name: "", slug: "" },
    validators: { onSubmit: organizationSchema },
    onSubmit: async ({ value }) => {
      const ownsSelection = selection.captureSelection();
      const outcome = await create.run({ name: value.name.trim(), slug: value.slug.trim() });
      if (outcome.status !== "success" || !outcome.isCurrent() || !ownsSelection()) return;
      form.reset();
      selection.selectOrganization(outcome.data.organization.id);
    },
  });
  return {
    form,
    organizations: selection.queries.organizations.data ?? [],
    loading: selection.queries.organizations.isPending,
    ready: selection.queries.organizations.isSuccess,
    organizationId: selection.queries.organizationId,
    select: selection.selectOrganization,
    activate: () => {
      const organizationId = selection.queries.organizationId;
      if (organizationId) void activate.run({ organizationId });
    },
    pending: create.isPending || activate.isPending,
    error: mutationError ?? organizations.error,
    readRecovery:
      !mutationError && organizations.error
        ? {
            pending: organizations.isFetching,
            retry: () => {
              if (!organizations.isFetching) void organizations.refetch({ cancelRefetch: false });
            },
          }
        : null,
  };
}
export type WorkspaceOrganizations = ReturnType<typeof useWorkspaceOrganizations>;
