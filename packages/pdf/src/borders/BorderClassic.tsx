import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: { flex: 1, borderWidth: 3, borderColor: "#1a1a2e", padding: 3, position: "relative" },
  inner: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#c9a227",
    padding: 28,
    justifyContent: "space-between",
  },
});

export default function BorderClassic({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}
