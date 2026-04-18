import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
const EVENT_INBOX_MIGRATION_VERSION = "0001_event_inbox";
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const DEFAULT_RETRY_DELAY_MS = 60 * 1000;
const MAX_ERROR_LENGTH = 4096;
export const EVENT_INBOX_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS forge_schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forge_event_inbox (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  action TEXT,
  received_at TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  hook_id TEXT,
  installation_id INTEGER,
  repository_full_name TEXT,
  sender_login TEXT,
  raw_body_sha256 TEXT NOT NULL CHECK (raw_body_sha256 LIKE 'sha256:%' AND length(raw_body_sha256) = 71),
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('received', 'processing', 'processed', 'failed_retryable', 'failed_terminal')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  next_attempt_at TEXT,
  locked_by TEXT,
  locked_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forge_event_inbox_ready
  ON forge_event_inbox (status, next_attempt_at, locked_until, created_at);

CREATE INDEX IF NOT EXISTS idx_forge_event_inbox_repo_time
  ON forge_event_inbox (repository_full_name, received_at);

CREATE INDEX IF NOT EXISTS idx_forge_event_inbox_raw_hash
  ON forge_event_inbox (raw_body_sha256);
`;
export function openSqliteEventInbox(databasePath = ":memory:") {
    return new SqliteEventInbox(databasePath);
}
export class SqliteEventInbox {
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
        this.applyPragmas();
        this.applyMigrations();
    }
    enqueue(delivery, now = new Date()) {
        const nowIso = now.toISOString();
        const existing = this.get(delivery.deliveryId);
        if (existing !== null) {
            if (existing.rawBodySha256 !== delivery.rawBodySha256) {
                this.db
                    .prepare(`UPDATE forge_event_inbox
             SET last_seen_at = ?,
                 last_error = ?,
                 updated_at = ?
             WHERE delivery_id = ?`)
                    .run(nowIso, "delivery_id_hash_mismatch", nowIso, delivery.deliveryId);
                const record = this.getOrThrow(delivery.deliveryId);
                return {
                    kind: "conflict",
                    reason: "delivery_id_hash_mismatch",
                    record,
                    incomingRawBodySha256: delivery.rawBodySha256,
                    storedRawBodySha256: existing.rawBodySha256,
                };
            }
            this.db
                .prepare(`UPDATE forge_event_inbox
           SET duplicate_count = duplicate_count + 1,
               last_seen_at = ?,
               updated_at = ?
           WHERE delivery_id = ?`)
                .run(nowIso, nowIso, delivery.deliveryId);
            return { kind: "duplicate", record: this.getOrThrow(delivery.deliveryId) };
        }
        const payloadJson = JSON.stringify(delivery.payload);
        this.db
            .prepare(`INSERT INTO forge_event_inbox (
           delivery_id,
           event_name,
           action,
           received_at,
           first_seen_at,
           last_seen_at,
           hook_id,
           installation_id,
           repository_full_name,
           sender_login,
           raw_body_sha256,
           payload_json,
           status,
           attempts,
           duplicate_count,
           next_attempt_at,
           locked_by,
           locked_until,
           last_error,
           created_at,
           updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'received', 0, 0, NULL, NULL, NULL, NULL, ?, ?)`)
            .run(delivery.deliveryId, delivery.eventName, delivery.action, delivery.receivedAt, nowIso, nowIso, delivery.hookId, delivery.installationId, delivery.repositoryFullName, delivery.senderLogin, delivery.rawBodySha256, payloadJson, nowIso, nowIso);
        return { kind: "inserted", record: this.getOrThrow(delivery.deliveryId) };
    }
    get(deliveryId) {
        const row = this.db.prepare(`SELECT * FROM forge_event_inbox WHERE delivery_id = ?`).get(deliveryId);
        return row === undefined ? null : rowToRecord(asRow(row));
    }
    list(options = {}) {
        const limit = clampLimit(options.limit ?? 100);
        const rows = options.status === undefined
            ? this.db
                .prepare(`SELECT * FROM forge_event_inbox ORDER BY created_at ASC, delivery_id ASC LIMIT ?`)
                .all(limit)
            : this.db
                .prepare(`SELECT * FROM forge_event_inbox
               WHERE status = ?
               ORDER BY created_at ASC, delivery_id ASC
               LIMIT ?`)
                .all(options.status, limit);
        return rows.map((row) => rowToRecord(asRow(row)));
    }
    claimNextForProcessing(options) {
        const now = options.now ?? new Date();
        const nowIso = now.toISOString();
        const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
        const lockedUntil = new Date(now.getTime() + leaseMs).toISOString();
        this.db.exec("BEGIN IMMEDIATE");
        try {
            const row = this.db
                .prepare(`SELECT * FROM forge_event_inbox
           WHERE (
             status = 'received'
             OR (status = 'failed_retryable' AND (next_attempt_at IS NULL OR next_attempt_at <= ?))
           )
           AND (locked_until IS NULL OR locked_until <= ?)
           ORDER BY created_at ASC, delivery_id ASC
           LIMIT 1`)
                .get(nowIso, nowIso);
            if (row === undefined) {
                this.db.exec("COMMIT");
                return null;
            }
            const record = rowToRecord(asRow(row));
            this.db
                .prepare(`UPDATE forge_event_inbox
           SET status = 'processing',
               attempts = attempts + 1,
               locked_by = ?,
               locked_until = ?,
               last_error = NULL,
               updated_at = ?
           WHERE delivery_id = ?`)
                .run(options.workerId, lockedUntil, nowIso, record.deliveryId);
            this.db.exec("COMMIT");
            return this.getOrThrow(record.deliveryId);
        }
        catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }
    }
    markProcessed(deliveryId, now = new Date()) {
        const nowIso = now.toISOString();
        const result = this.db
            .prepare(`UPDATE forge_event_inbox
         SET status = 'processed',
             next_attempt_at = NULL,
             locked_by = NULL,
             locked_until = NULL,
             last_error = NULL,
             updated_at = ?
         WHERE delivery_id = ?`)
            .run(nowIso, deliveryId);
        return result.changes === 0 ? null : this.getOrThrow(deliveryId);
    }
    markFailed(deliveryId, options) {
        const now = options.now ?? new Date();
        const nowIso = now.toISOString();
        const status = options.retryable ? "failed_retryable" : "failed_terminal";
        const nextAttemptAt = options.retryable
            ? (options.nextAttemptAt ?? new Date(now.getTime() + DEFAULT_RETRY_DELAY_MS)).toISOString()
            : null;
        const errorMessage = truncate(normalizeError(options.error), MAX_ERROR_LENGTH);
        const result = this.db
            .prepare(`UPDATE forge_event_inbox
         SET status = ?,
             next_attempt_at = ?,
             locked_by = NULL,
             locked_until = NULL,
             last_error = ?,
             updated_at = ?
         WHERE delivery_id = ?`)
            .run(status, nextAttemptAt, errorMessage, nowIso, deliveryId);
        return result.changes === 0 ? null : this.getOrThrow(deliveryId);
    }
    close() {
        if (this.ownsDatabase) {
            this.db.close();
        }
    }
    getOrThrow(deliveryId) {
        const record = this.get(deliveryId);
        if (record === null) {
            throw new Error(`Event inbox record was not found after write: ${deliveryId}`);
        }
        return record;
    }
    applyPragmas() {
        this.db.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA busy_timeout = 5000;
      PRAGMA journal_mode = WAL;
    `);
    }
    applyMigrations() {
        const appliedAt = new Date().toISOString();
        this.db.exec(EVENT_INBOX_MIGRATION_SQL);
        this.db
            .prepare(`INSERT OR IGNORE INTO forge_schema_migrations (version, name, applied_at)
         VALUES (?, ?, ?)`)
            .run(EVENT_INBOX_MIGRATION_VERSION, "event inbox and idempotency", appliedAt);
    }
}
export function isEventInboxEnqueueResult(value) {
    if (typeof value !== "object" || value === null || !("kind" in value)) {
        return false;
    }
    const kind = value.kind;
    return kind === "inserted" || kind === "duplicate" || kind === "conflict";
}
export function createEventInboxHandoff(inbox, options = {}) {
    return {
        async enqueue(delivery) {
            const result = inbox.enqueue(delivery);
            options.onResult?.(result, delivery);
            if (result.kind === "inserted") {
                await options.downstream?.enqueue(delivery);
            }
        },
    };
}
function ensureDatabaseDirectory(databasePath) {
    if (databasePath === ":memory:" || databasePath.startsWith("file:")) {
        return;
    }
    const directory = dirname(databasePath);
    if (directory.length > 0 && directory !== ".") {
        mkdirSync(directory, { recursive: true });
    }
}
function rowToRecord(row) {
    const payloadJson = readString(row, "payload_json");
    const payload = parsePayload(payloadJson);
    return {
        deliveryId: readString(row, "delivery_id"),
        eventName: readString(row, "event_name"),
        action: readNullableString(row, "action"),
        receivedAt: readString(row, "received_at"),
        firstSeenAt: readString(row, "first_seen_at"),
        lastSeenAt: readString(row, "last_seen_at"),
        hookId: readNullableString(row, "hook_id"),
        installationId: readNullableNumber(row, "installation_id"),
        repositoryFullName: readNullableString(row, "repository_full_name"),
        senderLogin: readNullableString(row, "sender_login"),
        rawBodySha256: readHash(row, "raw_body_sha256"),
        payloadJson,
        payload,
        status: readStatus(row, "status"),
        attempts: readNumber(row, "attempts"),
        duplicateCount: readNumber(row, "duplicate_count"),
        nextAttemptAt: readNullableString(row, "next_attempt_at"),
        lockedBy: readNullableString(row, "locked_by"),
        lockedUntil: readNullableString(row, "locked_until"),
        lastError: readNullableString(row, "last_error"),
        createdAt: readString(row, "created_at"),
        updatedAt: readString(row, "updated_at"),
    };
}
function asRow(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error("SQLite query did not return an object row.");
    }
    return value;
}
function readString(row, key) {
    const value = row[key];
    if (typeof value !== "string") {
        throw new Error(`SQLite column ${key} was not a string.`);
    }
    return value;
}
function readNullableString(row, key) {
    const value = row[key];
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value !== "string") {
        throw new Error(`SQLite column ${key} was not a nullable string.`);
    }
    return value;
}
function readNumber(row, key) {
    const value = row[key];
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return value;
    }
    throw new Error(`SQLite column ${key} was not a safe integer.`);
}
function readNullableNumber(row, key) {
    const value = row[key];
    if (value === null || value === undefined) {
        return null;
    }
    if (typeof value === "number" && Number.isSafeInteger(value)) {
        return value;
    }
    throw new Error(`SQLite column ${key} was not a nullable safe integer.`);
}
function readHash(row, key) {
    const value = readString(row, key);
    if (!/^sha256:[0-9a-f]{64}$/.test(value)) {
        throw new Error(`SQLite column ${key} was not a sha256 digest.`);
    }
    return value;
}
function readStatus(row, key) {
    const value = readString(row, key);
    switch (value) {
        case "received":
        case "processing":
        case "processed":
        case "failed_retryable":
        case "failed_terminal":
            return value;
        default:
            throw new Error(`SQLite column ${key} had unknown event inbox status: ${value}`);
    }
}
function parsePayload(payloadJson) {
    const parsed = JSON.parse(payloadJson);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("Stored webhook payload was not a JSON object.");
    }
    return parsed;
}
function clampLimit(limit) {
    if (!Number.isSafeInteger(limit) || limit <= 0) {
        return 100;
    }
    return Math.min(limit, 1000);
}
function normalizeError(error) {
    if (typeof error === "string") {
        return error;
    }
    if (error instanceof Error) {
        return error.stack ?? error.message;
    }
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function truncate(value, maxLength) {
    return value.length <= maxLength ? value : value.slice(0, maxLength);
}
//# sourceMappingURL=event-inbox.js.map