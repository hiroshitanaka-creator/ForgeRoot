# ForgeRoot Plan Spec DSL v1

Status: T016 initial implementation

## Purpose

The Plan Spec DSL is the bounded contract between intake classification and later execution. It exists to make **one task = one PR** mechanically checkable before the Executor receives any editing authority.

A Plan Spec is not an LLM transcript and not a free-form checklist. It is a JSON-serializable object with explicit source binding, mutable paths, immutable paths, out-of-scope boundaries, risk/approval linkage, execution steps, and machine-checkable acceptance criteria.

## Position in the ForgeRoot loop

```text
T015 intake classifier
  -> NormalizedTaskCandidate
  -> T016 Plan Spec DSL
  -> T017 planner runtime
  -> sandbox executor / auditor / PR composer
```

The T016 implementation provides the schema and deterministic builder primitives only. It does not create branches, execute commands, run tests, or open pull requests.

## Core invariants

Every valid Plan Spec v1 must satisfy these invariants:

1. `plan_version` is `1` and `schema_ref` is `urn:forgeroot:plan-spec:v1`.
2. `scope_contract.one_task_one_pr` is `true`.
3. `scope_contract.source_issue_count` is exactly `1`.
4. `scope_contract.no_default_branch_write` is `true`.
5. `scope_contract.mutable_paths` is non-empty.
6. `scope_contract.immutable_paths` is non-empty.
7. `scope_contract.out_of_scope` is non-empty.
8. `acceptance_criteria` is non-empty.
9. Every acceptance criterion has a `check` object with `machine: true`.
10. Class C/D or high/critical risk plans must set `risk_and_approval.escalation_required=true`.

## Top-level shape

```ts
interface PlanSpec {
  plan_version: 1;
  schema_ref: "urn:forgeroot:plan-spec:v1";
  plan_id: string;
  status: "draft" | "ready_for_execution" | "blocked_for_human" | "superseded";
  created_at: string;
  source: PlanSource;
  title: string;
  goal: string;
  summary: string;
  category: IntakeCategory;
  scope_contract: ScopeContract;
  risk_and_approval: RiskAndApprovalLink;
  acceptance_criteria: AcceptanceCriterion[];
  execution_steps: PlanStep[];
  audit: AuditContract;
  extensions: Record<string, JsonValue>;
}
```

## Source binding

`source` binds the plan to exactly one accepted intake candidate.

```ts
interface PlanSource {
  kind: "issue" | "issue_comment" | "alert" | "check_run" | "workflow_run";
  source_key: string;
  candidate_id: string;
  repository: string | null;
  issue_number: number | null;
  url: string | null;
  title: string;
  labels: string[];
}
```

The current T016 builder emits one Plan Spec per `NormalizedTaskCandidate`. It does not merge multiple issues, comments, alerts, or checks into one plan.

## Scope contract

`scope_contract` is the review boundary that prevents scope explosion.

```ts
interface ScopeContract {
  one_task_one_pr: true;
  source_issue_count: 1;
  no_default_branch_write: true;
  mutable_paths: string[];
  immutable_paths: string[];
  out_of_scope: string[];
  max_files_changed: number;
  max_diff_lines: number;
  branch_naming_hint: string;
}
```

`mutable_paths` declares what the Executor may touch. `immutable_paths` declares what the Executor must not touch. `out_of_scope` states human-readable but explicit exclusions that must be preserved in the PR description and audit report.

The default immutable governance paths are:

```text
.github/workflows/**
.forge/policies/**
.forge/network/**
```

These paths preserve the T003/T014 safety boundary. A future Class C/D human-approved workflow can create a separate governance plan, but the automatic T016 builder does not produce mutating plans for those areas.

## Risk and approval linkage

```ts
interface RiskAndApprovalLink {
  risk: "low" | "medium" | "high" | "critical";
  approval_class: "A" | "B" | "C" | "D";
  human_review_required_before_execution: boolean;
  human_review_required_before_merge: boolean;
  escalation_required: boolean;
  reasons: string[];
}
```

Class A plans may proceed to execution without pre-execution human review. Class B plans may proceed to execution but require human review before merge. Class C/D or high/critical risk plans are blocked before execution and require human review before any mutating step.

## Acceptance criteria

Acceptance criteria must be machine-checkable. Free-form review wishes belong in the issue or PR body, not in `acceptance_criteria`.

