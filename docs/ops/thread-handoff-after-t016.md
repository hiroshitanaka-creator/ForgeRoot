# ForgeRoot Thread Handoff — after T016

Created: 2026-04-18 JST  
Recommended next thread entry point: T017 planner runtime

## Recommendation

Start a new thread before implementing T017.

T017 is the first integration-heavy Planner task. It connects the deterministic intake classifier from T015, the Plan Spec DSL from T016, and soon the Event Inbox / runtime-mode boundaries from T008 and T014. The current thread already contains T001, T003, T004, T005, T006, T007, T008, T014, T015, and T016. A clean thread with this handoff file will reduce context drift and make the T017 implementation easier to audit.

## Canonical source material

Use these as the authoritative local sources for continuation:

- `ForgeRoot v1 Master Blueprint.txt` — v1 master design.
- `03_issue.md` — task issue definitions, including T017.
- `/mnt/data/ForgeRoot/` — latest generated repository working tree.
- `/mnt/data/ForgeRoot_T016_plan_spec_dsl.zip` — latest full handoff archive before this recap.

Do not treat runtime DB state as authoritative. The project invariant remains: Git is the source of truth, `.forge` is the genome/memory surface, and PR is the only evolution transport.

## Completed implementation sequence

| Task | Status | Main outcome |
|---|---:|---|
| T001 | done | Minimal monorepo skeleton and `.forge/` root layout. |
| T003 | done | `.forge/mind.forge` and `.forge/policies/constitution.forge` seed. |
| T004 | done | `.forge` v1 spec and JSON Schema. |
| T005 | done | Rust canonical parser/hash kernel seed under `crates/forge-kernel/`. |
| T006 | done | Minimum GitHub App manifest and permission contract. |
| T007 | done | GitHub webhook ingest with HMAC-SHA256 signature verification. |
| T008 | done | Event Inbox with delivery GUID idempotency and durable status transitions. |
| T014 | done | Runtime mode policy, kill switch, and 403/429 downgrade design. |
| T015 | done | Deterministic issue intake classifier. |
| T016 | done | One-task-one-PR Plan Spec DSL. |

## Current repository map

### `.forge`

- `.forge/mind.forge` — root Forge Mind defaults: conservative mode, allowlisted network, lab-only spawning, approval matrix.
- `.forge/policies/constitution.forge` — non-negotiables and breach behavior.
- `.forge/policies/runtime-mode.forge` — runtime mode and kill-switch policy.
- `.forge/agents/` — currently present as a directory only; T017 should add `planner.alpha.forge`.

### Kernel

- `crates/forge-kernel/src/source.rs` — source-form checks.
- `crates/forge-kernel/src/parser.rs` — parser entry.
- `crates/forge-kernel/src/canonical.rs` — canonical serialization.
- `crates/forge-kernel/src/hash.rs` — `sha256:<hex>` hash calculation.
- `crates/forge-kernel/src/validate.rs` — minimal shape validation.
- `crates/forge-kernel/tests/conformance.rs` — conformance fixtures.

### GitHub App / Control Plane

- `apps/github-app/src/webhooks.ts` — signature verification, event/action allowlist, accepted delivery envelope.
- `apps/github-app/src/event-inbox.ts` — SQLite-backed inbox, dedupe, claim/processed/failed transitions.
- `apps/github-app/src/runtime-mode.ts` — runtime state controller, kill switch, mutating lane checks, rate-limit downgrade.
- `apps/github-app/src/server.ts` — HTTP server, webhook route, kill-switch route.
- `apps/github-app/db/migrations/0001_event_inbox.sql` — inbox schema.
- `apps/github-app/db/migrations/0002_runtime_mode.sql` — runtime mode schema.

### Planner package

- `packages/planner/src/intake.ts` — deterministic classifier and GitHub webhook-like normalization.
- `packages/planner/src/plan-schema.ts` — Plan Spec creation and validation.
- `packages/planner/src/index.ts` — public exports.
- `packages/planner/tests/intake.test.mjs` — T015 tests.
- `packages/planner/tests/plan-schema.test.mjs` — T016 tests.

## Current safety contracts that T017 must preserve

1. No default branch writes.
2. One accepted task maps to one plan and later one PR.
3. Only label-derived `forge:auto` enables automation; text in issue/comment body must not enable automation.
4. Workflow, policy, permission, network, treaty, and branch-protection changes require escalation.
5. Security/workflow/policy/network classes must not be silently routed to executor-ready plans.
6. Runtime mode may close the mutating lane; Planner may still produce blocked/proposal artifacts but must not execute.
7. Webhook payloads reach Planner only after T007 signature verification and T008 inbox persistence in integrated flows.
8. Event Inbox dedupe uses `X-GitHub-Delivery` and raw body hash conflict detection.
9. Plan acceptance criteria must be machine-checkable.
10. `mutable_paths`, `immutable_paths`, and `out_of_scope` must stay explicit in every Plan Spec.

## Verification history

| Area | Latest known result |
|---|---:|
| T014 GitHub App tests | 18 pass / 0 fail |
| T015 planner tests | 11 pass / 0 fail |
| T015 GitHub App regression | 18 pass / 0 fail |
| T016 planner tests | 16 pass / 0 fail |
| T016 TypeScript typecheck | pass |
| T005 Rust cargo test | not executed in this environment; Rust toolchain was unavailable |

Node tests may print a `node:sqlite` experimental warning. That warning is expected for the current seed implementation and is not a test failure.

## Known caveats before T017

