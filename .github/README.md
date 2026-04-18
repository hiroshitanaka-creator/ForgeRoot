# ForgeRoot

GitHub repository as a living Forge Mind.

ForgeRoot turns a repository into a self-improving, PR-native, evolvable intelligence. The durable identity layer lives in Git and `.forge`; the GitHub App and runtime DBs are control-plane machinery around that identity.

## Current Phase 0 status

Completed bootstrap tasks in this working tree:

- `T001` — monorepo skeleton and `.forge/` root
- `T003` — initial `mind.forge` and constitution policy
- `T004` — `.forge` v1 spec and JSON Schema
- `T005` — canonical parser/hash kernel seed
- `T006` — minimum GitHub App manifest and permissions
- `T007` — webhook ingest with HMAC verification
- `T008` — event inbox and delivery GUID idempotency
- `T014` — runtime mode and kill switch

The next natural task is `T015` issue intake classifier.

## Core laws

1. Git is the source of truth.
2. `.forge` is the genome and curated memory layer.
3. PR is the only evolution transport.
4. No direct default-branch writes.
5. Federation and spawning start allowlisted/lab-only.
6. Runtime mutation must be stoppable by an explicit kill switch.

## Repository layout

```text
.forge/
  mind.forge
  policies/
    constitution.forge
    runtime-mode.forge
  agents/
  evals/
  lineage/
  network/
  packs/
apps/
  github-app/
crates/
  forge-kernel/
docs/
  specs/
  ops/
schemas/
```

## Current executable surfaces

```bash
# .forge parser/hash kernel, in a Rust-enabled environment
cargo test -p forge-kernel

# GitHub App webhook, inbox, runtime mode, and kill switch tests
cd apps/github-app
node --test --test-force-exit tests/*.test.mjs
```

## GitHub App runtime

`apps/github-app` currently provides:

- raw-body webhook signature verification
- T006 event/action allowlist
- accepted webhook envelope normalization
- SQLite event inbox table
- `X-GitHub-Delivery` idempotency
- retryable vs terminal event failure states
- runtime modes: `observe`, `propose`, `evolve`, `federate`, `quarantine`, `halted`
- admin-token-protected kill switch endpoint
- repeated 403/429 downgrade hook

Runtime configuration starts from:

```text
apps/github-app/.env.example
```

## Design documents

- `00_ForgeRoot_blueprint_設計書.md` — fixed v1 design source
- `01_単語や命名規則.md` — naming and terminology rules
- `02_README.md` — public README source draft
- `03_issue.md` — bounded issue drafts
- `docs/specs/forge-v1.md` — `.forge` v1 specification
- `docs/ops/event-inbox.md` — T008 inbox operations
- `docs/ops/runtime-mode.md` — T014 runtime mode and kill switch operations

## Non-goals

ForgeRoot is not designed to bypass GitHub governance. It is designed to make autonomous maintenance auditable, reversible, and evolvable inside Git-native constraints.

Still intentionally out of scope at this point:

- full planner/executor/auditor loop
- production scheduler
- full replay engine
- mutation runtime
- federation runtime
- browser extension UI
