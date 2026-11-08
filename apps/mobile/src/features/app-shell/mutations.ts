import { authClient } from "@/lib/auth-client";
export async function signOutMobile(): Promise<void> {
  await authClient.signOut();
}
