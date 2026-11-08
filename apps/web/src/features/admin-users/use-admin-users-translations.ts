"use client";
import type { AdminUsersTranslate } from "./translations";
import { useTranslations as useFrameworkTranslations } from "next-intl";
export function useAdminUsersTranslations(): AdminUsersTranslate {
  const translate = useFrameworkTranslations("adminUsers");
  return (key, values) => translate(key, values);
}
