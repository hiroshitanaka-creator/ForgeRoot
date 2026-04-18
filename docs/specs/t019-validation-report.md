# T019 validation report — executor sandbox harness

Date: 2026-04-18 JST

## Scope

T019 adds the deterministic executor-side sandbox request boundary after T018 branch/worktree planning.

Implemented paths:

- `.forge/agents/executor.alpha.forge`
- `packages/executor/src/sandbox.ts`
- `packages/executor/tests/sandbox.test.mjs`
- `docs/specs/t019-validation-report.md`

Updated paths:

- `packages/executor/src/index.ts`
- `packages/executor/package.json`
- `packages/executor/README.md`
- `README.md`
- `.forge/README.md`
- `docs/README.md`

## Contract

The sandbox harness is manifest-only. It prepares and validates `sandbox_execution_request` objects. It does not execute commands, edit files, create commits, create branches, add worktrees, open pull requests, generate audit reports, mount secrets, or mutate GitHub.

The generated request records:

- one T018 branch/worktree manifest to at most one sandbox execution request
- network default `off`
- GitHub token default `none`
- secret mount prohibition
- allowlisted command binaries only
- forbidden git / shell / network mutation binaries
- mutable and immutable path scope for command-declared writes
- runtime-owned artifact root outside the repo worktree
- declared output artifact schema
- observed output validation for command IDs, changed paths, environment, artifact paths, artifact media types, artifact sizes, and artifact hashes

## API surface

```ts
createSandboxExecutionRequest(worktreePlan, options)
validateSandboxExecutionRequest(request)
validateSandboxObservedOutput(request, output)
EXECUTOR_SANDBOX_HARNESS_CONTRACT
```

## Acceptance coverage

| Requirement | Coverage |
|---|---|
| T018 manifest becomes a bounded sandbox request | `createSandboxExecutionRequest` accepts a valid `BranchWorktreePlan` and emits one request |
| No command execution in harness | Contract and audit trail explicitly mark commands as declared only, not executed |
| Commands are bounded | command argv is array-based, binary allowlisted, git/shell/network mutation binaries rejected |
| Environment is bounded | secret-looking variable names and values are rejected; locked defaults cannot be overridden |
| Path scope is bounded | command writable paths and observed changed paths are checked against mutable/immutable scope |
| Output artifacts are bounded | artifacts are declared, safe relative paths only, media types allowlisted, sizes capped |
| Sandbox isolation is conservative | network defaults off, token defaults none, secret mounts forbidden |
| Human approval remains enforced | manifests that still require execution approval are blocked before request creation |
| T018 regression preserved | existing branch/worktree tests still pass |
| T017/T015/T016 regression preserved | planner regression suite still passes |

## Validation commands

```bash
cd packages/executor
node --test --test-force-exit tests/*.test.mjs

cd ../planner
node --test --test-force-exit tests/*.test.mjs

cd ../..
node --check packages/executor/dist/sandbox.js
node --check packages/executor/dist/index.js
node --check packages/executor/dist/worktree.js
node --check packages/planner/dist/run.js
```

## Results

- Executor tests: 21 pass / 0 fail
  - T019 sandbox harness tests: 11 pass / 0 fail
  - T018 branch/worktree regression tests: 10 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- `node --check packages/executor/dist/sandbox.js`: pass
- `node --check packages/executor/dist/index.js`: pass
- `node --check packages/executor/dist/worktree.js`: pass
- `node --check packages/planner/dist/run.js`: pass

## Sandbox note

As in T017 and T018, this local sandbox can emit TypeScript `dist/` files while the `tsc` process may not produce a clean terminal completion signal. The emitted `dist/` files were validated with Node syntax checks plus runtime tests.

## Out of scope preserved

T019 intentionally does not add:

- real sandbox command execution
- executor file editing
- patch generation
- audit report generation
- PR composer
- GitHub mutation
- workflow mutation
- policy mutation
- network/federation behavior
- self-evolution
