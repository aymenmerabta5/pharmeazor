import type * as React from "react";
import { useSignUpForm } from "./use-sign-up-form";
import { SignUpForm } from "./components/sign-up-form";
export function SignUpScreen(): React.JSX.Element {
  const state = useSignUpForm();
  return <SignUpForm state={state} />;
}
