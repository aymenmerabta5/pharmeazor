import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { performBillingAction, type BillingAction } from "./mutations";
export function useBillingActions(refresh: () => void) {
  const action = useAuthOwnedMutation(performBillingAction, {
    onSuccess: (_data, _input, isCurrent) => {
      if (isCurrent()) refresh();
    },
  });
  const submit = async (input: BillingAction): Promise<void> => {
    await action.run(input);
  };
  return { run: action.run, submit, error: action.error, isPending: action.isPending };
}
