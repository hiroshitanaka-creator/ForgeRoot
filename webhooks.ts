import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const RUNTIME_MODES = ["observe", "propose", "evolve", "federate", "quarantine", "halted"] as const;
export type RuntimeMode = (typeof RUNTIME_MODES)[number];
export const RUNTIME_OPERATIONS = [
  "webhook_ingest",
  "event_inbox_enqueue",
  "read_repository",
  "classify_event",
  "create_plan",
  "create_issue",
  "create_comment",
  "create_branch",
  "commit_patch",
  "open_pull_request",
  "update_pull_request",
  "create_check_run",
  "run_sandbox",
  "docs_only_incident_pr",
  "incident_report",
  "replay_diagnosis",
  "network_sync",
  "treaty_update",
  "self_evolution",
  "workflow_mutation",
  "auto_merge",
  "restore_runtime_mode",
] as const;
export type RuntimeOperation = (typeof RUNTIME_OPERATIONS)[number];
export type RuntimeTrigger = "manual" | "kill_switch" | "rate_limit" | "policy_breach" | "security_gate" | "restore";

export interface RuntimeModeSnapshot {
  mode: RuntimeMode;
  previousMode: RuntimeMode | null;
  killSwitchEngaged: boolean;
  mutatingLaneOpen: boolean;
  restoreRequiresHumanAck: boolean;
  reason: string;
  changedBy: string;
  changedAt: string;
  cooldownUntil: string | null;
  correlationId: string | null;
  updatedAt: string;
}

export interface RuntimeModeEvent {
  eventId: number;
  eventType: string;
  fromMode: RuntimeMode | null;
  toMode: RuntimeMode;
  killSwitchEngaged: boolean;
  mutatingLaneOpen: boolean;
  restoreRequiresHumanAck: boolean;
  actor: string;
  reason: string;
  trigger: RuntimeTrigger;
  correlationId: string | null;
  observedAt: string;
  metadataJson: string | null;
}

export interface RateLimitSignal {
  signalId: number;
  statusCode: 403 | 429;
  source: string;
  repositoryFullName: string | null;
  correlationId: string | null;
  observedAt: string;
}

export interface SetRuntimeModeInput {
  mode: RuntimeMode;
  actor: string;
  reason: string;
  trigger?: RuntimeTrigger | undefined;
  now?: Date | undefined;
  correlationId?: string | null | undefined;
  cooldownUntil?: Date | null | undefined;
  humanAck?: boolean | undefined;
}
export interface KillSwitchInput { actor: string; reason: string; now?: Date | undefined; correlationId?: string | null | undefined; }
export interface QuarantineInput { actor: string; reason: string; now?: Date | undefined; trigger?: RuntimeTrigger | undefined; correlationId?: string | null | undefined; }
export interface RestoreRuntimeModeInput { mode: Exclude<RuntimeMode, "halted" | "quarantine">; actor: string; reason: string; humanAck: boolean; now?: Date | undefined; correlationId?: string | null | undefined; }
export interface RateLimitSignalInput { statusCode: 403 | 429; source: string; now?: Date | undefined; repositoryFullName?: string | null | undefined; correlationId?: string | null | undefined; }

export type RuntimeAuthorization =
  | { allowed: true; mode: RuntimeMode; operation: RuntimeOperation }
  | { allowed: false; mode: RuntimeMode; operation: RuntimeOperation; reason: "operation_not_in_mode" | "halted" | "kill_switch_engaged" | "quarantine_restriction" };
export type RuntimeTransitionResult =
  | { ok: true; snapshot: RuntimeModeSnapshot }
  | { ok: false; reason: "human_ack_required" | "invalid_restore_target"; snapshot: RuntimeModeSnapshot };
export type RateLimitSignalResult =
  | { kind: "recorded"; signal: RateLimitSignal; countInWindow: number; snapshot: RuntimeModeSnapshot }
  | { kind: "downgraded"; signal: RateLimitSignal; countInWindow: number; fromMode: RuntimeMode; toMode: RuntimeMode; snapshot: RuntimeModeSnapshot };

