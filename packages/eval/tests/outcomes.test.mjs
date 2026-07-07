import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MERGE_OUTCOME_CONTRACT,
  collectMergeOutcome,
  collectPrOutcome,
  collectPullRequestOutcome,
  validateMergeOutcomeManifest,
  validateT036MergeOutcomeManifest,
} from "../dist/index.js";

const NOW = "2026-07-06T00:00:00Z";
const SHA = "abe8707391adc2b649702ba3d8d17ecc3cf9179f";
const MERGE_SHA = "28137e0a11111111111111111111111111111111";
const REVERT_SHA = "b1234567890abcdef1234567890abcdef1234567";

const BASE_PR = {
  repository: "hiroshitanaka-creator/ForgeRoot",
  number: 24,
  url: "https://github.com/hiroshitanaka-creator/ForgeRoot/pull/24",
  head_ref: "codex/t034-eval-suite-dsl",
  base_ref: "main",
  head_sha: SHA,
  state: "closed",
  merged: true,
  merged_at: "2026-07-06T01:45:00Z",
  merge_commit_sha: MERGE_SHA,
  closed_at: "2026-07-06T01:45:00Z",
};

const SOURCE = {
  task_id: "T036",
  pr: BASE_PR,
  commit_trailers: [
    { key: "Task", value: "T036", source_commit_sha: SHA },
    { key: "Source-PR", value: "24", source_commit_sha: SHA },
  ],
};

const BASE_INPUT = {
  now: NOW,
  source: SOURCE,
  review: {
    outcome: "approved",
    reviewed_commit_sha: SHA,
    reviewer_refs: ["github://maintainer"],
    decided_at: "2026-07-06T01:40:00Z",
  },
  ci: {
    outcome: "passed",
    required_check_count: 3,
    passed_check_count: 3,
    failed_check_names: [],
    decided_at: "2026-07-06T01:43:54Z",
  },
};

