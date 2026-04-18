# apps/github-app

GitHub App control-plane surface for ForgeRoot.

Current Phase 0 contents:

- `app-manifest.json` — minimum GitHub App manifest and permission surface from T006.
- `src/webhooks.ts` — T007 signature verification, event/action allowlist, and normalized delivery envelope.
- `src/server.ts` — HTTP server with webhook endpoints plus runtime control endpoints.
- `src/event-inbox.ts` — T008 SQLite event inbox, delivery GUID idempotency, and replay-ready status transitions.
- `src/runtime-mode.ts` — T014 runtime mode store, kill switch handler, operation authorization, and 403/429 downgrade hook.
- `db/migrations/0001_event_inbox.sql` — portable event inbox table shape.
- `db/migrations/0002_runtime_mode.sql` — portable runtime mode and kill switch table shape.
- `tests/` — signature, allowlist, server, inbox, idempotency, persistence, retry-state, runtime-mode, and kill-switch tests.

## Local development

```bash
cd apps/github-app
npm run build
node --test --test-force-exit tests/*.test.mjs
FORGE_WEBHOOK_SECRET=local-secret FORGE_ADMIN_TOKEN=local-admin-token npm start
```

Runtime configuration:

```bash
FORGE_WEBHOOK_SECRET=replace-with-local-webhook-secret
FORGE_GITHUB_APP_HOST=127.0.0.1
FORGE_GITHUB_APP_PORT=8080
FORGE_EVENT_INBOX_SQLITE_PATH=var/forgeroot/event-inbox.sqlite3
FORGE_RUNTIME_SQLITE_PATH=var/forgeroot/event-inbox.sqlite3
FORGE_ADMIN_TOKEN=replace-with-local-admin-token
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

## Runtime control endpoints

Admin endpoints require `FORGE_ADMIN_TOKEN` as `Authorization: Bearer <token>` or `x-forge-admin-token`.

- `GET /api/forge/runtime-mode`
- `POST /api/forge/runtime-mode`
- `POST /api/forge/runtime-mode/restore`
- `POST /api/forge/kill-switch`

The kill switch sets `mode=halted`, engages the kill switch flag, closes the mutating lane, and requires explicit human acknowledgement before restore.

## Event inbox status model

- `received` — verified and persisted, not yet claimed
- `processing` — leased by a worker
- `processed` — completed successfully
- `failed_retryable` — retryable failure with `next_attempt_at`
- `failed_terminal` — non-retryable failure retained for replay/audit

T014 intentionally does not implement the full incident UI, browser extension overlay, federation logic, production scheduler, or full RateGovernor queue.
