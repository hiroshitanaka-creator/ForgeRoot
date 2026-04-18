# apps/github-app

GitHub App control-plane surface for ForgeRoot.

Current T007 contents:

- `app-manifest.json` — minimum GitHub App manifest from T006.
- `src/webhooks.ts` — HMAC-SHA256 verification, header extraction, event/action allowlist, delivery normalization, and handoff types.
- `src/server.ts` — minimal Node HTTP webhook server with immediate ACK and asynchronous handoff.
- `tests/webhooks.test.mjs` — signature, allowlist, reject/ignore, and HTTP server tests.
- `.env.example` — local development environment variable template.

## Endpoints

- `GET /healthz` — process health probe.
- `POST /webhooks/github` — canonical GitHub webhook endpoint.
- `POST /api/github/webhook` — compatibility alias for deployments that prefer an API prefix.

## Security behavior

1. Capture the raw request body.
2. Verify `X-Hub-Signature-256` using HMAC-SHA256 and the configured webhook secret.
3. Reject missing or invalid signatures with `401`.
4. Extract `X-GitHub-Delivery` and `X-GitHub-Event`.
5. Apply the T006 event/action allowlist.
6. Return `202` immediately for accepted deliveries.
7. Pass only accepted delivery envelopes to `WebhookHandoff`.

Signed but unsupported events/actions are acknowledged with `202` and `ignored=true` so GitHub does not keep retrying a delivery that ForgeRoot intentionally does not process.

## Local commands

```bash
npm install
npm test
FORGE_WEBHOOK_SECRET=local-secret npm start
```

## T007 boundary

This is only the ingress boundary. It does not persist deliveries, dedupe `X-GitHub-Delivery`, schedule tasks, create PRs, refresh installation tokens, or redeliver failed events. Those are later tasks, starting with T008.

Permission notes live in `../../docs/github-app-permissions.md`.
