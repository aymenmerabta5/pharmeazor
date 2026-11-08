import { useQuery } from "@tanstack/react-query";
import { orpc } from "@/lib/orpc";
export const manualSummaryOptions = (enabled: boolean) =>
  orpc.billing.manual.summary.queryOptions({ enabled });
export const manualHistoryOptions = (enabled: boolean) =>
  orpc.billing.manual.list.queryOptions({ enabled });
export function useManualSummaryQuery(enabled: boolean) {
  return useQuery(manualSummaryOptions(enabled));
}
export function useManualHistoryQuery(enabled: boolean) {
  return useQuery(manualHistoryOptions(enabled));
}
