import { useForm, useStore } from "@tanstack/react-form";
import { canCreateAdminUser, type AdminCreateValues } from "./model";
import type { AdminOperations } from "./use-admin-operations";
export function useAdminSearch() {
  const form = useForm({ defaultValues: { search: "" } });
  const value = useStore(form.store, (state) => state.values.search);
  return { form, value };
}
export function useAdminCreateForm(operations: AdminOperations) {
  const form = useForm({
    defaultValues: { name: "", email: "", password: "", role: "user" } as AdminCreateValues,
    onSubmit: async ({ value }) => {
      if (!canCreateAdminUser(value)) return;
      if (await operations.create(value))
        form.reset({ name: "", email: "", password: "", role: value.role });
    },
  });
  return form;
}
