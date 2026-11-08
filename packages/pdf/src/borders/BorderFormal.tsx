import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#0f172a",
    padding: 8,
    backgroundColor: "#ffffff",
  },
  inner: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", padding: 24 },
});

export default function BorderFormal({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}
