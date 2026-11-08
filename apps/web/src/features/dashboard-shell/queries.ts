"use client";
import { authClient } from "@/lib/auth-client";
import { readNavbarUser } from "./navbar-user";
export function useNavbarUser() {
  const { data: session } = authClient.useSession();
  return readNavbarUser(session);
}
