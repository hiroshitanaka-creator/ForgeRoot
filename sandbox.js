import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createPlanSpecFromTaskCandidate } from "../../planner/dist/plan-schema.js";
import {
  BRANCH_WORKTREE_MANAGER_CONTRACT,
  createBranchWorktreePlan,
  validateBranchWorktreePlan,
  validateChangedPaths,
} from "../dist/index.js";

const CREATED_AT = "2026-04-18T00:00:00Z";

function docsTask(overrides = {}) {
  return {
    candidateId: "issue:42",
    sourceKey: "issue:42",
    sourceKind: "issue",
    repositoryFullName: "hiroshitanaka-creator/ForgeRoot",
    number: 42,
    url: "https://github.com/hiroshitanaka-creator/ForgeRoot/issues/42",
    title: "[P1][T018] worktree / branch manager",
    summary: "Add deterministic branch and worktree planning before sandbox execution.",
    category: "docs",
    risk: "medium",
    approvalClass: "B",
    labels: ["forge:auto", "phase:P1", "class:B", "risk:medium"],
    autoRequested: true,
    bodyExcerpt: "Prepare branch/worktree manifest only; do not run git or edit files.",
    plannerHints: {
      oneTaskOnePr: true,
      recommendedScope: "docs-only validation task",
      mutablePathHints: ["README.md", "docs/**", "packages/executor/**"],
      forbiddenPathHints: [".github/workflows/**", ".forge/policies/**", ".forge/network/**"],
      requiresHumanReviewBeforePlanning: false,
    },
    ...overrides,
  };
}

function docsPlan(overrides = {}) {
  return createPlanSpecFromTaskCandidate(docsTask(overrides), { createdAt: CREATED_AT });
}

