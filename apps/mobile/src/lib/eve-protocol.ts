export interface EveSessionCursor {
  readonly sessionId: string;
  readonly nextIndex: number;
}

export interface EveInvokeResult {
  readonly message: string;
  readonly session: EveSessionCursor;
  readonly status: "completed" | "waiting";
}

export interface EveTransportRequest {
  readonly body?: string;
  readonly method: "GET" | "POST";
  readonly signal?: AbortSignal;
}

export interface EveTransport {
  request(path: string, input: EveTransportRequest): Promise<Response>;
}

export interface EveInvokeOptions {
  readonly onText?: (text: string) => void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}

type JsonObject = Record<string, unknown>;
interface EveFact {
  readonly type: string;
  readonly data: JsonObject;
}
interface EveProgress {
  readonly type: string;
  readonly data: JsonObject;
}
type ParsedRecord =
  | { readonly kind: "facts"; readonly at: string; readonly facts: readonly EveFact[] }
  | { readonly kind: "progress"; readonly progress: EveProgress }
  | { readonly kind: "transport"; readonly name: string }
  | { readonly kind: "position"; readonly next: number };

interface StreamReceipt {
  readonly sessionId: string;
  readonly deliveryId: string | null;
}

const MAX_MESSAGE_LENGTH = 64 * 1024;
const MAX_EVENT_BATCH_BYTES = 2 * 1024 * 1024;
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
const DELIVERY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
/** Eve retires a session when it ends or the server restarts with fresh state. */
const STALE_SESSION_STATUSES = new Set([404, 409]);

export class EveClientError extends Error {
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "EveClientError";
    this.status = status;
  }
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) throw new EveClientError("The Eve request was cancelled.");
}

async function pause(ms: number, signal: AbortSignal | undefined): Promise<void> {
  throwIfAborted(signal);
  await new Promise<void>((resolve, reject) => {
    const cancel = () => {
      clearTimeout(timer);
      reject(new EveClientError("The Eve request was cancelled."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", cancel);
      resolve();
    }, ms);
    signal?.addEventListener("abort", cancel, { once: true });
  });
}

async function responseError(response: Response): Promise<EveClientError> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_EVENT_BATCH_BYTES) {
    return new EveClientError("The Eve service returned an oversized error.", response.status);
  }
  const source = await response.text();
  if (source.length > MAX_EVENT_BATCH_BYTES) {
    return new EveClientError("The Eve service returned an oversized error.", response.status);
  }
  try {
    const value: unknown = JSON.parse(source);
    if (isObject(value)) {
      const message = text(value.error) ?? text(value.message);
      if (message) return new EveClientError(message, response.status);
    }
  } catch {
    // Non-JSON upstream failures use the stable status fallback below.
  }
  return new EveClientError(
    "Eve request failed with status " + String(response.status) + ".",
    response.status,
  );
}

async function expectSuccess(response: Response): Promise<Response> {
  if (!response.ok) throw await responseError(response);
  return response;
}

async function acceptedReceipt(
  response: Response,
  fallback: string | null,
): Promise<StreamReceipt> {
  const source = await response.text();
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new EveClientError("The Eve service returned invalid JSON.", response.status);
  }
  const fromBody = isObject(value) ? text(value.sessionId) : null;
  const sessionId = fallback ?? fromBody ?? response.headers.get("x-eve-session-id");
  if (!sessionId || !SESSION_ID_PATTERN.test(sessionId)) {
    throw new EveClientError("The Eve service omitted a valid session id.", response.status);
  }
  const receipt = isObject(value) ? text(value.deliveryId) : null;
  const deliveryId = receipt && DELIVERY_ID_PATTERN.test(receipt) ? receipt : null;
  return { sessionId, deliveryId };
}

