import { randomUUID } from "node:crypto";
export function createRequestId(): string {
  return randomUUID();
}
export const REQUEST_ID_HEADER = "x-request-id";
