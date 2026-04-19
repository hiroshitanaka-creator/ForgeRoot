# T014 validation report — runtime mode and kill switch

Date: 2026-04-18

## Scope

T014 adds runtime mode and kill switch primitives for the GitHub App control plane.

Implemented:

- `.forge/policies/runtime-mode.forge`
- `apps/github-app/src/runtime-mode.ts`
- `apps/github-app/db/migrations/0002_runtime_mode.sql`
- runtime admin endpoints in `apps/github-app/src/server.ts`
- runtime mode and kill switch tests in `apps/github-app/tests/runtime-mode.test.mjs`
- operational guide in `docs/ops/runtime-mode.md`

Not implemented in T014:

- full incident UI
- browser extension overlay
- federation logic
- production scheduler integration
- full RateGovernor task queue

## Acceptance criteria

| Criterion | Result | Evidence |
|---|---:|---|
| 1 operation can stop mutating action | pass | `activateKillSwitch(...)` and `POST /api/forge/kill-switch` set `halted`, engage kill switch, and close mutating lane. |
| `halted` and `quarantine` behavior difference is documented | pass | `.forge/policies/runtime-mode.forge` and `docs/ops/runtime-mode.md` define the allowed operation envelopes. |
| repeated 403/429 connects to mode downgrade | pass | `recordRateLimitSignal(...)` downgrades after two signals in `PT15M`. |

## Test result

Command executed against emitted JavaScript:

```bash
cd apps/github-app
node --test --test-force-exit tests/*.test.mjs
```

Result:

```text
1..18
# tests 18
# suites 0
# pass 18
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Node v22 reports `ExperimentalWarning: SQLite is an experimental feature`; this is expected for the current Phase 0 local SQLite seed.

## Runtime policy parse check

The runtime policy was parsed with Ruby `YAML.safe_load` and checked for the required policy shape:

- `kind=policy`
- `policy_type=runtime-mode`
- rules present for all runtime modes, kill switch, and repeated rate-limit downgrade
