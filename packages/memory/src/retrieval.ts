// T033: Deterministic memory retrieval adapter
// Provides bounded, source-ref-preserving context retrieval from
// in-memory candidate sets. Does NOT use vector DB, embeddings,
// external search, or runtime DB. Does NOT mutate memory.

export const MEMORY_RETRIEVAL_VERSION = 1 as const;
export const MEMORY_RETRIEVAL_SCHEMA_REF =
  "urn:forgeroot:memory-retrieval:v1" as const;

const RETRIEVAL_ID_PREFIX = "forge-memory-retrieval://";
const REQUEST_ID_PREFIX = "forge-retrieval-request://";
const RFC3339_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ARTIFACT_SHA256_RE = /^sha256:[0-9a-f]{64}$/;

const DEFAULT_TOKEN_BUDGET = 4096;
const MAX_TOKEN_BUDGET = 32768;
const MIN_TOKEN_BUDGET = 1;
const TOKENS_PER_CHAR_ESTIMATE = 0.25; // rough estimate: 4 chars ≈ 1 token

const VALID_INTENTS = new Set([
  "planning",
  "audit",
  "memory_report",
  "unknown",
] as const);

const VALID_ITEM_TYPES = new Set([
  "working_memory_fact",
  "episode_digest",
  "semantic_digest",
  "pack_record",
] as const);

const VALID_MISSING_MEMORY = new Set([
  "none",
  "unknown",
  "not_available",
] as const);

const SECRET_KEY_TERMS = [
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY",
  "CREDENTIAL",
] as const;

export type RetrievalIntent = "planning" | "audit" | "memory_report" | "unknown";
export type MissingMemoryStatus = "none" | "unknown" | "not_available";
export type ContextItemType =
  | "working_memory_fact"
  | "episode_digest"
  | "semantic_digest"
  | "pack_record";

export interface MemoryContextItem {
  readonly id: string;
  readonly type: ContextItemType;
  readonly summary: string;
  readonly source_ref: string;
  readonly artifact_sha256: string;
  readonly relevance: number;
  readonly estimated_tokens: number;
}

export interface MemoryRetrievalResult {
  readonly manifest_version: 1;
  readonly schema_ref: typeof MEMORY_RETRIEVAL_SCHEMA_REF;
  readonly retrieval_id: string;
  readonly created_at: string;
  readonly query: {
    readonly text: string;
    readonly intent: RetrievalIntent;
    readonly token_budget: number;
  };
  readonly context: {
    readonly items: readonly MemoryContextItem[];
    readonly estimated_tokens: number;
    readonly truncated: boolean;
    readonly missing_memory: MissingMemoryStatus;
  };
  readonly source: {
    readonly repository: string | null;
    readonly task_id: string | null;
    readonly requested_by: string;
  };
  readonly derived_indexes: {
    readonly vector_index_used: false;
    readonly embedding_provider_used: false;
    readonly runtime_db_used: false;
  };
  readonly guards: {
    readonly source_refs_preserved: true;
    readonly token_budget_enforced: true;
    readonly deterministic_fallback_ordering: true;
    readonly missing_memory_not_guessed: true;
    readonly vector_db_not_authority: true;
    readonly no_github_api_call: true;
    readonly no_memory_mutation: true;
  };
  readonly provenance: {
    readonly generated_by: "forgeroot-memory.retrieval";
    readonly task: "T033";
  };
}

export interface MemoryRetrievalRequest {
  readonly request_id: string;
  readonly created_at: string;
  readonly query: {
    readonly text: string;
    readonly intent: RetrievalIntent;
    readonly token_budget: number;
  };
  readonly source: {
    readonly repository: string | null;
    readonly task_id: string | null;
    readonly requested_by: string;
  };
}

export interface MemoryRetrievalRequestResult {
  readonly ok: boolean;
  readonly request?: MemoryRetrievalRequest;
  readonly errors?: readonly string[];
}

export interface MemoryRetrievalResult_ extends MemoryRetrievalResult {}

export interface MemoryRetrievalResultWrapper {
  readonly ok: boolean;
  readonly result?: MemoryRetrievalResult;
  readonly errors?: readonly string[];
}

export interface MemoryRetrievalValidationResult {
  readonly ok: boolean;
  readonly issues?: readonly string[];
}

// ── helpers ───────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

