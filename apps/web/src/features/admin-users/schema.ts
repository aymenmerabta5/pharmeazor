import { z } from "zod";
import type { AdminUsersTranslate } from "./translations";

export const adminUserRoleSchema = z.enum(["user", "admin"]);

export function adminUsersFilterSchema(translate: AdminUsersTranslate) {
  return z.object({
    search: z.string().trim().max(120, translate("validation.searchTooLong")),
  });
}

export function createAdminUserSchema(translate: AdminUsersTranslate) {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, translate("validation.nameRequired"))
      .max(80, translate("validation.nameTooLong")),
    email: z.string().trim().email(translate("validation.emailInvalid")),
    password: z
      .string()
      .min(8, translate("validation.passwordTooShort"))
      .max(128, translate("validation.passwordTooLong")),
    role: adminUserRoleSchema,
  });
}

export type AdminUserRole = z.infer<typeof adminUserRoleSchema>;
export type AdminUsersFilterInput = z.infer<ReturnType<typeof adminUsersFilterSchema>>;
export type CreateAdminUserInput = z.infer<ReturnType<typeof createAdminUserSchema>>;
