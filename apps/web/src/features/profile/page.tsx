"use client";
import type * as React from "react";
import type { ProfileUser } from "./model";
import { useProfileActions } from "./use-profile-actions";
import { ProfileView } from "./components/profile-view";

export function ProfilePage({ user }: { user: ProfileUser }): React.JSX.Element {
  const actions = useProfileActions();
  return <ProfileView user={user} actions={actions} />;
}
