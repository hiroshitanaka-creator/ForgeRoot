import assert from "node:assert/strict";
import test from "node:test";
import {
  createMemoryRetrievalRequest,
  retrieveMemoryContext,
  validateMemoryRetrievalResult,
  MEMORY_RETRIEVAL_VERSION,
  MEMORY_RETRIEVAL_SCHEMA_REF,
} from "../dist/retrieval.js";

const HEX64 = "e1f2a3b4".repeat(8);
const SHA = `sha256:${HEX64}`;
const SHA2 = `sha256:${"f2a3b4c5".repeat(8)}`;
const SHA3 = `sha256:${"a3b4c5d6".repeat(8)}`;

const ITEM_A = {
  id: "item-001",
  type: "episode_digest",
  summary: "ForgeRoot planner accepted T030 working memory manifest task",
  source_ref: "T030:plan-001",
  artifact_sha256: SHA,
  relevance: 0.9,
  estimated_tokens: 20,
};

const ITEM_B = {
  id: "item-002",
  type: "working_memory_fact",
  summary: "Git is the source of truth for ForgeRoot memory",
  source_ref: "T029:memory-model",
  artifact_sha256: SHA2,
  relevance: 0.7,
  estimated_tokens: 15,
};

const ITEM_C = {
  id: "item-003",
  type: "episode_digest",
  summary: "T019 sandbox executor completed successfully",
  source_ref: "T019:audit-003",
  artifact_sha256: SHA3,
  relevance: 0.5,
  estimated_tokens: 12,
};

const VALID_QUERY_INPUT = {
  query: {
    text: "working memory planner task",
    intent: "planning",
    token_budget: 100,
  },
  source: {
    repository: "hiroshitanaka-creator/ForgeRoot",
    task_id: "T033",
    requested_by: "planner.alpha",
  },
  candidates: [ITEM_A, ITEM_B, ITEM_C],
};

// ── createMemoryRetrievalRequest ─────────────────────────────────────────────

test("createRequest: valid input produces request with correct shape", () => {
  const result = createMemoryRetrievalRequest({
    query: { text: "planner context", intent: "planning", token_budget: 512 },
    source: { requested_by: "auditor.alpha" },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const req = result.request;
  assert.ok(req);
  assert.ok(req.request_id.startsWith("forge-retrieval-request://"));
  assert.strictEqual(req.query.text, "planner context");
  assert.strictEqual(req.query.intent, "planning");
  assert.strictEqual(req.query.token_budget, 512);
});

test("createRequest: missing query text is rejected", () => {
  const result = createMemoryRetrievalRequest({
    query: { text: "", intent: "planning", token_budget: 100 },
    source: { requested_by: "x" },
  });
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("text")));
});

