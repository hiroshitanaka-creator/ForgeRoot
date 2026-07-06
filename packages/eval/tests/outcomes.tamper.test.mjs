import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { collectMergeOutcome, validateMergeOutcomeManifest } from "../dist/index.js";

const NOW = "2026-07-06T00:00:00Z";
const SHA = "abe8707391adc2b649702ba3d8d17ecc3cf9179f";
const MERGE_SHA = "28137e0a11111111111111111111111111111111";

const BASE_INPUT = {
  now: NOW,
  source: {
    task_id: "T036",
    pr: {
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
    },
    commit_trailers: [
      { key: "Task", value: "T036", source_commit_sha: SHA },
      { key: "Source-PR", value: "24", source_commit_sha: SHA },
    ],
  },
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

function leafPaths(value, prefix = []) {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => leafPaths(entry, [...prefix, index]));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([key, entry]) => leafPaths(entry, [...prefix, key]));
  }
  return [prefix];
}

function withTamper(manifest, path, tamperValue) {
  const clone = structuredClone(manifest);
  let cursor = clone;
  for (const key of path.slice(0, -1)) cursor = cursor[key];
  cursor[path.at(-1)] = tamperValue;
  return clone;
}

function tamperValuesFor(original) {
  const values = [];
  if (typeof original === "string") values.push("__tampered__", null);
  else if (typeof original === "number") values.push(original + 1, null);
  else if (typeof original === "boolean") values.push(!original, null);
  else if (original === null) values.push("__tampered__");
  else values.push(null);
  return values.filter((value) => !Object.is(value, original));
}

describe("T036 tamper harness", () => {
  it("rejects every single-field mutation of an accepted manifest on read-back", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    assert.equal(manifest.status, "ready");
    assert.equal(manifest.outcome, "merged");
    assert.deepEqual(validateMergeOutcomeManifest(manifest), { ok: true, issues: [] });

    let mutationCount = 0;
    for (const path of leafPaths(manifest)) {
      if (path[0] === "outcome_id") continue; // covered by dedicated mutation below
      const original = path.reduce((value, key) => value[key], manifest);
      for (const tampered of tamperValuesFor(original)) {
        const result = validateMergeOutcomeManifest(withTamper(manifest, path, tampered));
        assert.equal(result.ok, false, `tampering ${path.join(".")} -> ${JSON.stringify(tampered)} must fail validation`);
        mutationCount += 1;
      }
    }
    assert.ok(mutationCount >= 40, `expected broad mutation coverage, got ${mutationCount}`);

    const forgedId = withTamper(manifest, ["outcome_id"], "merge-outcome-00000000");
    assert.equal(validateMergeOutcomeManifest(forgedId).ok, false, "forged outcome_id must fail validation");
  });

  it("rejects unknown-key injection into an accepted manifest", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    const injected = structuredClone(manifest);
    injected.extra_claim = "looks-official";
    assert.equal(validateMergeOutcomeManifest(injected).ok, false);

    const nestedInjection = structuredClone(manifest);
    nestedInjection.source.pr.extra = true;
    assert.equal(validateMergeOutcomeManifest(nestedInjection).ok, false);
  });

  it("rejects element-level tampering of evidence arrays", () => {
    const manifest = collectMergeOutcome(BASE_INPUT);
    const swapped = structuredClone(manifest);
    swapped.evidence.outcome_evidence = [...swapped.evidence.outcome_evidence].reverse();
    if (manifest.evidence.outcome_evidence.length > 1) {
      assert.equal(validateMergeOutcomeManifest(swapped).ok, false, "reordering outcome evidence must fail validation");
    }

    const dropped = structuredClone(manifest);
    dropped.evidence.outcome_evidence = dropped.evidence.outcome_evidence.slice(1);
    assert.equal(validateMergeOutcomeManifest(dropped).ok, false, "dropping outcome evidence must fail validation");
  });
});
