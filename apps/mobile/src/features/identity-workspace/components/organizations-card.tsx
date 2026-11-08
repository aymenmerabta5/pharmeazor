import type * as React from "react";
import { ActivityIndicator, ScrollView, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import type { WorkspaceOrganizations } from "../use-workspace-organizations";
import { useTranslations } from "@/lib/i18n";

export function OrganizationsCard({ model }: { model: WorkspaceOrganizations }): React.JSX.Element {
  const t = useTranslations("workspace");
  const { form, organizations, organizationId, pending } = model;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("organizations")}</CardTitle>
        <CardDescription>{t("organizationsDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {model.loading ? (
          <ActivityIndicator accessibilityLabel={t("loadingOrganizations")} />
        ) : model.ready && organizations.length === 0 ? (
          <Text>{t("noOrganizations")}</Text>
        ) : null}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2"
        >
          {organizations.map((organization) => (
            <Button
              key={organization.id}
              accessibilityState={{ selected: organization.id === organizationId }}
              variant={organization.id === organizationId ? "default" : "outline"}
              onPress={() => model.select(organization.id)}
              className="min-w-44 h-auto p-3"
            >
              <Text className="font-semibold">{organization.name}</Text>
              <Text className="text-xs text-muted-foreground">{organization.slug}</Text>
            </Button>
          ))}
        </ScrollView>
        <form.Field name="name">
          {(field) => (
            <View className="gap-1">
              <Text>{t("organizationName")}</Text>
              <Input
                accessibilityLabel={t("organizationName")}
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                maxLength={120}
              />
            </View>
          )}
        </form.Field>
        <form.Field name="slug">
          {(field) => (
            <View className="gap-1">
              <Text>{t("organizationSlug")}</Text>
              <Input
                accessibilityLabel={t("organizationSlug")}
                value={field.state.value}
                onChangeText={field.handleChange}
                onBlur={field.handleBlur}
                autoCapitalize="none"
                maxLength={80}
              />
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
        <View className="flex-row flex-wrap gap-2">
          <Button disabled={pending} onPress={() => void form.handleSubmit()}>
            <Text>{t("createOrganization")}</Text>
          </Button>
          {organizationId ? (
            <Button disabled={pending} variant="outline" onPress={model.activate}>
              <Text>{t("useOrganization")}</Text>
            </Button>
          ) : null}
        </View>
      </CardContent>
    </Card>
  );
}
