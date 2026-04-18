# apps/github-app

GitHub App control-plane surface for ForgeRoot.

Current Phase 0 contents:

- `app-manifest.json` — minimum GitHub App manifest and permission surface from T006.
- `src/webhooks.ts` — T007 signature verification, event/action allowlist, and normalized delivery envelope.
- `src/server.ts` — webhook HTTP server with raw-body verification and inbox-backed acknowledgement.
- `src/event-inbox.ts` — T008 SQLite event inbox, delivery GUID idempotency, and replay-ready status transitions.
- `db/migrations/0001_event_inbox.sql` — portable event inbox table shape for future managed DB deployments.
- `tests/` — signature, allowlist, server, inbox, idempotency, persistence, and retry-state tests.

## Local development

```bash
cd apps/github-app
npm run build
node --test --test-force-exit tests/*.test.mjs
FORGE_WEBHOOK_SECRET=local-secret npm start
```

Runtime configuration:

```bash
FORGE_WEBHOOK_SECRET=replace-with-local-webhook-secret
FORGE_GITHUB_APP_HOST=127.0.0.1
FORGE_GITHUB_APP_PORT=8080
FORGE_EVENT_INBOX_SQLITE_PATH=var/forgeroot/event-inbox.sqlite3
```

## Ingress order

Accepted webhooks follow this order:

1. read the raw request body without mutation
2. verify `X-Hub-Signature-256`
3. validate `X-GitHub-Delivery` and `X-GitHub-Event`
4. enforce the T006 event/action allowlist
5. insert or dedupe by delivery GUID in the event inbox
6. return `2xx` for accepted or duplicate deliveries
7. let later scheduler/planner tasks claim inbox rows asynchronously

## Event inbox status model

- `received` — verified and persisted, not yet claimed
- `processing` — leased by a worker
- `processed` — completed successfully
- `failed_retryable` — retryable failure with `next_attempt_at`
- `failed_terminal` — non-retryable failure retained for replay/audit

T008 intentionally does not implement the full replay engine, telemetry dashboard, planner integration, or mutation scheduling. Those remain later tasks.
