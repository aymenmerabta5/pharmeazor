import { useEffect } from "react";
import { AppState } from "react-native";
import { useAuth } from "@/hooks/use-auth";
import { useBillingSnapshotQuery, useBillingIdentityQuery } from "./queries";
import { subscriptionView, invoiceView } from "./model";
export function useBillingSnapshot() {
  const { isAuthenticated } = useAuth();
  const identity = useBillingIdentityQuery(isAuthenticated);
  const snapshot = useBillingSnapshotQuery(isAuthenticated);
  const subscriptions =
    snapshot.data?.subscriptions.flatMap((value) => subscriptionView(value) ?? []) ?? [];
  const invoices = snapshot.data?.invoices.flatMap((value) => invoiceView(value) ?? []) ?? [];
  const role = identity.data?.user?.banned ? null : identity.data?.user?.role;
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active" && isAuthenticated) void snapshot.refetch();
    });
    return () => listener.remove();
  }, [isAuthenticated, snapshot.refetch]);
  const refresh = () => {
    if (isAuthenticated) void snapshot.refetch();
  };
  return {
    subscriptions,
    invoices,
    isAuthenticated,
    isAdmin: role === "admin" || role === "superAdmin",
    isPending: isAuthenticated && snapshot.isPending,
    isRefreshing: snapshot.isFetching,
    readError: snapshot.error,
    refresh,
  };
}
