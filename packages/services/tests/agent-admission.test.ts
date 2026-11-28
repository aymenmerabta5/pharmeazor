import { describe, expect, it } from "bun:test";
import { harness } from "@repo/services";

const { resolveAgentAdmissionPlan, toAgentPlan } = harness;

describe("agent admission entitlement", () => {
  it("sponsors an administrator who holds no subscription", () => {
    expect(resolveAgentAdmissionPlan({ entitledPlanId: null, isAdmin: true })).toBe("sponsored");
  });

  it("requires a live plan from a non-administrator", () => {
    expect(resolveAgentAdmissionPlan({ entitledPlanId: null, isAdmin: false })).toBeNull();
  });

  it("records the plan a customer actually bought", () => {
    expect(resolveAgentAdmissionPlan({ entitledPlanId: "pro", isAdmin: false })).toBe("pro");
  });

  it("records a paid plan for an administrator who also subscribes", () => {
    expect(resolveAgentAdmissionPlan({ entitledPlanId: "standard", isAdmin: true })).toBe(
      "standard",
    );
  });

  it("rejects a stored plan that is not in the catalog", () => {
    expect(() => toAgentPlan("retired-tier")).toThrow("EVE_PLAN_UNKNOWN");
  });
});