export interface RuntimeModeController {
  getSnapshot(): RuntimeModeSnapshot;
  authorizeOperation(operation: RuntimeOperation, snapshot?: RuntimeModeSnapshot): RuntimeAuthorization;
  setMode(input: SetRuntimeModeInput): RuntimeTransitionResult;
  activateKillSwitch(input: KillSwitchInput): RuntimeModeSnapshot;
  enterQuarantine(input: QuarantineInput): RuntimeModeSnapshot;
  restoreMode(input: RestoreRuntimeModeInput): RuntimeTransitionResult;
  recordRateLimitSignal(input: RateLimitSignalInput): RateLimitSignalResult;
}

const MODE_SET = new Set<string>(RUNTIME_MODES);
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_DOWNGRADE_THRESHOLD = 2;
const MUTATING_LANE_MODES = new Set<RuntimeMode>(["evolve", "federate"]);
const BASE: RuntimeOperation[] = ["webhook_ingest", "event_inbox_enqueue", "read_repository", "classify_event", "replay_diagnosis", "restore_runtime_mode"];
const MODE_ALLOWED: Record<RuntimeMode, ReadonlySet<RuntimeOperation>> = {
  observe: set(BASE),
  propose: set([...BASE, "create_plan", "create_issue", "create_comment"]),
  evolve: set([...BASE, "create_plan", "create_issue", "create_comment", "create_branch", "commit_patch", "open_pull_request", "update_pull_request", "create_check_run", "run_sandbox"]),
  federate: set([...BASE, "create_plan", "create_issue", "create_comment", "create_branch", "commit_patch", "open_pull_request", "update_pull_request", "create_check_run", "run_sandbox", "network_sync"]),
  quarantine: set(["webhook_ingest", "event_inbox_enqueue", "read_repository", "classify_event", "create_issue", "create_comment", "docs_only_incident_pr", "incident_report", "replay_diagnosis", "restore_runtime_mode"]),
  halted: set(["webhook_ingest", "event_inbox_enqueue", "read_repository", "replay_diagnosis", "restore_runtime_mode"]),
};

