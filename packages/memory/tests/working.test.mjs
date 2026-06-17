import assert from "node:assert/strict";
import test from "node:test";
import {
  createWorkingMemoryUpdate,
  validateWorkingMemoryUpdate,
  WORKING_MEMORY_UPDATE_VERSION,
  WORKING_MEMORY_UPDATE_SCHEMA_REF,
} from "../dist/working.js";

const VALID_SHA256 =
  "sha256:a".padEnd(7, "a") + "b".repeat(57);
// Construct a valid 64-hex sha256
const HEX64 = "a1b2c3d4".repeat(8); // 64 chars
const VALID_SHA = `sha256:${HEX64}`;

const BASE_FACT = {
  id: "fact-001",
  text: "ForgeRoot uses git as the source of truth.",
  confidence: 0.99,
  source_ref: "T030:design-doc:00_ForgeRoot_blueprint",
  tags: ["architecture", "git"],
};

const VALID_INPUT = {
  target: {
    repository: "hiroshitanaka-creator/ForgeRoot",
    mind_id: "forge://hiroshitanaka-creator/ForgeRoot/mind/root",
    agent_species: null,
  },
  source: {
    task_id: "T030",
    artifact_sha256: VALID_SHA,
    reason: "Phase 2 memory foundation test update",
  },
  facts: [BASE_FACT],
};

// ── createWorkingMemoryUpdate ────────────────────────────────────────────────

test("create: valid update produces ok result with correct manifest shape", () => {
  const result = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.ok(result.update);
  const u = result.update;
  assert.strictEqual(u.manifest_version, WORKING_MEMORY_UPDATE_VERSION);
  assert.strictEqual(u.schema_ref, WORKING_MEMORY_UPDATE_SCHEMA_REF);
  assert.ok(u.update_id.startsWith("forge-memory-update://"));
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(u.created_at));
  assert.strictEqual(u.target.memory_layer, "working_memory");
  assert.strictEqual(u.source.task_id, "T030");
  assert.strictEqual(u.source.artifact_sha256, VALID_SHA);
  assert.strictEqual(u.facts.length, 1);
  assert.strictEqual(u.approval.update_requires_pr, true);
  assert.strictEqual(u.approval.direct_write_allowed, false);
  assert.strictEqual(u.guards.no_direct_forge_write, true);
  assert.strictEqual(u.guards.no_github_api_call, true);
  assert.strictEqual(u.guards.no_eval_score_update, true);
  assert.strictEqual(u.provenance.generated_by, "forgeroot-memory.working");
  assert.strictEqual(u.provenance.task, "T030");
});

test("create: missing source task_id is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, task_id: "bad-id" },
  };
  const result = createWorkingMemoryUpdate(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("task_id")));
});

test("create: missing artifact_sha256 is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, artifact_sha256: "not-a-hash" },
  };
  const result = createWorkingMemoryUpdate(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("artifact_sha256")));
});

test("create: empty facts array is rejected", () => {
  const bad = { ...VALID_INPUT, facts: [] };
  const result = createWorkingMemoryUpdate(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("facts")));
});

test("create: max_items exceeded is rejected", () => {
  const manyFacts = Array.from({ length: 5 }, (_, i) => ({
    ...BASE_FACT,
    id: `fact-${String(i).padStart(3, "0")}`,
  }));
  const result = createWorkingMemoryUpdate(
    { ...VALID_INPUT, facts: manyFacts },
    { max_items: 3 },
  );
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("max_items_exceeded")));
});

test("create: duplicate facts are deduped deterministically (keep first)", () => {
  const facts = [
    { ...BASE_FACT, id: "fact-001", text: "First occurrence" },
    { ...BASE_FACT, id: "fact-001", text: "Duplicate should be dropped" },
    { ...BASE_FACT, id: "FACT-001", text: "Case-normalized duplicate" },
    { ...BASE_FACT, id: "fact-002", text: "Second unique fact" },
  ];
  const result = createWorkingMemoryUpdate({ ...VALID_INPUT, facts });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.update?.facts.length, 2);
  assert.strictEqual(result.update?.facts[0].text, "First occurrence");
});

test("create: facts are sorted deterministically by id", () => {
  const facts = [
    { ...BASE_FACT, id: "fact-zzz" },
    { ...BASE_FACT, id: "fact-aaa" },
    { ...BASE_FACT, id: "fact-mmm" },
  ];
  const result = createWorkingMemoryUpdate({ ...VALID_INPUT, facts });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const ids = result.update?.facts.map((f) => f.id) ?? [];
  assert.deepEqual(ids, ["fact-aaa", "fact-mmm", "fact-zzz"]);
});

