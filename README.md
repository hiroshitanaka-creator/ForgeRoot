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

The repository has moved through the Phase 0 kernel and the first Phase 1 planning and pre-execution primitives.

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
- T018 — deterministic branch/worktree manager manifest
- T019 — deterministic executor sandbox request harness
- T023 — deterministic independent auditor runtime and PR-composition gate
- T024 — deterministic PR composition manifest and review body boundary
- T025 — deterministic GitHub App PR creation request adapter

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
  executor/
  auditor/
  pr-composer/
  github-pr-adapter/
labs/
docs/
  specs/
  rfcs/
  ops/
schemas/
```

## Pre-execution path

The first forging loop now has pre-execution contracts that narrow one issue into one bounded execution lane:

1. `packages/planner/src/intake.ts` classifies issue/comment/alert-like inputs and only accepts normalized `forge:auto` candidates.
2. `packages/planner/src/plan-schema.ts` turns one accepted candidate into one `forge.plan` with explicit mutable paths, forbidden paths, out-of-scope boundaries, risk/approval linkage, and machine-checkable acceptance criteria.
3. `packages/planner/src/run.ts` is the deterministic runtime bridge that accepts a webhook-like event, normalized intake input, or pre-accepted task candidate and returns at most one valid Plan Spec.
4. `packages/executor/src/worktree.ts` consumes one ready Plan Spec-like object and returns at most one branch/worktree manifest with default-branch write protection, an ephemeral runtime worktree path, and mutable/immutable path guards.
5. `packages/executor/src/sandbox.ts` consumes one T018 branch/worktree manifest and returns at most one sandbox execution request with command, environment, path-scope, network, token, and artifact guards.
6. `packages/auditor/src/run.ts` consumes one Plan Spec, one branch/worktree manifest, one sandbox request, and observed sandbox evidence, then emits one independent audit result with a PR-composition gate decision.
7. `packages/pr-composer/src/run.ts` consumes the passed audit chain and emits one deterministic PR composition manifest with title, body, labels, review gate, artifact summary, and provenance for a later GitHub adapter.
8. `packages/github-pr-adapter/src/run.ts` consumes one PR composition manifest and a GitHub App installation context, then emits one bounded PR creation request manifest for a trusted transport layer.

The planner runtime still does not edit files, create branches, open PRs, run tests, or generate audit reports. The T018 worktree manager still does not run `git`, create branches, add worktrees, edit files, create commits, open PRs, run tests, or invoke a sandbox. The T019 sandbox harness still does not execute commands, edit files, create commits, open PRs, generate audit reports, or mutate GitHub; it only prepares and validates a bounded sandbox request. The T023 auditor runtime validates existing evidence only; it does not execute commands, edit files, compose PRs, mutate GitHub, approve merges, update memory, or federate. The T024 PR composer prepares review text and metadata only; it does not call GitHub, create the pull request, approve, merge, update memory, or federate. The T025 GitHub PR adapter prepares GitHub App REST request metadata only; it does not perform network transport by itself, merge, approve, persist tokens, update memory, or federate.

## Safety defaults

- GitHub App only for production automation.
- Protected default branch required.
- Runtime mode starts conservative.
- Workflow, policy, permission, and network changes are elevated.
- Kill switch can close the mutating lane in one operation.
- Event Inbox dedupes GitHub delivery IDs before downstream processing.
- One task becomes one plan, one branch/worktree manifest, one sandbox execution request, one audit result, one PR composition manifest, one GitHub PR creation request manifest, and later one PR.
