import { useAuthOwnedMutation } from "@/hooks/use-auth-owned-mutation";
import { openManualBillingWeb } from "./mutations";
export function useManualWebHandoff() {
  const handoff = useAuthOwnedMutation((_input: undefined, isCurrent: () => boolean) =>
    openManualBillingWeb(isCurrent),
  );
  const open = async (): Promise<void> => {
    await handoff.run(undefined);
  };
  return { pending: handoff.isPending, error: Boolean(handoff.error), open };
}
