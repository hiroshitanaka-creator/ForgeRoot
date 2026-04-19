# T028 validation report — end-to-end forged PR demo

Date: 2026-04-18 JST

## Scope

T028 adds `packages/forge-demo` as a deterministic, manifest-only end-to-end harness for the Phase 1 forging loop.

The harness verifies that one `forge:auto` issue-like input can move through:

```text
Planner -> Worktree manager -> Sandbox request -> Auditor -> PR composer -> GitHub PR adapter -> Approval checkpoint -> Rate governor
```

It stops at rate-governed dispatch and does not perform live GitHub transport.

## Added validation

Associated review artifacts:

- `docs/ops/t028-e2e-forged-pr-demo.md`
- `docs/ops/examples/t028-forged-pr-example.md`
- `docs/specs/fixtures/forge-demo/valid/t028-demo-manifest.json`

New T028 tests cover:

- contract forbids live GitHub transport, real PR creation, merge, approval execution, memory/evaluation updates, federation, and self-evolution
- default Class A issue produces a ready full manifest chain
- PR composition includes risk summary and acceptance criteria
- issue without `forge:auto` stops at Planner
- simulated sandbox output outside mutable scope stops before Auditor
- exhausted content-create budget returns delayed before transport
- Class B requires human approval before authorization
- alias exports and validators remain deterministic

## Commands run

```bash
node --test --test-force-exit packages/forge-demo/tests/run.test.mjs
node --test --test-force-exit packages/rate-governor/tests/run.test.mjs
node --test --test-force-exit packages/approval-checkpoint/tests/run.test.mjs
node --test --test-force-exit packages/github-pr-adapter/tests/run.test.mjs
node --test --test-force-exit packages/pr-composer/tests/run.test.mjs
node --test --test-force-exit packages/auditor/tests/audit.test.mjs packages/auditor/tests/run.test.mjs
node --test --test-force-exit packages/executor/tests/*.test.mjs
node --test --test-force-exit packages/planner/tests/*.test.mjs
node --check packages/forge-demo/dist/run.js
node --check packages/forge-demo/dist/index.js
node --check packages/rate-governor/dist/run.js
node --check packages/approval-checkpoint/dist/run.js
node --check packages/github-pr-adapter/dist/run.js
node --check packages/pr-composer/dist/run.js
node --check packages/auditor/dist/run.js
node --check packages/executor/dist/index.js
node --check packages/planner/dist/run.js
```

## Result summary

- Forge demo tests: 8 pass / 0 fail
- Rate governor regression tests: 10 pass / 0 fail
- Approval checkpoint regression tests: 10 pass / 0 fail
- GitHub PR adapter regression tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Auditor regression tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks: pass

## Notes

The generated `dist/` files were refreshed for `packages/forge-demo`. As in the prior TypeScript package tasks, this sandbox can behave inconsistently around `tsc` process completion, so validation relies on generated `dist`, Node syntax checks, and runtime tests.

## Boundary confirmation

T028 did not add:

- live GitHub API transport
- real PR creation
- merge or approval execution
- file-editing executor implementation
- real sandbox command execution
- memory/evaluation update
- workflow or policy mutation
- federation behavior
