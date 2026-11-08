import { designSystemContract } from "@repo/ui/contract";
import "../global.css";
export { ExpoRootLayout as default } from "@/components/providers";

const configuredDesignSystemApp = designSystemContract.apps.find(
  (candidate) => candidate.id === "mobile",
);
const configuredDesignSystemAdapter = designSystemContract.adapters.find(
  (candidate) => candidate.id === "expo",
);
if (
  configuredDesignSystemApp?.adapter !== "expo" ||
  configuredDesignSystemAdapter?.version !== 1 ||
  configuredDesignSystemAdapter?.status !== "applicable"
) {
  throw new Error("GhostInit design-system invariant: mobile/expo/v1");
}
