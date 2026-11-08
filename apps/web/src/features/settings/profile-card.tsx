"use client";
import type * as React from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSurfaceTranslations } from "@/lib/translations";
import { useProfileIdentity } from "./use-profile-identity";
import { useProfileForm } from "./use-profile-form";
import { ProfileView } from "./components/profile-view";
import type { SettingsUser } from "./model";

export function ProfileCard({ initialUser }: { initialUser?: SettingsUser }): React.JSX.Element {
  const common = useSurfaceTranslations("common");
  const errors = useSurfaceTranslations("errors");
  const identity = useProfileIdentity(initialUser);
  if (identity.pending)
    return (
      <Card role="status" aria-busy={true} aria-label={common("loading")}>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-9 w-36" />
        </CardContent>
      </Card>
    );
  if (!identity.user)
    return (
      <Alert role="alert" variant={identity.error ? "destructive" : "default"}>
        <AlertTitle>{errors(identity.error ? "genericTitle" : "unauthorizedTitle")}</AlertTitle>
        <AlertDescription>
          {errors(identity.error ? "genericDescription" : "unauthorizedDescription")}
        </AlertDescription>
      </Alert>
    );
  return <ProfileEditor key={identity.user.id} user={identity.user} />;
}
function ProfileEditor({ user }: { user: SettingsUser }): React.JSX.Element {
  const model = useProfileForm(user.name ?? "");
  return <ProfileView model={model} email={user.email} role={user.role ?? "user"} />;
}
