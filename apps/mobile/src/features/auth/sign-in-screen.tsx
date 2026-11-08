import type * as React from "react";
import { useSignInForm } from "./use-sign-in-form";
import { SignInForm } from "./components/sign-in-form";
export function SignInScreen(): React.JSX.Element {
  const state = useSignInForm();
  return <SignInForm state={state} />;
}
