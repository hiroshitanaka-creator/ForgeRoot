import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVAL_SUITE_CONTRACT,
  validateEvalSuite,
  validateT034EvalSuite,
} from "../dist/index.js";

const CORE_SUITE = {
  forge_version: 1,
  schema_ref: "urn:forgeroot:forge:eval_suite:v1",
  kind: "eval_suite",
  id: "forge://hiroshitanaka-creator/ForgeRoot/eval_suite/core.eval",
  revision: "01KQ1000000000000000000034",
  mind_ref: "forge://hiroshitanaka-creator/ForgeRoot/mind/root",
  status: "seeded",
  title: "ForgeRoot Core Eval Suite",
  summary: "Manifest-only benchmark task and grader definitions for Phase 2 eval validation.",
  owners: ["github://hiroshitanaka-creator", "github-app://forgeroot"],
  created_at: "2026-07-06T00:00:00Z",
  updated_at: "2026-07-06T00:00:00Z",
  suite_name: "core.eval",
  tasks: [
    {
      task_id: "docs_contract_review",
      fixture_ref: "labs/benchmarks/fixtures/docs-contract-review.json",
      input_kind: "docs",
      expected_outcome: "pass",
      risk_class: "B",
      grader_refs: ["manifest_boundary_grader"],
    },
    {
      task_id: "invalid_scope_rejection",
      fixture_ref: "labs/benchmarks/fixtures/invalid-scope-rejection.json",
      input_kind: "scope",
      expected_outcome: "blocked",
      risk_class: "B",
      grader_refs: ["scope_boundary_grader"],
    },
  ],
  graders: [
    {
      grader_id: "manifest_boundary_grader",
      description: "Checks whether eval outputs stay manifest-only and source-referenced.",
      input_schema_ref: "urn:forgeroot:eval:task_fixture:v1",
      output_schema_ref: "urn:forgeroot:eval:grader_result:v1",
      decision_values: ["pass", "fail", "blocked", "unknown"],
      score_output: "unknown_until_t037",
    },
    {
      grader_id: "scope_boundary_grader",
      description: "Checks whether forbidden live execution and mutation paths remain blocked.",
      input_schema_ref: "urn:forgeroot:eval:task_fixture:v1",
      output_schema_ref: "urn:forgeroot:eval:grader_result:v1",
      decision_values: ["pass", "fail", "blocked", "quarantined", "unknown"],
      score_output: "unknown_until_t037",
    },
  ],
  risk_class: "B",
  success_metrics: {
    deterministic_manifest_outputs: "unknown",
    policy_compliance: "unknown",
    reviewability: "unknown",
    low_blast_radius: "unknown",
  },
  shadow_only: true,
  provenance: { task_id: "T034", source: "docs/specs/t029-t039-canonical-task-source.md", generated_by: "codex", manifest_only: true },
  extensions: {
    t034_guards: {
      no_benchmark_execution: true,
      no_grader_execution: true,
      no_score_calculation: true,
      no_mutation_selection: true,
      no_live_ci_integration: true,
    },
  },
};

describe("T034 eval suite DSL validation", () => {
  it("declares a manifest-only validation contract", () => {
    assert.equal(EVAL_SUITE_CONTRACT.deterministic, true);
    assert.equal(EVAL_SUITE_CONTRACT.manifestOnly, true);
    assert.ok(EVAL_SUITE_CONTRACT.validates.includes("task_fixture_schema"));
    assert.ok(EVAL_SUITE_CONTRACT.validates.includes("grader_definitions"));
    assert.ok(EVAL_SUITE_CONTRACT.forbids.includes("benchmark_execution"));
    assert.ok(EVAL_SUITE_CONTRACT.forbids.includes("fitness_calculation"));
    assert.ok(EVAL_SUITE_CONTRACT.forbids.includes("live_ci_integration"));
  });

  it("validates separated benchmark tasks, grader definitions, risk class, and shadow_only", () => {
    const result = validateEvalSuite({ suite: CORE_SUITE, canonicalPath: ".forge/evals/core.eval.forge", requireDefinitions: true });

    assert.deepEqual(result.issues, []);
    assert.equal(result.ok, true);
    assert.equal(result.summary.suite_name, "core.eval");
    assert.equal(result.summary.task_count, 2);
    assert.equal(result.summary.grader_count, 2);
    assert.equal(result.summary.risk_class, "B");
    assert.equal(result.summary.shadow_only, true);
    assert.equal(result.summary.benchmark_execution_performed, false);
    assert.equal(result.summary.grader_execution_performed, false);
    assert.equal(result.summary.score_calculation_performed, false);
  });

  it("accepts a seeded empty suite when executable definitions are not required yet", () => {
    const result = validateEvalSuite({
      suite: { ...CORE_SUITE, id: "forge://hiroshitanaka-creator/ForgeRoot/eval_suite/root", suite_name: "root", tasks: [], graders: [], provenance: { ...CORE_SUITE.provenance, task_id: "T043" } },
      canonicalPath: ".forge/evals/root.forge",
    });

    assert.equal(result.ok, true, JSON.stringify(result, null, 2));
    assert.equal(result.summary.task_count, 0);
    assert.equal(result.summary.grader_count, 0);
  });

  it("rejects inline graders and unknown grader references", () => {
    const result = validateEvalSuite({
      suite: {
        ...CORE_SUITE,
        tasks: [
          {
            ...CORE_SUITE.tasks[0],
            grader_refs: ["missing_grader"],
            grader: { grader_id: "inline" },
          },
        ],
      },
      requireDefinitions: true,
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.code === "inline_grader_forbidden"));
    assert.ok(result.issues.some((entry) => entry.code === "unknown_grader_ref"));
  });

  it("rejects non-shadow suites, false guards, and path/name mismatch", () => {
    const result = validateEvalSuite({
      suite: {
        ...CORE_SUITE,
        shadow_only: false,
        extensions: { t034_guards: { ...CORE_SUITE.extensions.t034_guards, no_benchmark_execution: false } },
      },
      canonicalPath: ".forge/evals/other.forge",
      requireDefinitions: true,
    });

    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.code === "shadow_only_required"));
    assert.ok(result.issues.some((entry) => entry.code === "guard_must_be_true"));
    assert.ok(result.issues.some((entry) => entry.code === "suite_name_path_mismatch"));
  });

  it("supports the stable T034 alias", () => {
    assert.deepEqual(validateT034EvalSuite({ suite: CORE_SUITE, canonicalPath: ".forge/evals/core.eval.forge", requireDefinitions: true }), validateEvalSuite({ suite: CORE_SUITE, canonicalPath: ".forge/evals/core.eval.forge", requireDefinitions: true }));
  });
});
