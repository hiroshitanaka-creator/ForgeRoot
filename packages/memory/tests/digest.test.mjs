import assert from "node:assert/strict";
import test from "node:test";
import {
  createEpisodeDigest,
  validateEpisodeDigest,
  EPISODE_DIGEST_VERSION,
  EPISODE_DIGEST_SCHEMA_REF,
} from "../dist/digest.js";

const HEX64 = "c3d4e5f6".repeat(8); // 64 chars
const VALID_SHA = `sha256:${HEX64}`;

const VALID_ACCEPTED_INPUT = {
  episode: {
    type: "accepted",
    title: "T030 working memory update manifest implemented",
    summary:
      "Implemented deterministic working memory update manifest for T030. " +
      "Source refs required. No direct .forge write. No GitHub API calls.",
    reliability: "high",
  },
  source: {
    repository: "hiroshitanaka-creator/ForgeRoot",
    task_id: "T030",
    artifact_sha256: VALID_SHA,
  },
};

const VALID_REJECTED_INPUT = {
  episode: {
    type: "rejected",
    title: "T999 rejected: scope exceeded max_items",
    summary: "Rejected because proposed update exceeded the max_items limit.",
    reliability: "high",
  },
  source: {
    repository: "hiroshitanaka-creator/ForgeRoot",
    task_id: "T999",
    artifact_sha256: VALID_SHA,
  },
};

const VALID_BLOCKED_INPUT = {
  episode: {
    type: "blocked",
    title: "T888 blocked: restricted key name detected in source input",
    summary:
      "Blocked because input contained a field with a protected name " +
      "matching the guard rules defined in T031 digest specification.",
    reliability: "high",
  },
  source: {
    task_id: "T888",
    artifact_sha256: VALID_SHA,
    repository: null,
  },
};

// ── createEpisodeDigest ──────────────────────────────────────────────────────

test("create: valid accepted digest produces ok result with correct shape", () => {
  const result = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(result.ok, JSON.stringify(result.errors));
  const d = result.digest;
  assert.ok(d);
  assert.strictEqual(d.manifest_version, EPISODE_DIGEST_VERSION);
  assert.strictEqual(d.schema_ref, EPISODE_DIGEST_SCHEMA_REF);
  assert.ok(d.digest_id.startsWith("forge-episode-digest://"));
  assert.strictEqual(d.episode.type, "accepted");
  assert.strictEqual(d.episode.reliability, "high");
  assert.strictEqual(d.source.task_id, "T030");
  assert.strictEqual(d.source.artifact_sha256, VALID_SHA);
  assert.strictEqual(d.retention.preserve_rejected, true);
  assert.strictEqual(d.retention.preserve_blocked, true);
  assert.strictEqual(d.guards.no_eval_score_update, true);
  assert.strictEqual(d.guards.no_github_api_call, true);
  assert.strictEqual(d.guards.no_missing_source_guessing, true);
  assert.strictEqual(d.provenance.generated_by, "forgeroot-memory.digest");
  assert.strictEqual(d.provenance.task, "T031");
});

test("create: valid rejected digest is accepted as first-class memory event", () => {
  const result = createEpisodeDigest(VALID_REJECTED_INPUT);
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.digest?.episode.type, "rejected");
});

test("create: valid blocked digest is accepted as first-class memory event", () => {
  const result = createEpisodeDigest(VALID_BLOCKED_INPUT);
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.digest?.episode.type, "blocked");
});

test("create: quarantined, failed, reverted episode types are valid", () => {
  for (const type of ["quarantined", "failed", "reverted"]) {
    const result = createEpisodeDigest({
      ...VALID_ACCEPTED_INPUT,
      episode: { ...VALID_ACCEPTED_INPUT.episode, type, reliability: "low" },
    });
    assert.ok(result.ok, `type=${type} failed: ${JSON.stringify(result.errors)}`);
    assert.strictEqual(result.digest?.episode.type, type);
  }
});

test("create: missing artifact_sha256 is rejected", () => {
  const bad = {
    ...VALID_ACCEPTED_INPUT,
    source: { ...VALID_ACCEPTED_INPUT.source, artifact_sha256: "bad-hash" },
  };
  const result = createEpisodeDigest(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("artifact_sha256")));
});

test("create: missing task_id is rejected", () => {
  const bad = {
    ...VALID_ACCEPTED_INPUT,
    source: { ...VALID_ACCEPTED_INPUT.source, task_id: "no-t-prefix" },
  };
  const result = createEpisodeDigest(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("task_id")));
});

test("create: episode type unknown requires reliability unknown", () => {
  const badReliability = {
    ...VALID_ACCEPTED_INPUT,
    episode: {
      ...VALID_ACCEPTED_INPUT.episode,
      type: "unknown",
      reliability: "high",
    },
  };
  const result = createEpisodeDigest(badReliability);
  assert.ok(!result.ok);
  assert.ok(
    result.errors?.some((e) => e.includes("unknown_requires_reliability_unknown")),
  );
});

