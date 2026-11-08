import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export function useBillingIdentityQuery(enabled: boolean) {
  return useQuery(orpc.me.queryOptions({ enabled }));
}
export function useBillingSnapshotQuery(enabled: boolean) {
  return useQuery(orpc.billing.subscriptions.queryOptions({ enabled }));
}
