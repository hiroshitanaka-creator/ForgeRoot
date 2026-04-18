# T015 validation report — issue intake classifier

## Scope

T015 implements deterministic intake classification for issue, issue comment, and alert-like inputs. The implementation lives in `packages/planner/src/intake.ts` and is intentionally limited to classification plus normalized task candidate output.

## Acceptance criteria

| Acceptance criteria | Result |
|---|---:|
| 4分類以上で安定判定できる | pass |
| `forge:auto` のみ自動対象にできる | pass |
| `block` / `ignore` / `escalate` の区別がある | pass |
| Task candidate normalization がある | pass |
| Full LLM planner に踏み込まない | pass |
| PR creation に踏み込まない | pass |

## Implemented categories

The classifier recognizes `docs`, `test`, `bug`, `ci`, `dependency`, `security`, `workflow`, `policy`, `feature`, `question`, `network_offer`, `operator_command`, `chore`, and `unknown`.

The unit tests assert stable behavior for at least `docs`, `test`, `dependency`, `ci`, and `bug`, with additional coverage for `security` and `workflow` escalation.

## Routing behavior

| Case | Expected |
|---|---|
| `forge:auto` docs/test/bug/ci/dependency/feature/chore with low/medium risk | `accept` |
| Missing `forge:auto` | `ignore` |
| Successful CI/workflow signal | `ignore` |
| Explicit block label or bypass/default-branch-write request | `block` |
| Broad rewrite/refactor-everything request | `block` |
| Security, workflow, policy, or network/treaty work | `escalate` |

## Validation command

```bash
cd packages/planner
npm run test
```

## Result

```text
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
```

Full captured output: `/mnt/data/t015_planner_test_output.txt` in this workspace.

## Regression check

The existing GitHub App tests were also run after adding the planner package. They remain green.

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

Captured output: `/mnt/data/t015_github_app_regression_output.txt` in this workspace.

## Boundaries intentionally left for later tasks

- T016 owns the Plan Spec DSL.
- T017 owns the Planner runtime.
- T018+ own executor/auditor/PR composition pieces.
- T028 owns the first end-to-end issue-to-PR demo.
