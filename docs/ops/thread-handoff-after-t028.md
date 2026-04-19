# ForgeRoot Thread Handoff: after T028

Date: 2026-04-18 JST
Recommended next task: **T040 SARIF bridge**

## Completed in T028

T028 added the first deterministic end-to-end forged PR demo harness for the Phase 1 manifest chain.

Main deliverables:

- `packages/forge-demo/src/run.ts`
- `packages/forge-demo/tests/run.test.mjs`
- `packages/forge-demo/README.md`
- `docs/ops/examples/t028-forged-pr-example.md`
- `docs/specs/fixtures/forge-demo/valid/t028-demo-manifest.json`
- `docs/ops/t028-e2e-forged-pr-demo.md`
- `docs/specs/t028-validation-report.md`

Primary API:

```ts
runEndToEndForgedPrDemo(input)
validateEndToEndForgedPrDemo(result)
E2E_FORGED_PR_DEMO_CONTRACT
```

Compatibility aliases:

```ts
runForgeDemo(input)
runEndToEndDemo(input)
runE2EForgedPrDemo(input)
runT028Demo(input)
validateForgeDemo(result)
validateE2EForgedPrDemo(result)
validateT028Demo(result)
```

## Current Phase 1 chain

T028 wires the deterministic chain through:

1. T015 intake classifier
2. T016 Plan Spec DSL
3. T017 planner runtime
4. T018 branch/worktree manager
5. T019 executor sandbox request harness
6. T023 auditor runtime
7. T024 PR composer
8. T025 GitHub PR adapter
9. T026 approval checkpoint
10. T027 rate governor queue
11. T028 end-to-end forged PR demo manifest

## T028 boundary

T028 demonstrates chain integrity only. It does not execute trusted transport.

Preserved guards:

- one issue produces one plan
- one plan produces one worktree manifest
- one worktree manifest produces one sandbox request
- sandbox output remains inside mutable paths
- audit must pass before PR composition
- PR body carries risk summary and acceptance criteria
- GitHub PR adapter produces request metadata only
- approval checkpoint authorizes only trusted transport metadata
- rate governor emits queue/delay/block dispatch only
- live GitHub transport is not performed
- no real pull request is created
- no merge or approval execution occurs
- no memory/evaluation update occurs
- no federation behavior occurs

## Validation summary

- Forge demo tests: 8 pass / 0 fail
- Rate governor regression tests: 10 pass / 0 fail
- Approval checkpoint regression tests: 10 pass / 0 fail
- GitHub PR adapter regression tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Auditor regression tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks: pass

## Recommended next boundary

T040 SARIF bridge is the recommended next target from the safety floor. Before implementing it, confirm the exact issue scope from the canonical task source because the current uploaded `03_issue.md` only fully spells out T001, T003-T008, T014-T017, and T028.

Likely T040 boundary:

- consume scan/audit findings as structured SARIF-like evidence
- normalize security findings for later security gates
- avoid direct GitHub mutation
- avoid changing workflows, policies, or repository rulesets
- keep findings reviewable and replayable

Out of scope until separately introduced:

- live code scanning upload transport
- workflow mutation
- security gate enforcement that blocks merges
- memory/evaluation updates
- self-evolution or federation