- `apps/github-app/package.json` still reports `0.0.0-t007` even though later T008/T014 functionality exists. This is cosmetic but may be worth normalizing later.
- T005 expected hashes were confirmed through a reference procedure, but `cargo test` was not run here due missing Rust toolchain.
- No persistent planner queue exists yet. T017 should expose runtime primitives first; scheduler integration belongs later unless the issue explicitly expands.
- No Executor, Auditor, sandbox runner, PR composer, or GitHub write path should be added in T017.

## T017 issue brief

T017 title: `planner runtime`

Goal: Planner agent can generate one reviewable Plan Spec from one issue.

Why now: ForgeRoot's first forging loop cannot begin without the Planner.

Scope:

- Planner agent definition.
- Planner runtime.
- Context recipe.
- Bounded output contract.

Out of scope:

- Executor file editing.
- Audit report generation.
- PR composer.

Dependencies:

- T015 issue intake classifier — satisfied.
- T016 Plan Spec DSL — satisfied.

Deliverables:

- `.forge/agents/planner.alpha.forge`
- `packages/planner/src/run.ts`

Acceptance criteria:

- One issue produces one Plan Spec.
- `out_of_scope` is explicit.
- Approval class is output.
- Mutable paths are explicit.

Primary risks:

- Planner inflates one issue into a large multi-feature plan.
- Acceptance criteria become vague or non-machine-checkable.

## Recommended T017 implementation shape

### 1. Add Planner agent genome

Create `.forge/agents/planner.alpha.forge` as `kind: agent` with at least:

- `identity.role_name: planner`
- `role.mission` focused on one-task-one-PR planning
- `role.inputs`: issue, issue_comment, check_run, workflow_run, alert-like candidate
- `role.outputs`: plan_spec, scope_contract, acceptance_criteria
- `role.forbidden_actions`: default branch write, workflow edit, policy edit, permission change, network action, PR creation
- `constitution.non_negotiables`: one task one PR, no default branch write, bounded context, machine-checkable criteria
- `constitution.mutable_paths`: `.forge/agents/planner.alpha.forge`, `packages/planner/**`, `docs/specs/**`
- `constitution.immutable_paths`: `.github/workflows/**`, `.forge/policies/**`, `.forge/network/**`
- `context_recipe` with static slots and dynamic slots
- `tools` read-only planning tools only, as declarative capability names for now
- `evolution.generation: 0`
- `integrity.canonical_hash` using the zero-hash sentinel if actual hash is not recalculated in T017

Keep it compatible with the T004/T005 `.forge` shape. Do not invent a second agent schema.

### 2. Add planner runtime API

Create `packages/planner/src/run.ts` with deterministic runtime functions. Suggested exports:

```ts
export interface PlannerRuntimeOptions {
  createdAt?: string;
  planIdPrefix?: string;
}

export interface PlannerRuntimeResult {
  ok: boolean;
  classification: IntakeClassification;
  plan: PlanSpec | null;
  validation: PlanValidationResult | null;
  blockedBy: readonly string[];
  notes: readonly string[];
}

export function runPlannerFromIntake(input: IntakeInput, options?: PlannerRuntimeOptions): PlannerRuntimeResult;
export function runPlannerFromGitHubWebhook(input: GitHubWebhookLike, options?: PlannerRuntimeOptions): PlannerRuntimeResult | null;
export function assertPlannerRuntimeResult(result: PlannerRuntimeResult): asserts result is PlannerRuntimeResult & { ok: true; plan: PlanSpec; validation: { ok: true } };
```

Runtime behavior should be deterministic:

- Classify input using T015.
- If `disposition !== accept`, return no plan and explain why.
- If accepted, call `createPlanSpecFromTaskCandidate` from T016.
- Validate the generated plan using `validatePlanSpec`.
- Add runtime notes, not side effects.
- Do not call GitHub APIs.
- Do not write files other than tests/fixtures as part of implementation.

### 3. Export runtime

Update `packages/planner/src/index.ts` to export `run.ts`.

### 4. Tests

Add `packages/planner/tests/run.test.mjs` covering:

- `forge:auto` docs issue → `ok=true`, one valid plan.
- no `forge:auto` label → `ok=false`, `plan=null`.
- blocked prompt-injection issue → `ok=false`, `plan=null`.
- security/workflow/policy issue with `forge:auto` → no executor-ready plan; either `escalate` with no plan or plan status `blocked_for_human`. Prefer no plan unless T017 intentionally defines proposal-only behavior.
- accepted plan includes explicit `out_of_scope`.
- accepted plan includes approval class.
- accepted plan includes non-empty `mutable_paths`.
- generated acceptance criteria remain machine-checkable.
- one source issue yields one `plan_id` and `source_issue_count=1`.

### 5. Documentation

Add `docs/specs/t017-validation-report.md` with:

- scope implemented
- test commands
- pass/fail matrix
- explicit non-goals

Optionally update:

- `packages/planner/README.md`
- root `README.md`
- `docs/README.md`

## Suggested validation commands for T017

```bash
cd /mnt/data/ForgeRoot/packages/planner
npm run test

cd /mnt/data/ForgeRoot/apps/github-app
npm run test
```

If Rust is available in the future:

```bash
cd /mnt/data/ForgeRoot
cargo test -p forge-kernel
```

## Exact prompt to use in the new thread

```text
ForgeRoot の続きを進めます。
この handoff を前提に、T017 planner runtime を実装してください。
参照ファイル: /mnt/data/ForgeRoot/docs/ops/thread-handoff-after-t016.md
T017 の scope は `.forge/agents/planner.alpha.forge` と `packages/planner/src/run.ts` を中心に、Planner agent definition / planner runtime / context recipe / bounded output contract です。
Executor file editing、audit report generation、PR composer は out of scope のままにしてください。
```

## Final checkpoint

Current best next action is not to start T017 inside the old thread. Start a new thread with the prompt above, then implement T017 from this snapshot.
