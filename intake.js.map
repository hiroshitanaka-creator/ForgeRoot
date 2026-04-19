import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntake } from "../dist/intake.js";
import { assertValidPlanSpec, createPlanSpecFromTaskCandidate, validatePlanSpec } from "../dist/plan-schema.js";

function acceptedTask(input) {
  const result = classifyIntake(input);
  assert.equal(result.disposition, "accept");
  assert.ok(result.task);
  return result.task;
}

test("creates one deterministic Plan Spec from one accepted issue candidate", () => {
  const task = acceptedTask({
    sourceKind: "issue",
    repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
    number: 16,
    title: "Fix README typo in quickstart",
    body: "The setup section has a typo.",
    labels: ["forge:auto", "docs", "risk:low"],
    url: "https://github.example/issues/16",
  });

  const plan = createPlanSpecFromTaskCandidate(task, { createdAt: "2026-04-18T00:00:00Z" });
  const again = createPlanSpecFromTaskCandidate(task, { createdAt: "2026-04-18T00:00:00Z" });

  assert.deepEqual(plan, again);
  assert.equal(plan.plan_version, 1);
  assert.equal(plan.schema_ref, "urn:forgeroot:plan-spec:v1");
  assert.equal(plan.source.issue_number, 16);
  assert.equal(plan.scope_contract.one_task_one_pr, true);
  assert.equal(plan.scope_contract.source_issue_count, 1);
  assert.equal(plan.scope_contract.no_default_branch_write, true);
  assert.ok(plan.scope_contract.mutable_paths.length > 0);
  assert.ok(plan.scope_contract.immutable_paths.includes(".github/workflows/**"));
  assert.ok(plan.scope_contract.out_of_scope.some((item) => item.includes("second issue")));
  assert.equal(plan.risk_and_approval.approval_class, "A");
  assert.equal(plan.risk_and_approval.human_review_required_before_execution, false);

  const validation = validatePlanSpec(plan);
  assert.deepEqual(validation.issues, []);
  assert.equal(validation.ok, true);
});

test("acceptance criteria are required and machine-checkable", () => {
  const task = acceptedTask({ sourceKind: "issue", title: "Add missing unit test", labels: ["forge:auto", "type:test"] });
  const valid = createPlanSpecFromTaskCandidate(task, { createdAt: "2026-04-18T00:00:00Z" });
  assertValidPlanSpec(valid);

  const noCriteria = { ...valid, acceptance_criteria: [] };
  let result = validatePlanSpec(noCriteria);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.path === "/acceptance_criteria" && item.code === "non_empty"));

  const nonMachine = {
    ...valid,
    acceptance_criteria: [
      {
        ...valid.acceptance_criteria[0],
        check: { ...valid.acceptance_criteria[0].check, machine: false },
      },
    ],
  };
  result = validatePlanSpec(nonMachine);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.path.endsWith("/check/machine") && item.code === "literal"));
});

test("scope contract requires mutable paths and explicit out-of-scope boundaries", () => {
  const task = acceptedTask({ sourceKind: "issue", title: "Fix regression in event inbox", labels: ["forge:auto", "bug"] });
  const valid = createPlanSpecFromTaskCandidate(task, { createdAt: "2026-04-18T00:00:00Z" });

  const missingMutable = {
    ...valid,
    scope_contract: { ...valid.scope_contract, mutable_paths: [] },
  };
  let result = validatePlanSpec(missingMutable);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.path === "/scope_contract/mutable_paths" && item.code === "non_empty"));

  const missingOutOfScope = {
    ...valid,
    scope_contract: { ...valid.scope_contract, out_of_scope: [] },
  };
  result = validatePlanSpec(missingOutOfScope);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.path === "/scope_contract/out_of_scope" && item.code === "non_empty"));
});

test("mutable paths cannot overlap immutable governance paths", () => {
  const task = acceptedTask({ sourceKind: "issue", title: "Fix README typo", labels: ["forge:auto", "docs"] });
  const valid = createPlanSpecFromTaskCandidate(task, { createdAt: "2026-04-18T00:00:00Z" });
  const invalid = {
    ...valid,
    scope_contract: {
      ...valid.scope_contract,
      mutable_paths: ["README.md", ".github/workflows/**"],
    },
  };

  const result = validatePlanSpec(invalid);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "immutable_overlap"));
});

test("approval link blocks elevated class plans before execution", () => {
  const task = acceptedTask({ sourceKind: "issue", title: "Implement a small CLI flag", labels: ["forge:auto", "feature", "class:b"] });
  const valid = createPlanSpecFromTaskCandidate(task, { createdAt: "2026-04-18T00:00:00Z" });
  assert.equal(valid.risk_and_approval.approval_class, "B");
  assert.equal(valid.risk_and_approval.human_review_required_before_merge, true);
  assert.equal(validatePlanSpec(valid).ok, true);

  const invalidClassC = {
    ...valid,
    risk_and_approval: {
      ...valid.risk_and_approval,
      approval_class: "C",
      human_review_required_before_execution: false,
      escalation_required: false,
    },
  };
  const result = validatePlanSpec(invalidClassC);
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((item) => item.code === "approval_link"));
});
