import { DatabaseSync } from "node:sqlite";
export declare const RUNTIME_MODES: readonly ["observe", "propose", "evolve", "federate", "quarantine", "halted"];
export type RuntimeMode = (typeof RUNTIME_MODES)[number];
export declare const RUNTIME_OPERATIONS: readonly ["webhook_ingest", "event_inbox_enqueue", "read_repository", "classify_event", "create_plan", "create_issue", "create_comment", "create_branch", "commit_patch", "open_pull_request", "update_pull_request", "create_check_run", "run_sandbox", "docs_only_incident_pr", "incident_report", "replay_diagnosis", "network_sync", "treaty_update", "self_evolution", "workflow_mutation", "auto_merge", "restore_runtime_mode"];
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
export interface KillSwitchInput {
    actor: string;
    reason: string;
    now?: Date | undefined;
    correlationId?: string | null | undefined;
}
export interface QuarantineInput {
    actor: string;
    reason: string;
    now?: Date | undefined;
    trigger?: RuntimeTrigger | undefined;
    correlationId?: string | null | undefined;
}
export interface RestoreRuntimeModeInput {
    mode: Exclude<RuntimeMode, "halted" | "quarantine">;
    actor: string;
    reason: string;
    humanAck: boolean;
    now?: Date | undefined;
    correlationId?: string | null | undefined;
}
export interface RateLimitSignalInput {
    statusCode: 403 | 429;
    source: string;
    now?: Date | undefined;
    repositoryFullName?: string | null | undefined;
    correlationId?: string | null | undefined;
}
export type RuntimeAuthorization = {
    allowed: true;
    mode: RuntimeMode;
    operation: RuntimeOperation;
} | {
    allowed: false;
    mode: RuntimeMode;
    operation: RuntimeOperation;
    reason: "operation_not_in_mode" | "halted" | "kill_switch_engaged" | "quarantine_restriction";
};
export type RuntimeTransitionResult = {
    ok: true;
    snapshot: RuntimeModeSnapshot;
} | {
    ok: false;
    reason: "human_ack_required" | "invalid_restore_target";
    snapshot: RuntimeModeSnapshot;
};
export type RateLimitSignalResult = {
    kind: "recorded";
    signal: RateLimitSignal;
    countInWindow: number;
    snapshot: RuntimeModeSnapshot;
} | {
    kind: "downgraded";
    signal: RateLimitSignal;
    countInWindow: number;
    fromMode: RuntimeMode;
    toMode: RuntimeMode;
    snapshot: RuntimeModeSnapshot;
};
export interface RuntimeModeController {
    getSnapshot(): RuntimeModeSnapshot;
    authorizeOperation(operation: RuntimeOperation, snapshot?: RuntimeModeSnapshot): RuntimeAuthorization;
    setMode(input: SetRuntimeModeInput): RuntimeTransitionResult;
    activateKillSwitch(input: KillSwitchInput): RuntimeModeSnapshot;
    enterQuarantine(input: QuarantineInput): RuntimeModeSnapshot;
    restoreMode(input: RestoreRuntimeModeInput): RuntimeTransitionResult;
    recordRateLimitSignal(input: RateLimitSignalInput): RateLimitSignalResult;
}
export declare const RUNTIME_MODE_MIGRATION_SQL = "\nCREATE TABLE IF NOT EXISTS forge_schema_migrations (version TEXT PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL);\nCREATE TABLE IF NOT EXISTS forge_runtime_state (\n  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),\n  mode TEXT NOT NULL CHECK (mode IN ('observe','propose','evolve','federate','quarantine','halted')),\n  previous_mode TEXT CHECK (previous_mode IS NULL OR previous_mode IN ('observe','propose','evolve','federate','quarantine','halted')),\n  kill_switch_engaged INTEGER NOT NULL CHECK (kill_switch_engaged IN (0,1)),\n  mutating_lane_open INTEGER NOT NULL CHECK (mutating_lane_open IN (0,1)),\n  restore_requires_human_ack INTEGER NOT NULL CHECK (restore_requires_human_ack IN (0,1)),\n  reason TEXT NOT NULL,\n  changed_by TEXT NOT NULL,\n  changed_at TEXT NOT NULL,\n  cooldown_until TEXT,\n  correlation_id TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\nCREATE TABLE IF NOT EXISTS forge_runtime_mode_events (\n  event_id INTEGER PRIMARY KEY AUTOINCREMENT,\n  event_type TEXT NOT NULL,\n  from_mode TEXT CHECK (from_mode IS NULL OR from_mode IN ('observe','propose','evolve','federate','quarantine','halted')),\n  to_mode TEXT NOT NULL CHECK (to_mode IN ('observe','propose','evolve','federate','quarantine','halted')),\n  kill_switch_engaged INTEGER NOT NULL CHECK (kill_switch_engaged IN (0,1)),\n  mutating_lane_open INTEGER NOT NULL CHECK (mutating_lane_open IN (0,1)),\n  restore_requires_human_ack INTEGER NOT NULL CHECK (restore_requires_human_ack IN (0,1)),\n  actor TEXT NOT NULL,\n  reason TEXT NOT NULL,\n  trigger TEXT NOT NULL,\n  correlation_id TEXT,\n  observed_at TEXT NOT NULL,\n  metadata_json TEXT\n);\nCREATE TABLE IF NOT EXISTS forge_runtime_rate_limit_signals (\n  signal_id INTEGER PRIMARY KEY AUTOINCREMENT,\n  status_code INTEGER NOT NULL CHECK (status_code IN (403,429)),\n  source TEXT NOT NULL,\n  repository_full_name TEXT,\n  correlation_id TEXT,\n  observed_at TEXT NOT NULL\n);\nCREATE INDEX IF NOT EXISTS idx_forge_runtime_events_observed_at ON forge_runtime_mode_events (observed_at);\nCREATE INDEX IF NOT EXISTS idx_forge_runtime_rate_limit_signals_window ON forge_runtime_rate_limit_signals (repository_full_name, observed_at, status_code);\n";
export declare function isRuntimeMode(value: string): value is RuntimeMode;
export declare function isMutatingLaneMode(mode: RuntimeMode): boolean;
export declare function downgradeRuntimeMode(mode: RuntimeMode): RuntimeMode;
export declare function openSqliteRuntimeModeStore(databasePath?: string): SqliteRuntimeModeStore;
export declare function createRuntimeModeController(store?: SqliteRuntimeModeStore): RuntimeModeController;
export declare class SqliteRuntimeModeStore {
    private readonly db;
    private readonly ownsDatabase;
    constructor(databasePathOrHandle?: string | DatabaseSync);
    getSnapshot(): RuntimeModeSnapshot;
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
    }): RuntimeModeSnapshot;
    recordRateLimitSignal(input: RateLimitSignalInput): RateLimitSignal;
    countRateLimitSignalsSince(since: Date, until: Date, repositoryFullName?: string | null | undefined): number;
    listEvents(options?: {
        limit?: number | undefined;
    }): RuntimeModeEvent[];
    close(): void;
    private ensureInitialState;
}
