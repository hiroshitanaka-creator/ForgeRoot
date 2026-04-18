# T016 validation report — Plan Spec DSL

## Scope

T016 defines the first Plan Spec DSL for ForgeRoot's one-task-one-PR forging loop. The implementation lives in `packages/planner/src/plan-schema.ts` and is intentionally limited to schema types, deterministic Plan Spec construction from a T015 `NormalizedTaskCandidate`, and validation helpers.

## Deliverables

| Deliverable | Result |
|---|---:|
| `docs/specs/plan-spec.md` | added |
| `packages/planner/src/plan-schema.ts` | added |
| Planner package export | updated |
| Planner tests for Plan Spec validation | added |
| `packages/planner/tsconfig.json` | added |

## Acceptance criteria

| Acceptance criteria | Result |
|---|---:|
| acceptance criteria が機械判定可能 | pass |
| mutable paths と out-of-scope が明記される | pass |
| issue 1件から plan spec 1件へ落ちる | pass |
| risk / approval class link がある | pass |
| executor runtime に踏み込まない | pass |

## Validation coverage

The Plan Spec tests assert the following behavior:

- accepted T015 issue candidate creates exactly one deterministic Plan Spec
- Plan Spec binds to one source issue and `source_issue_count=1`
- `one_task_one_pr=true`
- `no_default_branch_write=true`
- `mutable_paths` is required and non-empty
- `out_of_scope` is required and non-empty
- every acceptance criterion must include `check.machine=true`
- mutable paths cannot overlap immutable governance paths
- elevated Class C/D plans must set execution-blocking escalation flags

## Validation commands

```bash
cd packages/planner
TSC_NONPOLLING_WATCHER=1 tsc -p tsconfig.json --noEmit --pretty false --diagnostics
node --test --test-force-exit tests/*.test.mjs
```

## Result

Planner test result:

```text
1..16
# tests 16
# suites 0
# pass 16
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Full captured test output: `/mnt/data/t016_planner_test_output.txt` in this workspace.

## Boundaries intentionally left for later tasks

- T017 owns the Planner runtime that will synthesize Plan Specs from richer context.
- Executor runtime remains out of scope.
- Test runner adapters remain out of scope.
- PR creation and audit report generation remain out of scope.
- Plan Spec persistence / scheduler integration remains out of scope.
