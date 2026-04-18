import { DatabaseSync } from "node:sqlite";
import type { AcceptedWebhookDelivery, JsonObject, WebhookHandoff } from "./webhooks.js";
export type EventInboxStatus = "received" | "processing" | "processed" | "failed_retryable" | "failed_terminal";
export type EventInboxEnqueueKind = "inserted" | "duplicate" | "conflict";
export interface EventInboxRecord {
    deliveryId: string;
    eventName: string;
    action: string | null;
    receivedAt: string;
    firstSeenAt: string;
    lastSeenAt: string;
    hookId: string | null;
    installationId: number | null;
    repositoryFullName: string | null;
    senderLogin: string | null;
    rawBodySha256: `sha256:${string}`;
    payloadJson: string;
    payload: JsonObject;
    status: EventInboxStatus;
    attempts: number;
    duplicateCount: number;
    nextAttemptAt: string | null;
    lockedBy: string | null;
    lockedUntil: string | null;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
}
export type EventInboxEnqueueResult = {
    kind: "inserted";
    record: EventInboxRecord;
} | {
    kind: "duplicate";
    record: EventInboxRecord;
} | {
    kind: "conflict";
    reason: "delivery_id_hash_mismatch";
    record: EventInboxRecord;
    incomingRawBodySha256: `sha256:${string}`;
    storedRawBodySha256: `sha256:${string}`;
};
export interface ClaimEventOptions {
    workerId: string;
    leaseMs?: number;
    now?: Date;
}
export interface MarkFailedOptions {
    retryable: boolean;
    error: unknown;
    nextAttemptAt?: Date;
    now?: Date;
}
export interface ListEventInboxOptions {
    status?: EventInboxStatus;
    limit?: number;
}
export interface EventInbox {
    enqueue(delivery: AcceptedWebhookDelivery, now?: Date): EventInboxEnqueueResult;
    get(deliveryId: string): EventInboxRecord | null;
    list(options?: ListEventInboxOptions): EventInboxRecord[];
    claimNextForProcessing(options: ClaimEventOptions): EventInboxRecord | null;
    markProcessed(deliveryId: string, now?: Date): EventInboxRecord | null;
    markFailed(deliveryId: string, options: MarkFailedOptions): EventInboxRecord | null;
    close(): void;
}
export interface InboxWebhookHandoffOptions {
    downstream?: WebhookHandoff;
    onResult?: (result: EventInboxEnqueueResult, delivery: AcceptedWebhookDelivery) => void;
}
export declare const EVENT_INBOX_MIGRATION_SQL = "\nCREATE TABLE IF NOT EXISTS forge_schema_migrations (\n  version TEXT PRIMARY KEY,\n  name TEXT NOT NULL,\n  applied_at TEXT NOT NULL\n);\n\nCREATE TABLE IF NOT EXISTS forge_event_inbox (\n  delivery_id TEXT PRIMARY KEY,\n  event_name TEXT NOT NULL,\n  action TEXT,\n  received_at TEXT NOT NULL,\n  first_seen_at TEXT NOT NULL,\n  last_seen_at TEXT NOT NULL,\n  hook_id TEXT,\n  installation_id INTEGER,\n  repository_full_name TEXT,\n  sender_login TEXT,\n  raw_body_sha256 TEXT NOT NULL CHECK (raw_body_sha256 LIKE 'sha256:%' AND length(raw_body_sha256) = 71),\n  payload_json TEXT NOT NULL,\n  status TEXT NOT NULL CHECK (status IN ('received', 'processing', 'processed', 'failed_retryable', 'failed_terminal')),\n  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),\n  duplicate_count INTEGER NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),\n  next_attempt_at TEXT,\n  locked_by TEXT,\n  locked_until TEXT,\n  last_error TEXT,\n  created_at TEXT NOT NULL,\n  updated_at TEXT NOT NULL\n);\n\nCREATE INDEX IF NOT EXISTS idx_forge_event_inbox_ready\n  ON forge_event_inbox (status, next_attempt_at, locked_until, created_at);\n\nCREATE INDEX IF NOT EXISTS idx_forge_event_inbox_repo_time\n  ON forge_event_inbox (repository_full_name, received_at);\n\nCREATE INDEX IF NOT EXISTS idx_forge_event_inbox_raw_hash\n  ON forge_event_inbox (raw_body_sha256);\n";
export declare function openSqliteEventInbox(databasePath?: string): SqliteEventInbox;
export declare class SqliteEventInbox implements EventInbox {
    private readonly db;
    private readonly ownsDatabase;
    constructor(databasePathOrHandle?: string | DatabaseSync);
    enqueue(delivery: AcceptedWebhookDelivery, now?: Date): EventInboxEnqueueResult;
    get(deliveryId: string): EventInboxRecord | null;
    list(options?: ListEventInboxOptions): EventInboxRecord[];
    claimNextForProcessing(options: ClaimEventOptions): EventInboxRecord | null;
    markProcessed(deliveryId: string, now?: Date): EventInboxRecord | null;
    markFailed(deliveryId: string, options: MarkFailedOptions): EventInboxRecord | null;
    close(): void;
    private getOrThrow;
    private applyPragmas;
    private applyMigrations;
}
export declare function isEventInboxEnqueueResult(value: unknown): value is EventInboxEnqueueResult;
export declare function createEventInboxHandoff(inbox: EventInbox, options?: InboxWebhookHandoffOptions): WebhookHandoff;
