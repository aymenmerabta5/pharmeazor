import * as React from "react";
import { Platform } from "react-native";
import * as Linking from "expo-linking";
import { usePathname } from "expo-router";
import { launchPathname } from "@/lib/launch-path";

/**
 * The path to paint before the root navigator exists.
 *
 * The auth gate holds the navigator back, and expo-router only reports the
 * active path once it mounts. The web already resolves the path from the
 * document; a native launch reads the deep link it was opened with, so a cold
 * start on a recovery link does not paint the landing skeleton.
 */
export function useRequestedPathname(): string {
  const pathname = usePathname() ?? "/";
  const [launchPath, setLaunchPath] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (Platform.OS === "web") return;
    let active = true;
    void Linking.getInitialURL()
      .then((url) => {
        if (!active || !url) return;
        setLaunchPath(launchPathname(url));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (Platform.OS !== "web" && pathname === "/" && launchPath && launchPath !== "/") {
    return launchPath;
  }
  return pathname;
}