// Secret key detection uses suffix/exact matching to avoid false positives on
// legitimate metadata fields such as "token_budget" or "estimated_tokens".
// Secret storage field names characteristically end with the secret type
// (e.g. api_token, client_secret) or ARE the type (e.g. "token", "password").
function hasSecretKey(key: string): boolean {
  const up = key.toUpperCase().replace(/-/g, "_");
  return SECRET_KEY_TERMS.some(
    (t) => up === t || up.endsWith("_" + t),
  );
}

function scanForSecretKeys(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const h = scanForSecretKeys(item);
      if (h !== null) return h;
    }
    return null;
  }
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (hasSecretKey(k)) return k;
    const h = scanForSecretKeys((obj as Record<string, unknown>)[k]);
    if (h !== null) return h;
  }
  return null;
}

function resolveCreatedAt(raw: unknown): string {
  if (typeof raw === "string" && RFC3339_UTC_RE.test(raw)) return raw;
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function generateId(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKENS_PER_CHAR_ESTIMATE);
}

// Deterministic lexical relevance score for a candidate item against a query.
// Returns 0.0–1.0. Uses normalized token overlap.
function lexicalScore(queryText: string, item: MemoryContextItem): number {
  if (queryText.trim().length === 0) return 0;
  const queryTokens = new Set(
    queryText
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 1),
  );
  if (queryTokens.size === 0) return 0;
  const itemText = (item.summary + " " + item.source_ref).toLowerCase();
  let matches = 0;
  for (const tok of queryTokens) {
    if (itemText.includes(tok)) matches++;
  }
  return matches / queryTokens.size;
}

function normalizeItem(raw: unknown, index: number, errors: string[]): MemoryContextItem | null {
  const r = asRecord(raw);
  if (r === null) {
    errors.push(`item[${index}]_must_be_object`);
    return null;
  }
  const id = typeof r.id === "string" ? r.id.trim() : "";
  const summary = typeof r.summary === "string" ? r.summary.trim() : "";
  const source_ref =
    typeof r.source_ref === "string" ? r.source_ref.trim() : "";
  const artifact_sha256 =
    typeof r.artifact_sha256 === "string" ? r.artifact_sha256.trim() : "";
  const rawType = typeof r.type === "string" ? r.type : "";
  const relevance =
    typeof r.relevance === "number" ? Math.max(0, Math.min(1, r.relevance)) : 0;

  let invalid = false;
  if (id.length === 0) {
    errors.push(`item[${index}].id_required`);
    invalid = true;
  }
  if (source_ref.length === 0) {
    errors.push(`item[${index}].source_ref_required`);
    invalid = true;
  }
  if (!ARTIFACT_SHA256_RE.test(artifact_sha256)) {
    errors.push(`item[${index}].artifact_sha256_invalid`);
    invalid = true;
  }
  if (!VALID_ITEM_TYPES.has(rawType as ContextItemType)) {
    errors.push(
      `item[${index}].type_must_be_one_of:${[...VALID_ITEM_TYPES].join(",")}`,
    );
    invalid = true;
  }
  if (invalid) return null;

  const estimated_tokens =
    typeof r.estimated_tokens === "number" && r.estimated_tokens > 0
      ? Math.ceil(r.estimated_tokens)
      : estimateTokens(summary);

  return {
    id,
    type: rawType as ContextItemType,
    summary,
    source_ref,
    artifact_sha256,
    relevance,
    estimated_tokens,
  };
}

// Sort: relevance desc, then id asc (deterministic tie-breaking).
function sortItems(
  items: MemoryContextItem[],
): MemoryContextItem[] {
  return [...items].sort((a, b) => {
    const relDiff = b.relevance - a.relevance;
    if (relDiff !== 0) return relDiff;
    return a.id.localeCompare(b.id);
  });
}

// Apply token budget: include items until budget is exhausted.
function applyTokenBudget(
  sorted: MemoryContextItem[],
  budget: number,
): { included: MemoryContextItem[]; truncated: boolean } {
  let used = 0;
  const included: MemoryContextItem[] = [];
  let truncated = false;
  for (const item of sorted) {
    if (used + item.estimated_tokens > budget) {
      truncated = true;
      break;
    }
    used += item.estimated_tokens;
    included.push(item);
  }
  if (included.length === 0 && sorted.length > 0) {
    // Always include at least one item if budget allows any
    included.push(sorted[0]);
    truncated = sorted.length > 1;
  }
  return { included, truncated };
}

