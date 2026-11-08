import * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useTranslations } from "@/lib/i18n";

import type { AdminScreenState } from "../screen";
import { AdminCreateCard } from "./create-card";

export function AdminView({ state }: { state: AdminScreenState }): React.JSX.Element {
  const t = useTranslations("adminUsers");
  function roleLabel(value: string): string {
    if (value === "admin" || value === "superAdmin") return t("roles.admin");
    if (value === "user") return t("roles.user");
    return value;
  }
  const { identity, users, search, operations } = state;
  const { sessionPending, hasSession, applicationPending, isAdmin } = identity;
  const { pending, error } = operations;
  if (sessionPending || (hasSession && applicationPending))
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  if (!isAdmin)
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background p-6">
        <Text className="text-2xl font-bold">{t("native.accessRequired")}</Text>
        <Text className="text-center text-sm text-muted-foreground">
          {t("native.accessDescription")}
        </Text>
      </View>
    );

  return (
    <ScrollView className="flex-1 bg-background" contentInsetAdjustmentBehavior="automatic">
      <View className="w-full max-w-[960px] self-center gap-5 p-5">
        <View className="gap-1">
          <Text className="text-xs font-semibold uppercase tracking-widest text-primary">
            {t("native.kicker")}
          </Text>
          <Text className="text-3xl font-bold tracking-tight">{t("list.title")}</Text>
          <Text className="text-sm text-muted-foreground">{t("list.description")}</Text>
        </View>
        {error ? (
          <Alert accessibilityRole="alert" variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <AdminCreateCard state={state} />
        <Card>
          <CardHeader>
            <View className="flex-row items-center justify-between">
              <CardTitle>{t("native.users")}</CardTitle>
              {users.data ? (
                <Badge>
                  <Text>{users.data.total}</Text>
                </Badge>
              ) : null}
            </View>
            <CardDescription>{t("filters.description")}</CardDescription>
          </CardHeader>
          <CardContent className="gap-3">
            <search.Field name="search">
              {(field) => (
                <Input
                  value={field.state.value}
                  onChangeText={field.handleChange}
                  placeholder={t("filters.placeholder")}
                />
              )}
            </search.Field>
            {users.error ? (
              <Alert accessibilityRole="alert" variant="destructive">
                <AlertTitle>{t("list.loadErrorTitle")}</AlertTitle>
                <AlertDescription>{t("errors.requestFailed")}</AlertDescription>
              </Alert>
            ) : null}
            {users.isPending ? <ActivityIndicator /> : null}
            {users.data && !users.isPending && !users.error && users.data.users.length === 0 ? (
              <Text className="text-sm text-muted-foreground">{t("list.emptyTitle")}</Text>
            ) : null}
            {(users.data?.users ?? []).map((user) => (
              <View key={user.id} className="gap-2 rounded-xl border p-3">
                <View className="flex-row items-start justify-between gap-3">
                  <View className="flex-1">
                    <Text className="font-semibold">{user.name ?? t("native.unnamedUser")}</Text>
                    <Text className="text-sm text-muted-foreground">{user.email}</Text>
                  </View>
                  <Badge variant={user.banned ? "destructive" : "secondary"}>
                    <Text>{user.banned ? t("status.suspended") : roleLabel(user.role)}</Text>
                  </Badge>
                </View>
                <View className="flex-row flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onPress={() => void operations.changeRole(user)}
                  >
                    <Text>
                      {user.role === "admin" ? t("native.makeUser") : t("actions.promote")}
                    </Text>
                  </Button>
                  <Button
                    size="sm"
                    variant={user.banned ? "outline" : "destructive"}
                    disabled={pending}
                    onPress={() => void operations.toggleBan(user)}
                  >
                    <Text>{user.banned ? t("actions.restore") : t("actions.suspend")}</Text>
                  </Button>
                </View>
              </View>
            ))}
          </CardContent>
        </Card>
      </View>
    </ScrollView>
  );
}
