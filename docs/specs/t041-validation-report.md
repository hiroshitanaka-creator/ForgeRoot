# T041 Validation Report — Security Gates

Date: 2026-04-19 JST

## Scope validated

T041 implements a deterministic, manifest-only security gate decision surface in `packages/auditor`.

Validated deliverables:

- `.forge/policies/security-gates.forge`
- `docs/specs/security-gates.md`
- `packages/auditor/src/security-gates.ts`
- `packages/auditor/tests/security-gates.test.mjs`
- `docs/specs/fixtures/security-gates/valid/*.json`
- `docs/specs/fixtures/security-gates/invalid/*.json`
- `packages/auditor/dist/security-gates.js`
- `packages/auditor/dist/security-gates.d.ts`

## Boundary checks

T041 remains manifest-only.

It does not:

- call GitHub APIs
- upload SARIF to GitHub Code Scanning
- call dependency review APIs
- mutate `.github/workflows/*`
- mutate branch protection
- mutate GitHub rulesets
- create PRs
- approve or merge PRs
- invoke the approval checkpoint
- invoke the rate governor
- update memory or evaluation state
- perform federation
- perform self-evolution

## Test commands

```bash
cd packages/auditor
npm run build
```

```bash
node --test --test-force-exit packages/auditor/tests/security-gates.test.mjs
node --test --test-force-exit packages/auditor/tests/*.test.mjs
node --test --test-force-exit packages/planner/tests/*.test.mjs
node --test --test-force-exit packages/executor/tests/*.test.mjs
node --test --test-force-exit packages/pr-composer/tests/run.test.mjs
node --test --test-force-exit packages/github-pr-adapter/tests/run.test.mjs
node --test --test-force-exit packages/approval-checkpoint/tests/run.test.mjs
node --test --test-force-exit packages/rate-governor/tests/run.test.mjs
node --test --test-force-exit packages/forge-demo/tests/run.test.mjs
```

```bash
node --check packages/auditor/dist/security-gates.js
node --check packages/auditor/dist/index.js
node --check packages/auditor/dist/sarif.js
node --check packages/auditor/dist/run.js
node --check packages/planner/dist/run.js
node --check packages/executor/dist/index.js
node --check packages/pr-composer/dist/run.js
node --check packages/github-pr-adapter/dist/run.js
node --check packages/approval-checkpoint/dist/run.js
node --check packages/rate-governor/dist/run.js
node --check packages/forge-demo/dist/run.js
```

## Results

| Test surface | Result |
|---|---:|
| T041 security gates tests | 13 pass / 0 fail |
| Auditor regression tests including T023, T040, T041 | 45 pass / 0 fail |
| Planner regression tests including T041-2 task-source readiness | 28 pass / 0 fail |
| Executor regression tests | 21 pass / 0 fail |
| PR composer regression tests | 8 pass / 0 fail |
| GitHub PR adapter regression tests | 10 pass / 0 fail |
| Approval checkpoint regression tests | 10 pass / 0 fail |
| Rate governor regression tests | 10 pass / 0 fail |
| Forge demo regression tests | 8 pass / 0 fail |
| Node syntax checks | pass |

## Acceptance criteria mapping

| T041 acceptance criterion | Evidence |
|---|---|
| High / critical-equivalent findings block or quarantine transport | `high-block.json` blocks; `critical-quarantine.json` quarantines. |
| Medium findings can hold by policy | `medium-hold.json` holds. |
| Docs-only / tests-like low risk findings can pass | `low-docs-pass.json` passes. |
| Gate decision contains reasons, finding summary, and affected paths | `validateSecurityGateDecision()` requires `reasons`, `summary`, `finding_decisions`, and affected-path summary. |
| Immutable path violation is connected to the gate | `immutable-path-quarantine.json` quarantines `.forge/policies/runtime-mode.forge`. |
| GitHub API is not called | Guard `no_github_api_call` is required and tested. |
| Branch protection / ruleset are not changed | Guards `no_branch_protection_mutation` and `no_ruleset_mutation` are required and tested. |
| `.forge/policies/security-gates.forge` is schema-shaped Forge policy | Test verifies magic line, policy schema, `kind: policy`, `policy_type: security-gates`, and no tabs. |

## Known caveats

- T041 emits an approval-checkpoint handoff summary only. It does not invoke or modify the T026 approval checkpoint.
- T041 consumes T040 SARIF-like artifacts. It does not upload SARIF to GitHub Code Scanning.
- T041 does not implement live dependency review integration.
- T041 does not implement T042 reporting/dashboard artifacts.
- Rust kernel validation caveat from earlier handoff remains unchanged.