test("createRequest: token_budget defaults when omitted", () => {
  const result = createMemoryRetrievalRequest({
    query: { text: "find something", intent: "audit" },
    source: { requested_by: "x" },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.ok(result.request?.query.token_budget > 0);
});

test("createRequest: token_budget capped at MAX_TOKEN_BUDGET", () => {
  const result = createMemoryRetrievalRequest({
    query: { text: "q", intent: "unknown", token_budget: 9_999_999 },
    source: { requested_by: "x" },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.ok(result.request?.query.token_budget <= 32768);
});

test("createRequest: negative token_budget is rejected", () => {
  const result = createMemoryRetrievalRequest({
    query: { text: "q", intent: "unknown", token_budget: -1 },
    source: { requested_by: "x" },
  });
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("token_budget")));
});

test("createRequest: secret-like key is rejected", () => {
  const result = createMemoryRetrievalRequest({
    query: { text: "q", intent: "unknown", token_budget: 100 },
    source: { requested_by: "x", api_token: "secret" },
  });
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

// ── retrieveMemoryContext ────────────────────────────────────────────────────

test("retrieve: valid retrieval produces correct result shape", () => {
  const result = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(result.ok, JSON.stringify(result.errors));
  const r = result.result;
  assert.ok(r);
  assert.strictEqual(r.manifest_version, MEMORY_RETRIEVAL_VERSION);
  assert.strictEqual(r.schema_ref, MEMORY_RETRIEVAL_SCHEMA_REF);
  assert.ok(r.retrieval_id.startsWith("forge-memory-retrieval://"));
  assert.strictEqual(r.derived_indexes.vector_index_used, false);
  assert.strictEqual(r.derived_indexes.embedding_provider_used, false);
  assert.strictEqual(r.derived_indexes.runtime_db_used, false);
  assert.strictEqual(r.guards.source_refs_preserved, true);
  assert.strictEqual(r.guards.token_budget_enforced, true);
  assert.strictEqual(r.guards.missing_memory_not_guessed, true);
  assert.strictEqual(r.guards.vector_db_not_authority, true);
  assert.strictEqual(r.guards.no_memory_mutation, true);
  assert.strictEqual(r.provenance.generated_by, "forgeroot-memory.retrieval");
  assert.strictEqual(r.provenance.task, "T033");
});

test("retrieve: items sorted by relevance desc then id asc", () => {
  const result = retrieveMemoryContext({
    ...VALID_QUERY_INPUT,
    candidates: [ITEM_C, ITEM_A, ITEM_B],
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const items = result.result?.context.items ?? [];
  assert.ok(items.length > 0);
  // First item should have highest relevance
  for (let i = 1; i < items.length; i++) {
    assert.ok(
      items[i].relevance <= items[i - 1].relevance,
      `items[${i}].relevance=${items[i].relevance} should be <= items[${i - 1}].relevance=${items[i - 1].relevance}`,
    );
  }
});

test("retrieve: token budget trims results and sets truncated:true", () => {
  const result = retrieveMemoryContext({
    ...VALID_QUERY_INPUT,
    query: {
      ...VALID_QUERY_INPUT.query,
      token_budget: 22, // only fits item-001 (20 tokens) + partial
    },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const ctx = result.result?.context;
  assert.ok(ctx);
  assert.ok(ctx.estimated_tokens <= 22);
  assert.strictEqual(ctx.truncated, true);
});

test("retrieve: estimated_tokens does not exceed token_budget", () => {
  const result = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(result.ok);
  const ctx = result.result?.context;
  assert.ok(ctx);
  assert.ok(ctx.estimated_tokens <= VALID_QUERY_INPUT.query.token_budget);
});

test("retrieve: empty candidates produces missing_memory not_available", () => {
  const result = retrieveMemoryContext({
    ...VALID_QUERY_INPUT,
    candidates: [],
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(
    result.result?.context.missing_memory,
    "not_available",
  );
  assert.strictEqual(result.result?.context.items.length, 0);
});

test("retrieve: explicit missing_memory unknown is preserved when no candidates", () => {
  const result = retrieveMemoryContext({
    ...VALID_QUERY_INPUT,
    candidates: [],
    missing_memory: "unknown",
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  assert.strictEqual(result.result?.context.missing_memory, "unknown");
});

test("retrieve: missing_memory is none when candidates are present", () => {
  const result = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(result.ok);
  assert.strictEqual(result.result?.context.missing_memory, "none");
});

test("retrieve: all items in result have source_ref and artifact_sha256", () => {
  const result = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(result.ok);
  for (const item of result.result?.context.items ?? []) {
    assert.ok(
      item.source_ref.length > 0,
      `item ${item.id} missing source_ref`,
    );
    assert.ok(
      /^sha256:[0-9a-f]{64}$/.test(item.artifact_sha256),
      `item ${item.id} invalid artifact_sha256`,
    );
  }
});

test("retrieve: item missing source_ref is rejected", () => {
  const bad = {
    ...VALID_QUERY_INPUT,
    candidates: [{ ...ITEM_A, source_ref: "" }],
  };
  const result = retrieveMemoryContext(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("source_ref")));
});

test("retrieve: item with invalid artifact_sha256 is rejected", () => {
  const bad = {
    ...VALID_QUERY_INPUT,
    candidates: [{ ...ITEM_A, artifact_sha256: "not-a-hash" }],
  };
  const result = retrieveMemoryContext(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("artifact_sha256")));
});

test("retrieve: duplicate item ids are deduped", () => {
  const result = retrieveMemoryContext({
    ...VALID_QUERY_INPUT,
    candidates: [ITEM_A, ITEM_A, ITEM_B],
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  const ids = result.result?.context.items.map((i) => i.id) ?? [];
  const uniqueIds = new Set(ids);
  assert.strictEqual(ids.length, uniqueIds.size);
});

test("retrieve: lexical scoring is non-zero for query terms in summary", () => {
  const result = retrieveMemoryContext({
    ...VALID_QUERY_INPUT,
    candidates: [
      { ...ITEM_A, relevance: 0 },
      { ...ITEM_B, relevance: 0 },
      { ...ITEM_C, relevance: 0 },
    ],
    query: {
      ...VALID_QUERY_INPUT.query,
      text: "working memory planner",
    },
  });
  assert.ok(result.ok, JSON.stringify(result.errors));
  // Item A has "working memory" in summary and should rank higher than item C
  const items = result.result?.context.items ?? [];
  const itemAIdx = items.findIndex((i) => i.id === "item-001");
  const itemCIdx = items.findIndex((i) => i.id === "item-003");
  if (itemAIdx !== -1 && itemCIdx !== -1) {
    assert.ok(
      itemAIdx <= itemCIdx,
      "item-001 (working memory planner) should rank >= item-003",
    );
  }
});

test("retrieve: secret-like key in input is rejected", () => {
  const bad = {
    ...VALID_QUERY_INPUT,
    source: { ...VALID_QUERY_INPUT.source, client_secret: "abc" },
  };
  const result = retrieveMemoryContext(bad);
  assert.ok(!result.ok);
  assert.ok(result.errors?.some((e) => e.includes("secret")));
});

// ── validateMemoryRetrievalResult ────────────────────────────────────────────

test("validate: valid retrieval result passes", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const vr = validateMemoryRetrievalResult(rr.result);
  assert.ok(vr.ok, JSON.stringify(vr.issues));
});

test("validate: wrong manifest_version fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const bad = { ...rr.result, manifest_version: 2 };
  const vr = validateMemoryRetrievalResult(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("manifest_version")));
});

test("validate: vector_index_used:true fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const bad = {
    ...rr.result,
    derived_indexes: { ...rr.result?.derived_indexes, vector_index_used: true },
  };
  const vr = validateMemoryRetrievalResult(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("vector_index_used")));
});

test("validate: estimated_tokens exceeding token_budget fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const bad = {
    ...rr.result,
    context: {
      ...rr.result?.context,
      estimated_tokens: 999_999,
    },
  };
  const vr = validateMemoryRetrievalResult(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("estimated_tokens")));
});

test("validate: missing_memory with invalid value fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const bad = {
    ...rr.result,
    context: { ...rr.result?.context, missing_memory: "invented_answer" },
  };
  const vr = validateMemoryRetrievalResult(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("missing_memory")));
});