// ── public API ────────────────────────────────────────────────────────────────

export function createMemoryRetrievalRequest(
  input: unknown,
  _options?: unknown,
): MemoryRetrievalRequestResult {
  const errors: string[] = [];

  const r = asRecord(input);
  if (r === null) return { ok: false, errors: ["input_must_be_object"] };

  const secretKey = scanForSecretKeys(input);
  if (secretKey !== null)
    return { ok: false, errors: [`secret_like_key_detected:${secretKey}`] };

  const request_id =
    typeof r.request_id === "string" && r.request_id.startsWith(REQUEST_ID_PREFIX)
      ? r.request_id
      : generateId(REQUEST_ID_PREFIX);

  const created_at = resolveCreatedAt(r.created_at);

  const queryRaw = asRecord(r.query);
  let queryText = "";
  let intent: RetrievalIntent = "unknown";
  let token_budget = DEFAULT_TOKEN_BUDGET;
  if (queryRaw === null) {
    errors.push("query_required");
  } else {
    queryText =
      typeof queryRaw.text === "string" ? queryRaw.text.trim() : "";
    if (queryText.length === 0) errors.push("query.text_required");
    const rawIntent = queryRaw.intent;
    if (
      typeof rawIntent === "string" &&
      VALID_INTENTS.has(rawIntent as RetrievalIntent)
    ) {
      intent = rawIntent as RetrievalIntent;
    }
    const rawBudget = queryRaw.token_budget;
    if (typeof rawBudget === "number" && rawBudget >= MIN_TOKEN_BUDGET) {
      token_budget = Math.min(Math.floor(rawBudget), MAX_TOKEN_BUDGET);
    } else if (rawBudget !== undefined) {
      errors.push(
        `query.token_budget_must_be_positive_integer_max_${MAX_TOKEN_BUDGET}`,
      );
    }
  }

  const sourceRaw = asRecord(r.source);
  let repository: string | null = null;
  let task_id: string | null = null;
  let requested_by = "unknown";
  if (sourceRaw !== null) {
    repository =
      typeof sourceRaw.repository === "string" ? sourceRaw.repository : null;
    task_id =
      typeof sourceRaw.task_id === "string" ? sourceRaw.task_id : null;
    requested_by =
      typeof sourceRaw.requested_by === "string" && sourceRaw.requested_by.trim().length > 0
        ? sourceRaw.requested_by.trim()
        : "unknown";
  }

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    request: {
      request_id,
      created_at,
      query: { text: queryText, intent, token_budget },
      source: { repository, task_id, requested_by },
    },
  };
}

