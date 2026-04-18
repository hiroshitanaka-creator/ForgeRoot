# ForgeRoot

GitHub repository as a living Forge Mind.

ForgeRoot turns a repository into a self-improving, PR-native, evolvable intelligence. Agents do not merely work on the repo; their identity, memory, policy, lineage, and mutation history are designed to live in Git.

## Core laws

1. Git is the source of truth.
2. `.forge` is the durable genome and curated memory layer.
3. No direct writes to the default branch.
4. Every behavior-changing mutation must be reviewable as a PR.
5. Humans set the constitution; agents optimize within it.
6. Federation is allowlisted before it is autonomous.

## Current bootstrap status

Implemented through **T016 Plan Spec DSL**.

Completed bootstrap slice:

- T001 — monorepo skeleton and `.forge` root
- T003 — `mind.forge` and initial constitution policy
- T004 — `.forge` v1 spec and JSON Schema
- T005 — canonical parser/hash kernel seed
- T006 — minimum GitHub App manifest and permissions doc
- T007 — webhook ingest with HMAC signature verification
- T008 — event inbox and delivery idempotency
- T014 — runtime mode and kill switch
- T015 — issue intake classifier
- T016 — one-task-one-PR Plan Spec DSL

Next natural task: **T017 planner runtime**.

## Repo layout

```text
.forge/
  mind.forge
  agents/
  policies/
  evals/
  lineage/
  network/
  packs/
.github/
  workflows/
apps/
  github-app/
  cli/
  browser-extension/
crates/
  forge-kernel/
packages/
  planner/
labs/
docs/
  specs/
  rfcs/
  ops/
schemas/
```

## Start here

- `00_ForgeRoot_blueprint_設計書.md` — master blueprint
- `01_単語や命名規則.md` — naming and identity rules
- `02_README.md` — public-facing README source draft
- `03_issue.md` — initial bounded issue drafts
- `docs/specs/forge-v1.md` — `.forge` v1 specification
- `docs/specs/issue-intake.md` — intake classification spec
- `docs/specs/plan-spec.md` — one-task-one-PR Plan Spec DSL

## Development notes

Planner package local checks:

```bash
cd packages/planner
TSC_NONPOLLING_WATCHER=1 tsc -p tsconfig.json --noEmit --pretty false --diagnostics
node --test --test-force-exit tests/*.test.mjs
```

GitHub App local checks:

```bash
cd apps/github-app
tsc -p tsconfig.json
node --test --test-force-exit tests/*.test.mjs
```

## Safety defaults

- GitHub App only; no production PAT flow.
- Protected default branch; no default-branch direct writes.
- Runtime starts in `observe`.
- Mutating lane closes in `quarantine` and `halted`.
- `forge:auto` is required for automatic intake.
- T016 Plan Specs must declare mutable paths, immutable paths, out-of-scope boundaries, and machine-checkable acceptance criteria.
- Workflow, policy, permission, and network/treaty changes remain elevated governance work.
