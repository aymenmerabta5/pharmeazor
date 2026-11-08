"use client";
import { useNavbarUser } from "./queries";
import { signOutNavbar } from "./mutations";
export function useDashboardNavbar() {
  return { user: useNavbarUser(), onSignOut: signOutNavbar };
}