test("create: tags within each fact are sorted and unique", () => {
  const facts = [
    {
      ...BASE_FACT,
      tags: ["zzz", "aaa", "mmm", "aaa"],
    },
  ];
  const result = createWorkingMemoryUpdate({ ...VALID_INPUT, facts });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.deepEqual(result.update?.facts[0].tags, ["aaa", "mmm", "zzz"]);
});

test("create: secret-like key name in input is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    source: { ...VALID_INPUT.source, api_token: "abc123" },
  };
  const result = createWorkingMemoryUpdate(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

test("create: secret-like key TOKEN in nested fact is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    facts: [{ ...BASE_FACT, access_token: "secret" }],
  };
  const result = createWorkingMemoryUpdate(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

test("create: missing target.mind_id is rejected", () => {
  const bad = {
    ...VALID_INPUT,
    target: { ...VALID_INPUT.target, mind_id: "" },
  };
  const result = createWorkingMemoryUpdate(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("mind_id")));
});

test("create: explicit update_id with valid prefix is preserved", () => {
  const customId = "forge-memory-update://test-custom-id-001";
  const result = createWorkingMemoryUpdate({
    ...VALID_INPUT,
    update_id: customId,
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.update?.update_id, customId);
});

test("create: explicit created_at RFC3339 is preserved", () => {
  const ts = "2026-06-17T00:00:00Z";
  const result = createWorkingMemoryUpdate({
    ...VALID_INPUT,
    created_at: ts,
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.update?.created_at, ts);
});

test("create: guards object always has correct fixed values", () => {
  const result = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(result.ok);
  const g = result.update?.guards;
  assert.strictEqual(g?.no_direct_forge_write, true);
  assert.strictEqual(g?.no_runtime_db_authority, true);
  assert.strictEqual(g?.source_refs_required, true);
  assert.strictEqual(g?.deterministic_ordering, true);
  assert.strictEqual(g?.max_items_enforced, true);
  assert.strictEqual(g?.no_eval_score_update, true);
  assert.strictEqual(g?.no_github_api_call, true);
});

// ── validateWorkingMemoryUpdate ──────────────────────────────────────────────

test("validate: valid update passes validation", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const vResult = validateWorkingMemoryUpdate(createResult.update);
  assert.ok(vResult.ok, JSON.stringify(vResult.issues));
});

test("validate: wrong manifest_version fails", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const bad = { ...createResult.update, manifest_version: 2 };
  const vResult = validateWorkingMemoryUpdate(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("manifest_version")));
});

test("validate: wrong schema_ref fails", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const bad = { ...createResult.update, schema_ref: "urn:wrong:schema" };
  const vResult = validateWorkingMemoryUpdate(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("schema_ref")));
});

test("validate: missing source task_id fails", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.update,
    source: { ...createResult.update?.source, task_id: "bad" },
  };
  const vResult = validateWorkingMemoryUpdate(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("task_id")));
});

test("validate: direct_write_allowed:true fails", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.update,
    approval: { ...createResult.update?.approval, direct_write_allowed: true },
  };
  const vResult = validateWorkingMemoryUpdate(bad);
  assert.ok(!vResult.ok);
  assert.ok(
    vResult.issues?.some((i) => i.includes("direct_write_allowed")),
  );
});

test("validate: non-object input fails", () => {
  const vResult = validateWorkingMemoryUpdate("not-an-object");
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("must_be_object")));
});

test("validate: fact with out-of-order ids fails", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const bad = {
    ...createResult.update,
    facts: [
      { ...BASE_FACT, id: "fact-zzz" },
      { ...BASE_FACT, id: "fact-aaa" },
    ],
  };
  const vResult = validateWorkingMemoryUpdate(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("ordering_violation")));
});

test("validate: secret-like key in value fails", () => {
  const createResult = createWorkingMemoryUpdate(VALID_INPUT);
  assert.ok(createResult.ok);
  const bad = { ...createResult.update, my_token: "abc" };
  const vResult = validateWorkingMemoryUpdate(bad);
  assert.ok(!vResult.ok);
  assert.ok(vResult.issues?.some((i) => i.includes("secret")));
});
