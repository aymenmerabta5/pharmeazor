import { createHash, createHmac } from "node:crypto";
import { defineHook } from "eve/hooks";

const CALLBACK_PATH = "/api/agent/internal/eve-lifecycle";
const CALLBACK_TIMEOUT_MS = 5_000;
const HEARTBEAT_INTERVAL_MS = 60_000;
// Stream v27 ends work with one event that carries an outcome. A manual
// compaction is forwarded as `context.settled`; threshold compactions are not.
const TERMINAL_EVENTS = new Set(["turn.settled", "session.ended"]);
const LEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const lastSuccessfulHeartbeat = new Map<string, number>();
const compactingSessions = new Set<string>();
const manualCompactions = new Map<string, string>();

interface LifecycleContext {
  readonly session: {
    readonly id: string;
    readonly auth: {
      readonly current?: { readonly attributes?: unknown } | null;
      readonly initiator?: { readonly attributes?: unknown } | null;
    };
  };
  readonly position: { readonly line: number; readonly index: number };
  readonly now: Date;
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * v27 has no event ids: `(line, index)` identifies an event. The application's
 * append-only replay fence still keys on one string, so derive a stable id from
 * the same position the authenticated tail probe reports. Keep this derivation
 * in sync with `packages/api/src/eve/admission-stream.ts`.
 */
function evePositionEventId(
  sessionId: string,
  position: { readonly line: number; readonly index: number },
): string {
  const session = createHash("sha256").update(sessionId, "utf8").digest("base64url").slice(0, 22);
  return "evt_" + String(position.line) + "_" + String(position.index) + "_" + session;
}

function configuredSecret(): string | null {
  const value = process.env.EVE_INTERNAL_AUTH_SECRET?.trim();
  return value && value.length >= 32 && !value.startsWith("REPLACE_WITH") ? value : null;
}

function callbackOrigin(): string | null {
  const configured = process.env.BETTER_AUTH_URL?.trim();
  if (!configured) return null;
  try {
    const value = new URL(configured);
    const loopback =
      value.hostname === "localhost" ||
      value.hostname === "127.0.0.1" ||
      value.hostname === "[::1]";
    if (
      value.username ||
      value.password ||
      value.search ||
      value.hash ||
      (value.protocol !== "https:" && !(value.protocol === "http:" && loopback))
    ) {
      return null;
    }
    return value.origin;
  } catch {
    return null;
  }
}

function admissionLeaseId(ctx: LifecycleContext): string | undefined {
  for (const principal of [ctx.session.auth.current, ctx.session.auth.initiator]) {
    const attributes = principal?.attributes;
    if (!attributes || typeof attributes !== "object" || Array.isArray(attributes)) continue;
    const candidate = Reflect.get(attributes, "eveAdmissionLeaseId");
    if (typeof candidate === "string" && LEASE_ID_PATTERN.test(candidate)) return candidate;
  }
  return undefined;
}

async function notifyApplication(
  event: { readonly type: string },
  ctx: LifecycleContext,
): Promise<void> {
  const origin = callbackOrigin();
  const secret = configuredSecret();
  if (!origin || !secret) return;
  const compactionSettled =
    event.type === "context.settled" && compactingSessions.has(ctx.session.id);
  const terminal = TERMINAL_EVENTS.has(event.type) || compactionSettled;
  const now = Date.now();
  const previous = lastSuccessfulHeartbeat.get(ctx.session.id) ?? 0;
  if (
    !terminal &&
    event.type !== "session.started" &&
    event.type !== "context.started" &&
    now - previous < HEARTBEAT_INTERVAL_MS
  ) {
    return;
  }

  const body = JSON.stringify({
    eventAt: ctx.now.toISOString(),
    eventId: evePositionEventId(ctx.session.id, ctx.position),
    eventType: event.type,
    eveSessionId: ctx.session.id,
    // Eve control routes do not accept forwardedPrincipal. During compaction,
    // the prior turn's caller snapshot can therefore contain a stale lease.
    // Omit it and let the application select only its already-bound compact
    // lease after observing context.started.
    leaseId: compactingSessions.has(ctx.session.id) ? undefined : admissionLeaseId(ctx),
  });
  const timestamp = String(now);
  const signature = createHmac("sha256", secret)
    .update(timestamp)
    .update(".")
    .update(body)
    .digest("base64url");
  try {
    const response = await fetch(new URL(CALLBACK_PATH, origin), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-GhostInit-Eve-Signature": signature,
        "X-GhostInit-Eve-Timestamp": timestamp,
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(CALLBACK_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error("The application rejected the Eve lifecycle callback");
    if (terminal) lastSuccessfulHeartbeat.delete(ctx.session.id);
    else lastSuccessfulHeartbeat.set(ctx.session.id, now);
  } finally {
    if (terminal) {
      compactingSessions.delete(ctx.session.id);
      manualCompactions.delete(ctx.session.id);
    }
  }
}

export default defineHook({
  events: {
    async "*"(event, ctx) {
      const data = isObject(event.data) ? event.data : {};
      const kind = typeof data.kind === "string" ? data.kind : null;
      const changeId = typeof data.changeId === "string" ? data.changeId : null;
      const contextChange = event.type === "context.started" || event.type === "context.settled";

      if (contextChange && kind !== "compaction") return;
      if (event.type === "context.started") {
        // A manual compaction is a control delivery. A threshold compaction is
        // part of a running turn and leaves that turn's lease alone.
        if (data.cause === undefined || changeId === null) return;
        manualCompactions.set(ctx.session.id, changeId);
        compactingSessions.add(ctx.session.id);
      } else if (event.type === "context.settled") {
        if (changeId === null || manualCompactions.get(ctx.session.id) !== changeId) return;
      }

      // The callback is primary lifecycle authority, but callback downtime must
      // not fail model work. The application fail-closes expired bound leases
      // by inspecting Eve's authenticated durable stream tail before admission.
      await notifyApplication(event, ctx).catch(() => undefined);
    },
  },
});
