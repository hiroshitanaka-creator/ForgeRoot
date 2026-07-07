import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ARENA_COMPARISON_CONTRACT,
  compareArenaCandidates,
  runT065ConflictArena,
  validateArenaComparison,
  validateT065ConflictArena,
} from "../dist/index.js";

const NOW = "2026-07-06T00:00:00Z";
const BASE_INPUT = {
  now: NOW,
  arena_id: "arena-main-11111111",
  conflict: { conflict_id: "conflict-main-11111111", reason: "behavior_conflict", summary: "candidate behavior differs under local policy" },
  eval_binding: {
    shadow_run_ref: "eval-shadow-run:e7e4faaf",
    eval_suite_ref: ".forge/evals/root.forge",
    lineage_threshold_ref: "lineage-threshold:root-11111111",
  },
  candidates: [
    candidate("candidate-alpha-11111111", "peer", 88, 82, 20, "low"),
    candidate("candidate-beta-22222222", "species", 70, 75, 95, "medium"),
  ],
};

describe("T065 conflict arbitration arena", () => {
  it("declares a deterministic manifest-only arena contract", () => {
    assert.equal(ARENA_COMPARISON_CONTRACT.deterministic, true);
    assert.equal(ARENA_COMPARISON_CONTRACT.manifestOnly, true);
    assert.equal(ARENA_COMPARISON_CONTRACT.reputationAuxiliaryOnly, true);
    assert.ok(ARENA_COMPARISON_CONTRACT.consumes.includes("eval_shadow_run_ref"));
    assert.ok(ARENA_COMPARISON_CONTRACT.consumes.includes("peer_reputation_score"));
    assert.ok(ARENA_COMPARISON_CONTRACT.validates.includes("winner_loser_inconclusive_decision"));
    assert.ok(ARENA_COMPARISON_CONTRACT.forbids.includes("automatic_merge"));
    assert.ok(ARENA_COMPARISON_CONTRACT.forbids.includes("live_benchmark_execution"));
    assert.ok(ARENA_COMPARISON_CONTRACT.forbids.includes("global_consensus_protocol"));
  });

  it("compares two or more candidates deterministically and selects a winner", () => {
    const first = compareArenaCandidates(BASE_INPUT);
    const second = compareArenaCandidates({ ...BASE_INPUT, candidates: [...BASE_INPUT.candidates].reverse() });

    assert.deepEqual(second, first);
    assert.equal(first.status, "arena_ready", JSON.stringify(first, null, 2));
    assert.equal(first.decision, "arena_winner_selected");
    assert.equal(first.summary.winner_candidate_id, "candidate-alpha-11111111");
    assert.equal(first.summary.top_margin, 10.4);
    assert.equal(first.candidate_results.find((entry) => entry.candidate_id === "candidate-alpha-11111111").decision, "winner");
    assert.equal(first.candidate_results.find((entry) => entry.candidate_id === "candidate-beta-22222222").decision, "loser");
    assert.equal(first.score_policy.reputation_weight_percent, 10);
    assert.equal(first.score_policy.reputation_is_sole_basis, false);
    assert.equal(first.authority_boundary.automatic_merge_allowed, false);
    assert.equal(first.dry_run.live_benchmark_execution_performed, false);
    assert.deepEqual(validateArenaComparison(first), { ok: true, issues: [] });
  });

  it("represents inconclusive outcomes when the top margin is below threshold", () => {
    const result = compareArenaCandidates({
      ...BASE_INPUT,
      candidates: [
        candidate("candidate-alpha-11111111", "peer", 80, 80, 60, "low"),
        candidate("candidate-beta-22222222", "species", 79, 80, 62, "low"),
      ],
    });

    assert.equal(result.status, "arena_inconclusive", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "arena_inconclusive");
    assert.equal(result.summary.winner_candidate_id, null);
    assert.equal(result.summary.top_margin, 0.4);
    assert.ok(result.candidate_results.every((entry) => entry.decision === "inconclusive"));
    assert.deepEqual(validateArenaComparison(result), { ok: true, issues: [] });
  });

  it("keeps reputation auxiliary instead of allowing it to decide alone", () => {
    const result = compareArenaCandidates({
      ...BASE_INPUT,
      candidates: [
        candidate("candidate-alpha-11111111", "peer", 92, 92, 10, "low"),
        candidate("candidate-beta-22222222", "species", 70, 70, 100, "low"),
      ],
    });

    assert.equal(result.summary.winner_candidate_id, "candidate-alpha-11111111");
    assert.equal(result.candidate_results.find((entry) => entry.candidate_id === "candidate-beta-22222222").rank, 2);
    assert.equal(result.summary.reputation_is_sole_basis, false);
    assert.equal(result.authority_boundary.reputation_is_sole_basis, false);
    assert.deepEqual(validateArenaComparison(result), { ok: true, issues: [] });
  });

  it("rejects a local policy breach candidate even with high scores", () => {
    const result = compareArenaCandidates({
      ...BASE_INPUT,
      conflict: { ...BASE_INPUT.conflict, reason: "policy_conflict" },
      candidates: [
        candidate("candidate-alpha-11111111", "local", 100, 100, 100, "low", { policy_compliant: false, local_policy_breach: true }),
        candidate("candidate-beta-22222222", "peer", 70, 70, 20, "low"),
        candidate("candidate-gamma-33333333", "species", 62, 68, 30, "medium"),
      ],
    });

    const rejected = result.candidate_results.find((entry) => entry.candidate_id === "candidate-alpha-11111111");
    assert.equal(result.status, "arena_ready", JSON.stringify(result, null, 2));
    assert.equal(rejected.decision, "rejected");
    assert.ok(rejected.rejection_reasons.includes("policy_breach_rejected"));
    assert.ok(rejected.rejection_reasons.includes("local_policy_breach_rejected"));
    assert.equal(rejected.score_total, 0);
    assert.equal(result.summary.winner_candidate_id, "candidate-beta-22222222");
    assert.deepEqual(validateArenaComparison(result), { ok: true, issues: [] });
  });

  it("blocks out-of-scope live benchmark execution and authoritative score writes", () => {
    const result = compareArenaCandidates({
      ...BASE_INPUT,
      eval_binding: { ...BASE_INPUT.eval_binding, live_benchmark_execution_allowed: true, authoritative_score_write_allowed: true },
    });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "arena_blocked");
    assert.ok(result.reasons.includes("live_benchmark_execution_forbidden"));
    assert.ok(result.reasons.includes("authoritative_score_write_forbidden"));
    assert.equal(result.summary.winner_candidate_id, null);
    assert.deepEqual(validateArenaComparison(result), { ok: true, issues: [] });
  });

  it("fails closed for invalid timestamps, unknown enum values, and secret-shaped material", () => {
    const invalidTimestamp = compareArenaCandidates({ ...BASE_INPUT, now: "2026-02-31T00:00:00Z" });
    const unknownEnum = compareArenaCandidates({ ...BASE_INPUT, conflict: { ...BASE_INPUT.conflict, reason: "vote_conflict" } });
    const secretLike = compareArenaCandidates({ ...BASE_INPUT, eval_binding: { ...BASE_INPUT.eval_binding, shadow_run_ref: "ghp_secretmaterial" } });

    assert.equal(invalidTimestamp.status, "invalid");
    assert.ok(invalidTimestamp.reasons.includes("invalid_timestamp"));
    assert.equal(unknownEnum.status, "invalid");
    assert.ok(unknownEnum.reasons.includes("invalid_conflict_reason"));
    assert.equal(secretLike.status, "invalid");
    assert.ok(secretLike.reasons.includes("secret_material_forbidden"));
    assert.deepEqual(validateArenaComparison(invalidTimestamp), { ok: true, issues: [] });
    assert.deepEqual(validateArenaComparison(unknownEnum), { ok: true, issues: [] });
    assert.deepEqual(validateArenaComparison(secretLike), { ok: true, issues: [] });
  });

  it("rejects tampering of every ready manifest leaf field", () => {
    const result = compareArenaCandidates(BASE_INPUT);
    const paths = leafPaths(result);

    assert.ok(paths.length > 50, "tamper harness should cover the full manifest");
    for (const path of paths) {
      const tampered = structuredClone(result);
      mutateAt(tampered, path);
      const validation = validateArenaComparison(tampered);
      assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join(".")}`);
    }
  });

  it("rejects structural tampering that is not covered by scalar leaf edits", () => {
    const missingPenalty = compareArenaCandidates(BASE_INPUT);
    delete missingPenalty.score_policy.risk_penalties.medium;
    assertIssue(validateArenaComparison(missingPenalty), "risk_penalty_mismatch");

    const unsortedInputs = compareArenaCandidates(BASE_INPUT);
    unsortedInputs.candidate_inputs.reverse();
    assertIssue(validateArenaComparison(unsortedInputs), "entries_not_sorted");

    const unknownNestedKey = compareArenaCandidates(BASE_INPUT);
    unknownNestedKey.candidate_results[0].score_breakdown.extra = true;
    assertIssue(validateArenaComparison(unknownNestedKey), "unknown_key");

    const soleReputation = compareArenaCandidates(BASE_INPUT);
    soleReputation.score_policy.reputation_is_sole_basis = true;
    assertIssue(validateArenaComparison(soleReputation), "reputation_sole_basis_forbidden");
  });

  it("supports the stable T065 aliases", () => {
    const result = runT065ConflictArena(BASE_INPUT);

    assert.deepEqual(result, compareArenaCandidates(BASE_INPUT));
    assert.deepEqual(validateT065ConflictArena(result), validateArenaComparison(result));
  });
});

function candidate(candidate_id, source_kind, eval_score, lineage_score, reputation_score, risk, overrides = {}) {
  return {
    candidate_id,
    source_kind,
    source_ref: `${source_kind}:${candidate_id}`,
    proposal_ref: `proposal:${candidate_id}`,
    policy_compliant: true,
    local_policy_breach: false,
    eval_score,
    lineage_score,
    reputation_score,
    risk,
    evidence_digest: `sha-fnv1a-${candidate_id.slice(-8)}`,
    ...overrides,
  };
}

function leafPaths(value, base = []) {
  if (value === null || typeof value !== "object") return [base];
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafPaths(entry, [...base, index]));
  return Object.keys(value).flatMap((key) => leafPaths(value[key], [...base, key]));
}

function mutateAt(target, path) {
  let cursor = target;
  for (const segment of path.slice(0, -1)) cursor = cursor[segment];
  const leaf = path.at(-1);
  const current = cursor[leaf];
  if (typeof current === "string") cursor[leaf] = `${current}-tampered`;
  else if (typeof current === "number") cursor[leaf] = current + 1;
  else if (typeof current === "boolean") cursor[leaf] = !current;
  else if (current === null) cursor[leaf] = "tampered";
  else cursor[leaf] = "tampered";
}

function assertIssue(validation, code) {
  assert.equal(validation.ok, false, `expected validation to fail with ${code}`);
  assert.ok(validation.issues.some((entry) => entry.code === code), JSON.stringify(validation.issues, null, 2));
}
