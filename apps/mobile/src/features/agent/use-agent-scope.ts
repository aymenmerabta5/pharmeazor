import { useAgentOwnership } from "./queries";
export function useAgentScope() {
  const owner = useAgentOwnership();
  return {
    key: owner.generation,
    phase: owner.isPending
      ? ("pending" as const)
      : owner.isAuthenticated
        ? ("authenticated" as const)
        : ("anonymous" as const),
  };
}
