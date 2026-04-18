-- ForgeRoot T014 runtime mode and kill switch schema.
-- This is derived control-plane state. .forge/policies/runtime-mode.forge is the policy source of truth.

CREATE TABLE IF NOT EXISTS forge_schema_migrations (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS forge_runtime_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('observe', 'propose', 'evolve', 'federate', 'quarantine', 'halted')),
  previous_mode TEXT CHECK (previous_mode IS NULL OR previous_mode IN ('observe', 'propose', 'evolve', 'federate', 'quarantine', 'halted')),
  kill_switch_engaged INTEGER NOT NULL CHECK (kill_switch_engaged IN (0, 1)),
  mutating_lane_open INTEGER NOT NULL CHECK (mutating_lane_open IN (0, 1)),
  restore_requires_human_ack INTEGER NOT NULL CHECK (restore_requires_human_ack IN (0, 1)),
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
  from_mode TEXT CHECK (from_mode IS NULL OR from_mode IN ('observe', 'propose', 'evolve', 'federate', 'quarantine', 'halted')),
  to_mode TEXT NOT NULL CHECK (to_mode IN ('observe', 'propose', 'evolve', 'federate', 'quarantine', 'halted')),
  kill_switch_engaged INTEGER NOT NULL CHECK (kill_switch_engaged IN (0, 1)),
  mutating_lane_open INTEGER NOT NULL CHECK (mutating_lane_open IN (0, 1)),
  restore_requires_human_ack INTEGER NOT NULL CHECK (restore_requires_human_ack IN (0, 1)),
  actor TEXT NOT NULL,
  reason TEXT NOT NULL,
  trigger TEXT NOT NULL,
  correlation_id TEXT,
  observed_at TEXT NOT NULL,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS forge_runtime_rate_limit_signals (
  signal_id INTEGER PRIMARY KEY AUTOINCREMENT,
  status_code INTEGER NOT NULL CHECK (status_code IN (403, 429)),
  source TEXT NOT NULL,
  repository_full_name TEXT,
  correlation_id TEXT,
  observed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_forge_runtime_events_observed_at
  ON forge_runtime_mode_events (observed_at);

CREATE INDEX IF NOT EXISTS idx_forge_runtime_rate_limit_signals_window
  ON forge_runtime_rate_limit_signals (repository_full_name, observed_at, status_code);

INSERT OR IGNORE INTO forge_runtime_state (
  singleton_id,
  mode,
  previous_mode,
  kill_switch_engaged,
  mutating_lane_open,
  restore_requires_human_ack,
  reason,
  changed_by,
  changed_at,
  cooldown_until,
  correlation_id,
  created_at,
  updated_at
)
VALUES (
  1,
  'observe',
  NULL,
  0,
  0,
  0,
  'runtime mode initialized from T014 policy',
  'system://forgeroot/runtime-mode',
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO forge_schema_migrations (version, name, applied_at)
VALUES ('0002_runtime_mode', 'runtime mode and kill switch', CURRENT_TIMESTAMP);
