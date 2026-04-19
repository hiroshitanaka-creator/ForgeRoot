# Event inbox operations

T008 introduces the first durable runtime inbox for verified GitHub webhook deliveries.

The inbox is a derived runtime state store. It is not the source of truth for Forge Mind identity; `.forge` and Git history remain authoritative. The inbox exists to prevent duplicate delivery processing, preserve replay hints, and give T015/T017/T027 a stable queue boundary.

## Idempotency key

`X-GitHub-Delivery` is stored as `delivery_id` and is the primary key. A redelivery with the same `delivery_id` and same payload hash increments `duplicate_count` and is not forwarded to downstream processing again.

A redelivery with the same `delivery_id` but a different `raw_body_sha256` is treated as `delivery_id_hash_mismatch`. The original payload is retained and the conflicting payload is not processed.

## Table

The managed DB shape is captured in:

```text
apps/github-app/db/migrations/0001_event_inbox.sql
```

The current local runtime uses Node's SQLite binding through `src/event-inbox.ts`.

## Status transitions

```text
received -> processing -> processed
received -> processing -> failed_retryable -> processing -> processed
received -> processing -> failed_terminal
```

`failed_retryable` rows carry `next_attempt_at`. `failed_terminal` rows remain queryable for audit and replay tooling.

## Replay boundary

T008 stores enough data for later replay work:

- delivery GUID
- event name and action
- repository and installation identifiers
- sender login
- original payload JSON
- raw body SHA-256
- attempts and failure state
- lock and retry timestamps

T008 does not replay events by itself. T008 only makes replay possible without relying on in-memory state.
