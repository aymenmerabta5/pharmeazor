import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { organizations, teams, users } from "./auth";

export const eveAgentSessions = pgTable(
  "eve_agent_sessions",
  {
    eveSessionId: text("eve_session_id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    // Retain the non-secret Better Auth session id for audit even after that
    // login session is revoked or deleted. It is deliberately not a foreign
    // key: logout must never be blocked by durable agent history.
    createdByAuthSessionId: text("created_by_auth_session_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (table) => [
    index("eve_agent_sessions_owner_idx").on(table.userId, table.organizationId, table.teamId),
    index("eve_agent_sessions_auth_session_idx").on(table.createdByAuthSessionId),
    index("eve_agent_sessions_retired_idx").on(table.retiredAt),
  ],
);

/**
 * Latest Eve-authored event per durable session. Its clock is exclusively
 * Eve's event clock, so callback replay ordering never compares app and Eve
 * wall clocks. It may precede the application ownership claim.
 */
export const eveAgentRuntimeSessions = pgTable("eve_agent_runtime_sessions", {
  eveSessionId: text("eve_session_id").primaryKey(),
  lastEventId: text("last_event_id").notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});

/**
 * Append-only replay fence for lifecycle callbacks and authenticated tail
 * reconciliation. Event ids, rather than cross-process wall clocks, decide
 * whether one durable Eve event has already been applied.
 */
export const eveAgentRuntimeEvents = pgTable(
  "eve_agent_runtime_events",
  {
    eventId: text("event_id").primaryKey(),
    eveSessionId: text("eve_session_id").notNull(),
    eventType: text("event_type").notNull(),
    eventAt: timestamp("event_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("eve_agent_runtime_events_session_idx").on(table.eveSessionId, table.receivedAt),
  ],
);

/**
 * Durable admission leases bound successful paid operations per actor across
 * processes. Expired rows are pruned opportunistically by the adapter.
 */
export const eveAgentAdmissions = pgTable(
  "eve_agent_admissions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id").references(() => organizations.id, {
      onDelete: "cascade",
    }),
    teamId: text("team_id").references(() => teams.id, { onDelete: "cascade" }),
    eveSessionId: text("eve_session_id"),
    operation: text("operation").$type<"create" | "follow" | "compact">().notNull(),
    plan: text("plan").$type<"pro" | "sponsored">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    lastRuntimeEventId: text("last_runtime_event_id"),
    lastRuntimeEventAt: timestamp("last_runtime_event_at", { withTimezone: true }),
  },
  (table) => [
    index("eve_agent_admissions_user_created_idx").on(table.userId, table.createdAt),
    index("eve_agent_admissions_user_expiry_idx").on(table.userId, table.expiresAt),
    index("eve_agent_admissions_user_session_idx").on(table.userId, table.eveSessionId),
    index("eve_agent_admissions_session_created_idx").on(table.eveSessionId, table.createdAt),
  ],
);
