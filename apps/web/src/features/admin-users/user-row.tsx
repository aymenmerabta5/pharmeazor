"use client";
import { UserRow as UserRowView } from "./components/user-row";
import { useAdminUserAction, type AdminUserActionOptions } from "./use-admin-user-action";
import type { AdminUsersTranslate } from "./translations";
export function UserRow(
  props: AdminUserActionOptions & { translate: AdminUsersTranslate },
): React.JSX.Element {
  const action = useAdminUserAction(props);
  return (
    <UserRowView
      user={props.user}
      rolePending={props.rolePending}
      banPending={props.banPending}
      translate={props.translate}
      {...action}
    />
  );
}
