"use server";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createRequestApplicationForRequest } from "@repo/services/application";

const roleSchema = z.enum(["user", "admin"]);
const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  role: roleSchema,
});
const roleChangeSchema = z.object({ userId: z.string().min(1), role: roleSchema });
const bannedChangeSchema = z.object({ userId: z.string().min(1), banned: z.boolean() });
type AdminActionResult = { ok: true } | { ok: false; error: string };
async function actionApplication() {
  return createRequestApplicationForRequest(new Headers(await headers()));
}
function failure(): AdminActionResult {
  return { ok: false, error: "Admin operation failed" };
}

export async function createAdminUserAction(input: unknown): Promise<AdminActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid admin user input" };
  try {
    await (await actionApplication()).admin.createUser(parsed.data);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return failure();
  }
}
export async function changeAdminUserRoleAction(input: unknown): Promise<AdminActionResult> {
  const parsed = roleChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid role update" };
  try {
    await (await actionApplication()).admin.changeRole(parsed.data);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return failure();
  }
}
export async function setAdminUserBannedAction(input: unknown): Promise<AdminActionResult> {
  const parsed = bannedChangeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid ban update" };
  try {
    await (await actionApplication()).admin.setBanned(parsed.data);
    revalidatePath("/admin/users");
    return { ok: true };
  } catch {
    return failure();
  }
}
