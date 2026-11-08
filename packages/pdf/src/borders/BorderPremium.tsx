import { StyleSheet, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

const styles = StyleSheet.create({
  outer: {
    flex: 1,
    borderWidth: 3,
    borderColor: "#1e1b4b",
    padding: 2,
    backgroundColor: "#f8fafc",
  },
  inner: { flex: 1, borderWidth: 2, borderColor: "#c9a227", padding: 28 },
});

export default function BorderPremium({ children }: { children: ReactNode }) {
  return (
    <View style={styles.outer}>
      <View style={styles.inner}>{children}</View>
    </View>
  );
}
