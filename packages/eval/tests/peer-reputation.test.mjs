import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PEER_REPUTATION_CONTRACT,
  evaluatePeerReputation,
  runT063PeerReputationScoring,
  validatePeerReputation,
  validateT063PeerReputationScoring,
} from "../dist/index.js";

const NOW = "2026-07-06T00:00:00Z";
const BASE_INPUT = {
  now: NOW,
  peer: { peer_id: "target-peer", repository_full_name: "owner/target", status: "active" },
  treaty: { treaty_id: "treaty-alpha", status: "active", source_peer_id: "source-peer", target_peer_id: "target-peer", expires_at: "2026-08-01T00:00:00Z" },
  outcomes: [
    outcome("outcome-11111111", "cross-repo-pr:cross-repo-pr-11111111", "accepted", true, "low"),
    outcome("outcome-22222222", "cross-repo-pr:cross-repo-pr-22222222", "accepted", true, "medium"),
    outcome("outcome-33333333", "cross-repo-pr:cross-repo-pr-33333333", "rejected", true, "medium"),
  ],
};

describe("T063 peer reputation scoring", () => {
  it("declares an advisory manifest-only contract", () => {
    assert.equal(PEER_REPUTATION_CONTRACT.deterministic, true);
    assert.equal(PEER_REPUTATION_CONTRACT.manifestOnly, true);
    assert.equal(PEER_REPUTATION_CONTRACT.advisoryOnly, true);
    assert.ok(PEER_REPUTATION_CONTRACT.consumes.includes("peer_outcomes"));
    assert.ok(PEER_REPUTATION_CONTRACT.validates.includes("adoption_authority_boundary"));
    assert.ok(PEER_REPUTATION_CONTRACT.forbids.includes("automatic_adoption"));
    assert.ok(PEER_REPUTATION_CONTRACT.forbids.includes("network_transport"));
    assert.ok(PEER_REPUTATION_CONTRACT.forbids.includes("public_ranking"));
  });

  it("creates a deterministic advisory reputation manifest without adoption authority", () => {
    const first = evaluatePeerReputation(BASE_INPUT);
    const second = evaluatePeerReputation(BASE_INPUT);

    assert.deepEqual(second, first);
    assert.equal(first.status, "reputation_ready", JSON.stringify(first, null, 2));
    assert.equal(first.decision, "peer_reputation_ready");
    assert.equal(first.score.value, 56);
    assert.equal(first.score.band, "neutral");
    assert.equal(first.recommended_action, "observe");
    assert.equal(first.adoption_authority.source_of_truth_for_adoption, false);
    assert.equal(first.adoption_authority.automatic_adoption_allowed, false);
    assert.equal(first.adoption_authority.advisory_only, true);
    assert.equal(first.dry_run.adoption_performed, false);
    assert.equal(first.dry_run.network_transport_performed, false);
    assert.equal(first.dry_run.github_api_called, false);
    assert.deepEqual(validatePeerReputation(first), { ok: true, issues: [] });
  });

  it("lowers score when peer proposals are repeatedly rejected", () => {
    const oneRejected = evaluatePeerReputation({ ...BASE_INPUT, outcomes: [outcome("outcome-11111111", "cross-repo-pr:cross-repo-pr-11111111", "rejected", true, "medium")] });
    const repeatedRejected = evaluatePeerReputation({
      ...BASE_INPUT,
      outcomes: [
        outcome("outcome-11111111", "cross-repo-pr:cross-repo-pr-11111111", "rejected", true, "medium"),
        outcome("outcome-22222222", "cross-repo-pr:cross-repo-pr-22222222", "rejected", true, "medium"),
        outcome("outcome-33333333", "cross-repo-pr:cross-repo-pr-33333333", "rejected", true, "medium"),
      ],
    });

    assert.equal(oneRejected.score.value, 40);
    assert.equal(repeatedRejected.score.value, 20);
    assert.equal(repeatedRejected.scoring_summary.repeated_rejections, true);
    assert.equal(repeatedRejected.recommended_action, "quarantine");
    assert.deepEqual(validatePeerReputation(repeatedRejected), { ok: true, issues: [] });
  });

  it("can recommend quarantine from a policy breach without performing adoption or network writes", () => {
    const result = evaluatePeerReputation({
      ...BASE_INPUT,
      outcomes: [outcome("outcome-11111111", "cross-repo-pr:cross-repo-pr-11111111", "accepted", false, "high")],
    });

    assert.equal(result.status, "reputation_ready", JSON.stringify(result, null, 2));
    assert.equal(result.scoring_summary.policy_breach_count, 1);
    assert.equal(result.scoring_summary.quarantine_threshold_met, true);
    assert.equal(result.recommended_action, "quarantine");
    assert.equal(result.dry_run.adoption_performed, false);
    assert.equal(result.dry_run.public_ranking_written, false);
    assert.deepEqual(validatePeerReputation(result), { ok: true, issues: [] });
  });

  it("blocks revoked peers and expired treaties without carrying invalid issues", () => {
    const result = evaluatePeerReputation({
      ...BASE_INPUT,
      peer: { ...BASE_INPUT.peer, status: "revoked" },
      treaty: { ...BASE_INPUT.treaty, expires_at: "2026-01-01T00:00:00Z" },
    });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "peer_reputation_blocked");
    assert.ok(result.reasons.includes("peer_revoked"));
    assert.ok(result.reasons.includes("treaty_expired"));
    assert.equal("issues" in result, false);
    assert.deepEqual(validatePeerReputation(result), { ok: true, issues: [] });
  });

  it("fails closed for invalid timestamps, unknown enum values, and secret-shaped material", () => {
    const invalidTimestamp = evaluatePeerReputation({ ...BASE_INPUT, now: "2026-02-31T00:00:00Z" });
    const unknownEnum = evaluatePeerReputation({ ...BASE_INPUT, outcomes: [{ ...BASE_INPUT.outcomes[0], adoption_outcome: "maybe" }] });
    const secretLike = evaluatePeerReputation({ ...BASE_INPUT, outcomes: [{ ...BASE_INPUT.outcomes[0], proposal_ref: "ghp_secretmaterial" }] });

    assert.equal(invalidTimestamp.status, "invalid");
    assert.ok(invalidTimestamp.reasons.includes("invalid_timestamp"));
    assert.equal(unknownEnum.status, "invalid");
    assert.ok(unknownEnum.reasons.includes("invalid_adoption_outcome"));
    assert.equal(secretLike.status, "invalid");
    assert.ok(secretLike.reasons.includes("secret_material_forbidden"));
    assert.deepEqual(validatePeerReputation(invalidTimestamp), { ok: true, issues: [] });
    assert.deepEqual(validatePeerReputation(unknownEnum), { ok: true, issues: [] });
    assert.deepEqual(validatePeerReputation(secretLike), { ok: true, issues: [] });
  });

  it("rejects tampering of every ready manifest leaf field", () => {
    const result = evaluatePeerReputation(BASE_INPUT);
    const paths = leafPaths(result);

    assert.ok(paths.length > 40, "tamper harness should cover the full manifest");
    for (const path of paths) {
      const tampered = structuredClone(result);
      mutateAt(tampered, path);
      const validation = validatePeerReputation(tampered);
      assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join(".")}`);
    }
  });

  it("rejects structural tampering that is not covered by scalar leaf edits", () => {
    const missingWeight = evaluatePeerReputation(BASE_INPUT);
    delete missingWeight.scoring_inputs.weights.rejected;
    assertIssue(validatePeerReputation(missingWeight), "missing_weight_key");

    const unsortedOutcomes = evaluatePeerReputation(BASE_INPUT);
    unsortedOutcomes.scoring_inputs.outcomes.reverse();
    assertIssue(validatePeerReputation(unsortedOutcomes), "entries_not_sorted");

    const unknownNestedKey = evaluatePeerReputation(BASE_INPUT);
    unknownNestedKey.score.extra = true;
    assertIssue(validatePeerReputation(unknownNestedKey), "unknown_key");

    const expiredReadyTreaty = evaluatePeerReputation(BASE_INPUT);
    expiredReadyTreaty.treaty_ref.expires_at = "2026-01-01T00:00:00Z";
    assertIssue(validatePeerReputation(expiredReadyTreaty), "ready_treaty_expired");
  });

  it("supports the stable T063 aliases", () => {
    const result = runT063PeerReputationScoring(BASE_INPUT);

    assert.deepEqual(result, evaluatePeerReputation(BASE_INPUT));
    assert.deepEqual(validateT063PeerReputationScoring(result), validatePeerReputation(result));
  });
});

function outcome(outcome_id, proposal_ref, adoption_outcome, policy_compliant, risk) {
  return {
    outcome_id,
    proposal_ref,
    source_kind: "cross_repo_pr",
    adoption_outcome,
    policy_compliant,
    risk,
    evidence_digest: `sha-fnv1a-${outcome_id.slice(-8)}`,
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
