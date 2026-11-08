"use client";
import type * as React from "react";
import { useIdentitySessions } from "./use-identity-sessions";
import { SessionsView } from "./components/sessions-view";
import type { IdentitySessionsInitialState } from "./model";
export function SessionsCard(initialState: IdentitySessionsInitialState): React.JSX.Element {
  const state = useIdentitySessions(initialState);
  return <SessionsView state={state} />;
}
