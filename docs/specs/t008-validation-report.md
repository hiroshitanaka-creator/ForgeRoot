# T008 validation report — event inbox and idempotency

Date: 2026-04-18
Task: T008 event inbox and idempotency

## Scope implemented

T008 adds durable webhook delivery persistence after T007 signature verification.

Implemented:

- SQLite-backed event inbox runtime implementation
- delivery GUID idempotency keyed by `X-GitHub-Delivery`
- insert / duplicate / conflict enqueue outcomes
- downstream handoff only for first-seen deliveries
- replay-ready payload and metadata persistence
- status transitions for processing, processed, retryable failure, and terminal failure
- DB migration for the event inbox table
- idempotency, transition, persistence, and server integration tests

Still out of scope:

- full replay engine
- telemetry dashboard
- mutation scheduling
- planner integration
- rate governor queue
- production DB adapter beyond the SQLite seed

## Runtime files

- `apps/github-app/src/event-inbox.ts`
- `apps/github-app/src/server.ts`
- `apps/github-app/src/webhooks.ts`
- `apps/github-app/db/migrations/0001_event_inbox.sql`
- `apps/github-app/tests/event-inbox.test.mjs`
- `apps/github-app/tests/webhooks.test.mjs`
- `docs/ops/event-inbox.md`

## Event inbox table

Primary table: `forge_event_inbox`

Primary key:

- `delivery_id`

Replay metadata:

- `event_name`
- `action`
- `received_at`
- `hook_id`
- `installation_id`
- `repository_full_name`
- `sender_login`
- `raw_body_sha256`
- `payload_json`

Processing state:

- `status`
- `attempts`
- `duplicate_count`
- `next_attempt_at`
- `locked_by`
- `locked_until`
- `last_error`
- `created_at`
- `updated_at`

## Status model

```text
received -> processing -> processed
received -> processing -> failed_retryable -> processing -> processed
received -> processing -> failed_terminal
```

## Idempotency behavior

| Case | Result | Downstream handoff |
|---|---:|---:|
| first delivery GUID | `inserted` | yes |
| same delivery GUID + same hash | `duplicate` | no |
| same delivery GUID + different hash | `conflict` | no |
| invalid signature | rejected before inbox | no |
| ignored event/action | acknowledged before inbox | no |

## Validation commands

```bash
cd apps/github-app
/usr/bin/timeout 5s tsc -p tsconfig.json --pretty false
/usr/bin/timeout 20s node --test --test-force-exit tests/*.test.mjs
```

## Validation result

TypeScript build:

```text
TSC:0
```

Node test result:

```text
1..12
# tests 12
# suites 0
# pass 12
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Node v22 prints an ExperimentalWarning for the built-in SQLite module. The tests pass despite that warning.

## Acceptance criteria mapping

| Acceptance criterion | Result |
|---|---:|
| 同一 delivery の重複処理が発生しない | pass |
| イベント状態が追跡できる | pass |
| 失敗イベントが再試行対象として区別できる | pass |
| in-memory only ではなく再起動後も残る | pass |

## Notes for T014/T015/T017/T027

- T014 can use inbox failure/status signals to trigger runtime downgrades later.
- T015 can consume only `received` rows once intake classification exists.
- T017 can claim a single row with `claimNextForProcessing` and produce one plan candidate.
- T027 should replace direct claim calls with rate-governed scheduling lanes.
