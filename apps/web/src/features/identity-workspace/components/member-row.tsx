"use client";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
// Workspace copy follows the active runtime locale.
import { useSurfaceTranslations } from "@/lib/translations";
import type { WorkspaceMembers } from "../use-workspace-members";
import { organizationRole, type IdentityOrganizationMembership } from "../types";
import { MemberIdentity } from "./member-identity";

export function MemberRow({
  membership,
  model,
}: {
  membership: IdentityOrganizationMembership;
  model: WorkspaceMembers;
}): React.JSX.Element {
  const t = useSurfaceTranslations("workspace");
  const { access, pending, currentUser } = model;
  const roleLabel = (role: string) =>
    t(role === "owner" ? "roles.owner" : role === "admin" ? "roles.admin" : "roles.member");
  const roleItems = access
    .rolesForMember(membership)
    .map((value) => ({ value, label: roleLabel(value) }));
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="space-y-1">
        <MemberIdentity userId={membership.userId} currentUser={currentUser} />
        <p className="text-xs text-muted-foreground">{roleLabel(membership.role)}</p>
      </div>
      {access.canManageMember(membership) ? (
        <div className="flex items-end gap-2">
          <Field>
            <FieldLabel className="sr-only" htmlFor={"member-role-" + membership.id}>
              {t("memberRole")}
            </FieldLabel>
            <Select
              items={roleItems}
              disabled={pending}
              value={membership.role}
              onValueChange={(value) => model.changeRole(membership, organizationRole(value))}
            >
              <SelectTrigger id={"member-role-" + membership.id}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {roleItems.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Button
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => model.remove(membership)}
          >
            {t("remove")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