describe("T018 branch/worktree manager", () => {
  it("declares a manifest-only contract with no git side effects", () => {
    assert.equal(BRANCH_WORKTREE_MANAGER_CONTRACT.oneTaskOnePr, true);
    assert.equal(BRANCH_WORKTREE_MANAGER_CONTRACT.branchPrefix, "forge/");
    assert.ok(BRANCH_WORKTREE_MANAGER_CONTRACT.forbids.includes("git_worktree_add"));
    assert.ok(BRANCH_WORKTREE_MANAGER_CONTRACT.forbids.includes("default_branch_write"));
  });

  it("creates one deterministic branch/worktree plan from one ready Plan Spec", () => {
    const plan = docsPlan();
    const result = createBranchWorktreePlan(plan, { now: CREATED_AT, defaultBranch: "main" });

    assert.equal(result.status, "ready");
    assert.ok(result.plan);
    assert.match(result.plan.branch.name, /^forge\/p1\/T018-worktree-branch-manager/);
    assert.equal(result.plan.branch.base_ref, "main");
    assert.equal(result.plan.branch.default_branch, "main");
    assert.notEqual(result.plan.branch.name, "main");
    assert.equal(result.plan.worktree.ephemeral, true);
    assert.match(result.plan.worktree.path, /^\.forgeroot\/worktrees\/forge__p1__T018-worktree-branch-manager/);
    assert.deepEqual(result.plan.scope.mutable_paths, plan.scope_contract.mutable_paths);
    assert.deepEqual(validateBranchWorktreePlan(result.plan), { ok: true, issues: [] });
  });

  it("is deterministic for identical Plan Spec and options", () => {
    const plan = docsPlan();
    const first = createBranchWorktreePlan(plan, { now: CREATED_AT, defaultBranch: "main" });
    const second = createBranchWorktreePlan(plan, { now: CREATED_AT, defaultBranch: "main" });
    assert.deepEqual(first, second);
  });

  it("blocks elevated plans before branch preparation unless execution approval is attached", () => {
    const plan = docsPlan();
    const elevated = {
      ...plan,
      status: "blocked_for_human",
      risk_and_approval: {
        ...plan.risk_and_approval,
        risk: "high",
        approval_class: "C",
        human_review_required_before_execution: true,
        escalation_required: true,
      },
    };

    const blocked = createBranchWorktreePlan(elevated, { now: CREATED_AT });
    assert.equal(blocked.status, "blocked");
    assert.equal(blocked.plan, undefined);
    assert.ok(blocked.reasons.includes("human_review_required_before_branch_preparation"));

    const approved = createBranchWorktreePlan(elevated, {
      now: CREATED_AT,
      approvedForExecution: true,
      approvalRef: "issue-comment://42#approval",
    });
    assert.equal(approved.status, "ready");
    assert.equal(approved.plan.approval.approved_for_execution, true);
    assert.equal(approved.plan.approval.approval_ref, "issue-comment://42#approval");
  });

  it("requires an approval reference when elevated execution approval is asserted", () => {
    const plan = docsPlan();
    const elevated = {
      ...plan,
      risk_and_approval: {
        ...plan.risk_and_approval,
        human_review_required_before_execution: true,
        escalation_required: true,
      },
    };
    const result = createBranchWorktreePlan(elevated, { approvedForExecution: true, now: CREATED_AT });
    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.includes("approval_ref_required_when_approved_for_execution"));
  });

  it("rejects default-branch or unsafe branch targets", () => {
    const plan = docsPlan();
    const main = createBranchWorktreePlan(plan, { branchName: "main", now: CREATED_AT });
    assert.equal(main.status, "invalid");
    assert.ok(main.reasons.includes("branch_name_must_start_with_forge_prefix") || main.reasons.includes("branch_name_targets_default_branch"));

    const traversal = createBranchWorktreePlan(plan, { branchName: "forge/p1/../escape", now: CREATED_AT });
    assert.equal(traversal.status, "invalid");
    assert.ok(traversal.reasons.includes("branch_name_invalid"));
  });

  it("rejects unsafe worktree roots", () => {
    const plan = docsPlan();
    const result = createBranchWorktreePlan(plan, { worktreeRoot: "../outside", now: CREATED_AT });
    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.includes("worktree_root_contains_unsafe_segment"));
  });

  it("guards changed paths against immutable and out-of-scope paths", () => {
    const plan = docsPlan();
    const result = createBranchWorktreePlan(plan, { now: CREATED_AT });
    assert.equal(result.status, "ready");

    const accepted = validateChangedPaths(result.plan, ["README.md", "docs/ops/worktree.md", "packages/executor/src/worktree.ts"]);
    assert.equal(accepted.ok, true);
    assert.deepEqual(accepted.rejectedPaths, []);

    const rejected = validateChangedPaths(result.plan, [".github/workflows/ci.yml", "src/unrelated.ts", "../escape"]);
    assert.equal(rejected.ok, false);
    assert.deepEqual(rejected.rejectedPaths.map((path) => path.reason), ["immutable", "outside_mutable_scope", "invalid_path"]);
    assert.ok(rejected.reasons.includes("immutable_path_changed"));
    assert.ok(rejected.reasons.includes("path_outside_mutable_scope"));
    assert.ok(rejected.reasons.includes("invalid_changed_path"));
  });

  it("does not prepare branches for draft or superseded plans", () => {
    const plan = docsPlan();
    for (const status of ["draft", "superseded"]) {
      const result = createBranchWorktreePlan({ ...plan, status }, { now: CREATED_AT });
      assert.equal(result.status, "blocked");
      assert.equal(result.plan, undefined);
      assert.ok(result.reasons.includes(`plan_status_not_ready_for_worktree:${status}`));
    }
  });

  it("rejects malformed plan-like inputs before branch derivation", () => {
    const result = createBranchWorktreePlan({}, { now: CREATED_AT });
    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.includes("invalid_plan_spec_like"));
    assert.ok(result.issues.length >= 1);
  });
});
