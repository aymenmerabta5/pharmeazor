import "server-only";
import { Buffer } from "node:buffer";
import { terminalEveEvent, type TerminalEveEvent } from "./admission-stream";
import type {
  AgentAdmissionPort,
  AgentRuntimeAdmissionPort,
  AgentSessionActor,
} from "@repo/services/eve";

const PROXY_USERNAME = "ghostinit-web-proxy";
const MAX_TAIL_BYTES = 64 * 1024;
const PROBE_TIMEOUT_MS = 5_000;

type TailProbe =
  | { readonly state: "active" | "unknown" }
  | { readonly event: TerminalEveEvent; readonly state: "terminal" };

function proxyAuthorization(secret: string): string {
  return "Basic " + Buffer.from(PROXY_USERNAME + ":" + secret, "utf8").toString("base64");
}

async function readBoundedText(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let result = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      result += decoder.decode(chunk.value, { stream: true });
      if (result.length > MAX_TAIL_BYTES) {
        await reader.cancel();
        return null;
      }
    }
    result += decoder.decode();
    return result.length <= MAX_TAIL_BYTES ? result : null;
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

async function probeDurableTail(
  origin: string,
  secret: string,
  sessionId: string,
): Promise<TailProbe> {
  const url = new URL(
    "/eve/v1/session/" + encodeURIComponent(sessionId) + "/stream?startIndex=-1&includeTailIndex=1",
    origin,
  );
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/x-ndjson", Authorization: proxyAuthorization(secret) },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
  } catch {
    return { state: "unknown" };
  }
  if (!response.ok) return { state: "unknown" };
  const tailIndexHeader = response.headers.get("x-eve-stream-tail-index");
  const tailIndex = tailIndexHeader === null ? Number.NaN : Number(tailIndexHeader);
  const text = await readBoundedText(response);
  if (text === null) return { state: "unknown" };
  const lines = text.split(/\r?\n/).filter(Boolean);
  const tail = lines.at(-1);
  if (!tail) return { state: "unknown" };
  const event = terminalEveEvent({ line: tail, lineIndex: tailIndex, sessionId });
  return event ? { event, state: "terminal" } : { state: "active" };
}

/**
 * Expiry is only a recovery trigger. A bound lease is never reclaimed from its
 * timestamp alone: the private Eve stream must prove a settled tail. An
 * unavailable or active runtime is fenced by renewal and admission remains
 * fail-closed, including when no browser ever attached to the public stream.
 */
export async function reconcileExpiredEveAdmissions(input: {
  readonly actor: AgentSessionActor;
  readonly admission: AgentAdmissionPort & AgentRuntimeAdmissionPort;
  readonly origin: string;
  readonly secret: string;
}): Promise<void> {
  const inspectedAt = new Date();
  const expired = await input.admission.listExpiredBoundSessions({
    actor: input.actor,
    inspectedAt,
  });
  const sessions = new Map<string, string[]>();
  for (const entry of expired) {
    const leases = sessions.get(entry.eveSessionId) ?? [];
    leases.push(entry.leaseId);
    sessions.set(entry.eveSessionId, leases);
  }
  for (const [eveSessionId, leaseIds] of sessions) {
    const probe = await probeDurableTail(input.origin, input.secret, eveSessionId);
    if (probe.state === "terminal") {
      const [firstLeaseId] = leaseIds;
      if (probe.event.eventId && firstLeaseId) {
        await input.admission.recordRuntimeEvent({
          eventAt: probe.event.eventAt,
          eventId: probe.event.eventId,
          eventType: probe.event.eventType,
          eveSessionId,
          leaseId: firstLeaseId,
          receivedAt: new Date(),
        });
      }
      for (const leaseId of leaseIds) {
        await input.admission.releaseSession({
          actor: input.actor,
          eveSessionId,
          leaseId,
          releasedAt: new Date(),
        });
      }
      continue;
    }
    await input.admission.touchSession({
      actor: input.actor,
      eveSessionId,
      touchedAt: new Date(),
    });
  }
}
