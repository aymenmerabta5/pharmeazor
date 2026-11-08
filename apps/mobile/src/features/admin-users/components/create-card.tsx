import type * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { canCreateAdminUser } from "../model";
import type { AdminScreenState } from "../screen";
import { useTranslations } from "@/lib/i18n";
export function AdminCreateCard({
  state,
}: {
  state: Pick<AdminScreenState, "create" | "operations">;
}): React.JSX.Element {
  const t = useTranslations("adminUsers");
  function roleLabel(value: string): string {
    if (value === "admin" || value === "superAdmin") return t("roles.admin");
    if (value === "user") return t("roles.user");
    return value;
  }
  const {
    create,
    operations: { pending },
  } = state;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("create.shellTitle")}</CardTitle>
        <CardDescription>{t("create.passwordDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        <create.Field name="name">
          {(field) => (
            <Input
              value={field.state.value}
              onChangeText={field.handleChange}
              placeholder={t("create.nameLabel")}
            />
          )}
        </create.Field>
        <create.Field name="email">
          {(field) => (
            <Input
              value={field.state.value}
              onChangeText={field.handleChange}
              keyboardType="email-address"
              autoCapitalize="none"
              placeholder={t("create.emailLabel")}
            />
          )}
        </create.Field>
        <create.Field name="password">
          {(field) => (
            <Input
              value={field.state.value}
              onChangeText={field.handleChange}
              secureTextEntry
              placeholder={t("create.passwordLabel")}
            />
          )}
        </create.Field>
        <create.Field name="role">
          {(field) => (
            <Button
              variant="outline"
              onPress={() => field.handleChange(field.state.value === "admin" ? "user" : "admin")}
            >
              <Text>{t("native.role", { role: roleLabel(field.state.value) })}</Text>
            </Button>
          )}
        </create.Field>
        <create.Subscribe selector={(form) => form.values}>
          {(value) => (
            <Button
              disabled={pending || !canCreateAdminUser(value)}
              onPress={() => void create.handleSubmit()}
            >
              <Text>{t("create.submit")}</Text>
            </Button>
          )}
        </create.Subscribe>
      </CardContent>
    </Card>
  );
}