```ts
interface AcceptanceCriterion {
  id: string;
  description: string;
  required: true;
  evidence: "diff" | "command_output" | "metadata" | "file_content";
  check: AcceptanceCheck;
}
```

Allowed check kinds:

| Check kind | Required fields | Purpose |
|---|---|---|
| `command` | `command`, `expected_exit_code` | Verify a test/build/lint command result. |
| `path_changed` | `paths` | Verify the diff touched at least one allowed path. |
| `path_not_changed` | `paths` | Verify specific paths were not touched. |
| `forbidden_paths_unchanged` | `paths` | Verify immutable paths were not changed. |
| `diff_budget` | `max_files_changed`, `max_diff_lines` | Verify bounded PR size. |
| `text_contains` | `paths`, `needle` | Verify required text exists in a file. |
| `plan_field_equals` | `field`, `expected` | Verify a Plan Spec field remains fixed. |

Every check must include `machine: true`.

## Execution steps

Execution steps are bounded hints, not shell scripts. They describe the smallest allowed sequence for the future Executor.

```ts
interface PlanStep {
  id: string;
  kind: "inspect" | "edit" | "diagnose" | "test" | "audit" | "document" | "dependency";
  description: string;
  allowed_paths: string[];
  produces: string[];
}
```

A valid Plan Spec has between one and eight steps. Each step's `allowed_paths` must be covered by `scope_contract.mutable_paths`.

## Example

```json
{
  "plan_version": 1,
  "schema_ref": "urn:forgeroot:plan-spec:v1",
  "plan_id": "forge-plan://github/hiroshitanaka-creator/forgeroot/issue/16",
  "status": "ready_for_execution",
  "created_at": "2026-04-18T00:00:00Z",
  "source": {
    "kind": "issue",
    "source_key": "github://hiroshitanaka-creator/forgeroot/issue/16",
    "candidate_id": "forge-task://github/hiroshitanaka-creator/forgeroot/issue/16",
    "repository": "hiroshitanaka-creator/ForgeRoot",
    "issue_number": 16,
    "url": "https://github.example/issues/16",
    "title": "Fix README typo in quickstart",
    "labels": ["docs", "forge:auto", "risk:low"]
  },
  "title": "Fix README typo in quickstart",
  "goal": "Resolve exactly one docs task: Fix README typo in quickstart",
  "summary": "The setup section has a typo.",
  "category": "docs",
  "scope_contract": {
    "one_task_one_pr": true,
    "source_issue_count": 1,
    "no_default_branch_write": true,
    "mutable_paths": ["README.md", "docs/**", "*.md"],
    "immutable_paths": [".github/workflows/**", ".forge/policies/**", ".forge/network/**"],
    "out_of_scope": ["any second issue or unrelated feature request", "direct writes to the default branch"],
    "max_files_changed": 6,
    "max_diff_lines": 250,
    "branch_naming_hint": "forge/p1/fix-readme-typo-in-quickstart"
  },
  "risk_and_approval": {
    "risk": "low",
    "approval_class": "A",
    "human_review_required_before_execution": false,
    "human_review_required_before_merge": false,
    "escalation_required": false,
    "reasons": ["risk:low", "approval_class:A", "automatic_planning_allowed"]
  },
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "description": "The diff stays within the Plan Spec file and line budget.",
      "required": true,
      "evidence": "diff",
      "check": { "kind": "diff_budget", "machine": true, "max_files_changed": 6, "max_diff_lines": 250 }
    }
  ],
  "execution_steps": [
    {
      "id": "STEP-001",
      "kind": "inspect",
      "description": "Inspect the source issue and the smallest relevant repository context before editing.",
      "allowed_paths": ["README.md", "docs/**", "*.md"],
      "produces": ["context_digest"]
    }
  ],
  "audit": {
    "required_evidence": ["diff", "metadata", "command_output"],
    "independent_audit_required": true
  },
  "extensions": {}
}
```

## Implementation

T016 adds `packages/planner/src/plan-schema.ts` with:

- `PlanSpec` TypeScript types
- `createPlanSpecFromTaskCandidate(task)` deterministic builder
- `validatePlanSpec(plan)` structural and semantic validator
- `assertValidPlanSpec(plan)` throwing guard

The implementation intentionally has no runtime dependency beyond TypeScript/Node.

## Non-goals

T016 does not implement:

- LLM planner prompting
- branch creation
- patch generation
- test execution
- audit report generation
- PR composition
- scheduler or executor integration
