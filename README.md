# ForgeRoot

GitHub repository as a living Forge Mind.

ForgeRoot turns a repository into a self-improving, PR-native, evolvable intelligence. Agents do not merely work on your repo. They live in it.

## Core laws

1. Git is the source of truth.
2. `.forge` is the durable genome and memory surface.
3. No direct writes to the default branch.
4. Every behavior-changing mutation must be reviewable as a PR.
5. Humans set the constitution; agents optimize within it.
6. Federation is allowlisted before it is autonomous.

## Current implementation status

The repository has moved through the Phase 0 kernel and the first Phase 1 planning primitives.

Implemented so far:

- T001 — monorepo skeleton and `.forge/` root
- T003 — `mind.forge` and constitution seed
- T004 — `.forge` v1 spec and JSON Schema
- T005 — canonical parser/hash kernel seed
- T006 — minimum GitHub App manifest and permission contract
- T007 — webhook ingest with HMAC signature verification
- T008 — event inbox and delivery idempotency
- T014 — runtime mode and kill switch
- T015 — deterministic issue intake classifier
- T016 — one-task-one-PR Plan Spec DSL
- T017 — deterministic planner runtime bridge

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

## Planner path

The first forging loop now has two pre-execution contracts:

1. `packages/planner/src/intake.ts` classifies issue/comment/alert-like inputs and only accepts normalized `forge:auto` candidates.
2. `packages/planner/src/plan-schema.ts` turns one accepted candidate into one `forge.plan` with explicit mutable paths, forbidden paths, out-of-scope boundaries, risk/approval linkage, and machine-checkable acceptance criteria.

3. `packages/planner/src/run.ts` is the deterministic runtime bridge that accepts a webhook-like event, normalized intake input, or pre-accepted task candidate and returns at most one valid Plan Spec.

The planner runtime still does not edit files, create branches, open PRs, run tests, or generate audit reports.

## Safety defaults

- GitHub App only for production automation.
- Protected default branch required.
- Runtime mode starts conservative.
- Workflow, policy, permission, and network changes are elevated.
- Kill switch can close the mutating lane in one operation.
- Event Inbox dedupes GitHub delivery IDs before downstream processing.
- One task becomes one plan and, later, one PR.
