import { authClient } from "@/lib/auth-client";
export function useAuthSessionQuery() {
  return authClient.useSession();
}
