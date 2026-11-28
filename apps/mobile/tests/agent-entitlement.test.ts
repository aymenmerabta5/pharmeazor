import { describe, expect, it } from "bun:test";
import { resolveAgentEntitlement } from "../src/features/agent/model";

describe("agent entitlement", () => {
  it("keeps a live subscription", () => {
    expect(resolveAgentEntitlement({ isAdmin: false, livePlanId: "pro" })).toEqual({
      planId: "pro",
      subscribed: true,
    });
  });

  it("sponsors an administrator without a subscription", () => {
    expect(resolveAgentEntitlement({ isAdmin: true, livePlanId: null })).toEqual({
      planId: "sponsored",
      subscribed: true,
    });
  });

  it("blocks an unsubscribed ordinary user", () => {
    expect(resolveAgentEntitlement({ isAdmin: false, livePlanId: null })).toEqual({
      planId: null,
      subscribed: false,
    });
  });
});