function parseRecords(source: string): {
  readonly records: readonly ParsedRecord[];
  readonly storedLines: number;
} {
  if (source.length > MAX_EVENT_BATCH_BYTES) {
    throw new EveClientError("The Eve event batch is too large.");
  }
  const records: ParsedRecord[] = [];
  let storedLines = 0;
  for (const line of source.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let value: unknown;
    try {
      value = JSON.parse(trimmed);
    } catch {
      throw new EveClientError("The Eve event stream contained invalid JSON.");
    }
    if (!isObject(value)) {
      throw new EveClientError("The Eve event stream contained an invalid event.");
    }
    if (typeof value.$eve === "string") {
      if (
        value.$eve === "position" &&
        Number.isSafeInteger(value.next) &&
        Number(value.next) >= 0
      ) {
        records.push({ kind: "position", next: Number(value.next) });
      } else {
        records.push({ kind: "transport", name: value.$eve });
      }
      continue;
    }
    if (isObject(value.progress)) {
      const progress = value.progress;
      if (typeof progress.type !== "string") {
        throw new EveClientError("The Eve event stream contained an invalid progress record.");
      }
      storedLines += 1;
      records.push({
        kind: "progress",
        progress: {
          type: progress.type,
          data: isObject(progress.data) ? progress.data : {},
        },
      });
      continue;
    }
    if (Array.isArray(value.facts) && typeof value.at === "string") {
      const facts: EveFact[] = [];
      for (const entry of value.facts) {
        if (!isObject(entry) || typeof entry.type !== "string") continue;
        facts.push({ type: entry.type, data: isObject(entry.data) ? entry.data : {} });
      }
      storedLines += 1;
      records.push({ kind: "facts", at: value.at, facts });
      continue;
    }
    throw new EveClientError("The Eve event stream contained an invalid event.");
  }
  return { records, storedLines };
}

function failureMessage(data: JsonObject): string {
  const error = data.error;
  if (isObject(error)) {
    return (
      text(error.message) ??
      text(error.hint) ??
      text(error.code) ??
      text(data.message) ??
      "The Eve session failed."
    );
  }
  return text(error) ?? text(data.message) ?? text(data.reason) ?? "The Eve session failed.";
}

interface PartState {
  kind: string;
  phase: string | null;
  text: string;
}

