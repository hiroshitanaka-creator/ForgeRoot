# T017 Validation Report — planner runtime

Date: 2026-04-18 JST

## Scope implemented

T017 adds the first deterministic Planner runtime bridge around the T015 intake classifier and T016 Plan Spec DSL.

Implemented paths:

- `.forge/agents/planner.alpha.forge`
- `packages/planner/src/run.ts`
- `packages/planner/tests/run.test.mjs`
- `packages/planner/src/index.ts`
- `packages/planner/dist/run.*`
- `packages/planner/dist/index.*`
- `packages/planner/README.md`
- `docs/specs/t017-validation-report.md`
- `README.md`
- `.forge/README.md`

## Runtime contract

`runPlanner(input)` accepts exactly one planning input source per call:

- `github_webhook`
- `intake_input`
- `task_candidate`

The runtime returns a `PlannerRunResult` with one of these statuses:

- `planned`
- `ignored`
- `blocked`
- `escalated`
- `invalid`

A `planned` result contains at most one Plan Spec. All other statuses contain no plan and preserve deterministic reasons plus an audit trail.

## Acceptance criteria mapping

| T017 criterion | Implementation evidence |
|---|---|
| 1 issue → 1 plan spec | `runPlanner` converts one accepted intake classification into one validated `PlanSpec`; tests assert `plan_count:1`. |
| out-of-scope is explicit | Plan Spec validation requires `scope_contract.out_of_scope`; runtime tests assert it is non-empty. |
| approval class is output | Plan Spec includes `risk_and_approval.approval_class`; runtime tests assert it is present. |
| mutable paths are explicit | Plan Spec validation requires `scope_contract.mutable_paths`; runtime tests assert it is non-empty. |

## Out of scope preserved

T017 intentionally does not implement:

- executor file editing
- sandbox execution
- branch creation
- commit creation
- audit report generation
- PR composition
- GitHub mutating operations
- workflow or policy mutation
- network/federation behavior
- LLM/model-router integration

## Verification commands

```bash
cd packages/planner
timeout 20 tsc -p tsconfig.json
node --test --test-force-exit tests/*.test.mjs
```

## Verification result

In this sandbox, TypeScript emitted updated `dist/` artifacts and did not report TypeScript diagnostics before the local `tsc` process stayed open. The emitted runtime was syntax-checked with `node --check dist/run.js`, and the planner test suite completed successfully.

```text
1..23
# tests 23
# suites 0
# pass 23
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

## Notes

- Existing T015 and T016 public APIs are preserved.
- `src/index.ts` now re-exports `run.ts`.
- `packages/planner/package.json` version is updated to `0.0.0-t017`.
- The runtime is deterministic when `now` is supplied; otherwise it uses the current UTC timestamp only for `created_at`.
