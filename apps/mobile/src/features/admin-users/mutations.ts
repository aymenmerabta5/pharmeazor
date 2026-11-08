import { useMutation, useQueryClient } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export function useAdminMutations() {
  const client = useQueryClient();
  const refresh = () =>
    client.invalidateQueries({ queryKey: orpc.adminUsers.list.key({ type: "query" }) });
  const createUser = useMutation(orpc.adminUsers.create.mutationOptions({ onSuccess: refresh }));
  const changeRole = useMutation(
    orpc.adminUsers.changeRole.mutationOptions({ onSuccess: refresh }),
  );
  const setBanned = useMutation(orpc.adminUsers.setBanned.mutationOptions({ onSuccess: refresh }));
  return { createUser, changeRole, setBanned };
}