test("create: unknown type with unknown reliability is valid", () => {
  const result = createEpisodeDigest({
    ...VALID_ACCEPTED_INPUT,
    episode: {
      ...VALID_ACCEPTED_INPUT.episode,
      type: "unknown",
      reliability: "unknown",
    },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.digest?.episode.type, "unknown");
  assert.strictEqual(result.digest?.episode.reliability, "unknown");
});

test("create: summary exceeding 1200 chars is rejected", () => {
  const longSummary = "x".repeat(1201);
  const bad = {
    ...VALID_ACCEPTED_INPUT,
    episode: { ...VALID_ACCEPTED_INPUT.episode, summary: longSummary },
  };
  const result = createEpisodeDigest(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("summary_exceeds_max_length")));
});

test("create: summary at exactly 1200 chars is accepted", () => {
  const maxSummary = "x".repeat(1200);
  const result = createEpisodeDigest({
    ...VALID_ACCEPTED_INPUT,
    episode: { ...VALID_ACCEPTED_INPUT.episode, summary: maxSummary },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
});

test("create: title exceeding 160 chars is rejected", () => {
  const longTitle = "T".repeat(161);
  const bad = {
    ...VALID_ACCEPTED_INPUT,
    episode: { ...VALID_ACCEPTED_INPUT.episode, title: longTitle },
  };
  const result = createEpisodeDigest(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("title_exceeds_max_length")));
});

test("create: related IDs in links are sorted and deduplicated", () => {
  const result = createEpisodeDigest({
    ...VALID_ACCEPTED_INPUT,
    links: {
      related_plan_ids: ["plan-zzz", "plan-aaa", "plan-mmm", "plan-aaa"],
      related_audit_ids: ["audit-b", "audit-a"],
      related_pr_numbers: [99, 1, 50, 1],
    },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.deepEqual(result.digest?.links.related_plan_ids, [
    "plan-aaa",
    "plan-mmm",
    "plan-zzz",
  ]);
  assert.deepEqual(result.digest?.links.related_audit_ids, [
    "audit-a",
    "audit-b",
  ]);
  assert.deepEqual(result.digest?.links.related_pr_numbers, [1, 50, 99]);
});

test("create: secret-like key in input is rejected", () => {
  const bad = {
    ...VALID_ACCEPTED_INPUT,
    source: { ...VALID_ACCEPTED_INPUT.source, api_token: "supersecret" },
  };
  const result = createEpisodeDigest(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

test("create: secret-like value in input is rejected", () => {
  const bad = {
    ...VALID_ACCEPTED_INPUT,
    episode: {
      ...VALID_ACCEPTED_INPUT.episode,
      summary: "contains PASSWORD in the text",
    },
  };
  const result = createEpisodeDigest(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

test("create: non-object input fails", () => {
  const result = createEpisodeDigest(null);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("must_be_object")));
});

// ── validateEpisodeDigest ────────────────────────────────────────────────────

test("validate: valid accepted digest passes", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const vResult = validateEpisodeDigest(createResult.digest);
  assert.ok(vResult.ok, JSON.stringify(vResult.issues));
});

test("validate: valid rejected digest passes", () => {
  const createResult = createEpisodeDigest(VALID_REJECTED_INPUT);
  assert.ok(createResult.ok);
  const vResult = validateEpisodeDigest(createResult.digest);
  assert.ok(vResult.ok, JSON.stringify(vResult.issues));
});

test("validate: valid blocked digest passes", () => {
  const createResult = createEpisodeDigest(VALID_BLOCKED_INPUT);
  assert.ok(createResult.ok);
  const vResult = validateEpisodeDigest(createResult.digest);
  assert.ok(vResult.ok, JSON.stringify(vResult.issues));
});

test("validate: wrong manifest_version fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const bad = { ...createResult.digest, manifest_version: 2 };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("manifest_version")));
});

test("validate: missing artifact_sha256 fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.digest,
    source: { ...createResult.digest?.source, artifact_sha256: "bad" },
  };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("artifact_sha256")));
});

test("validate: preserve_rejected:false fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.digest,
    retention: { ...createResult.digest?.retention, preserve_rejected: false },
  };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(
    vResult.issues?.some((i) => i.includes("preserve_rejected")),
  );
});

test("validate: unsorted related_plan_ids fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.digest,
    links: {
      ...createResult.digest?.links,
      related_plan_ids: ["plan-zzz", "plan-aaa"],
    },
  };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("related_plan_ids_not_sorted")));
});

test("validate: type unknown with non-unknown reliability fails", () => {
  const createResult = createEpisodeDigest({
    ...VALID_ACCEPTED_INPUT,
    episode: {
      ...VALID_ACCEPTED_INPUT.episode,
      type: "unknown",
      reliability: "unknown",
    },
  });
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.digest,
    episode: { ...createResult.digest?.episode, reliability: "high" },
  };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(
    vResult.issues?.some((i) => i.includes("unknown_requires_reliability_unknown")),
  );
});

test("validate: secret-like key in digest object fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const bad = { ...createResult.digest, auth_credential: "exposed" };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("secret")));
});

test("validate: missing links object fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const { links: _links, ...withoutLinks } = createResult.digest ?? {};
  const vResult = validateEpisodeDigest(withoutLinks);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("links_must_be_object")));
});

test("validate: duplicate related_plan_ids fails", () => {
  const createResult = createEpisodeDigest(VALID_ACCEPTED_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.digest,
    links: {
      ...createResult.digest?.links,
      related_plan_ids: ["plan-aaa", "plan-aaa"],
    },
  };
  const vResult = validateEpisodeDigest(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("related_plan_ids_duplicate")));
});
