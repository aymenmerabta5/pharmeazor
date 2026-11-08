import { authClient } from "@/lib/auth-client";
export function useDashboardIdentity() {
  const { data: session, isPending } = authClient.useSession();
  return { user: session?.user, isPending };
}