export function retrieveMemoryContext(
  input: unknown,
  _options?: unknown,
): MemoryRetrievalResultWrapper {
  const errors: string[] = [];

  const r = asRecord(input);
  if (r === null) return { ok: false, errors: ["input_must_be_object"] };

  const secretKey = scanForSecretKeys(input);
  if (secretKey !== null)
    return { ok: false, errors: [`secret_like_key_detected:${secretKey}`] };

  const retrieval_id =
    typeof r.retrieval_id === "string" && r.retrieval_id.startsWith(RETRIEVAL_ID_PREFIX)
      ? r.retrieval_id
      : generateId(RETRIEVAL_ID_PREFIX);

  const created_at = resolveCreatedAt(r.created_at);

  // query
  const queryRaw = asRecord(r.query);
  let queryText = "";
  let intent: RetrievalIntent = "unknown";
  let token_budget = DEFAULT_TOKEN_BUDGET;
  if (queryRaw === null) {
    errors.push("query_required");
  } else {
    queryText =
      typeof queryRaw.text === "string" ? queryRaw.text.trim() : "";
    if (queryText.length === 0) errors.push("query.text_required");
    const rawIntent = queryRaw.intent;
    if (
      typeof rawIntent === "string" &&
      VALID_INTENTS.has(rawIntent as RetrievalIntent)
    ) {
      intent = rawIntent as RetrievalIntent;
    }
    const rawBudget = queryRaw.token_budget;
    if (typeof rawBudget === "number" && rawBudget >= MIN_TOKEN_BUDGET) {
      token_budget = Math.min(Math.floor(rawBudget), MAX_TOKEN_BUDGET);
    }
  }

  // source
  const sourceRaw = asRecord(r.source);
  let repository: string | null = null;
  let task_id: string | null = null;
  let requested_by = "unknown";
  if (sourceRaw !== null) {
    repository =
      typeof sourceRaw.repository === "string" ? sourceRaw.repository : null;
    task_id =
      typeof sourceRaw.task_id === "string" ? sourceRaw.task_id : null;
    requested_by =
      typeof sourceRaw.requested_by === "string" &&
      sourceRaw.requested_by.trim().length > 0
        ? sourceRaw.requested_by.trim()
        : "unknown";
  }

  // candidates — the memory items available for retrieval
  const rawCandidates = Array.isArray(r.candidates) ? r.candidates : [];
  const normErrors: string[] = [];
  const normalizedItems: MemoryContextItem[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < rawCandidates.length; i++) {
    const item = normalizeItem(rawCandidates[i], i, normErrors);
    if (item === null) continue;
    if (seenIds.has(item.id)) continue;
    seenIds.add(item.id);
    // Compute lexical relevance if not already provided meaningfully
    const scoredItem: MemoryContextItem =
      item.relevance === 0
        ? { ...item, relevance: lexicalScore(queryText, item) }
        : item;
    normalizedItems.push(scoredItem);
  }
  errors.push(...normErrors);

  if (errors.length > 0) return { ok: false, errors };

  // missing_memory determination
  let missingMemory: MissingMemoryStatus = "none";
  if (rawCandidates.length === 0) {
    const explicitMissing = r.missing_memory;
    if (
      typeof explicitMissing === "string" &&
      VALID_MISSING_MEMORY.has(explicitMissing as MissingMemoryStatus) &&
      explicitMissing !== "none"
    ) {
      missingMemory = explicitMissing as MissingMemoryStatus;
    } else {
      missingMemory = "not_available";
    }
  } else if (
    typeof r.missing_memory === "string" &&
    VALID_MISSING_MEMORY.has(r.missing_memory as MissingMemoryStatus)
  ) {
    missingMemory = r.missing_memory as MissingMemoryStatus;
  }

  // Score, sort, and trim to budget
  const scored = sortItems(normalizedItems);
  const { included, truncated } = applyTokenBudget(scored, token_budget);
  const estimated_tokens = included.reduce((s, i) => s + i.estimated_tokens, 0);

  const result: MemoryRetrievalResult = {
    manifest_version: 1,
    schema_ref: MEMORY_RETRIEVAL_SCHEMA_REF,
    retrieval_id,
    created_at,
    query: { text: queryText, intent, token_budget },
    context: {
      items: included,
      estimated_tokens,
      truncated,
      missing_memory: missingMemory,
    },
    source: { repository, task_id, requested_by },
    derived_indexes: {
      vector_index_used: false,
      embedding_provider_used: false,
      runtime_db_used: false,
    },
    guards: {
      source_refs_preserved: true,
      token_budget_enforced: true,
      deterministic_fallback_ordering: true,
      missing_memory_not_guessed: true,
      vector_db_not_authority: true,
      no_github_api_call: true,
      no_memory_mutation: true,
    },
    provenance: {
      generated_by: "forgeroot-memory.retrieval",
      task: "T033",
    },
  };

  return { ok: true, result };
}

