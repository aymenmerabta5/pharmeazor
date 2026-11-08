import { describe, expect, it } from "bun:test";
import * as server from "../src/server/index";

describe("@repo/analytics/server barrel", () => {
  it("loads with a test-only validated server environment", () => {
    expect(typeof server.getAnalyticsConfig).toBe("function");
    expect(server.isAnalyticsEnabled()).toBe(false);
  });
});
