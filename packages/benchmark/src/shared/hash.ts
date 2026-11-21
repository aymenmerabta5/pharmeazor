import { createHash } from "node:crypto";

export function sha256(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/** Stable join delimiter that cannot appear in normal text fields. */
export const FIELD_SEP = "\u001f";
export const RECORD_SEP = "\u001e";