export const RUNTIME_MODE_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS forge_schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS forge_runtime_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('observe','propose','evolve','federate','quarantine','halted')),
  previous_mode TEXT CHECK (previous_mode IS NULL OR previous_mode IN ('observe','propose','evolve','federate','quarantine','halted')),
  kill_switch_engaged INTEGER NOT NULL CHECK (kill_switch_engaged IN (0,1)),
  mutating_lane_open INTEGER NOT NULL CHECK (mutating_lane_open IN (0,1)),
  restore_requires_human_ack INTEGER NOT NULL CHECK (restore_requires_human_ack IN (0,1)),
  reason TEXT NOT NULL,
  changed_by TEXT NOT NULL,
  changed_at TEXT NOT NULL,
  cooldown_until TEXT,
  correlation_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS forge_runtime_mode_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  from_mode TEXT CHECK (from_mode IS NULL OR from_mode IN ('observe','propose','evolve','federate','quarantine','halted')),
  to_mode TEXT NOT NULL CHECK (to_mode IN ('observe','propose','evolve','federate','quarantine','halted')),
  kill_switch_engaged INTEGER NOT NULL CHECK (kill_switch_engaged IN (0,1)),
  mutating_lane_open INTEGER NOT NULL CHECK (mutating_lane_open IN (0,1)),
  restore_requires_human_ack INTEGER NOT NULL CHECK (restore_requires_human_ack IN (0,1)),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  trigger TEXT NOT NULL,
  correlation_id TEXT,
  observed_at TEXT NOT NULL,
  metadata_json TEXT
);
CREATE TABLE IF NOT EXISTS forge_runtime_rate_limit_signals (
  signal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  status_code INTEGER NOT NULL CHECK (status_code IN (403,429)),
  source TEXT NOT NULL,
  repository_full_name TEXT,
  correlation_id TEXT,
  observed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_forge_runtime_events_observed_at ON forge_runtime_mode_events (observed_at);
CREATE INDEX IF NOT EXISTS idx_forge_runtime_rate_limit_signals_window ON forge_runtime_rate_limit_signals (repository_full_name, observed_at, status_code);
`;

type Row = Record<string, unknown>;
interface RunResult { changes: number; lastInsertRowid: number | bigint; }

export function isRuntimeMode(value: string): value is RuntimeMode { return MODE_SET.has(value); }
export function isMutatingLaneMode(mode: RuntimeMode): boolean { return MUTATING_LANE_MODES.has(mode); }
export function downgradeRuntimeMode(mode: RuntimeMode): RuntimeMode {
  if (mode === "evolve" || mode === "federate") return "propose";
  if (mode === "propose") return "observe";
  return mode;
}
export function openSqliteRuntimeModeStore(databasePath = ":memory:"): SqliteRuntimeModeStore { return new SqliteRuntimeModeStore(databasePath); }
export function createRuntimeModeController(store = openSqliteRuntimeModeStore()): RuntimeModeController { return new DefaultRuntimeModeController(store); }

export class SqliteRuntimeModeStore {
  private readonly db: DatabaseSync;
  private readonly ownsDatabase: boolean;

  constructor(databasePathOrHandle: string | DatabaseSync = ":memory:") {
    if (typeof databasePathOrHandle === "string") {
      ensureDatabaseDirectory(databasePathOrHandle);
      this.db = new DatabaseSync(databasePathOrHandle);
      this.ownsDatabase = true;
    } else {
      this.db = databasePathOrHandle;
      this.ownsDatabase = false;
    }
    this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    this.db.exec(RUNTIME_MODE_MIGRATION_SQL);
    this.db.prepare("INSERT OR IGNORE INTO forge_schema_migrations (version,name,applied_at) VALUES (?,?,?)").run("0002_runtime_mode", "runtime mode and kill switch", new Date().toISOString());
    this.ensureInitialState();
  }

  getSnapshot(): RuntimeModeSnapshot {
    const row = this.db.prepare("SELECT * FROM forge_runtime_state WHERE singleton_id = 1").get();
    if (row === undefined) throw new Error("Runtime mode state was not initialized.");
    return snapshotFromRow(asRow(row));
  }

  writeTransition(input: {
    toMode: RuntimeMode;
    actor: string;
    reason: string;
    trigger: RuntimeTrigger;
    now?: Date | undefined;
    correlationId?: string | null | undefined;
    cooldownUntil?: Date | null | undefined;
    killSwitchEngaged?: boolean | undefined;
    restoreRequiresHumanAck?: boolean | undefined;
    metadata?: Record<string, unknown> | undefined;
  }): RuntimeModeSnapshot {
    const current = this.getSnapshot();
    const now = input.now ?? new Date();
    const nowIso = now.toISOString();
    const kill = input.killSwitchEngaged ?? false;
    const restoreAck = input.restoreRequiresHumanAck ?? false;
    const laneOpen = !kill && isMutatingLaneMode(input.toMode);
    const cooldown = input.cooldownUntil === undefined ? current.cooldownUntil : input.cooldownUntil?.toISOString() ?? null;
    const correlationId = input.correlationId ?? null;
    const metadataJson = input.metadata === undefined ? null : JSON.stringify(input.metadata);

    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare(`UPDATE forge_runtime_state SET mode=?, previous_mode=?, kill_switch_engaged=?, mutating_lane_open=?, restore_requires_human_ack=?, reason=?, changed_by=?, changed_at=?, cooldown_until=?, correlation_id=?, updated_at=? WHERE singleton_id = 1`)
        .run(input.toMode, current.mode, bit(kill), bit(laneOpen), bit(restoreAck), input.reason, input.actor, nowIso, cooldown, correlationId, nowIso);
      this.db.prepare(`INSERT INTO forge_runtime_mode_events (event_type, from_mode, to_mode, kill_switch_engaged, mutating_lane_open, restore_requires_human_ack, actor, reason, trigger, correlation_id, observed_at, metadata_json) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(eventType(input.trigger, input.toMode), current.mode, input.toMode, bit(kill), bit(laneOpen), bit(restoreAck), input.actor, input.reason, input.trigger, correlationId, nowIso, metadataJson);
      this.db.exec("COMMIT");
      return this.getSnapshot();
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  recordRateLimitSignal(input: RateLimitSignalInput): RateLimitSignal {
    const nowIso = (input.now ?? new Date()).toISOString();
    const result = this.db.prepare("INSERT INTO forge_runtime_rate_limit_signals (status_code, source, repository_full_name, correlation_id, observed_at) VALUES (?,?,?,?,?)")
      .run(input.statusCode, input.source, input.repositoryFullName ?? null, input.correlationId ?? null, nowIso) as RunResult;
    const row = this.db.prepare("SELECT * FROM forge_runtime_rate_limit_signals WHERE signal_id = ?").get(result.lastInsertRowid);
    if (row === undefined) throw new Error("Rate-limit signal was not found after insert.");
    return signalFromRow(asRow(row));
  }

  countRateLimitSignalsSince(since: Date, until: Date, repositoryFullName?: string | null | undefined): number {
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const row = repositoryFullName === undefined
      ? this.db.prepare("SELECT COUNT(*) AS count FROM forge_runtime_rate_limit_signals WHERE observed_at >= ? AND observed_at <= ?").get(sinceIso, untilIso)
      : this.db.prepare("SELECT COUNT(*) AS count FROM forge_runtime_rate_limit_signals WHERE observed_at >= ? AND observed_at <= ? AND repository_full_name IS ?").get(sinceIso, untilIso, repositoryFullName);
    const count = asRow(row)["count"];
    if (typeof count !== "number" || !Number.isSafeInteger(count)) throw new Error("Rate-limit count was not an integer.");
    return count;
  }

  listEvents(options: { limit?: number | undefined } = {}): RuntimeModeEvent[] {
    return this.db.prepare("SELECT * FROM forge_runtime_mode_events ORDER BY observed_at ASC, event_id ASC LIMIT ?")
      .all(clampLimit(options.limit ?? 100))
      .map((row: unknown) => eventFromRow(asRow(row)));
  }

  close(): void { if (this.ownsDatabase) this.db.close(); }

  private ensureInitialState(): void {
    const nowIso = new Date().toISOString();
    this.db.prepare(`INSERT OR IGNORE INTO forge_runtime_state (singleton_id, mode, previous_mode, kill_switch_engaged, mutating_lane_open, restore_requires_human_ack, reason, changed_by, changed_at, cooldown_until, correlation_id, created_at, updated_at) VALUES (1, 'observe', NULL, 0, 0, 0, ?, ?, ?, NULL, NULL, ?, ?)`).run("runtime mode initialized from T014 policy", "system://forgeroot/runtime-mode", nowIso, nowIso, nowIso);
  }
}

