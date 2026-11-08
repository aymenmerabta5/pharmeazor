import { authClient } from "@/lib/auth-client";
export function useHeaderIdentity() {
  const { data: session, isPending } = authClient.useSession();
  return { user: session?.user, isPending };
}
