# Issue Intake Classifier

Status: T015 initial implementation

## Purpose

The issue intake classifier is the first gate between raw GitHub events and the later Planner runtime. It classifies issue, issue comment, and alert-like inputs into bounded ForgeRoot task candidates without invoking an LLM planner.

The classifier deliberately answers only three questions:

1. What kind of input is this?
2. Is it allowed to become an automatic ForgeRoot planning candidate?
3. If yes, what normalized candidate contract should the later planner receive?

## Input surfaces

The current implementation accepts two shapes:

- `IntakeInput` — normalized issue/comment/alert/check input.
- `GitHubWebhookLike` — a small webhook-like object that can be converted by `intakeInputFromGitHubWebhook`.

Supported event families in T015:

- `issues`
- `issue_comment`
- `check_run`
- `workflow_run`
- `dependabot_alert`
- `code_scanning_alert`
- `secret_scanning_alert`
- `security_alert`

## Categories

T015 ships deterministic keyword/label/path classification for these categories:

| Category | Intent |
|---|---|
| `docs` | README, guide, documentation, typo, markdown-only work |
| `test` | unit/integration tests, fixtures, coverage, golden cases |
| `bug` | regression, crash, broken behavior, targeted fixes |
| `ci` | check/workflow failures and flaky build symptoms |
| `dependency` | dependency bumps, lockfiles, package manifests, Dependabot-like inputs |
| `security` | vulnerability, secret, SARIF/code scanning, CVE-like inputs |
| `workflow` | `.github/workflows`, Actions permissions, OIDC/workflow behavior |
| `policy` | `.forge/policies`, constitution, runtime mode, rulesets, branch protection |
| `feature` | bounded enhancement or new option |
| `question` | support/discussion/help requests |
| `network_offer` | federation, treaty, peer, lineage offer |
| `operator_command` | Forge operator commands such as `forge:quarantine` |
| `chore` | cleanup, rename, formatting, small maintenance |
| `unknown` | insufficient deterministic signal |

## Dispositions

Each input receives one of four dispositions:

| Disposition | Meaning |
|---|---|
| `accept` | A normalized task candidate is safe to enqueue for later planning. |
| `ignore` | The input is valid but not an automation target. The common case is missing `forge:auto`. |
| `block` | The input must not reach planning because it is explicitly blocked, unsafe, or too broad. |
| `escalate` | Human review is required before the planner can act. |

## `forge:auto` rule

Only normalized labels can enable automation. Body text or comment text that contains the phrase `forge:auto` is intentionally ignored for auto-enablement.

An item can become an automatic target only when all of the following are true:

1. The normalized label set contains `forge:auto`.
2. The disposition is `accept`.
3. The category is one of `docs`, `test`, `bug`, `ci`, `dependency`, `feature`, or `chore`.
4. The inferred approval class is not Class C/D.
5. The inferred risk is not high/critical.
6. No block/hold/non-actionable signal is present.

## Block and escalation defaults

The classifier blocks before planning when it sees explicit block labels, no-forge style intent, direct default-branch write requests, branch-protection bypass requests, or broad multi-task requests such as rewriting/refactoring everything in one pass.

The classifier escalates security, workflow, policy, and network/treaty work even when `forge:auto` is present. This preserves the T003/T014 safety boundary and prevents high-risk work from entering the automatic planner lane.

## Candidate normalization

Accepted items produce a `NormalizedTaskCandidate` with:

- deterministic `candidateId`
- source key and GitHub-like origin fields
- category, risk, approval class, labels
- one-task-one-PR planner hints
- mutable path hints
- forbidden path hints for workflows, policies, and network config

The candidate is intentionally not a Plan Spec. T016 implements the Plan Spec DSL in `docs/specs/plan-spec.md` and `packages/planner/src/plan-schema.ts`.

## Non-goals

T015 does not implement:

- LLM planning
- PR creation
- executor runtime
- network offer completion
- persistent scheduler integration
- human approval UI