class DefaultRuntimeModeController implements RuntimeModeController {
  constructor(private readonly store: SqliteRuntimeModeStore) {}
  getSnapshot(): RuntimeModeSnapshot { return this.store.getSnapshot(); }

  authorizeOperation(operation: RuntimeOperation, snapshot = this.store.getSnapshot()): RuntimeAuthorization {
    if (snapshot.killSwitchEngaged && operation !== "restore_runtime_mode") {
      return MODE_ALLOWED.halted.has(operation)
        ? { allowed: true, mode: snapshot.mode, operation }
        : { allowed: false, mode: snapshot.mode, operation, reason: "kill_switch_engaged" };
    }
    if (snapshot.mode === "halted" && !MODE_ALLOWED.halted.has(operation)) return { allowed: false, mode: snapshot.mode, operation, reason: "halted" };
    if (snapshot.mode === "quarantine" && !MODE_ALLOWED.quarantine.has(operation)) return { allowed: false, mode: snapshot.mode, operation, reason: "quarantine_restriction" };
    if (!MODE_ALLOWED[snapshot.mode].has(operation)) return { allowed: false, mode: snapshot.mode, operation, reason: "operation_not_in_mode" };
    return { allowed: true, mode: snapshot.mode, operation };
  }

  setMode(input: SetRuntimeModeInput): RuntimeTransitionResult {
    const current = this.store.getSnapshot();
    const leavingStop = (current.mode === "halted" || current.mode === "quarantine" || current.killSwitchEngaged) && input.mode !== "halted" && input.mode !== "quarantine";
    if (leavingStop && current.restoreRequiresHumanAck && input.humanAck !== true) return { ok: false, reason: "human_ack_required", snapshot: current };
    const snapshot = this.store.writeTransition({ toMode: input.mode, actor: input.actor, reason: input.reason, trigger: input.trigger ?? "manual", now: input.now, correlationId: input.correlationId, cooldownUntil: input.cooldownUntil, killSwitchEngaged: false, restoreRequiresHumanAck: false });
    return { ok: true, snapshot };
  }

