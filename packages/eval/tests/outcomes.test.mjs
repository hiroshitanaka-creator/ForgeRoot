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
    assert.equal(manifest.outcome_id, "merge-outcome-8b8775d5");
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
    assert.deepEqual(manifest.review_outcome.reviewer_refs, []);
    assert.deepEqual(manifest.ci_outcome.failed_check_names, []);
    assert.deepEqual(manifest.quarantine.reasons, []);
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_refs"));
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_names"));
    assert.ok(manifest.issues.some((entry) => entry.code === "invalid_reasons"));
    assert.ok(manifest.issues.some((entry) => entry.code === "reasons_required"));
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
    assert.deepEqual(manifest.source.commit_trailers, []);
    assert.equal(manifest.evidence.source_pr_metadata_present, false);
    assert.ok(manifest.issues.some((entry) => entry.path === "source.pr" && entry.code === "required"));
    assert.ok(manifest.issues.some((entry) => entry.path === "source.commit_trailers.0" && entry.code === "must_be_object"));
  });

  it("supports stable aliases", () => {
    for (const fn of [collectPrOutcome, collectPullRequestOutcome]) {
      const manifest = fn(BASE_INPUT);
      assert.equal(manifest.outcome, "merged");
      assert.deepEqual(validateT036MergeOutcomeManifest(manifest), { ok: true, issues: [] });
    }
  });
});
