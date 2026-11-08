import * as Linking from "expo-linking";
import { env } from "@repo/config/expo";
export async function openManualBillingWeb(isCurrent: () => boolean): Promise<void> {
  const configured = [env.EXPO_PUBLIC_APP_URL, env.EXPO_PUBLIC_API_URL].flatMap((value) => {
    if (typeof value !== "string" || !value.trim()) return [];
    try {
      const url = new URL(value);
      return (url.protocol === "https:" || url.protocol === "http:") &&
        !url.username &&
        !url.password
        ? [url]
        : [];
    } catch {
      return [];
    }
  })[0];
  if (!configured) throw new Error("MANUAL_WEB_UNAVAILABLE");
  const url = new URL("/billing", configured).toString();
  if (!(await Linking.canOpenURL(url))) throw new Error("MANUAL_WEB_UNAVAILABLE");
  if (isCurrent()) await Linking.openURL(url);
}
