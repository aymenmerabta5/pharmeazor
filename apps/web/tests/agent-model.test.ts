import { describe, expect, it } from "bun:test";
import { isAdminAccount, planDisplayName } from "../src/features/agent/model";

describe("agent account badge", () => {
  it("recognises both administrator roles", () => {
    expect(isAdminAccount("admin")).toBe(true);
    expect(isAdminAccount("superAdmin")).toBe(true);
  });

  it("does not treat ordinary roles as administrators", () => {
    expect(isAdminAccount("user")).toBe(false);
    expect(isAdminAccount("viewer")).toBe(false);
    expect(isAdminAccount(null)).toBe(false);
    expect(isAdminAccount(undefined)).toBe(false);
  });

  it("names the sponsored entitlement instead of falling back to free", () => {
    expect(planDisplayName("sponsored")).toBe("Sponsored");
    expect(planDisplayName("pro-yearly")).toBe("Pro");
  });
});
