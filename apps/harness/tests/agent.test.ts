import { describe, expect, it } from "bun:test";
import agent from "../agent/agent";

describe("Eve agent smoke", () => {
  it("loads the generated agent definition", () => {
    expect(agent).toBeDefined();
  });
});
