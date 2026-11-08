import type * as React from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useTranslations } from "@/lib/i18n";
export function WorkspaceError({ error }: { error: unknown }): React.JSX.Element | null {
  const t = useTranslations("workspace");
  return error ? (
    <Alert variant="destructive" accessibilityRole="alert">
      <AlertDescription>{t("operationError")}</AlertDescription>
    </Alert>
  ) : null;
}
