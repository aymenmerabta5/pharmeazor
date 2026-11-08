import type * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import type { WorkspaceInvitations } from "../use-workspace-invitations";
import { useTranslations } from "@/lib/i18n";

export function InvitationsCard({
  model,
  loading,
}: {
  model: WorkspaceInvitations;
  loading: boolean;
}): React.JSX.Element {
  const t = useTranslations("workspace");
  const { form } = model;
  const roles = model.permissions.isOwner
    ? (["owner", "admin", "member"] as const)
    : (["admin", "member"] as const);
  const roleLabel = (role: string) =>
    role === "owner" ? t("roles.owner") : role === "admin" ? t("roles.admin") : t("roles.member");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("invitations")}</CardTitle>
        <CardDescription>{t("invitationsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {loading ? <ActivityIndicator accessibilityLabel={t("invitations")} /> : null}
        {model.canWrite ? (
          <>
            <form.Field name="email">
              {(field) => (
                <View className="gap-1">
                  <Text>{t("inviteEmail")}</Text>
                  <Input
                    accessibilityLabel={t("inviteEmail")}
                    value={field.state.value}
                    onChangeText={field.handleChange}
                    onBlur={field.handleBlur}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              )}
            </form.Field>
            <form.Field name="role">
              {(field) => (
                <View className="flex-row flex-wrap gap-2">
                  {roles.map((role) => (
                    <Button
                      key={role}
                      variant={role === field.state.value ? "default" : "outline"}
                      disabled={model.pending}
                      onPress={() => field.handleChange(role)}
                    >
                      <Text>{roleLabel(role)}</Text>
                    </Button>
                  ))}
                </View>
              )}
            </form.Field>
            <form.Subscribe selector={(state) => state.errors.length}>
              {(errors) =>
                errors ? (
                  <Text accessibilityRole="alert" className="text-destructive">
                    {t("operationError")}
                  </Text>
                ) : null
              }
            </form.Subscribe>
            <Button disabled={model.pending} onPress={() => void form.handleSubmit()}>
              <Text>{t("sendInvitation")}</Text>
            </Button>
          </>
        ) : null}
        {model.invitations.map((invitation) => (
          <View key={invitation.id} className="gap-2 rounded-xl border border-border p-3">
            <Text className="font-medium">{invitation.email}</Text>
            <Text className="text-sm text-muted-foreground">
              {roleLabel(invitation.role)} · {invitation.status}
            </Text>
            {invitation.status === "pending" ? (
              <View className="flex-row gap-2">
                {model.canAccept(invitation) ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={model.pending}
                    onPress={() => model.accept(invitation)}
                  >
                    <Text>{t("accept")}</Text>
                  </Button>
                ) : null}
                {model.canCancel ? (
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={model.pending}
                    onPress={() => model.cancel(invitation)}
                  >
                    <Text>{t("cancel")}</Text>
                  </Button>
                ) : null}
              </View>
            ) : null}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}
