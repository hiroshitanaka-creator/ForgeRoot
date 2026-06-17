import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryArchivePack,
  validateMemoryArchivePack,
  verifyMemoryArchivePack,
  MEMORY_ARCHIVE_PACK_VERSION,
  MEMORY_ARCHIVE_PACK_SCHEMA_REF,
} from "../dist/packer.js";

const HEX64 = "d1e2f3a4".repeat(8);
const SHA = `sha256:${HEX64}`;
const SHA2 = `sha256:${"b2c3d4e5".repeat(8)}`;
const SHA3 = `sha256:${"c3d4e5f6".repeat(8)}`;

const RECORD_A = {
  record_id: "ep-001",
  record_type: "episode_digest",
  source_ref: "T031:audit-001",
  artifact_sha256: SHA,
};

const RECORD_B = {
  record_id: "ep-002",
  record_type: "episode_digest",
  source_ref: "T031:audit-002",
  artifact_sha256: SHA2,
};

const RECORD_C = {
  record_id: "wm-001",
  record_type: "working_memory_update",
  source_ref: "T030:plan-001",
  artifact_sha256: SHA3,
};

const VALID_INPUT = {
  source: {
    repository: "hiroshitanaka-creator/ForgeRoot",
    task_id: "T032",
    source_artifacts: [SHA],
  },
  records: [RECORD_A, RECORD_B],
};

// ── createMemoryArchivePack ──────────────────────────────────────────────────

test("create: valid pack produces correct manifest shape", () => {
  const result = createMemoryArchivePack(VALID_INPUT);
  assert.ok(result.ok, JSON.stringify(result.errors));
  const p = result.pack;
  assert.ok(p);
  assert.strictEqual(p.manifest_version, MEMORY_ARCHIVE_PACK_VERSION);
  assert.strictEqual(p.schema_ref, MEMORY_ARCHIVE_PACK_SCHEMA_REF);
  assert.ok(p.pack_id.startsWith("forge-memory-pack://"));
  assert.strictEqual(p.pack.format, "jsonl.zst");
  assert.strictEqual(p.pack.compression, "zstd");
  assert.strictEqual(p.pack.compression_performed, false);
  assert.strictEqual(p.pack.compressed_sha256, null);
  assert.strictEqual(p.pack.record_count, 2);
  assert.ok(p.pack.raw_jsonl_sha256.startsWith("sha256:"));
  assert.strictEqual(p.pack.deterministic_ordering, true);
  assert.strictEqual(p.guards.no_destructive_delete, true);
  assert.strictEqual(p.guards.no_github_api_call, true);
  assert.strictEqual(p.guards.no_eval_score_update, true);
  assert.strictEqual(p.guards.no_federation, true);
  assert.strictEqual(p.provenance.generated_by, "forgeroot-memory.packer");
  assert.strictEqual(p.provenance.task, "T032");
});

test("create: records are sorted by record_id regardless of input order", () => {
  const reversed = { ...VALID_INPUT, records: [RECORD_B, RECORD_A] };
  const result = createMemoryArchivePack(reversed);
  assert.ok(result.ok, JSON.stringify(result.errors));
  const ids = result.pack?.records.map((r) => r.record_id);
  assert.deepEqual(ids, ["ep-001", "ep-002"]);
});

test("create: same records different order produces same raw_jsonl_sha256", () => {
  const fwd = createMemoryArchivePack(VALID_INPUT);
  const rev = createMemoryArchivePack({
    ...VALID_INPUT,
    records: [RECORD_B, RECORD_A],
  });
  assert.ok(fwd.ok && rev.ok);
  assert.strictEqual(
    fwd.pack?.pack.raw_jsonl_sha256,
    rev.pack?.pack.raw_jsonl_sha256,
  );
});

test("create: different content produces different raw_jsonl_sha256", () => {
  const r1 = createMemoryArchivePack(VALID_INPUT);
  const r2 = createMemoryArchivePack({
    ...VALID_INPUT,
    records: [RECORD_A, RECORD_C],
  });
  assert.ok(r1.ok && r2.ok);
  assert.notEqual(
    r1.pack?.pack.raw_jsonl_sha256,
    r2.pack?.pack.raw_jsonl_sha256,
  );
});

test("create: duplicate record_ids are deduped deterministically", () => {
  const result = createMemoryArchivePack({
    ...VALID_INPUT,
    records: [RECORD_A, RECORD_A, RECORD_B],
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.pack?.records.length, 2);
  assert.strictEqual(result.pack?.pack.record_count, 2);
});

test("create: missing source artifacts is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, source_artifacts: [] },
  };
  const result = createMemoryArchivePack(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("source_artifacts")));
});

