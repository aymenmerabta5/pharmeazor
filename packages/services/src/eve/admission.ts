import type { AgentSessionActor } from "./ownership";

export const EVE_OPERATION_RATE_WINDOW_MS = 60_000;
export const EVE_MAX_OPERATIONS_PER_WINDOW = 10;
export const EVE_MAX_CONCURRENT_OPERATIONS = 1;
export const EVE_ADMISSION_LEASE_MS = 5 * 60_000;

export type AgentPaidOperation = "create" | "follow" | "compact";
export type AgentPlan = "pro" | "sponsored";
export type AgentAdmissionErrorCode =
  | "EVE_ENTITLEMENT_UNSUPPORTED"
  | "EVE_ENTITLEMENT_REQUIRED"
  | "EVE_RATE_LIMITED"
  | "EVE_CONCURRENCY_LIMIT";

export type AgentAdmissionDecision =
  | { readonly ok: true; readonly leaseId: string; readonly plan: AgentPlan }
  | {
      readonly ok: false;
      readonly code: AgentAdmissionErrorCode;
      readonly retryAfterSeconds?: number;
    };

export interface ExpiredBoundAgentAdmission {
  readonly eveSessionId: string;
  readonly leaseId: string;
}

export interface AgentRuntimeAdmissionEvent {
  readonly eventAt: Date;
  readonly eventId: string;
  readonly eventType: string;
  readonly eveSessionId: string;
  readonly leaseId?: string;
  readonly receivedAt: Date;
}

export interface AgentAdmissionPort {
  admit(input: {
    readonly actor: AgentSessionActor;
    readonly eveSessionId?: string;
    readonly operation: AgentPaidOperation;
    readonly requestedAt: Date;
  }): Promise<AgentAdmissionDecision>;
  bindSession(input: {
    readonly actor: AgentSessionActor;
    readonly boundAt: Date;
    readonly eveSessionId: string;
    readonly leaseId: string;
  }): Promise<void>;
  listExpiredBoundSessions(input: {
    readonly actor: AgentSessionActor;
    readonly inspectedAt: Date;
  }): Promise<readonly ExpiredBoundAgentAdmission[]>;
  touchSession(input: {
    readonly actor: AgentSessionActor;
    readonly eveSessionId: string;
    readonly touchedAt: Date;
  }): Promise<void>;
  release(input: {
    readonly actor: AgentSessionActor;
    readonly leaseId: string;
    readonly releasedAt: Date;
  }): Promise<void>;
  releaseSession(input: {
    readonly actor: AgentSessionActor;
    readonly eveSessionId: string;
    readonly leaseId?: string;
    readonly releasedAt: Date;
  }): Promise<boolean>;
}

/**
 * Privileged sink called only by the HMAC-authenticated Eve runtime callback.
 * It intentionally accepts no browser/user identity: ownership is resolved
 * from the already-bound lease/session rows, never from callback JSON.
 */
export interface AgentRuntimeAdmissionPort {
  recordRuntimeEvent(input: AgentRuntimeAdmissionEvent): Promise<void>;
}

const EVE_RUNTIME_EVENT_ID_PATTERN = /^evt_[A-Za-z0-9_-]{8,80}$/;
const EVE_RUNTIME_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9.]{0,63}$/;
const EVE_ADMISSION_LEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/;
// Stream v27 ends work with one event that carries an outcome. A manual
// compaction is forwarded as `context.settled`; threshold compactions are not.
const TERMINAL_EVE_RUNTIME_EVENTS = new Set(["turn.settled", "session.ended", "context.settled"]);

export function isTerminalEveRuntimeEvent(eventType: string): boolean {
  return TERMINAL_EVE_RUNTIME_EVENTS.has(eventType);
}

export function isValidEveRuntimeEventId(value: string): boolean {
  return EVE_RUNTIME_EVENT_ID_PATTERN.test(value);
}

export function isValidEveRuntimeEventType(value: string): boolean {
  return EVE_RUNTIME_EVENT_TYPE_PATTERN.test(value);
}

export function isValidEveAdmissionLeaseId(value: string): boolean {
  return EVE_ADMISSION_LEASE_ID_PATTERN.test(value);
}

export function isPaidAgentOperation(value: string): value is AgentPaidOperation {
  return value === "create" || value === "follow" || value === "compact";
}
