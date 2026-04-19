# T007 validation report — webhook ingest with signature verification

Status: implemented  
Scope: T007 only  
App path: `apps/github-app/`

## Goal

Implement a minimal GitHub App webhook ingress server that verifies GitHub webhook signatures, applies the T006 event/action allowlist, returns a quick 2XX for accepted deliveries, and passes the delivery ID to a downstream handoff interface.

## Implemented files

- `apps/github-app/package.json`
- `apps/github-app/tsconfig.json`
- `apps/github-app/.env.example`
- `apps/github-app/src/types-node-shim.d.ts`
- `apps/github-app/src/webhooks.ts`
- `apps/github-app/src/server.ts`
- `apps/github-app/tests/webhooks.test.mjs`
- `apps/github-app/README.md`

## Ingress behavior

| Case | HTTP result | Handoff |
|---|---:|---:|
| Valid signature + allowed event/action | `202` | yes |
| Valid signature + unallowlisted event | `202 ignored` | no |
| Valid signature + unallowlisted action | `202 ignored` | no |
| Missing signature | `401` | no |
| Malformed signature | `401` | no |
| Invalid signature | `401` | no |
| Missing delivery ID after valid signature | `400` | no |
| Invalid JSON after valid signature | `400` | no |
| Oversized request body | `413` | no |

## Event/action allowlist

The implementation mirrors `docs/github-app-permissions.md`:

- `installation`: all actions
- `installation_repositories`: `added`, `removed`
- `issues`: `opened`, `edited`, `labeled`, `unlabeled`, `reopened`, `closed`
- `issue_comment`: `created`, `edited`
- `pull_request`: `opened`, `edited`, `synchronize`, `reopened`, `closed`, `ready_for_review`
- `pull_request_review`: `submitted`, `edited`, `dismissed`
- `push`: all actions
- `check_suite`: `completed`, `requested`, `rerequested`
- `check_run`: `completed`, `rerequested`, `requested_action`
- `workflow_run`: `completed`, `requested`, `in_progress`
- `fork`: all actions

## Validation commands run

```bash
cd apps/github-app
tsc -p tsconfig.json
node --test --test-force-exit tests/*.test.mjs
```

## Test result

```text
1..8
# tests 8
# suites 0
# pass 8
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## Acceptance criteria mapping

| Acceptance criterion | Result | Evidence |
|---|---:|---|
| 不正署名を reject | pass | invalid signature tests return `401` and no handoff |
| 正常イベントを 2XX で即返す | pass | HTTP server test returns `202` for a signed `issue_comment.created` payload |
| delivery ID を後続処理へ渡せる | pass | accepted envelope preserves `deliveryId` and reaches `WebhookHandoff` |
| event allowlist | pass | unallowlisted `repository_dispatch` is `202 ignored` and no handoff |
| action allowlist | pass | unallowlisted `issues.assigned` is `202 ignored` and no handoff |

## Deliberately out of scope

- persistent event inbox
- delivery GUID deduplication
- redelivery automation
- task scheduler
- planner integration
- installation token refresh
- PR creation
- runtime mode / kill switch
- production deployment hardening

These belong to T008 and later tasks.
