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

The repository has moved through the Phase 0 kernel, Phase 1 forged-PR
manifest chain, Phase 2 memory/eval foundations, Phase 3 bounded
self-evolution manifests, Phase 4 manifest-only federation stack through the
lab-only T069 three-repo forge-net testnet, and the T070 lab-only distributed
evolution demo.

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
- T026 — deterministic approval checkpoint and trusted transport authorization manifest
- T027 — deterministic rate governor queue and dispatch manifest
- T028 — deterministic end-to-end forged PR demo manifest chain

- T029-T033 - deterministic memory partition, working memory, episode digest,
  archive pack, and retrieval context manifests
- T034-T045 - eval suite, merge outcome, security report source, eval result,
  and shadow-run foundations
- T046-T060 - bounded mutation, audit routing, guard, transport, rollout, and
  completion bundle manifests
- T061-T069 - lineage pack, cross-repo PR composition, reputation, gossip,
  arena, network boundary, federation reporting, and lab-only forge-net topology
- T070 - lab-only distributed evolution demo wiring the T069 topology through
  lineage, reputation, boundary, cross-repo PR composition, arena, and derived
  federation reporting without live transport or automatic adoption

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
  memory/
  eval/
  mutate/
  network/
  reporting/
  pr-composer/
  github-pr-adapter/
  approval-checkpoint/
  rate-governor/
  forge-demo/
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
9. `packages/approval-checkpoint/src/run.ts` consumes one GitHub PR creation request manifest and emits a trusted transport authorization only when runtime, rate, source, risk, and human approval gates pass.
10. `packages/rate-governor/src/run.ts` consumes one trusted transport authorization and emits a queued / delayed / blocked dispatch decision while preserving one-repo mutating lane, write spacing, content-create budget, PR-create budget, retry-after, and cooldown controls.
11. `packages/forge-demo/src/run.ts` wires the Phase 1 manifests from one `forge:auto` issue-like input through the rate-governed dispatch manifest without performing live transport.
12. `packages/forge-demo/src/distributed-evolution.ts` wires the T069 lab topology through T061 lineage export, T063 reputation, T067 network boundary, T062 cross-repo PR composition, T065 arena comparison, and T068 federation report manifests without live network transport, GitHub API calls, open federation, or automatic lineage adoption.

The planner runtime still does not edit files, create branches, open PRs, run tests, or generate audit reports. The T018 worktree manager still does not run `git`, create branches, add worktrees, edit files, create commits, open PRs, run tests, or invoke a sandbox. The T019 sandbox harness still does not execute commands, edit files, create commits, open PRs, generate audit reports, or mutate GitHub; it only prepares and validates a bounded sandbox request. The T023 auditor runtime validates existing evidence only; it does not execute commands, edit files, compose PRs, mutate GitHub, approve merges, update memory, or federate. The T024 PR composer prepares review text and metadata only; it does not call GitHub, create the pull request, approve, merge, update memory, or federate. The T025 GitHub PR adapter prepares GitHub App REST request metadata only; it does not perform network transport by itself, merge, approve, persist tokens, update memory, or federate. The T026 approval checkpoint emits authorization manifests only; it does not call GitHub, create the PR, merge, approve, self-approve, persist tokens, update memory, or federate. The T027 rate governor emits queue/dispatch manifests only; it does not call GitHub, create the PR, merge, approve, persist tokens, bypass rate limits, update memory, or federate. The T028 forge demo only validates and packages the manifest chain; it does not call GitHub, create a real PR, execute commands, merge, approve, update memory, or federate. The T070 distributed evolution demo only validates and packages a lab-only manifest chain; it does not perform live federation, call GitHub APIs, create real pull requests, write authoritative reputation, adopt imported lineage, mutate policies, or execute self-evolution.

## Memory, evaluation, and mutation path

The Phase 2 and Phase 3 packages add deterministic manifests without making
runtime state authoritative:

1. `packages/memory` creates and validates working memory updates, episode
   digests, archive packs, and bounded retrieval contexts.
2. `packages/eval` validates eval suites, collects explicit merge outcomes,
   runs shadow-only eval manifests, scores peer reputation advisory data, and
   compares arena candidates without automatic adoption.
3. `packages/mutate` prepares prompt/tool/speciation mutation proposals,
   routes independent audits, evaluates EvolutionGuard decisions, prepares
   mutation PR and transport manifests, and packages rollout/completion
   evidence without executing mutation or live transport.

These packages do not write `.forge`, call GitHub APIs, create PRs, execute
mutations, self-approve high-risk changes, or make scores authoritative.

## Federation path

The Phase 4 federation stack remains manifest-only:

1. `packages/network` exports treaty-scoped lineage packs, composes cross-repo
   PR manifests, schedules gossip without transport, and enforces network
   boundary decisions.
2. `packages/reporting` renders derived Markdown/JSON federation reports.
3. `labs/forge-net/topology.yml` defines the T069 three-repo lab-only topology.

The federation stack does not perform live network transport, open federation,
production treaty creation, GitHub transport, authoritative reputation writes,
or automatic lineage adoption.

## Safety defaults

- GitHub App only for production automation.
- Protected default branch required.
- Runtime mode starts conservative.
- Workflow, policy, permission, and network changes are elevated.
- Federation and self-evolution boundary work requires explicit approval before
  production enablement.
- Kill switch can close the mutating lane in one operation.
- Event Inbox dedupes GitHub delivery IDs before downstream processing.
- One task becomes one plan, one branch/worktree manifest, one sandbox execution request, one audit result, one PR composition manifest, one GitHub PR creation request manifest, one trusted transport authorization manifest, one rate-governed dispatch manifest, one end-to-end demo manifest, and later one PR.
