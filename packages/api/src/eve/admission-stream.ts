import "server-only";
import { createHash } from "node:crypto";
import { isValidEveRuntimeEventId, isValidEveRuntimeEventType } from "@repo/services/eve";

// Stream v27 groups every fact one state change produced into a stored line.
// Only a line whose last lifecycle fact leaves the session idle is terminal.
const TERMINAL_FACT_TYPES = new Set(["turn.settled", "session.ended"]);
const OPENING_FACT_TYPES = new Set([
  "session.started",
  "turn.started",
  "delivery.admitted",
  "delivery.consumed",
]);
const MAX_INSPECTED_EVENT_CHARS = 64 * 1024;

export interface TerminalEveEvent {
  readonly eventAt: Date;
  readonly eventId: string;
  readonly eventType: string;
}

/**
 * v27 has no event ids: `(line, index)` identifies an event. The application's
 * append-only replay fence still keys on one string, so derive a stable id from
 * the same position the authored hook reports. Keep this derivation in sync
 * with `apps/eve/agent/hooks/admission-lifecycle.ts`.
 */
export function evePositionEventId(
  sessionId: string,
  position: { readonly line: number; readonly index: number },
): string {
  const session = createHash("sha256").update(sessionId, "utf8").digest("base64url").slice(0, 22);
  return "evt_" + String(position.line) + "_" + String(position.index) + "_" + session;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerminalFact(fact: JsonObject): boolean {
  const type = fact.type;
  if (typeof type !== "string" || !isValidEveRuntimeEventType(type)) return false;
  if (TERMINAL_FACT_TYPES.has(type)) return true;
  if (type !== "context.settled") return false;
  // Only a manual compaction leaves the session idle. A threshold compaction
  // belongs to a running turn, which names the turn in its scope.
  const data = fact.data;
  const scope = fact.scope;
  return (
    isObject(data) &&
    data.kind === "compaction" &&
    (!isObject(scope) || typeof scope.turnId !== "string")
  );
}

function isOpeningFact(fact: JsonObject): boolean {
  return typeof fact.type === "string" && OPENING_FACT_TYPES.has(fact.type);
}

export function terminalEveEvent(input: {
  readonly line: string;
  readonly lineIndex: number;
  readonly sessionId: string;
}): TerminalEveEvent | null {
  if (input.line.length === 0 || input.line.length > MAX_INSPECTED_EVENT_CHARS) return null;
  if (!Number.isSafeInteger(input.lineIndex) || input.lineIndex < 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.line);
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const facts = parsed.facts;
  const at = parsed.at;
  if (!Array.isArray(facts) || typeof at !== "string") return null;
  const eventAt = new Date(at);
  if (!Number.isFinite(eventAt.getTime())) return null;

  let terminalIndex = -1;
  let terminalType: string | null = null;
  for (let index = 0; index < facts.length; index += 1) {
    const fact: unknown = facts[index];
    if (!isObject(fact)) continue;
    if (isOpeningFact(fact)) {
      terminalIndex = -1;
      terminalType = null;
      continue;
    }
    if (isTerminalFact(fact) && typeof fact.type === "string") {
      terminalIndex = index;
      terminalType = fact.type;
    }
  }
  if (terminalIndex < 0 || terminalType === null) return null;

  const eventId = evePositionEventId(input.sessionId, {
    line: input.lineIndex,
    index: terminalIndex,
  });
  if (!isValidEveRuntimeEventId(eventId)) return null;
  return { eventAt, eventId, eventType: terminalType };
}
