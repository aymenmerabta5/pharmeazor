import type * as React from "react";
import { ActivityIndicator, View } from "react-native";
import { useTranslations } from "@/lib/i18n";
import { useSignOut } from "@/features/app-shell/use-sign-out";
import { ProfileView, type ProfileLink } from "./components/profile-view";
import { profileInitials, profileRole } from "./model";
import { useProfileIdentity } from "./queries";

export function ProfileScreen(): React.JSX.Element {
  const t = useTranslations("profile");
  const { user, isPending } = useProfileIdentity();
  const { pending: signOutPending, signOut } = useSignOut();

  if (isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  const role = profileRole(user);
  const name = typeof user?.name === "string" && user.name.trim() ? user.name : t("nameNotSet");
  const email = typeof user?.email === "string" ? user.email : null;
  const links: ProfileLink[] = [
    {
      key: "wallet",
      label: t("wallet"),
      description: t("walletDescription"),
      monogram: "W",
      href: "/wallet",
    },
    {
      key: "settings",
      label: t("settings"),
      description: t("settingsDescription"),
      monogram: "S",
      href: "/settings",
    },
    {
      key: "workspace",
      label: t("workspace"),
      description: t("workspaceDescription"),
      monogram: "O",
      href: "/workspace",
    },
    {
      key: "dashboard",
      label: t("dashboard"),
      description: t("dashboardDescription"),
      monogram: "D",
      href: "/dashboard",
    },
    {
      key: "pdf",
      label: t("pdf"),
      description: t("pdfDescription"),
      monogram: "PDF",
      href: "/pdf",
    },
    {
      key: "storage",
      label: t("storage"),
      description: t("storageDescription"),
      monogram: "F",
      href: "/storage",
    },
  ];
  if (role === "admin" || role === "superAdmin") {
    links.push({
      key: "admin",
      label: t("admin"),
      description: t("adminDescription"),
      monogram: "A",
      href: "/admin",
    });
  }

  return (
    <ProfileView
      name={name}
      email={email}
      initials={profileInitials(user?.name, email)}
      roleLabel={t(`roles.${role}`)}
      kicker={t("kicker")}
      title={t("title")}
      description={t("description")}
      quickLinksTitle={t("quickLinks")}
      links={links}
      languageTitle={t("language")}
      languageDescription={t("languageDescription")}
      signOutLabel={t("signOut")}
      signOutPending={signOutPending}
      onSignOut={() => void signOut()}
    />
  );
}
