import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "Run architecture boundary checks for GhostInit monorepo via oxc-parser AST.",
  inputSchema: z.object({}),
  async execute() {
    return {
      guidance: "Run: ghostinit check --json",
      command: "ghostinit check --json",
      qualityGate: "blockers==0 && highs==0",
    };
  },
});