  activateKillSwitch(input: KillSwitchInput): RuntimeModeSnapshot {
    return this.store.writeTransition({ toMode: "halted", actor: input.actor, reason: input.reason, trigger: "kill_switch", now: input.now, correlationId: input.correlationId, killSwitchEngaged: true, restoreRequiresHumanAck: true, metadata: { mutating_lane_closed_by: "kill_switch" } });
  }

  enterQuarantine(input: QuarantineInput): RuntimeModeSnapshot {
    return this.store.writeTransition({ toMode: "quarantine", actor: input.actor, reason: input.reason, trigger: input.trigger ?? "policy_breach", now: input.now, correlationId: input.correlationId, killSwitchEngaged: false, restoreRequiresHumanAck: true, metadata: { quarantine: true } });
  }

  restoreMode(input: RestoreRuntimeModeInput): RuntimeTransitionResult {
    return this.setMode({ mode: input.mode, actor: input.actor, reason: input.reason, trigger: "restore", now: input.now, correlationId: input.correlationId, humanAck: input.humanAck });
  }

  recordRateLimitSignal(input: RateLimitSignalInput): RateLimitSignalResult {
    const now = input.now ?? new Date();
    const signal = this.store.recordRateLimitSignal({ ...input, now });
    const count = this.store.countRateLimitSignalsSince(new Date(now.getTime() - RATE_LIMIT_WINDOW_MS), now, input.repositoryFullName);
    const current = this.store.getSnapshot();
    if (count < RATE_LIMIT_DOWNGRADE_THRESHOLD) return { kind: "recorded", signal, countInWindow: count, snapshot: current };
    const toMode = downgradeRuntimeMode(current.mode);
    if (toMode === current.mode) return { kind: "recorded", signal, countInWindow: count, snapshot: current };
    const snapshot = this.store.writeTransition({ toMode, actor: "system://forgeroot/rate-governor", reason: `repeated ${input.statusCode} rate-limit signal within PT15M`, trigger: "rate_limit", now, correlationId: input.correlationId, killSwitchEngaged: false, restoreRequiresHumanAck: current.restoreRequiresHumanAck, metadata: { source: input.source, repository_full_name: input.repositoryFullName ?? null, count_in_window: count, window: "PT15M" } });
    return { kind: "downgraded", signal, countInWindow: count, fromMode: current.mode, toMode, snapshot };
  }
}

