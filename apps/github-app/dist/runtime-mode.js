import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
export const RUNTIME_MODES = ["observe", "propose", "evolve", "federate", "quarantine", "halted"];
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
];
const MODE_SET = new Set(RUNTIME_MODES);
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_DOWNGRADE_THRESHOLD = 2;
const MUTATING_LANE_MODES = new Set(["evolve", "federate"]);
const BASE = ["webhook_ingest", "event_inbox_enqueue", "read_repository", "classify_event", "replay_diagnosis", "restore_runtime_mode"];
const MODE_ALLOWED = {
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
export function isRuntimeMode(value) { return MODE_SET.has(value); }
export function isMutatingLaneMode(mode) { return MUTATING_LANE_MODES.has(mode); }
export function downgradeRuntimeMode(mode) {
    if (mode === "evolve" || mode === "federate")
        return "propose";
    if (mode === "propose")
        return "observe";
    return mode;
}
export function openSqliteRuntimeModeStore(databasePath = ":memory:") { return new SqliteRuntimeModeStore(databasePath); }
export function createRuntimeModeController(store = openSqliteRuntimeModeStore()) { return new DefaultRuntimeModeController(store); }
export class SqliteRuntimeModeStore {
    db;
    ownsDatabase;
    constructor(databasePathOrHandle = ":memory:") {
        if (typeof databasePathOrHandle === "string") {
            ensureDatabaseDirectory(databasePathOrHandle);
            this.db = new DatabaseSync(databasePathOrHandle);
            this.ownsDatabase = true;
        }
        else {
            this.db = databasePathOrHandle;
            this.ownsDatabase = false;
        }
        this.db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
        this.db.exec(RUNTIME_MODE_MIGRATION_SQL);
        this.db.prepare("INSERT OR IGNORE INTO forge_schema_migrations (version,name,applied_at) VALUES (?,?,?)").run("0002_runtime_mode", "runtime mode and kill switch", new Date().toISOString());
        this.ensureInitialState();
    }
    getSnapshot() {
        const row = this.db.prepare("SELECT * FROM forge_runtime_state WHERE singleton_id = 1").get();
        if (row === undefined)
            throw new Error("Runtime mode state was not initialized.");
        return snapshotFromRow(asRow(row));
    }
    writeTransition(input) {
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
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    recordRateLimitSignal(input) {
        const nowIso = (input.now ?? new Date()).toISOString();
        const result = this.db.prepare("INSERT INTO forge_runtime_rate_limit_signals (status_code, source, repository_full_name, correlation_id, observed_at) VALUES (?,?,?,?,?)")
            .run(input.statusCode, input.source, input.repositoryFullName ?? null, input.correlationId ?? null, nowIso);
        const row = this.db.prepare("SELECT * FROM forge_runtime_rate_limit_signals WHERE signal_id = ?").get(result.lastInsertRowid);
        if (row === undefined)
            throw new Error("Rate-limit signal was not found after insert.");
        return signalFromRow(asRow(row));
    }
    countRateLimitSignalsSince(since, until, repositoryFullName) {
        const sinceIso = since.toISOString();
        const untilIso = until.toISOString();
        const row = repositoryFullName === undefined
            ? this.db.prepare("SELECT COUNT(*) AS count FROM forge_runtime_rate_limit_signals WHERE observed_at >= ? AND observed_at <= ?").get(sinceIso, untilIso)
            : this.db.prepare("SELECT COUNT(*) AS count FROM forge_runtime_rate_limit_signals WHERE observed_at >= ? AND observed_at <= ? AND repository_full_name IS ?").get(sinceIso, untilIso, repositoryFullName);
        const count = asRow(row)["count"];
        if (typeof count !== "number" || !Number.isSafeInteger(count))
            throw new Error("Rate-limit count was not an integer.");
        return count;
    }
    listEvents(options = {}) {
        return this.db.prepare("SELECT * FROM forge_runtime_mode_events ORDER BY observed_at ASC, event_id ASC LIMIT ?")
            .all(clampLimit(options.limit ?? 100))
            .map((row) => eventFromRow(asRow(row)));
    }
    close() { if (this.ownsDatabase)
        this.db.close(); }
    ensureInitialState() {
        const nowIso = new Date().toISOString();
        this.db.prepare(`INSERT OR IGNORE INTO forge_runtime_state (singleton_id, mode, previous_mode, kill_switch_engaged, mutating_lane_open, restore_requires_human_ack, reason, changed_by, changed_at, cooldown_until, correlation_id, created_at, updated_at) VALUES (1, 'observe', NULL, 0, 0, 0, ?, ?, ?, NULL, NULL, ?, ?)`).run("runtime mode initialized from T014 policy", "system://forgeroot/runtime-mode", nowIso, nowIso, nowIso);
    }
}
class DefaultRuntimeModeController {
    store;
    constructor(store) {
        this.store = store;
    }
    getSnapshot() { return this.store.getSnapshot(); }
    authorizeOperation(operation, snapshot = this.store.getSnapshot()) {
        if (snapshot.killSwitchEngaged && operation !== "restore_runtime_mode") {
            return MODE_ALLOWED.halted.has(operation)
                ? { allowed: true, mode: snapshot.mode, operation }
                : { allowed: false, mode: snapshot.mode, operation, reason: "kill_switch_engaged" };
        }
        if (snapshot.mode === "halted" && !MODE_ALLOWED.halted.has(operation))
            return { allowed: false, mode: snapshot.mode, operation, reason: "halted" };
        if (snapshot.mode === "quarantine" && !MODE_ALLOWED.quarantine.has(operation))
            return { allowed: false, mode: snapshot.mode, operation, reason: "quarantine_restriction" };
        if (!MODE_ALLOWED[snapshot.mode].has(operation))
            return { allowed: false, mode: snapshot.mode, operation, reason: "operation_not_in_mode" };
        return { allowed: true, mode: snapshot.mode, operation };
    }
    setMode(input) {
        const current = this.store.getSnapshot();
        const leavingStop = (current.mode === "halted" || current.mode === "quarantine" || current.killSwitchEngaged) && input.mode !== "halted" && input.mode !== "quarantine";
        if (leavingStop && current.restoreRequiresHumanAck && input.humanAck !== true)
            return { ok: false, reason: "human_ack_required", snapshot: current };
        const snapshot = this.store.writeTransition({ toMode: input.mode, actor: input.actor, reason: input.reason, trigger: input.trigger ?? "manual", now: input.now, correlationId: input.correlationId, cooldownUntil: input.cooldownUntil, killSwitchEngaged: false, restoreRequiresHumanAck: false });
        return { ok: true, snapshot };
    }
    activateKillSwitch(input) {
        return this.store.writeTransition({ toMode: "halted", actor: input.actor, reason: input.reason, trigger: "kill_switch", now: input.now, correlationId: input.correlationId, killSwitchEngaged: true, restoreRequiresHumanAck: true, metadata: { mutating_lane_closed_by: "kill_switch" } });
    }
    enterQuarantine(input) {
        return this.store.writeTransition({ toMode: "quarantine", actor: input.actor, reason: input.reason, trigger: input.trigger ?? "policy_breach", now: input.now, correlationId: input.correlationId, killSwitchEngaged: false, restoreRequiresHumanAck: true, metadata: { quarantine: true } });
    }
    restoreMode(input) {
        return this.setMode({ mode: input.mode, actor: input.actor, reason: input.reason, trigger: "restore", now: input.now, correlationId: input.correlationId, humanAck: input.humanAck });
    }
    recordRateLimitSignal(input) {
        const now = input.now ?? new Date();
        const signal = this.store.recordRateLimitSignal({ ...input, now });
        const count = this.store.countRateLimitSignalsSince(new Date(now.getTime() - RATE_LIMIT_WINDOW_MS), now, input.repositoryFullName);
        const current = this.store.getSnapshot();
        if (count < RATE_LIMIT_DOWNGRADE_THRESHOLD)
            return { kind: "recorded", signal, countInWindow: count, snapshot: current };
        const toMode = downgradeRuntimeMode(current.mode);
        if (toMode === current.mode)
            return { kind: "recorded", signal, countInWindow: count, snapshot: current };
        const snapshot = this.store.writeTransition({ toMode, actor: "system://forgeroot/rate-governor", reason: `repeated ${input.statusCode} rate-limit signal within PT15M`, trigger: "rate_limit", now, correlationId: input.correlationId, killSwitchEngaged: false, restoreRequiresHumanAck: current.restoreRequiresHumanAck, metadata: { source: input.source, repository_full_name: input.repositoryFullName ?? null, count_in_window: count, window: "PT15M" } });
        return { kind: "downgraded", signal, countInWindow: count, fromMode: current.mode, toMode, snapshot };
    }
}
function set(values) { return new Set(values); }
function bit(value) { return value ? 1 : 0; }
function eventType(trigger, toMode) {
    if (trigger === "kill_switch")
        return "kill_switch_engaged";
    if (trigger === "restore")
        return "runtime_mode_restored";
    if (trigger === "rate_limit")
        return "runtime_mode_downgraded";
    if (toMode === "quarantine")
        return "quarantine_entered";
    return "runtime_mode_changed";
}
function ensureDatabaseDirectory(databasePath) {
    if (databasePath === ":memory:" || databasePath.startsWith("file:"))
        return;
    const directory = dirname(databasePath);
    if (directory.length > 0 && directory !== ".")
        mkdirSync(directory, { recursive: true });
}
function asRow(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("SQLite query did not return an object row.");
    return value;
}
function readString(row, key) {
    const value = row[key];
    if (typeof value !== "string")
        throw new Error(`SQLite column ${key} was not a string.`);
    return value;
}
function readNullableString(row, key) {
    const value = row[key];
    if (value === null || value === undefined)
        return null;
    if (typeof value !== "string")
        throw new Error(`SQLite column ${key} was not a nullable string.`);
    return value;
}
function readNumber(row, key) {
    const value = row[key];
    if (typeof value === "number" && Number.isSafeInteger(value))
        return value;
    throw new Error(`SQLite column ${key} was not a safe integer.`);
}
function readBool(row, key) {
    const value = readNumber(row, key);
    if (value === 0)
        return false;
    if (value === 1)
        return true;
    throw new Error(`SQLite column ${key} was not a boolean integer.`);
}
function readMode(row, key) {
    const value = readString(row, key);
    if (!isRuntimeMode(value))
        throw new Error(`SQLite column ${key} had unknown runtime mode: ${value}`);
    return value;
}
function readNullableMode(row, key) {
    const value = readNullableString(row, key);
    if (value === null)
        return null;
    if (!isRuntimeMode(value))
        throw new Error(`SQLite column ${key} had unknown runtime mode: ${value}`);
    return value;
}
function readTrigger(row, key) {
    const value = readString(row, key);
    if (value === "manual" || value === "kill_switch" || value === "rate_limit" || value === "policy_breach" || value === "security_gate" || value === "restore")
        return value;
    throw new Error(`SQLite column ${key} had unknown runtime trigger: ${value}`);
}
function readRateStatus(row, key) {
    const value = readNumber(row, key);
    if (value === 403 || value === 429)
        return value;
    throw new Error(`SQLite column ${key} was not a supported rate-limit status.`);
}
function snapshotFromRow(row) {
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
function eventFromRow(row) {
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
function signalFromRow(row) {
    return {
        signalId: readNumber(row, "signal_id"),
        statusCode: readRateStatus(row, "status_code"),
        source: readString(row, "source"),
        repositoryFullName: readNullableString(row, "repository_full_name"),
        correlationId: readNullableString(row, "correlation_id"),
        observedAt: readString(row, "observed_at"),
    };
}
function clampLimit(limit) {
    if (!Number.isSafeInteger(limit) || limit <= 0)
        return 100;
    return Math.min(limit, 1000);
}
//# sourceMappingURL=runtime-mode.js.map