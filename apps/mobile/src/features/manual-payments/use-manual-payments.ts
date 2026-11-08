import { useAuth } from "@/hooks/use-auth";
import { useManualSummaryQuery, useManualHistoryQuery } from "./queries";
export function useManualPayments() {
  const { isAuthenticated } = useAuth();
  const summary = useManualSummaryQuery(isAuthenticated);
  const history = useManualHistoryQuery(isAuthenticated);
  const refresh = () => {
    void summary.refetch();
    void history.refetch();
  };
  return { isAuthenticated, summary, history, refresh };
}
