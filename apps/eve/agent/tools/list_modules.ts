import { defineTool } from "eve/tools";
import { z } from "zod";
export default defineTool({
  description: "List existing DDD modules in GhostInit monorepo.",
  inputSchema: z.object({}),
  async execute() {
    return { guidance: "Run: ghostinit status --json", command: "ghostinit status --json" };
  },
});
