import { describe, expect, it } from "bun:test";
import * as mod from "../src/server";

describe("@repo/email/server barrel", () => {
  it("loads with a test-only validated server environment", () => {
    expect(typeof mod.sendEmail).toBe("function");
    expect(mod.EMAIL_FROM).toBe("noreply@example.test");
  });
});