export function createEveClient(transport: EveTransport) {
  return {
    async invoke(
      message: string,
      previous: EveSessionCursor | null = null,
      options: EveInvokeOptions = {},
    ): Promise<EveInvokeResult> {
      const normalized = message.trim();
      if (!normalized) throw new EveClientError("Enter a message for Eve.");
      if (normalized.length > MAX_MESSAGE_LENGTH)
        throw new EveClientError("The Eve message is too large.");
      if (previous && !SESSION_ID_PATTERN.test(previous.sessionId)) {
        throw new EveClientError("The saved Eve session id is invalid.");
      }
      if (previous && (!Number.isSafeInteger(previous.nextIndex) || previous.nextIndex < 0)) {
        throw new EveClientError("The saved Eve stream cursor is invalid.");
      }

      throwIfAborted(options.signal);
      const send = async (cursor: EveSessionCursor | null): Promise<Response> =>
        await transport.request(
          cursor
            ? "/api/agent/eve/v1/session/" + encodeURIComponent(cursor.sessionId)
            : "/api/agent/eve/v1/session",
          {
            body: JSON.stringify({ message: normalized }),
            method: "POST",
            signal: options.signal,
          },
        );
      let resumed = previous !== null;
      let accepted = await send(previous);
      if (!accepted.ok && resumed && STALE_SESSION_STATUSES.has(accepted.status)) {
        // Eve retired the saved session, for example when the server restarted.
        // Continuing in a new session keeps the next turn usable; its history
        // starts empty because the old conversation no longer exists.
        resumed = false;
        accepted = await send(null);
      }
      const receipt = await acceptedReceipt(
        await expectSuccess(accepted),
        resumed && previous ? previous.sessionId : null,
      );
      const { sessionId, deliveryId } = receipt;

      const parts = new Map<string, PartState>();
      const order: string[] = [];
      let replyIds: readonly string[] = [];
      let nextIndex = resumed && previous ? previous.nextIndex : 0;
      const deadline = Date.now() + (options.timeoutMs ?? 120_000);

      const partFor = (partId: string, kind: string | undefined): PartState => {
        const existing = parts.get(partId);
        if (existing) {
          if (kind !== undefined && existing.text.length === 0) existing.kind = kind;
          return existing;
        }
        const created: PartState = { kind: kind ?? "text", phase: null, text: "" };
        parts.set(partId, created);
        order.push(partId);
        return created;
      };

      const rendered = (): string => {
        let value = "";
        for (const partId of order) {
          const part = parts.get(partId);
          if (part && part.kind === "text") value += part.text;
        }
        return value;
      };

      const finalMessage = (): string => {
        if (replyIds.length > 0) {
          let value = "";
          for (const partId of replyIds) {
            const part = parts.get(partId);
            if (part && part.kind === "text") value += part.text;
          }
          if (value.length > 0) return value;
        }
        let replied = "";
        let hasReply = false;
        for (const partId of order) {
          const part = parts.get(partId);
          if (part && part.kind === "text" && part.phase === "reply") {
            replied += part.text;
            hasReply = true;
          }
        }
        return hasReply ? replied : rendered();
      };

      const finish = (status: "completed" | "waiting"): EveInvokeResult => ({
        message: finalMessage(),
        session: { sessionId, nextIndex },
        status,
      });

      for (;;) {
        throwIfAborted(options.signal);
        if (Date.now() > deadline) throw new EveClientError("Timed out waiting for Eve.");
        const streamPath =
          "/api/agent/eve/v1/session/" +
          encodeURIComponent(sessionId) +
          "/stream?startIndex=" +
          String(nextIndex) +
          "&includeTailIndex=1";
        const stream = await expectSuccess(
          await transport.request(streamPath, { method: "GET", signal: options.signal }),
        );
        const declared = Number(stream.headers.get("content-length") ?? "0");
        if (Number.isFinite(declared) && declared > MAX_EVENT_BATCH_BYTES) {
          throw new EveClientError("The Eve event batch is too large.", stream.status);
        }
        const headerTail = stream.headers.get("x-eve-stream-tail-index");
        const tail = headerTail === null ? Number.NaN : Number(headerTail);
        const { records, storedLines } = parseRecords(await stream.text());
        const marked = records.reduce<number | null>(
          (next, record) => (record.kind === "position" ? record.next : next),
          null,
        );
        nextIndex =
          Number.isSafeInteger(tail) && tail >= -1
            ? tail + 1
            : Math.max(nextIndex + storedLines, marked ?? 0);

        for (const record of records) {
          if (record.kind === "transport") {
            if (record.name === "stream.ended") return finish("completed");
            continue;
          }
          if (record.kind === "position") continue;
          if (record.kind === "progress") {
            const { type, data } = record.progress;
            if (type !== "content.delta") continue;
            const partId = text(data.partId);
            const delta = typeof data.delta === "string" ? data.delta : null;
            if (!partId || delta === null) continue;
            const part = partFor(partId, typeof data.kind === "string" ? data.kind : undefined);
            if (part.kind !== "text") continue;
            part.text += delta;
            options.onText?.(rendered());
            continue;
          }

          for (const fact of record.facts) {
            const data = fact.data;
            if (fact.type === "content.completed") {
              const partId = text(data.partId);
              if (!partId) continue;
              const kind = typeof data.kind === "string" ? data.kind : "text";
              const part = partFor(partId, kind);
              part.kind = kind;
              if (typeof data.phase === "string") part.phase = data.phase;
              if (typeof data.value === "string") part.text = data.value;
              if (part.kind === "text") options.onText?.(rendered());
              continue;
            }
            if (fact.type === "turn.settled") {
              const outcome = text(data.outcome);
              if (outcome === "failed") throw new EveClientError(failureMessage(data));
              if (outcome === "cancelled") {
                throw new EveClientError("The Eve turn was cancelled.");
              }
              if (Array.isArray(data.reply)) {
                replyIds = data.reply.filter((id): id is string => typeof id === "string");
              }
              if (deliveryId === null && outcome === "completed") return finish("waiting");
              continue;
            }
            if (fact.type === "delivery.settled") {
              if (deliveryId === null || data.deliveryId !== deliveryId) continue;
              const outcome = text(data.outcome);
              if (outcome === "failed" || outcome === "refused") {
                throw new EveClientError(text(data.reason) ?? "Eve could not process the message.");
              }
              if (outcome === "ignored") {
                throw new EveClientError("Eve ignored the message because the session changed.");
              }
              return finish("waiting");
            }
            if (fact.type === "session.ended") {
              if (text(data.outcome) === "failed") throw new EveClientError(failureMessage(data));
              return finish("completed");
            }
            if (fact.type === "turn.paused" && deliveryId === null) {
              return finish("waiting");
            }
          }
        }
        await pause(250, options.signal);
      }
    },
  };
}
