# T023 validation report — Auditor runtime

Date: 2026-04-18 JST

## Scope

T023 adds the deterministic Auditor runtime after the T019 sandbox request harness and before the future PR composer.

Implemented paths:

- `.forge/agents/auditor.alpha.forge`
- `packages/auditor/src/run.ts`
- `packages/auditor/src/index.ts`
- `packages/auditor/tests/audit.test.mjs`
- `packages/auditor/tests/run.test.mjs`
- `packages/auditor/scripts/build.mjs`
- `docs/specs/t023-validation-report.md`
- `docs/ops/thread-handoff-after-t023.md`

Updated paths:

- `README.md`
- `.forge/README.md`
- `docs/README.md`

## Contract

The Auditor runtime is evidence-only. It consumes one Plan Spec, one T018 branch/worktree manifest, one T019 sandbox execution request, and one observed sandbox output or evidence summary. It emits one `AuditResultReport` with a PR-composition gate decision.

The Auditor runtime does not execute commands, edit files, create branches, add worktrees, create commits, compose pull requests, mutate GitHub, approve merges, update memory/evaluation state, or perform federation/network behavior.

The generated audit result records:

- the Plan Spec, worktree manifest, and sandbox request identifiers
- chain-consistency checks across plan/worktree/sandbox inputs
- mutable and immutable path validation for observed changed paths
- required artifact validation
- undeclared command and artifact rejection
- secret-looking environment rejection
- machine-checkable acceptance-criteria outcomes
- risk and approval-class summary
- PR-composition gate decision
- auditor guard assertions proving the auditor did not perform mutation-side actions

## API surface

```ts
runAuditor(input)
validatePlanSpecForAudit(plan)
validateBranchWorktreePlanForAudit(worktreePlan)
validateSandboxExecutionRequestForAudit(request)
validateAuditResult(report)
validateAuditReport(report)
AUDITOR_RUNTIME_CONTRACT
```

## Runtime statuses

| Status | Decision | Meaning |
|---|---|---|
| `passed` | `allow_pr_composition` | Evidence and acceptance criteria passed. A later PR composer may consume the audit result. |
| `failed` | `request_changes` | Evidence exists, but scope, artifact, command, environment, or acceptance checks failed. |
| `blocked` | `block_pr_composition` | Required sandbox observed output is missing, so the auditor refuses to guess. |
| `invalid` | `invalid` | Input chain is malformed or inconsistent. |

## Acceptance coverage

| Requirement | Coverage |
|---|---|
| Consume plan/worktree/sandbox chain | `runAuditor` requires all three structural inputs and validates them independently. |
| Independent audit before PR composer | `AUDITOR_RUNTIME_CONTRACT.independentFromExecutor` and report gates assert independent audit. |
| No command execution by auditor | Contract, agent definition, audit trail, and report guards explicitly prohibit auditor command execution. |
| No file/GitHub mutation | Contract and generated report guards prohibit file editing, branch creation, commits, PR creation, GitHub mutation, and default branch writes. |
| Mutable path scope enforced | Observed changed paths must match mutable paths and avoid immutable paths. |
| Sandbox artifacts bounded | Observed artifacts must be declared, required artifacts must be present, media type/size/hash are validated. |
| Commands bounded | Observed command IDs must have been declared by the sandbox request. |
| Secret environment rejected | Secret-looking environment names and values become audit failures. |
| Acceptance criteria machine-checkable | Criteria are evaluated from explicit changed-path, diff-budget, command, and text evidence. |
| Human gate preserved | A passed audit allows PR composition only; merge remains human-review gated according to approval class. |
| T018/T019 regressions preserved | Executor tests still pass. |
| T015/T016/T017 regressions preserved | Planner tests still pass. |

## Validation commands

```bash
cd packages/auditor
node scripts/build.mjs
node --test --test-force-exit tests/*.test.mjs

cd ../executor
node --test --test-force-exit tests/*.test.mjs

cd ../planner
node --test --test-force-exit tests/*.test.mjs

cd ../..
node --check packages/auditor/dist/index.js
node --check packages/auditor/dist/run.js
node --check packages/executor/dist/index.js
node --check packages/executor/dist/worktree.js
node --check packages/executor/dist/sandbox.js
node --check packages/planner/dist/index.js
node --check packages/planner/dist/run.js
```

## Results

- Auditor build script: pass
- Auditor tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
  - T019 sandbox harness tests: 11 pass / 0 fail
  - T018 branch/worktree tests: 10 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks:
  - `packages/auditor/dist/index.js`: pass
  - `packages/auditor/dist/run.js`: pass
  - `packages/executor/dist/index.js`: pass
  - `packages/executor/dist/worktree.js`: pass
  - `packages/executor/dist/sandbox.js`: pass
  - `packages/planner/dist/index.js`: pass
  - `packages/planner/dist/run.js`: pass

## Build note

T023 uses a deterministic package-local build script for `packages/auditor` that emits the runtime JavaScript and declaration stubs from the source files. The prior local sandbox caveat around `tsc` terminal completion remains; this report relies on the build script, Node syntax checks, and runtime tests for this task.

## Out of scope preserved

T023 intentionally does not add:

- PR composer
- GitHub mutation
- real sandbox command execution
- executor patch generation
- branch creation or worktree creation
- commit creation
- merge approval or merge operation
- workflow mutation
- policy mutation
- network/federation behavior
- memory/evaluation updates
- self-evolution
