import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVAL_SHADOW_RUN_CONTRACT,
  runEvalShadowRun,
  runShadowRun,
  runT045ShadowRun,
  validateEvalShadowRun,
  validateShadowRun,
  validateT045ShadowRun,
} from "../dist/index.js";

const NOW = "2026-06-21T00:00:00Z";
const BASE_INPUT = {
  now: NOW,
  suite: { path: ".forge/evals/root.forge", name: "root", kind: "eval_suite" },
  baselineResult: { path: ".forge/evals/results/root-baseline.forge", name: "root-baseline", kind: "eval_result" },
  candidate: { path: ".forge/mind.forge", name: "mind", kind: "forge_document" },
};

describe("T045 eval shadow-run harness", () => {
  it("declares a dry-run-only contract", () => {
    assert.equal(EVAL_SHADOW_RUN_CONTRACT.dryRunOnly, true);
    assert.equal(EVAL_SHADOW_RUN_CONTRACT.deterministic, true);
    assert.ok(EVAL_SHADOW_RUN_CONTRACT.consumes.includes("eval_suite_manifest"));
    assert.ok(EVAL_SHADOW_RUN_CONTRACT.consumes.includes("eval_result_manifest"));
    assert.ok(EVAL_SHADOW_RUN_CONTRACT.forbids.includes("authoritative_score_write"));
    assert.ok(EVAL_SHADOW_RUN_CONTRACT.forbids.includes("runtime_memory_write"));
    assert.ok(EVAL_SHADOW_RUN_CONTRACT.forbids.includes("live_self_evolution"));
  });

  it("creates a deterministic manifest without executing graders or writing authoritative state", () => {
    const result = runEvalShadowRun(BASE_INPUT);

    assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "shadow_run_ready");
    assert.equal(result.shadow_run_id, "eval-shadow-run-e7e4faaf");
    assert.equal(result.dry_run.grader_execution_performed, false);
    assert.equal(result.dry_run.authoritative_scores_written, false);
    assert.equal(result.dry_run.runtime_memory_written, false);
    assert.equal(result.dry_run.github_api_called, false);
    assert.equal(result.dry_run.live_evolution_enabled, false);
    assert.deepEqual(validateEvalShadowRun(result), { ok: true, issues: [] });
  });

  it("rejects non-canonical manifest references before a shadow run can become ready", () => {
    const result = runEvalShadowRun({ ...BASE_INPUT, baselineResult: { path: ".forge/evals/root-baseline.forge", name: "root-baseline", kind: "eval_result" } });

    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "invalid_shadow_run_input");
    assert.ok(result.reasons.includes("invalid_ref_path"));
    assert.deepEqual(validateEvalShadowRun(result), { ok: true, issues: [] });
  });

  it("blocks attempts to make shadow-run scores or evolution live", () => {
    const result = runEvalShadowRun({ ...BASE_INPUT, allowAuthoritativeScores: true, allowRuntimeWrites: true, allowLiveEvolution: true });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.deepEqual(result.reasons, ["authoritative_scores_forbidden", "runtime_writes_forbidden", "live_evolution_forbidden"]);
    assert.deepEqual(validateEvalShadowRun(result), { ok: true, issues: [] });
  });

  it("supports stable aliases", () => {
    for (const fn of [runShadowRun, runT045ShadowRun]) {
      const result = fn(BASE_INPUT);
      assert.equal(result.status, "ready");
      assert.deepEqual(validateShadowRun(result), { ok: true, issues: [] });
      assert.deepEqual(validateT045ShadowRun(result), { ok: true, issues: [] });
    }
  });
});
