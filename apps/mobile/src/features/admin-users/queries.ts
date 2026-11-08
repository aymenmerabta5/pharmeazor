import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { orpc } from "@/lib/orpc";
export function useAdminIdentity() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const application = useQuery(orpc.me.queryOptions({ enabled: Boolean(session?.user) }));
  const role = application.data?.user?.role ?? "user";
  return {
    sessionPending,
    hasSession: Boolean(session?.user),
    applicationPending: application.isPending,
    isAdmin: role === "admin" || role === "superAdmin",
  };
}
export function useAdminUsers(search: string, isAdmin: boolean) {
  return useQuery(
    orpc.adminUsers.list.queryOptions({
      input: { search: search.trim() || undefined, page: 1, limit: 50 },
      enabled: isAdmin,
    }),
  );
}
