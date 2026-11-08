import { describe, it, expect } from "bun:test";
import * as mod from "../src/index";

describe("@repo/analytics barrel", () => {
  it("loads the environment-neutral public API", () => {
    expect(typeof mod.createEvent).toBe("function");
    expect(typeof mod.createMockPostHogClient).toBe("function");
    expect("getAnalyticsConfig" in mod).toBe(false);
  });
});
