import { Slot } from "expo-router";
import { AppTabShell } from "@/features/app-shell/app-tab-shell";

export default function TabsLayout() {
  return (
    <AppTabShell>
      <Slot />
    </AppTabShell>
  );
}