describe("T036 merge outcome collector", () => {
  it("declares a deterministic manifest-only contract", () => {
    assert.equal(MERGE_OUTCOME_CONTRACT.deterministic, true);
    assert.equal(MERGE_OUTCOME_CONTRACT.manifestOnly, true);
    assert.ok(MERGE_OUTCOME_CONTRACT.consumes.includes("source_pr_metadata"));
    assert.ok(MERGE_OUTCOME_CONTRACT.validates.includes("commit_trailer_refs"));
    assert.ok(MERGE_OUTCOME_CONTRACT.distinguishes.includes("reverted"));
    assert.ok(MERGE_OUTCOME_CONTRACT.forbids.includes("github_api_polling"));
    assert.ok(MERGE_OUTCOME_CONTRACT.forbids.includes("outcome_guessing"));
  });

  it("collects a merged outcome from explicit merge metadata", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);

    assert.equal(manifest.status, "ready", JSON.stringify(manifest, null, 2));
    assert.equal(manifest.outcome, "merged");
    assert.equal(manifest.outcome_id, "merge-outcome-47750bbc");
    assert.ok(manifest.evidence.outcome_evidence.includes(`source.pr.merge_commit_sha:${MERGE_SHA}`));
    assert.equal(manifest.guards.no_github_api_call, true);
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("collects a rejected outcome only when review rejection evidence is explicit", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, merged: false, merged_at: null, merge_commit_sha: null } },
      review: { ...BASE_INPUT.review, outcome: "changes_requested" },
      ci: { ...BASE_INPUT.ci, outcome: "failed", passed_check_count: 1, failed_check_names: ["Node package tests"] },
    });

    assert.equal(manifest.status, "ready");
    assert.equal(manifest.outcome, "rejected");
    assert.ok(manifest.evidence.outcome_evidence.includes("review.outcome:changes_requested"));
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("collects stale only from explicit stale evidence instead of guessing from open state", () => {
    const openInput = {
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, state: "open", merged: false, merged_at: null, merge_commit_sha: null, closed_at: null } },
      review: { ...BASE_INPUT.review, outcome: "unknown" },
      ci: { ...BASE_INPUT.ci, outcome: "pending", passed_check_count: 0, failed_check_names: [] },
    };
    const unknown = collectMergeOutcome(openInput);
    assert.equal(unknown.status, "unknown");
    assert.equal(unknown.outcome, "unknown");
    assert.equal(unknown.evidence.missing_outcome_evidence, true);

    const stale = collectMergeOutcome({ ...openInput, stale: { stale: true, stale_as_of: "2026-07-06T02:00:00Z", reason: "superseded_by_newer_branch" } });
    assert.equal(stale.status, "ready");
    assert.equal(stale.outcome, "stale");
    assert.ok(stale.evidence.outcome_evidence.includes("stale.reason:superseded_by_newer_branch"));
    assert.deepEqual(validateMergeOutcomeManifest(stale), { ok: true, issues: [] });
  });

  it("collects reverted outcome with explicit revert linkage", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      revert: {
        reverted_by_pr: { ...BASE_PR, number: 26, url: "https://github.com/hiroshitanaka-creator/ForgeRoot/pull/26", head_ref: "revert/t034", head_sha: REVERT_SHA, merged: true, merge_commit_sha: REVERT_SHA },
        revert_commit_sha: REVERT_SHA,
        reverted_at: "2026-07-06T03:00:00Z",
        reason: "regression_reverted_by_followup_pr",
      },
    });

    assert.equal(manifest.status, "ready");
    assert.equal(manifest.outcome, "reverted");
    assert.equal(manifest.revert_linkage.revert_commit_sha, REVERT_SHA);
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("quarantine evidence takes precedence over merge metadata", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      quarantine: {
        quarantined: true,
        reasons: ["critical_risk"],
        policy_ref: ".forge/policies/security-gates.forge",
        decided_at: "2026-07-06T01:30:00Z",
      },
    });

    assert.equal(manifest.status, "ready");
    assert.equal(manifest.outcome, "quarantined");
    assert.ok(manifest.evidence.outcome_evidence.includes("quarantine.reason:critical_risk"));
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("rejects missing source refs and commit trailer refs", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, task_id: "", commit_trailers: [] },
    });

    assert.equal(manifest.status, "invalid");
    assert.equal(manifest.outcome, "unknown");
    assert.equal(manifest.evidence.task_ref_present, false);
    assert.equal(manifest.evidence.commit_trailer_refs_present, false);
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_task_id"));
    assert.ok(manifest.issues.some((entry) => entry.code === "commit_trailers_required"));
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("returns invalid manifest instead of throwing on malformed optional evidence arrays", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      review: { ...BASE_INPUT.review, reviewer_refs: "github://maintainer" },
      ci: { ...BASE_INPUT.ci, failed_check_names: "Node package tests" },
      quarantine: { quarantined: true, reasons: "critical_risk" },
    });

    assert.equal(manifest.status, "invalid");
    assert.equal(manifest.outcome, "unknown");
    assert.deepEqual(manifest.review_outcome.reviewer_refs, [""]);
    assert.deepEqual(manifest.ci_outcome.failed_check_names, [""]);
    assert.deepEqual(manifest.quarantine.reasons, [""]);
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_refs"));
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_names"));
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_reasons"));
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("returns invalid manifest instead of throwing on malformed optional evidence objects", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      review: null,
      ci: "passed",
      revert: "revert-link",
      quarantine: 1,
      stale: false,
    });

    assert.equal(manifest.status, "invalid");
    assert.equal(manifest.outcome, "unknown");
    assert.ok(manifest.issues.some((entry) => entry.path === "review" && entry.code === "must_be_object"));
    assert.ok(manifest.issues.some((entry) => entry.path === "ci" && entry.code === "must_be_object"));
    assert.ok(manifest.issues.some((entry) => entry.path === "revert" && entry.code === "must_be_object"));
    assert.ok(manifest.issues.some((entry) => entry.path === "quarantine" && entry.code === "must_be_object"));
    assert.ok(manifest.issues.some((entry) => entry.path === "stale" && entry.code === "must_be_object"));
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("normalizes malformed source references in invalid manifests", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      source: { task_id: "T036", pr: "https://github.com/hiroshitanaka-creator/ForgeRoot/pull/24", commit_trailers: ["Task: T036"] },
    });

    assert.equal(manifest.status, "invalid");
    assert.equal(manifest.outcome, "unknown");
    assert.deepEqual(manifest.source.pr, {
      repository: "",
      number: 0,
      url: null,
      head_ref: "",
      base_ref: "",
      head_sha: "",
      state: "open",
      merged: false,
      merged_at: null,
      merge_commit_sha: null,
      closed_at: null,
    });
    assert.deepEqual(manifest.source.commit_trailers, [{ key: "", value: "" }]);
    assert.equal(manifest.evidence.source_pr_metadata_present, false);
    assert.equal(manifest.evidence.commit_trailer_refs_present, true);
    assert.ok(manifest.issues.some((entry) => entry.path === "source.pr" && entry.code === "required"));
    assert.ok(manifest.issues.some((entry) => entry.path === "source.commit_trailers.0" && entry.code === "must_be_object"));
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("supports stable aliases", () => {
    for (const fn of [collectPrOutcome, collectPullRequestOutcome]) {
      const manifest = fn(BASE_INPUT);
      assert.equal(manifest.outcome, "merged");
      assert.deepEqual(validateT036MergeOutcomeManifest(manifest), { ok: true, issues: [] });
    }
  });
});