test("create: invalid source artifact hash is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, source_artifacts: ["not-a-hash"] },
  };
  const result = createMemoryArchivePack(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("source_artifacts")));
});

test("create: empty records array is rejected", () => {
  const bad = { ...VALID_INPUT, records: [] };
  const result = createMemoryArchivePack(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("records")));
});

test("create: missing source.task_id is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, task_id: "not-starting-with-T" },
  };
  const result = createMemoryArchivePack(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("task_id")));
});

test("create: secret-like key in input is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, api_token: "abc" },
  };
  const result = createMemoryArchivePack(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

test("create: destructive delete key in input is rejected", () => {
  const bad = { ...VALID_INPUT, delete_after_pack: true };
  const result = createMemoryArchivePack(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("destructive")));
});

test("create: pack kind inferred as episode_digest when all records are episode_digest", () => {
  const result = createMemoryArchivePack(VALID_INPUT);
  assert.ok(result.ok);
  assert.strictEqual(result.pack?.pack.kind, "episode_digest");
});

test("create: pack kind inferred as mixed for mixed record types", () => {
  const result = createMemoryArchivePack({
    ...VALID_INPUT,
    records: [RECORD_A, RECORD_C],
  });
  assert.ok(result.ok);
  assert.strictEqual(result.pack?.pack.kind, "mixed");
});

test("create: pack kind inferred as working_memory for working_memory_update records", () => {
  const result = createMemoryArchivePack({
    ...VALID_INPUT,
    records: [RECORD_C],
  });
  assert.ok(result.ok);
  assert.strictEqual(result.pack?.pack.kind, "working_memory");
});

// ── validateMemoryArchivePack ────────────────────────────────────────────────

test("validate: valid pack passes validation", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const vr = validateMemoryArchivePack(cr.pack);
  assert.ok(vr.ok, JSON.stringify(vr.issues));
});

test("validate: wrong manifest_version fails", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const bad = { ...cr.pack, manifest_version: 2 };
  const vr = validateMemoryArchivePack(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("manifest_version")));
});

test("validate: record_count mismatch fails", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const bad = {
    ...cr.pack,
    pack: { ...cr.pack?.pack, record_count: 99 },
  };
  const vr = validateMemoryArchivePack(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("record_count_mismatch")));
});

test("validate: invalid raw_jsonl_sha256 fails", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const bad = {
    ...cr.pack,
    pack: { ...cr.pack?.pack, raw_jsonl_sha256: "not-a-hash" },
  };
  const vr = validateMemoryArchivePack(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("raw_jsonl_sha256")));
});

test("validate: out-of-order records fail", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const bad = {
    ...cr.pack,
    records: [RECORD_B, RECORD_A].map((r) => ({
      ...r,
      raw_sha256: SHA,
    })),
  };
  const vr = validateMemoryArchivePack(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("ordering_violation")));
});

test("validate: secret-like key fails", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const bad = { ...cr.pack, api_credential: "exposed" };
  const vr = validateMemoryArchivePack(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("secret")));
});

// ── verifyMemoryArchivePack ──────────────────────────────────────────────────

test("verify: pack matches its original records", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const vr = verifyMemoryArchivePack(cr.pack, [RECORD_A, RECORD_B]);
  assert.ok(vr.ok, JSON.stringify(vr.issues));
  assert.strictEqual(vr.verified_count, 2);
});

test("verify: records in different order still match", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const vr = verifyMemoryArchivePack(cr.pack, [RECORD_B, RECORD_A]);
  assert.ok(vr.ok, JSON.stringify(vr.issues));
});

test("verify: tampered artifact_sha256 fails", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  const tampered = [
    { ...RECORD_A, artifact_sha256: SHA2 },
    RECORD_B,
  ];
  const vr = verifyMemoryArchivePack(cr.pack, tampered);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("sha256_mismatch")));
});

test("verify: missing record in supplied list fails", () => {
  const cr = createMemoryArchivePack(VALID_INPUT);
  assert.ok(cr.ok);
  // Supply only one record when pack has two
  const vr = verifyMemoryArchivePack(cr.pack, [RECORD_A]);
  assert.ok(!vr.ok);
  assert.ok(
    vr.issues?.some(
      (i) => i.includes("record_count_mismatch") || i.includes("not_in_pack"),
    ),
  );
});

test("verify: invalid pack manifest causes failure before record check", () => {
  const vr = verifyMemoryArchivePack({ manifest_version: 99 }, [RECORD_A]);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("pack_manifest_invalid")));
});
