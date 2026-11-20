import type * as React from "react";
import { useLocalSearchParams } from "expo-router";
import { ResetPasswordScreen } from "@/features/auth/reset-password-screen";
function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
export default function ResetPasswordRoute(): React.JSX.Element {
  const params = useLocalSearchParams<{ token?: string | string[]; error?: string | string[] }>();
  return (
    <ResetPasswordScreen
      token={first(params.token) ?? ""}
      queryError={first(params.error) ?? null}
    />
  );
}
