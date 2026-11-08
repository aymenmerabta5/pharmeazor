"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "@repo/services/application";

const id = z.string().min(1);
const role = z.enum(["owner", "admin", "member"]);
const organization = z.object({ organizationId: id });
const team = z.object({ organizationId: id, teamId: id });
const membership = z.object({ organizationId: id, membershipId: id });
const teamMembership = z.object({ organizationId: id, teamId: id, userId: id });

async function application() {
  return createRequestApplicationForRequest(new Headers(await headers()));
}
function changed(): void {
  revalidatePath("/settings/workspace");
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new Error("Invalid workspace operation input");
  return result.data;
}

export async function createOrganizationAction(input: unknown) {
  const value = parse(
    z.object({
      name: z.string().trim().min(1).max(120),
      slug: z
        .string()
        .trim()
        .min(2)
        .max(80)
        .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i),
    }),
    input,
  );
  const result = await (await application()).identity.organizations.create(value);
  changed();
  return result;
}
export async function setActiveOrganizationAction(input: unknown) {
  const result = await (
    await application()
  ).identity.organizations.setActive(parse(organization, input));
  changed();
  return result;
}
export async function createTeamAction(input: unknown) {
  const result = await (
    await application()
  ).identity.teams.create(
    parse(z.object({ organizationId: id, name: z.string().trim().min(1).max(100) }), input),
  );
  changed();
  return result;
}
export async function setActiveTeamAction(input: unknown) {
  const result = await (await application()).identity.teams.setActive(parse(team, input));
  changed();
  return result;
}
export async function createInvitationAction(input: unknown) {
  const result = await (
    await application()
  ).identity.invitations.create(
    parse(z.object({ organizationId: id, email: z.string().email(), role }), input),
  );
  changed();
  return result;
}
export async function cancelInvitationAction(input: unknown) {
  const result = await (
    await application()
  ).identity.invitations.cancel(parse(z.object({ invitationId: id }), input));
  changed();
  return result;
}
export async function acceptInvitationAction(input: unknown) {
  const result = await (
    await application()
  ).identity.invitations.accept(parse(z.object({ invitationId: id }), input));
  changed();
  return result;
}
export async function changeMemberRoleAction(input: unknown) {
  const result = await (
    await application()
  ).identity.organizations.changeMemberRole(parse(membership.extend({ role }), input));
  changed();
  return result;
}
export async function removeMemberAction(input: unknown) {
  const result = await (
    await application()
  ).identity.organizations.removeMember(parse(membership, input));
  changed();
  return result;
}
export async function addTeamMemberAction(input: unknown) {
  const result = await (await application()).identity.teams.addMember(parse(teamMembership, input));
  changed();
  return result;
}
export async function removeTeamMemberAction(input: unknown) {
  const result = await (
    await application()
  ).identity.teams.removeMember(parse(teamMembership, input));
  changed();
  return result;
}
