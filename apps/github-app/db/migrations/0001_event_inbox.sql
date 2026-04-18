-- ForgeRoot T008 event inbox schema.
-- delivery_id is the idempotency key sourced from X-GitHub-Delivery.
-- Runtime DB state is derived and replay-ready; Git + .forge remain authoritative.

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

INSERT OR IGNORE INTO forge_schema_migrations (version, name, applied_at)
VALUES ('0001_event_inbox', 'event inbox and idempotency', CURRENT_TIMESTAMP);