describe("T036 review hardening (PR #26 findings sweep)", () => {
  const OPEN_PR = { ...BASE_PR, state: "open", merged: false, merged_at: null, merge_commit_sha: null, closed_at: null };

  it("rejects revert linkage without completed revert evidence", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      revert: {
        reverted_by_pr: { ...OPEN_PR, number: 26, url: "https://github.com/hiroshitanaka-creator/ForgeRoot/pull/26", head_ref: "revert/t034", head_sha: REVERT_SHA },
        revert_commit_sha: null,
        reverted_at: null,
        reason: "revert_proposed",
      },
    });
    assert.equal(manifest.status, "invalid");
    assert.notEqual(manifest.outcome, "reverted");
    assert.ok(manifest.issues.some((entry) => entry.code === "revert_evidence_incomplete"));
  });

  it("rejects impossible merged metadata combinations", () => {
    const openButMerged = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, state: "open", closed_at: null } },
    });
    assert.equal(openButMerged.status, "invalid");
    assert.ok(openButMerged.issues.some((entry) => entry.code === "merged_state_mismatch"));

    const mergedWithoutSha = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, merge_commit_sha: null } },
    });
    assert.equal(mergedWithoutSha.status, "invalid");
    assert.ok(mergedWithoutSha.issues.some((entry) => entry.code === "merged_requires_merge_commit"));

    const unmergedWithSha = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, merged: false, merged_at: null } },
    });
    assert.equal(unmergedWithSha.status, "invalid");
    assert.ok(unmergedWithSha.issues.some((entry) => entry.code === "unmerged_merge_commit"));
  });

  it("derives distinct outcome ids for distinct outcomes of the same PR", () => {
    const openInput = { ...BASE_INPUT, source: { ...SOURCE, pr: OPEN_PR } };
    const unknown = collectMergeOutcome({ ...openInput, review: { outcome: "unknown" }, ci: undefined });
    const stale = collectMergeOutcome({ ...openInput, review: { outcome: "unknown" }, ci: undefined, stale: { stale: true, stale_as_of: "2026-07-06T02:00:00Z", reason: "superseded" } });
    const quarantined = collectMergeOutcome({ ...openInput, review: { outcome: "unknown" }, ci: undefined, quarantine: { quarantined: true, reasons: ["critical_risk"] } });
    assert.equal(unknown.outcome, "unknown");
    assert.equal(stale.outcome, "stale");
    assert.equal(quarantined.outcome, "quarantined");
    assert.notEqual(unknown.outcome_id, stale.outcome_id);
    assert.notEqual(unknown.outcome_id, quarantined.outcome_id);
    assert.notEqual(stale.outcome_id, quarantined.outcome_id);
  });

  it("rejects commit trailers that reference another task or PR", () => {
    const wrongTask = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, commit_trailers: [{ key: "Task", value: "T999", source_commit_sha: SHA }] },
    });
    assert.equal(wrongTask.status, "invalid");
    assert.ok(wrongTask.issues.some((entry) => entry.code === "trailer_task_mismatch"));

    const unrelated = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, commit_trailers: [{ key: "Reviewed-By", value: "someone", source_commit_sha: SHA }] },
    });
    assert.equal(unrelated.status, "invalid");
    assert.ok(unrelated.issues.some((entry) => entry.code === "commit_trailers_unrelated"));

    const wrongPr = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, commit_trailers: [{ key: "Task", value: "T036" }, { key: "Source-PR", value: "999" }] },
    });
    assert.equal(wrongPr.status, "invalid");
    assert.ok(wrongPr.issues.some((entry) => entry.code === "trailer_pr_mismatch"));
  });

  it("does not use stale review evidence as rejection proof", () => {
    const staleReviewSha = "1111111111111111111111111111111111111111";
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, merged: false, merged_at: null, merge_commit_sha: null } },
      review: { outcome: "changes_requested", reviewed_commit_sha: staleReviewSha },
      ci: undefined,
    });
    assert.equal(manifest.status, "invalid");
    assert.notEqual(manifest.outcome, "rejected");
    assert.ok(manifest.issues.some((entry) => entry.code === "review_head_mismatch"));

    const missingSha = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, merged: false, merged_at: null, merge_commit_sha: null } },
      review: { outcome: "changes_requested" },
      ci: undefined,
    });
    assert.equal(missingSha.status, "unknown");
    assert.equal(missingSha.outcome, "unknown");
  });

  it("rejects PR URLs that do not match the repository and number", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, url: "https://github.com/evil/repo/pull/999" } },
    });
    assert.equal(manifest.status, "invalid");
    assert.ok(manifest.issues.some((entry) => entry.code === "url_reference_mismatch"));
  });

  it("rejects internally contradictory CI evidence", () => {
    const passedWithGap = collectMergeOutcome({
      ...BASE_INPUT,
      ci: { outcome: "passed", required_check_count: 3, passed_check_count: 1, failed_check_names: [] },
    });
    assert.equal(passedWithGap.status, "invalid");
    assert.ok(passedWithGap.issues.some((entry) => entry.code === "passed_count_mismatch"));

    const failedWithoutNames = collectMergeOutcome({
      ...BASE_INPUT,
      ci: { outcome: "failed", required_check_count: 3, passed_check_count: 3, failed_check_names: [] },
    });
    assert.equal(failedWithoutNames.status, "invalid");
    assert.ok(failedWithoutNames.issues.some((entry) => entry.code === "failed_requires_names"));

    const failedWithOmittedNames = collectMergeOutcome({
      ...BASE_INPUT,
      ci: { outcome: "failed", required_check_count: 3, passed_check_count: 2 },
    });
    assert.equal(failedWithOmittedNames.status, "invalid");
    assert.ok(failedWithOmittedNames.issues.some((entry) => entry.code === "failed_requires_names"));
    assert.deepEqual(validateMergeOutcomeManifest(failedWithOmittedNames), { ok: true, issues: [] });
  });

  it("rejects tampered ready manifests on read-back", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    assert.equal(manifest.status, "ready");

    const blankedTask = structuredClone(manifest);
    blankedTask.source.task_id = "";
    assert.equal(validateMergeOutcomeManifest(blankedTask).ok, false);

    const flippedGate = structuredClone(manifest);
    flippedGate.guards.no_github_api_call = false;
    assert.equal(validateMergeOutcomeManifest(flippedGate).ok, false);

    const swappedOutcome = structuredClone(manifest);
    swappedOutcome.outcome = "rejected";
    assert.equal(validateMergeOutcomeManifest(swappedOutcome).ok, false);

    const emptyIssues = structuredClone(manifest);
    emptyIssues.issues = [];
    const emptyIssuesResult = validateMergeOutcomeManifest(emptyIssues);
    assert.equal(emptyIssuesResult.ok, false);
    assert.ok(emptyIssuesResult.issues.some((entry) => entry.code === "non_invalid_carries_issues"));

    const invalidRecastReady = collectMergeOutcome({ ...BASE_INPUT, source: { ...SOURCE, task_id: "" } });
    assert.equal(invalidRecastReady.status, "invalid");
    const recast = structuredClone(invalidRecastReady);
    recast.status = "ready";
    recast.outcome = "merged";
    delete recast.issues;
    assert.equal(validateMergeOutcomeManifest(recast).ok, false);

    const invalidRecast = collectMergeOutcome(BASE_INPUT);
    invalidRecast.status = "invalid";
    invalidRecast.outcome = "unknown";
    invalidRecast.reasons = ["invalid_merge_outcome_input", "arbitrary_issue"];
    invalidRecast.evidence.outcome_evidence = [];
    invalidRecast.evidence.missing_outcome_evidence = true;
    invalidRecast.issues = [{ path: "source.task_id", code: "arbitrary_issue", message: "forged invalid state" }];
    const invalidRecastResult = validateMergeOutcomeManifest(invalidRecast);
    assert.equal(invalidRecastResult.ok, false);
    assert.ok(invalidRecastResult.issues.some((entry) => entry.code === "issues_mismatch"));

    const invalidReasonsMismatch = collectMergeOutcome({
      ...BASE_INPUT,
      ci: { outcome: "failed", required_check_count: 1, passed_check_count: 0 },
    });
    invalidReasonsMismatch.reasons = ["invalid_merge_outcome_input", "arbitrary_issue"];
    const invalidReasonsMismatchResult = validateMergeOutcomeManifest(invalidReasonsMismatch);
    assert.equal(invalidReasonsMismatchResult.ok, false);
    assert.ok(invalidReasonsMismatchResult.issues.some((entry) => entry.code === "reasons_mismatch"));

    const invalidWithEvidence = collectMergeOutcome({
      ...BASE_INPUT,
      ci: { outcome: "failed", required_check_count: 1, passed_check_count: 0 },
    });
    invalidWithEvidence.evidence.outcome_evidence = ["source.pr.merged:true"];
    const invalidWithEvidenceResult = validateMergeOutcomeManifest(invalidWithEvidence);
    assert.equal(invalidWithEvidenceResult.ok, false);
    assert.ok(invalidWithEvidenceResult.issues.some((entry) => entry.code === "invalid_carries_outcome_evidence"));
  });

  it("fails closed instead of throwing on malformed manifests", () => {
    for (const malformed of [null, undefined, "manifest", 1, [], {}]) {
      const result = validateMergeOutcomeManifest(malformed);
      assert.equal(result.ok, false);
      assert.ok(result.issues.length > 0);
    }
    const manifest = collectMergeOutcome(BASE_INPUT);
    for (const section of ["source", "review_outcome", "ci_outcome", "revert_linkage", "quarantine", "stale", "evidence", "guards"]) {
      const broken = structuredClone(manifest);
      broken[section] = null;
      const result = validateMergeOutcomeManifest(broken);
      assert.equal(result.ok, false, `null ${section} must fail closed`);
    }
    const malformedReasons = structuredClone(manifest);
    malformedReasons.quarantine.reasons = null;
    const malformedReasonsResult = validateMergeOutcomeManifest(malformedReasons);
    assert.equal(malformedReasonsResult.ok, false);
    assert.ok(malformedReasonsResult.issues.some((entry) => entry.path === "quarantine.reasons" && entry.code === "must_be_array"));
  });

  it("rejects unknown top-level and nested manifest keys explicitly", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    const topLevel = structuredClone(manifest);
    topLevel.extra_claim = true;
    assert.ok(validateMergeOutcomeManifest(topLevel).issues.some((entry) => entry.path === "manifest.extra_claim" && entry.code === "unknown_key"));

    const nested = structuredClone(manifest);
    nested.source.pr.extra_claim = true;
    assert.ok(validateMergeOutcomeManifest(nested).issues.some((entry) => entry.path === "source.pr.extra_claim" && entry.code === "unknown_key"));

    const evidence = structuredClone(manifest);
    evidence.evidence.extra_claim = true;
    assert.ok(validateMergeOutcomeManifest(evidence).issues.some((entry) => entry.path === "evidence.extra_claim" && entry.code === "unknown_key"));
  });

  it("fails closed on malformed nested arrays instead of throwing (round 2)", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    for (const [section, field] of [["quarantine", "reasons"], ["review_outcome", "reviewer_refs"], ["ci_outcome", "failed_check_names"], ["source", "commit_trailers"], ["evidence", "outcome_evidence"]]) {
      for (const bad of [null, "not-an-array", 1]) {
        const broken = structuredClone(manifest);
        broken[section][field] = bad;
        const result = validateMergeOutcomeManifest(broken);
        assert.equal(result.ok, false, `${section}.${field}=${JSON.stringify(bad)} must fail closed`);
        assert.ok(result.issues.length > 0);
      }
    }
  });

  it("rejects unknown manifest keys explicitly, not only via stale ids", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    const injected = structuredClone(manifest);
    injected.extra_claim = "looks-official";
    const result = validateMergeOutcomeManifest(injected);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.code === "unknown_key"), "unknown top-level key must be rejected by an explicit unknown_key issue");

    const nested = structuredClone(manifest);
    nested.source.pr.extra = true;
    const nestedResult = validateMergeOutcomeManifest(nested);
    assert.equal(nestedResult.ok, false);
    assert.ok(nestedResult.issues.some((entry) => entry.code === "unknown_key"), "unknown nested key must be rejected by an explicit unknown_key issue");
  });

  it("rejects failed CI outcomes when failed_check_names is omitted", () => {
    const manifest = collectMergeOutcome({
      ...BASE_INPUT,
      ci: { outcome: "failed", required_check_count: 3, passed_check_count: 1 },
    });
    assert.equal(manifest.status, "invalid");
    assert.ok(manifest.issues.some((entry) => entry.code === "failed_requires_names"));
  });

  it("keeps validator symmetry for every collector output, including invalid envelopes", () => {
    const malformedInputs = [
      { ...BASE_INPUT, source: { ...SOURCE, commit_trailers: ["Task: T036"] } },
      { ...BASE_INPUT, source: { ...SOURCE, task_id: "" } },
      { ...BASE_INPUT, review: { ...BASE_INPUT.review, reviewer_refs: "github://maintainer" } },
      { ...BASE_INPUT, now: "2026-99-99T99:99:99Z" },
      { ...BASE_INPUT, ci: { outcome: "failed", required_check_count: 3, passed_check_count: 1 } },
      BASE_INPUT,
    ];
    for (const input of malformedInputs) {
      const manifest = collectMergeOutcome(input);
      const result = validateMergeOutcomeManifest(manifest);
      assert.deepEqual(result, { ok: true, issues: [] }, `validate(collect(x)) must be ok for status=${manifest.status}`);
    }
  });

  it("preserves normalized invalid evidence for read-back comparison", () => {
    const manifest = collectMergeOutcome({ ...BASE_INPUT, source: { ...SOURCE, task_id: "" } });
    assert.equal(manifest.status, "invalid");
    assert.equal(manifest.source.task_id, "");
    assert.equal(manifest.source.pr.repository, BASE_PR.repository);
    assert.equal(manifest.source.commit_trailers.length, SOURCE.commit_trailers.length);
    assert.equal(manifest.evidence.source_pr_metadata_present, true);
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });
  });

  it("rejects ready manifests recast as invalid with forged issues", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    assert.equal(manifest.status, "ready");
    const recast = structuredClone(manifest);
    recast.status = "invalid";
    recast.outcome = "unknown";
    recast.issues = [{ path: "now", code: "invalid_timestamp", message: "forged" }];
    recast.reasons = ["invalid_merge_outcome_input", "invalid_timestamp"];
    const result = validateMergeOutcomeManifest(recast);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.code === "invalid_carries_outcome_evidence"), "recast invalid manifest carrying ready evidence must be rejected");
  });

  it("rejects malformed invalid issue fields before deriving reasons", () => {
    const manifest = collectMergeOutcome({ ...BASE_INPUT, source: { ...SOURCE, task_id: "" } });
    assert.equal(manifest.status, "invalid");
    const malformed = structuredClone(manifest);
    malformed.issues[0].code = null;
    const result = validateMergeOutcomeManifest(malformed);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.path === "issues.0.code" && entry.code === "must_be_string"));
  });

  it("rejects invalid manifests whose recorded issues do not match recomputed input errors", () => {
    const manifest = collectMergeOutcome({ ...BASE_INPUT, source: { ...SOURCE, task_id: "" } });
    assert.equal(manifest.status, "invalid");
    const forged = structuredClone(manifest);
    forged.issues = [{ path: "ci.failed_check_names", code: "failed_requires_names", message: "forged issue" }];
    forged.reasons = ["invalid_merge_outcome_input", "failed_requires_names"];
    const result = validateMergeOutcomeManifest(forged);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((entry) => entry.code === "issues_mismatch"));
  });

  it("rejects syntactically valid but impossible timestamps", () => {
    const impossibleNow = collectMergeOutcome({ ...BASE_INPUT, now: "2026-99-99T99:99:99Z" });
    assert.equal(impossibleNow.status, "invalid");
    assert.ok(impossibleNow.issues.some((entry) => entry.path === "now" && entry.code === "invalid_timestamp"));

    const impossibleMergedAt = collectMergeOutcome({
      ...BASE_INPUT,
      source: { ...SOURCE, pr: { ...BASE_PR, merged_at: "2026-02-30T00:00:00Z" } },
    });
    assert.equal(impossibleMergedAt.status, "invalid");
    assert.ok(impossibleMergedAt.issues.some((entry) => entry.code === "invalid_timestamp"));
  });
});
