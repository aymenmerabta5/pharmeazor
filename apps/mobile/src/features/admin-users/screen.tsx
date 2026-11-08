import type * as React from "react";
import { useAdminIdentity, useAdminUsers } from "./queries";
import { useAdminOperations } from "./use-admin-operations";
import { useAdminSearch, useAdminCreateForm } from "./use-admin-forms";
import { AdminView } from "./components/admin-view";
export interface AdminScreenState {
  identity: ReturnType<typeof useAdminIdentity>;
  users: ReturnType<typeof useAdminUsers>;
  operations: ReturnType<typeof useAdminOperations>;
  search: ReturnType<typeof useAdminSearch>["form"];
  create: ReturnType<typeof useAdminCreateForm>;
}
export function AdminScreen(): React.JSX.Element {
  const identity = useAdminIdentity();
  const search = useAdminSearch();
  const users = useAdminUsers(search.value, identity.isAdmin);
  const operations = useAdminOperations();
  const create = useAdminCreateForm(operations);
  return <AdminView state={{ identity, users, operations, create, search: search.form }} />;
}
