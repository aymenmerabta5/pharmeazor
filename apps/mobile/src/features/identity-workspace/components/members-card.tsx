import type * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Text } from "@/components/ui/text";
import { compactIdentityId } from "../access";
import type { WorkspaceMembers } from "../use-workspace-members";
import { useTranslations } from "@/lib/i18n";

export function MembersCard({
  model,
  loading,
}: {
  model: WorkspaceMembers;
  loading: boolean;
}): React.JSX.Element {
  const t = useTranslations("workspace");
  const roleLabel = (role: string) =>
    role === "owner" ? t("roles.owner") : role === "admin" ? t("roles.admin") : t("roles.member");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("members")}</CardTitle>
        <CardDescription>{t("membersPolicyDescription")}</CardDescription>
      </CardHeader>
      <CardContent className="gap-3">
        {loading ? <ActivityIndicator accessibilityLabel={t("members")} /> : null}
        {model.members.map((member) => (
          <View key={member.id} className="gap-2 rounded-xl border border-border p-3">
            <Text>
              {member.userId === model.currentUser?.id
                ? model.currentUser?.name || compactIdentityId(member.userId)
                : compactIdentityId(member.userId)}
            </Text>
            <Text className="text-sm text-muted-foreground">{roleLabel(member.role)}</Text>
            {model.access.canManageMember(member) ? (
              <View className="flex-row flex-wrap gap-2">
                {model.access.rolesForMember(member).map((role) => (
                  <Button
                    key={role}
                    size="sm"
                    variant={role === member.role ? "default" : "outline"}
                    disabled={model.pending || role === member.role}
                    onPress={() => model.changeRole(member, role)}
                  >
                    <Text>{roleLabel(role)}</Text>
                  </Button>
                ))}
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={model.pending}
                  onPress={() => model.remove(member)}
                >
                  <Text>{t("remove")}</Text>
                </Button>
              </View>
            ) : null}
          </View>
        ))}
      </CardContent>
    </Card>
  );
}
