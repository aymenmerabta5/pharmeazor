import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description:
    "Rebuild deterministic registries: modules index, api contract/router, db schema index.",
  inputSchema: z.object({ check: z.boolean().default(false) }),
  async execute({ check }) {
    const cmd = check ? "ghostinit sync --check --json" : "ghostinit sync --json";
    return {
      guidance: `Run: ${cmd}`,
      command: cmd,
      registries: ["packages/modules/src/index.ts", "packages/api/src/contract.ts"],
    };
  },
});
