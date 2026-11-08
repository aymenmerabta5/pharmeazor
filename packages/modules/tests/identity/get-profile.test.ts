import { describe, it, expect } from "bun:test";
import { getProfileUseCase } from "../../src/identity/application/get-profile";

describe("getProfileUseCase", () => {
  it("returns the profile when found", async () => {
    const profile = { id: "1", email: "a@example.com", name: "A" };
    const result = await getProfileUseCase({ userId: "1" }, { findById: async () => profile });
    expect(result).toEqual(profile);
  });

  it("returns null when missing", async () => {
    const result = await getProfileUseCase({ userId: "2" }, { findById: async () => null });
    expect(result).toBeNull();
  });
});
