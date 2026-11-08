import { z } from "zod";
export const organizationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/i),
});
export const teamSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const teamMemberSchema = z.object({ userId: z.string().min(1) });
export const invitationSchema = z.object({
  email: z.string().trim().email(),
  role: z.enum(["owner", "admin", "member"]),
});