test("validate: secret-like key in result fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const bad = { ...rr.result, auth_token: "exposed" };
  const vr = validateMemoryRetrievalResult(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("secret")));
});

test("validate: item with source_ref missing in result fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const items = rr.result?.context.items ?? [];
  const bad = {
    ...rr.result,
    context: {
      ...rr.result?.context,
      items: [{ ...items[0], source_ref: "" }, ...items.slice(1)],
    },
  };
  const vr = validateMemoryRetrievalResult(bad);
  assert.ok(!vr.ok);
  assert.ok(vr.issues?.some((i) => i.includes("source_ref")));
});

test("validate: out-of-order items (relevance not descending) fails", () => {
  const rr = retrieveMemoryContext(VALID_QUERY_INPUT);
  assert.ok(rr.ok);
  const items = rr.result?.context.items ?? [];
  if (items.length < 2) return; // skip if only 1 item
  const bad = {
    ...rr.result,
    context: {
      ...rr.result?.context,
      // Swap first two items to break relevance-desc ordering
      items: [items[1], items[0], ...items.slice(2)],
    },
  };
  const vr = validateMemoryRetrievalResult(bad);
  // Only fails if relevance is actually different; if equal, id-ordering matters
  if (items[0].relevance !== items[1].relevance) {
    assert.ok(!vr.ok);
    assert.ok(vr.issues?.some((i) => i.includes("ordering_violation")));
  }
});
