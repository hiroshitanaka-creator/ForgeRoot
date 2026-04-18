import assert from "node:assert/strict";
import test from "node:test";
import { classifyIntake } from "../dist/intake.js";
import { runPlanner, PLANNER_BOUNDED_OUTPUT_CONTRACT, PLANNER_CONTEXT_RECIPE } from "../dist/run.js";

function labels(names) {
  return names.map((name) => ({ name }));
}

function issuePayload({ title, body = "", labelNames = [], state = "open" }) {
  return {
    action: "opened",
    repository: { full_name: "hiroshitanaka-creator/ForgeRoot" },
    issue: {
      number: 17,
      title,
      body,
      state,
      html_url: "https://github.example/issues/17",
      labels: labels(labelNames),
    },
  };
}

function acceptedTask(input) {
  const result = classifyIntake(input);
  assert.equal(result.disposition, "accept");
  assert.ok(result.task);
  return result.task;
}

test("planner runtime turns one forge:auto docs issue into one validated Plan Spec", () => {
  const result = runPlanner({
    source: "github_webhook",
    eventName: "issues",
    deliveryId: "delivery-t017-docs",
    now: "2026-04-18T00:00:00Z",
    payload: issuePayload({
      title: "Fix README typo in planner docs",
      body: "The planner README has a small typo in the local development section.",
      labelNames: ["forge:auto", "docs", "risk:low"],
    }),
  });

  assert.equal(result.status, "planned");
  assert.ok(result.intake);
  assert.ok(result.task);
  assert.ok(result.plan);
  assert.equal(result.plan.source.issue_number, 17);
  assert.equal(result.plan.scope_contract.one_task_one_pr, true);
  assert.equal(result.plan.scope_contract.source_issue_count, 1);
  assert.ok(result.plan.scope_contract.mutable_paths.length > 0);
  assert.ok(result.plan.scope_contract.out_of_scope.length > 0);
  assert.equal(result.plan.risk_and_approval.approval_class, "A");
  assert.ok(result.auditTrail.includes("plan_count:1"));
});

test("planner runtime ignores issues without the forge:auto label", () => {
  const result = runPlanner({
    source: "github_webhook",
    eventName: "issues",
    now: "2026-04-18T00:00:00Z",
    payload: issuePayload({
      title: "Fix README typo without automation label",
      body: "This is valid docs work but should not run automatically.",
      labelNames: ["docs", "risk:low"],
    }),
  });

  assert.equal(result.status, "ignored");
  assert.equal(result.plan, undefined);
  assert.ok(result.reasons.includes("missing_label:forge:auto"));
});

test("planner runtime escalates security, workflow, and policy issues before plan creation", () => {
  const security = runPlanner({
    source: "github_webhook",
    eventName: "issues",
    now: "2026-04-18T00:00:00Z",
    payload: issuePayload({
      title: "Security: investigate leaked token",
      body: "Potential secret exposure in CI logs.",
      labelNames: ["forge:auto", "security", "risk:high"],
    }),
  });
  assert.equal(security.status, "escalated");
  assert.equal(security.plan, undefined);
  assert.ok(security.reasons.includes("category:security"));

  const workflow = runPlanner({
    source: "github_webhook",
    eventName: "issues",
    now: "2026-04-18T00:00:00Z",
    payload: issuePayload({
      title: "Update .github/workflows/release.yml permissions",
      body: "This changes workflow permissions.",
      labelNames: ["forge:auto", "class:D"],
    }),
  });
  assert.equal(workflow.status, "escalated");
  assert.equal(workflow.plan, undefined);
  assert.ok(workflow.reasons.includes("category:workflow"));

  const policy = runPlanner({
    source: "github_webhook",
    eventName: "issues",
    now: "2026-04-18T00:00:00Z",
    payload: issuePayload({
      title: "Change runtime mode policy thresholds",
      body: "Tune .forge/policies/runtime-mode.forge thresholds.",
      labelNames: ["forge:auto", "policy"],
    }),
  });
  assert.equal(policy.status, "escalated");
  assert.equal(policy.plan, undefined);
  assert.ok(policy.reasons.includes("category:policy"));
});

test("planner runtime blocks broad forge:auto requests", () => {
  const result = runPlanner({
    source: "intake_input",
    now: "2026-04-18T00:00:00Z",
    intake: {
      sourceKind: "issue",
      title: "Rewrite everything and refactor all modules",
      body: "Please refactor all packages and also rewrite docs.",
      labels: ["forge:auto", "type:maintenance"],
    },
  });

  assert.equal(result.status, "blocked");
  assert.equal(result.plan, undefined);
  assert.ok(result.reasons.includes("scope:too-large"));
});

test("planner runtime accepts a direct normalized task candidate deterministically", () => {
  const task = acceptedTask({
    sourceKind: "issue",
    repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
    number: 18,
    title: "Add missing unit test for planner run",
    body: "Cover direct task candidate planning.",
    labels: ["forge:auto", "type:test"],
    url: "https://github.example/issues/18",
  });

  const first = runPlanner({ source: "task_candidate", task, now: "2026-04-18T00:00:00Z" });
  const second = runPlanner({ source: "task_candidate", task, now: "2026-04-18T00:00:00Z" });

  assert.equal(first.status, "planned");
  assert.deepEqual(first.plan, second.plan);
  assert.equal(first.intake, undefined);
  assert.ok(first.plan.scope_contract.mutable_paths.length > 0);
  assert.equal(first.plan.risk_and_approval.approval_class, "A");
});

test("planner runtime rejects invalid payloads without creating a plan", () => {
  const result = runPlanner({
    source: "github_webhook",
    eventName: "issues",
    now: "2026-04-18T00:00:00Z",
    payload: null,
  });

  assert.equal(result.status, "invalid");
  assert.equal(result.plan, undefined);
  assert.ok(result.reasons.includes("payload_must_be_object"));
});

test("planner runtime exposes bounded context and output contracts", () => {
  assert.ok(PLANNER_CONTEXT_RECIPE.outputContract.includes("at_most_one_plan_spec"));
  assert.equal(PLANNER_BOUNDED_OUTPUT_CONTRACT.maxPlanSpecsPerRun, 1);
  assert.equal(PLANNER_BOUNDED_OUTPUT_CONTRACT.oneTaskOnePr, true);
  assert.ok(PLANNER_BOUNDED_OUTPUT_CONTRACT.forbids.includes("executor_file_editing"));
});
