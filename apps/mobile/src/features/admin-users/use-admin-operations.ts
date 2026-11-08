import { useState } from "react";
import { useAdminMutations } from "./mutations";
import type { AdminCreateValues, AdminUser } from "./model";
import { useTranslations } from "@/lib/i18n";
export function useAdminOperations() {
  const t = useTranslations("adminUsers");
  const mutations = useAdminMutations();
  const [error, setError] = useState<string | null>(null);
  async function run(operation: () => Promise<unknown>): Promise<boolean> {
    setError(null);
    try {
      await operation();
      return true;
    } catch {
      setError(t("native.operationError"));
      return false;
    }
  }
  return {
    error,
    pending:
      mutations.createUser.isPending ||
      mutations.changeRole.isPending ||
      mutations.setBanned.isPending,
    create: (value: AdminCreateValues) =>
      run(() =>
        mutations.createUser.mutateAsync({
          ...value,
          name: value.name.trim(),
          email: value.email.trim(),
        }),
      ),
    changeRole: (user: AdminUser) =>
      run(() =>
        mutations.changeRole.mutateAsync({
          userId: user.id,
          role: user.role === "admin" ? "user" : "admin",
        }),
      ),
    toggleBan: (user: AdminUser) =>
      run(() =>
        mutations.setBanned.mutateAsync({
          userId: user.id,
          banned: !user.banned,
          reason: user.banned ? undefined : t("native.suspensionReason"),
        }),
      ),
  };
}
export type AdminOperations = ReturnType<typeof useAdminOperations>;