function set(values: RuntimeOperation[]): ReadonlySet<RuntimeOperation> { return new Set(values); }
function bit(value: boolean): 0 | 1 { return value ? 1 : 0; }
function eventType(trigger: RuntimeTrigger, toMode: RuntimeMode): string {
  if (trigger === "kill_switch") return "kill_switch_engaged";
  if (trigger === "restore") return "runtime_mode_restored";
  if (trigger === "rate_limit") return "runtime_mode_downgraded";
  if (toMode === "quarantine") return "quarantine_entered";
  return "runtime_mode_changed";
}
function ensureDatabaseDirectory(databasePath: string): void {
  if (databasePath === ":memory:" || databasePath.startsWith("file:")) return;
  const directory = dirname(databasePath);
  if (directory.length > 0 && directory !== ".") mkdirSync(directory, { recursive: true });
}
function asRow(value: unknown): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("SQLite query did not return an object row.");
  return value as Row;
}
function readString(row: Row, key: string): string {
  const value = row[key];
  if (typeof value !== "string") throw new Error(`SQLite column ${key} was not a string.`);
  return value;
}
function readNullableString(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error(`SQLite column ${key} was not a nullable string.`);
  return value;
}
function readNumber(row: Row, key: string): number {
  const value = row[key];
  if (typeof value === "number" && Number.isSafeInteger(value)) return value;
  throw new Error(`SQLite column ${key} was not a safe integer.`);
}
function readBool(row: Row, key: string): boolean {
  const value = readNumber(row, key);
  if (value === 0) return false;
  if (value === 1) return true;
  throw new Error(`SQLite column ${key} was not a boolean integer.`);
}
function readMode(row: Row, key: string): RuntimeMode {
  const value = readString(row, key);
  if (!isRuntimeMode(value)) throw new Error(`SQLite column ${key} had unknown runtime mode: ${value}`);
  return value;
}
function readNullableMode(row: Row, key: string): RuntimeMode | null {
  const value = readNullableString(row, key);
  if (value === null) return null;
  if (!isRuntimeMode(value)) throw new Error(`SQLite column ${key} had unknown runtime mode: ${value}`);
  return value;
}
function readTrigger(row: Row, key: string): RuntimeTrigger {
  const value = readString(row, key);
  if (value === "manual" || value === "kill_switch" || value === "rate_limit" || value === "policy_breach" || value === "security_gate" || value === "restore") return value;
  throw new Error(`SQLite column ${key} had unknown runtime trigger: ${value}`);
}
function readRateStatus(row: Row, key: string): 403 | 429 {
  const value = readNumber(row, key);
  if (value === 403 || value === 429) return value;
  throw new Error(`SQLite column ${key} was not a supported rate-limit status.`);
}
function snapshotFromRow(row: Row): RuntimeModeSnapshot {
  return {
    mode: readMode(row, "mode"),
    previousMode: readNullableMode(row, "previous_mode"),
    killSwitchEngaged: readBool(row, "kill_switch_engaged"),
    mutatingLaneOpen: readBool(row, "mutating_lane_open"),
    restoreRequiresHumanAck: readBool(row, "restore_requires_human_ack"),
    reason: readString(row, "reason"),
    changedBy: readString(row, "changed_by"),
    changedAt: readString(row, "changed_at"),
    cooldownUntil: readNullableString(row, "cooldown_until"),
    correlationId: readNullableString(row, "correlation_id"),
    updatedAt: readString(row, "updated_at"),
  };
}
function eventFromRow(row: Row): RuntimeModeEvent {
  return {
    eventId: readNumber(row, "event_id"),
    eventType: readString(row, "event_type"),
    fromMode: readNullableMode(row, "from_mode"),
    toMode: readMode(row, "to_mode"),
    killSwitchEngaged: readBool(row, "kill_switch_engaged"),
    mutatingLaneOpen: readBool(row, "mutating_lane_open"),
    restoreRequiresHumanAck: readBool(row, "restore_requires_human_ack"),
    actor: readString(row, "actor"),
    reason: readString(row, "reason"),
    trigger: readTrigger(row, "trigger"),
    correlationId: readNullableString(row, "correlation_id"),
    observedAt: readString(row, "observed_at"),
    metadataJson: readNullableString(row, "metadata_json"),
  };
}
function signalFromRow(row: Row): RateLimitSignal {
  return {
    signalId: readNumber(row, "signal_id"),
    statusCode: readRateStatus(row, "status_code"),
    source: readString(row, "source"),
    repositoryFullName: readNullableString(row, "repository_full_name"),
    correlationId: readNullableString(row, "correlation_id"),
    observedAt: readString(row, "observed_at"),
  };
}
function clampLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit <= 0) return 100;
  return Math.min(limit, 1000);
}
