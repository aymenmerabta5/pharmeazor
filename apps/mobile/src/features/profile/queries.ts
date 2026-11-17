import { authClient } from "@/lib/auth-client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authScopedQueryKey, currentQueryAuthScope } from "@/lib/query-client";
import { orpc } from "@/lib/orpc";

export function useProfileIdentity() {
  const session = authClient.useSession();
  const scope = currentQueryAuthScope(useQueryClient());
  const options = orpc.me.queryOptions();
  const application = useQuery({
    ...options,
    queryKey: scope
      ? authScopedQueryKey(scope, options.queryKey)
      : ["auth", "anonymous", "profile-identity"],
    enabled: Boolean(scope),
  });
  return {
    user: application.data?.user ?? session.data?.user,
    isPending: session.isPending || Boolean(session.data?.user && application.isPending),
  };
}
