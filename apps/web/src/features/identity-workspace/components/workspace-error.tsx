import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useSurfaceTranslations } from "@/lib/translations";
interface WorkspaceReadRecovery {
  pending: boolean;
  retry(): void;
}
export function WorkspaceError({
  error,
  recovery,
}: {
  error: unknown;
  recovery?: WorkspaceReadRecovery | null;
}): React.JSX.Element | null {
  const t = useSurfaceTranslations("workspace");
  if (!error) return null;
  return (
    <Alert variant="destructive">
      <AlertTitle>{t(recovery ? "organizationsReadError" : "operationError")}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p>{t(recovery ? "organizationsReadErrorDescription" : "operationErrorDescription")}</p>
        {recovery ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            disabled={recovery.pending}
            onClick={recovery.retry}
          >
            {t(recovery.pending ? "loading" : "retry")}
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
