import type * as React from "react";
import { Button } from "@/components/ui/button";
import { useSignOut } from "./use-sign-out";
import { useTranslations } from "@/lib/i18n";
export function SignOutButton(): React.JSX.Element {
  const t = useTranslations("navigation");
  const { pending, signOut } = useSignOut();
  return (
    <Button
      size="sm"
      variant="outline"
      accessibilityLabel={t("signOut")}
      isLoading={pending}
      onPress={signOut}
      disabled={pending}
    >
      {t("signOut")}
    </Button>
  );
}
