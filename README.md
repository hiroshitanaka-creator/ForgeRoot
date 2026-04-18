# ForgeRoot

GitHub repository as a living Forge Mind.

ForgeRoot turns a repository into a self-improving, PR-native, evolvable intelligence. Agents do not merely work on the repo; their durable identity, policy, memory, lineage, and mutation history live in Git under `.forge/`.

## Core laws

1. Git is the source of truth.
2. No direct writes to the default branch.
3. Every behavior-changing mutation must be reviewable as a PR.
4. Humans set the constitution; agents optimize within it.
5. Federation is allowlisted before it is autonomous.

## Current bootstrap status

- Current completed task: `T007 webhook ingest with signature verification`
- Phase: `P0 / Forge Kernel`
- Implemented so far:
  - `T001` monorepo skeleton and `.forge` root
  - `T003` root `mind.forge` and constitution policy seed
  - `T004` `.forge` v1 specification and JSON Schema
  - `T005` Rust parser/hash kernel crate and conformance fixtures
  - `T006` minimum GitHub App manifest, permission matrix, installation scope, and webhook event shortlist
  - `T007` TypeScript webhook ingest server with HMAC-SHA256 verification, event/action allowlist, immediate ACK, and async handoff interface

## Current layout

```text
.forge/
  mind.forge
  policies/
    constitution.forge
apps/
  github-app/
    app-manifest.json
    package.json
    src/
      server.ts
      webhooks.ts
    tests/
      webhooks.test.mjs
crates/
  forge-kernel/
    src/
    tests/
docs/
  github-app-permissions.md
  specs/
    forge-v1.md
    t003-validation-fixture.yaml
    t004-validation-report.md
    t005-validation-report.md
    t006-validation-report.md
    t007-validation-report.md
schemas/
  forge-v1.schema.json
```

## T007 GitHub webhook ingest

`apps/github-app/src/server.ts` exposes the initial GitHub App webhook server.

Implemented behavior:

- `POST /webhooks/github` and `POST /api/github/webhook`
- `GET /healthz`
- raw request body capture before JSON parsing
- `X-Hub-Signature-256` HMAC-SHA256 verification
- `X-GitHub-Delivery` extraction for the later T008 inbox/dedupe layer
- event and action allowlist matching `docs/github-app-permissions.md`
- accepted deliveries return `202` immediately and are handed to a non-blocking `WebhookHandoff`
- signed but unsupported events/actions return `202` with `ignored=true` and are not handed off
- invalid signatures return `401`

Local commands:

```bash
cd apps/github-app
npm install
npm test
FORGE_WEBHOOK_SECRET=local-secret npm start
```

The current handoff is intentionally an interface plus in-memory test implementation. Persistent inbox, dedupe, replay state, and status transitions belong to `T008`.

## Important boundaries

Still intentionally deferred:

- persistent event inbox / idempotency
- delivery redelivery automation
- full scheduler
- planner integration
- installation token refresh
- production GitHub App rollout
- runtime mode / kill switch
- pack compaction
- replay engine
- evaluator and mutation runtime
- federation/network runtime
- browser extension and UI overlays

## Next tasks

- `T008` — event inbox and idempotency
- `T014` — runtime mode and kill switch
- `T015` — issue intake classifier
