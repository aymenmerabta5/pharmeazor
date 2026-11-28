import { describe, expect, it } from "bun:test";
import { canOpenAgent } from "../src/lib/agent-access";

describe("agent access", () => {
  it("opens for a live subscription", () => {
    expect(canOpenAgent({ hasLiveSubscription: true, isAdmin: false })).toBe(true);
  });

  it("opens for an administrator without a subscription", () => {
    expect(canOpenAgent({ hasLiveSubscription: false, isAdmin: true })).toBe(true);
  });

  it("keeps an unsubscribed ordinary user on the pricing path", () => {
    expect(canOpenAgent({ hasLiveSubscription: false, isAdmin: false })).toBe(false);
  });
});