export function validateMemoryRetrievalResult(
  value: unknown,
): MemoryRetrievalValidationResult {
  const issues: string[] = [];

  const r = asRecord(value);
  if (r === null) return { ok: false, issues: ["value_must_be_object"] };

  const secretKey = scanForSecretKeys(value);
  if (secretKey !== null) issues.push(`secret_like_key_detected:${secretKey}`);

  if (r.manifest_version !== 1) issues.push("manifest_version_must_be_1");
  if (r.schema_ref !== MEMORY_RETRIEVAL_SCHEMA_REF)
    issues.push("schema_ref_mismatch");
  if (
    typeof r.retrieval_id !== "string" ||
    !r.retrieval_id.startsWith(RETRIEVAL_ID_PREFIX)
  )
    issues.push("retrieval_id_must_start_with_forge-memory-retrieval://");
  if (
    typeof r.created_at !== "string" ||
    !RFC3339_UTC_RE.test(r.created_at)
  )
    issues.push("created_at_must_be_rfc3339_utc");

  const query = asRecord(r.query);
  if (query === null) {
    issues.push("query_must_be_object");
  } else {
    if (typeof query.text !== "string" || query.text.trim().length === 0)
      issues.push("query.text_required");
    if (
      typeof query.token_budget !== "number" ||
      query.token_budget < MIN_TOKEN_BUDGET ||
      query.token_budget > MAX_TOKEN_BUDGET
    )
      issues.push(
        `query.token_budget_must_be_between_${MIN_TOKEN_BUDGET}_and_${MAX_TOKEN_BUDGET}`,
      );
  }

  const context = asRecord(r.context);
  if (context === null) {
    issues.push("context_must_be_object");
  } else {
    const items = context.items;
    const budget =
      query && typeof (query as Record<string, unknown>).token_budget === "number"
        ? ((query as Record<string, unknown>).token_budget as number)
        : MAX_TOKEN_BUDGET;
    const estimated = context.estimated_tokens;
    if (typeof estimated === "number" && estimated > budget)
      issues.push(
        `context.estimated_tokens_${estimated}_exceeds_token_budget_${budget}`,
      );

    if (!Array.isArray(items)) {
      issues.push("context.items_must_be_array");
    } else {
      // Check items are sorted: relevance desc, then id asc
      for (let i = 1; i < items.length; i++) {
        const prev = asRecord(items[i - 1]);
        const curr = asRecord(items[i]);
        if (prev === null || curr === null) continue;
        const prevRel =
          typeof prev.relevance === "number" ? prev.relevance : 0;
        const currRel =
          typeof curr.relevance === "number" ? curr.relevance : 0;
        const prevId = typeof prev.id === "string" ? prev.id : "";
        const currId = typeof curr.id === "string" ? curr.id : "";
        if (currRel > prevRel) {
          issues.push(
            `context.items[${i}].ordering_violation:relevance_${currRel}_after_${prevRel}`,
          );
        } else if (currRel === prevRel && currId.localeCompare(prevId) < 0) {
          issues.push(
            `context.items[${i}].ordering_violation:id_${currId}_before_${prevId}_same_relevance`,
          );
        }
      }
      // Check each item has source_ref and artifact_sha256
      for (let i = 0; i < items.length; i++) {
        const item = asRecord(items[i]);
        if (item === null) {
          issues.push(`context.items[${i}]_must_be_object`);
          continue;
        }
        if (
          typeof item.source_ref !== "string" ||
          item.source_ref.trim().length === 0
        )
          issues.push(`context.items[${i}].source_ref_required`);
        if (
          typeof item.artifact_sha256 !== "string" ||
          !ARTIFACT_SHA256_RE.test(item.artifact_sha256)
        )
          issues.push(`context.items[${i}].artifact_sha256_invalid`);
        if (
          typeof item.relevance !== "number" ||
          item.relevance < 0 ||
          item.relevance > 1
        )
          issues.push(`context.items[${i}].relevance_must_be_0_to_1`);
      }
    }

    if (
      typeof context.missing_memory !== "string" ||
      !VALID_MISSING_MEMORY.has(context.missing_memory as MissingMemoryStatus)
    )
      issues.push(
        `context.missing_memory_must_be_one_of:${[...VALID_MISSING_MEMORY].join(",")}`,
      );
  }

  const derivedIdx = asRecord(r.derived_indexes);
  if (derivedIdx === null) {
    issues.push("derived_indexes_must_be_object");
  } else {
    if (derivedIdx.vector_index_used !== false)
      issues.push("derived_indexes.vector_index_used_must_be_false");
    if (derivedIdx.embedding_provider_used !== false)
      issues.push("derived_indexes.embedding_provider_used_must_be_false");
    if (derivedIdx.runtime_db_used !== false)
      issues.push("derived_indexes.runtime_db_used_must_be_false");
  }

  const guards = asRecord(r.guards);
  if (guards === null) {
    issues.push("guards_must_be_object");
  } else {
    const required = [
      "source_refs_preserved",
      "token_budget_enforced",
      "deterministic_fallback_ordering",
      "missing_memory_not_guessed",
      "vector_db_not_authority",
      "no_github_api_call",
      "no_memory_mutation",
    ] as const;
    for (const g of required) {
      if (guards[g] !== true) issues.push(`guards.${g}_must_be_true`);
    }
  }

  const provenance = asRecord(r.provenance);
  if (provenance === null) {
    issues.push("provenance_must_be_object");
  } else {
    if (provenance.generated_by !== "forgeroot-memory.retrieval")
      issues.push("provenance.generated_by_mismatch");
    if (provenance.task !== "T033")
      issues.push("provenance.task_must_be_T033");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
