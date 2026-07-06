import {
  HASH_RE, SECRET_FIELD_RE, SECRET_VALUE_RE, isValidRfc3339Utc, stableId, invalid, issue, asRecord,
  stringOr, presentOr, nonEmpty, isManifestUri, isPositiveInt, isNonNegativeInt,
  checkAllowedKeys, validateSectionIsObject, validateNullableNonEmptyString,
} from "./contract.js";

export const MEMORY_CONTEXT_VERSION = 1;
export const MEMORY_CONTEXT_SCHEMA_REF = "urn:forgeroot:memory-context:v1";
const CONTEXT_URI_PREFIX = "forge-memory-context://";
const TOKEN_ESTIMATOR = "char_div_4_ceil";
const TOP_KEYS = new Set(["manifest_version", "schema_ref", "context_id", "created_at", "request", "retrieval_status", "budget", "items", "guards", "provenance"]);
const REQUEST_KEYS = new Set(["query", "token_budget", "token_estimator", "candidate_count"]);
const BUDGET_KEYS = new Set(["token_budget", "used_tokens", "remaining_tokens", "candidate_count", "selected_count", "truncated"]);
const ITEM_KEYS = new Set(["item_id", "kind", "source_ref", "artifact_sha256", "title", "summary", "token_estimate", "relevance_score", "source_uri", "payload_ref"]);
const GUARD_KEYS = [
  "source_refs_required",
  "token_budget_enforced",
  "deterministic_ordering",
  "no_missing_memory_guessing",
  "vector_index_is_derived",
  "no_vector_db_authority",
  "no_memory_mutation",
  "no_direct_forge_write",
  "no_runtime_db_authority",
  "no_github_api_call",
];
const PROVENANCE_KEYS = new Set(["generated_by", "task"]);
const ITEM_KINDS = new Set(["episode_digest", "working_memory_fact", "archive_record", "semantic_digest", "other"]);
const RETRIEVAL_STATUSES = new Set(["ok", "empty", "truncated"]);
const SECRET_FIELD_ALLOWLIST = new Set(["token_budget", "token_estimator", "used_tokens", "remaining_tokens", "token_estimate", "token_budget_enforced"]);

export function retrieveMemoryContext(input, options: any = {}) {
  if (hasRetrievalSecretLike(input)) return invalid(["secret_like_field_or_value"]);
  const r = asRecord(input);
  if (!r) return invalid(["input_must_be_object"]);
  if (declaresVectorAuthority(r)) return invalid(["vector_index_must_be_derived"]);

  const request = asRecord(r.request);
  if (r.request !== undefined && !request) return invalid(["request_must_be_object"]);
  const rawItems = r.items === undefined ? [] : r.items;
  if (!Array.isArray(rawItems)) return invalid(["items_must_be_array"]);

  const createdAt = options.created_at !== undefined ? options.created_at : r.created_at;
  const query = presentOr(r.query, request?.query ?? "");
  const tokenBudget = presentOr(r.token_budget, request?.token_budget ?? 0);
  const normalized = normalizeCandidates(rawItems, query);
  const candidateIssues = validateCandidateItems(normalized);
  if (candidateIssues.length > 0) return { ok: false, issues: candidateIssues };

  const sorted = [...normalized].sort(compareRetrievalItems);
  const selected = selectWithinBudget(sorted, tokenBudget);
  const usedTokens = selected.reduce((sum, item) => sum + item.token_estimate, 0);
  const remainingTokens = isPositiveInt(tokenBudget) ? tokenBudget - usedTokens : 0;
  const truncated = normalized.length > selected.length;
  const context = {
    manifest_version: 1,
    schema_ref: MEMORY_CONTEXT_SCHEMA_REF,
    context_id: presentOr(r.context_id, `${CONTEXT_URI_PREFIX}${stableId([{ query, token_budget: tokenBudget }, selected.map(contextIdentityItem), createdAt])}`),
    created_at: createdAt,
    request: {
      query,
      token_budget: tokenBudget,
      token_estimator: TOKEN_ESTIMATOR,
      candidate_count: normalized.length,
    },
    retrieval_status: normalized.length === 0 ? "empty" : truncated ? "truncated" : "ok",
    budget: {
      token_budget: tokenBudget,
      used_tokens: usedTokens,
      remaining_tokens: remainingTokens,
      candidate_count: normalized.length,
      selected_count: selected.length,
      truncated,
    },
    items: selected,
    guards: Object.fromEntries(GUARD_KEYS.map((key) => [key, true])),
    provenance: { generated_by: "forgeroot-memory.retrieval", task: "T033" },
  };
  const validation = validateMemoryContext(context);
  return validation.ok ? { ok: true, context } : { ok: false, issues: validation.issues };
}

export function validateMemoryContext(value) {
  const issues = [];
  const r = asRecord(value);
  if (!r) return { ok: false, issues: [issue("", "must_be_object")] };
  if (hasRetrievalSecretLike(value)) issues.push(issue("", "secret_like_field_or_value"));
  checkAllowedKeys(r, TOP_KEYS, "", issues);
  validateSectionIsObject(r.request, "request", issues);
  validateSectionIsObject(r.budget, "budget", issues);
  validateSectionIsObject(r.guards, "guards", issues);
  validateSectionIsObject(r.provenance, "provenance", issues);
  checkAllowedKeys(r.request, REQUEST_KEYS, "request", issues);
  checkAllowedKeys(r.budget, BUDGET_KEYS, "budget", issues);
  checkAllowedKeys(r.guards, new Set(GUARD_KEYS), "guards", issues);
  checkAllowedKeys(r.provenance, PROVENANCE_KEYS, "provenance", issues);

  if (r.manifest_version !== 1) issues.push(issue("manifest_version", "must_equal_1"));
  if (r.schema_ref !== MEMORY_CONTEXT_SCHEMA_REF) issues.push(issue("schema_ref", "must_match_schema_ref"));
  if (!isManifestUri(stringOr(r.context_id, ""), CONTEXT_URI_PREFIX)) issues.push(issue("context_id", "must_use_forge_memory_context_uri"));
  if (!isValidRfc3339Utc(r.created_at)) issues.push(issue("created_at", "must_be_rfc3339_utc"));
  if (!nonEmpty(r.request?.query)) issues.push(issue("request.query", "required"));
  if (!isPositiveInt(r.request?.token_budget)) issues.push(issue("request.token_budget", "must_be_positive_integer"));
  if (r.request?.token_estimator !== TOKEN_ESTIMATOR) issues.push(issue("request.token_estimator", "must_equal_char_div_4_ceil"));
  if (!isNonNegativeInt(r.request?.candidate_count)) issues.push(issue("request.candidate_count", "must_be_non_negative_integer"));
  if (!RETRIEVAL_STATUSES.has(stringOr(r.retrieval_status, ""))) issues.push(issue("retrieval_status", "invalid"));

  if (r.budget?.token_budget !== r.request?.token_budget) issues.push(issue("budget.token_budget", "must_match_request"));
  if (!isNonNegativeInt(r.budget?.used_tokens)) issues.push(issue("budget.used_tokens", "must_be_non_negative_integer"));
  if (!isNonNegativeInt(r.budget?.remaining_tokens)) issues.push(issue("budget.remaining_tokens", "must_be_non_negative_integer"));
  if (r.budget?.used_tokens + r.budget?.remaining_tokens !== r.request?.token_budget) issues.push(issue("budget.remaining_tokens", "budget_mismatch"));
  if (r.budget?.candidate_count !== r.request?.candidate_count) issues.push(issue("budget.candidate_count", "must_match_request"));
  if (!isNonNegativeInt(r.budget?.selected_count)) issues.push(issue("budget.selected_count", "must_be_non_negative_integer"));
  if (typeof r.budget?.truncated !== "boolean") issues.push(issue("budget.truncated", "must_be_boolean"));

  const items = Array.isArray(r.items) ? r.items : [];
  if (!Array.isArray(r.items)) issues.push(issue("items", "must_be_array"));
  if (!isRetrievalOrderSorted(items)) issues.push(issue("items", "must_be_sorted_by_relevance_then_id"));
  const seen = new Set();
  items.forEach((item, index) => validateRetrievalItem(item, `items.${index}`, seen, issues));
  const used = items.reduce((sum, item) => sum + (isPositiveInt(item?.token_estimate) ? item.token_estimate : 0), 0);
  if (r.budget?.used_tokens !== used) issues.push(issue("budget.used_tokens", "must_match_item_tokens"));
  if (r.budget?.selected_count !== items.length) issues.push(issue("budget.selected_count", "must_match_item_count"));
  if (r.budget?.candidate_count < items.length) issues.push(issue("budget.candidate_count", "must_cover_selected_items"));
  if (r.retrieval_status === "empty" && (r.budget?.candidate_count !== 0 || items.length !== 0 || r.budget?.truncated !== false)) issues.push(issue("retrieval_status", "empty_requires_no_candidates"));
  if (r.retrieval_status === "truncated" && r.budget?.truncated !== true) issues.push(issue("retrieval_status", "truncated_requires_budget_flag"));
  if (r.retrieval_status === "ok" && (r.budget?.truncated !== false || r.budget?.candidate_count !== items.length)) issues.push(issue("retrieval_status", "ok_requires_all_candidates_selected"));

  GUARD_KEYS.forEach((g) => { if (r.guards?.[g] !== true) issues.push(issue(`guards.${g}`, "must_be_true")); });
  if (!nonEmpty(r.provenance?.generated_by) || !nonEmpty(r.provenance?.task)) issues.push(issue("provenance", "required_generated_by_and_task"));
  return { ok: issues.length === 0, issues };
}

function normalizeCandidates(values, query) {
  const items = [];
  values.forEach((value, index) => {
    for (const candidate of expandCandidate(value, index)) {
      if (declaresVectorAuthority(candidate.raw)) {
        items.push(invalidRetrievalItem(index, "vector_index_authority"));
      } else {
        items.push(scoreCandidate(candidate.item, query));
      }
    }
  });
  return items;
}

function expandCandidate(value, index) {
  const r = asRecord(value);
  if (!r) return [{ raw: value, item: invalidRetrievalItem(index, "non_object") }];
  if (r.schema_ref === "urn:forgeroot:archive-pack:v1" && Array.isArray(r.records)) {
    if (r.records.length === 0) return [{ raw: r, item: invalidRetrievalItem(index, "archive_pack") }];
    return r.records.map((record, recordIndex) => ({ raw: record, item: archiveRecordToItem(record, `${index}-${recordIndex}`) }));
  }
  if (r.schema_ref === "urn:forgeroot:working-memory-update:v1" || r.update_id !== undefined) {
    const facts = Array.isArray(r.facts) ? r.facts : [];
    if (facts.length === 0) return [{ raw: r, item: invalidRetrievalItem(index, "working_memory_update") }];
    return facts.map((fact, factIndex) => ({ raw: fact, item: workingFactToItem(r, fact, `${index}-${factIndex}`) }));
  }
  if (r.schema_ref === "urn:forgeroot:episode-digest:v1" || r.digest_id !== undefined) {
    return [{ raw: r, item: episodeDigestToItem(r, index) }];
  }
  if (r.record_id !== undefined || r.payload !== undefined) {
    return [{ raw: r, item: archiveRecordToItem(r, index) }];
  }
  return [{ raw: r, item: genericToItem(r, index) }];
}

function episodeDigestToItem(digest, index) {
  const id = stringOr(digest.digest_id, "").trim();
  const sourceRef = stringOr(digest.source?.outcome_ref, "").trim() || id;
  const title = stringOr(digest.episode?.title, "").trim();
  const summary = stringOr(digest.episode?.summary, "").trim();
  return baseItem({
    item_id: `episode_digest:${id || index}`,
    kind: "episode_digest",
    source_ref: sourceRef,
    artifact_sha256: stringOr(digest.source?.artifact_sha256, ""),
    title,
    summary,
    source_uri: stringOr(digest.source?.repository, "") || null,
    payload_ref: id || null,
  });
}

function workingFactToItem(update, fact, index) {
  const updateId = stringOr(update.update_id, "").trim();
  const factId = stringOr(fact?.id, "").trim();
  return baseItem({
    item_id: `working_memory_fact:${updateId || "update"}#${factId || index}`,
    kind: "working_memory_fact",
    source_ref: stringOr(fact?.source_ref, "").trim(),
    artifact_sha256: stringOr(update.source?.artifact_sha256, ""),
    title: factId,
    summary: stringOr(fact?.text, "").trim(),
    source_uri: stringOr(update.source?.task_id, "") || null,
    payload_ref: updateId || null,
  });
}

function archiveRecordToItem(record, index) {
  const r = asRecord(record);
  if (!r) return invalidRetrievalItem(index, "archive_record");
  const payload = r.payload;
  const payloadSummary = summarizePayload(payload);
  return baseItem({
    item_id: `archive_record:${stringOr(r.record_id, "").trim() || index}`,
    kind: "archive_record",
    source_ref: stringOr(r.source_ref, "").trim(),
    artifact_sha256: stringOr(r.artifact_sha256, ""),
    title: stringOr(r.record_id, "").trim() || payloadSummary.title,
    summary: payloadSummary.summary,
    source_uri: null,
    payload_ref: stringOr(r.payload_sha256, "") || null,
  });
}

function genericToItem(value, index) {
  const kind = ITEM_KINDS.has(stringOr(value.kind, "")) ? value.kind : value.semantic_id !== undefined ? "semantic_digest" : "other";
  const id = stringOr(value.item_id, "").trim() || stringOr(value.id, "").trim() || stringOr(value.semantic_id, "").trim();
  return baseItem({
    item_id: `${kind}:${id || index}`,
    kind,
    source_ref: stringOr(value.source_ref, "").trim(),
    artifact_sha256: stringOr(value.artifact_sha256, ""),
    title: stringOr(value.title, "").trim() || id,
    summary: stringOr(value.summary, "").trim() || stringOr(value.text, "").trim(),
    source_uri: value.source_uri === undefined ? null : value.source_uri,
    payload_ref: value.payload_ref === undefined ? null : value.payload_ref,
  });
}

function baseItem(value) {
  const summary = clampText(value.summary, 1200);
  const title = clampText(value.title, 160);
  return {
    item_id: value.item_id,
    kind: value.kind,
    source_ref: value.source_ref,
    artifact_sha256: value.artifact_sha256,
    title,
    summary,
    token_estimate: tokenEstimate(`${title}\n${summary}`),
    relevance_score: 0,
    source_uri: value.source_uri,
    payload_ref: value.payload_ref,
  };
}

function scoreCandidate(item, query) {
  return { ...item, relevance_score: relevanceScore(query, item) };
}

function selectWithinBudget(items, tokenBudget) {
  if (!isPositiveInt(tokenBudget)) return [];
  const selected = [];
  let used = 0;
  for (const item of items) {
    if (used + item.token_estimate <= tokenBudget) {
      selected.push(item);
      used += item.token_estimate;
    }
  }
  return selected;
}

function validateCandidateItems(items) {
  const issues = [];
  const seen = new Set();
  items.forEach((item, index) => validateRetrievalItem(item, `candidates.${index}`, seen, issues));
  return issues;
}

function validateRetrievalItem(value, path, seen, issues) {
  const r = asRecord(value);
  if (!r) {
    issues.push(issue(path, "must_be_object"));
    return;
  }
  checkAllowedKeys(r, ITEM_KEYS, path, issues);
  if (!nonEmpty(r.item_id)) issues.push(issue(`${path}.item_id`, "required"));
  if (seen.has(r.item_id)) issues.push(issue(`${path}.item_id`, "duplicate"));
  seen.add(r.item_id);
  if (!ITEM_KINDS.has(stringOr(r.kind, ""))) issues.push(issue(`${path}.kind`, "invalid"));
  if (!nonEmpty(r.source_ref)) issues.push(issue(`${path}.source_ref`, "required"));
  if (!HASH_RE.test(stringOr(r.artifact_sha256, ""))) issues.push(issue(`${path}.artifact_sha256`, "must_be_sha256"));
  if (!nonEmpty(r.title)) issues.push(issue(`${path}.title`, "required"));
  if (!nonEmpty(r.summary)) issues.push(issue(`${path}.summary`, "required"));
  if (!isPositiveInt(r.token_estimate)) issues.push(issue(`${path}.token_estimate`, "must_be_positive_integer"));
  if (!Number.isFinite(r.relevance_score) || r.relevance_score < 0 || r.relevance_score > 1) issues.push(issue(`${path}.relevance_score`, "must_be_0_to_1"));
  validateNullableNonEmptyString(r.source_uri, `${path}.source_uri`, issues);
  validateNullableNonEmptyString(r.payload_ref, `${path}.payload_ref`, issues);
}

function invalidRetrievalItem(index, label) {
  return baseItem({
    item_id: `invalid:${label}:${index}`,
    kind: "other",
    source_ref: "",
    artifact_sha256: "",
    title: label,
    summary: label,
    source_uri: null,
    payload_ref: null,
  });
}

function compareRetrievalItems(a, b) {
  if (a.relevance_score !== b.relevance_score) return b.relevance_score - a.relevance_score;
  return a.item_id < b.item_id ? -1 : a.item_id > b.item_id ? 1 : 0;
}

function isRetrievalOrderSorted(items) {
  return items.every((item, index) => index === 0 || compareRetrievalItems(items[index - 1], item) <= 0);
}

function relevanceScore(query, item) {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return 0;
  const itemTerms = new Set(tokenize(`${item.title} ${item.summary} ${item.source_ref} ${item.payload_ref ?? ""}`));
  let matches = 0;
  for (const term of queryTerms) {
    if (itemTerms.has(term)) matches += 1;
  }
  const coverage = matches / queryTerms.size;
  const density = matches / Math.max(itemTerms.size, 1);
  return Math.min(1, Number((coverage * 0.85 + density * 0.15).toFixed(6)));
}

function tokenize(value) {
  const matches = stringOr(value, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  return [...new Set(matches.filter((term) => term.length > 1))].sort();
}

function tokenEstimate(value) {
  return Math.max(1, Math.ceil(stringOr(value, "").length / 4));
}

function summarizePayload(payload) {
  const r = asRecord(payload);
  if (r?.episode) return { title: stringOr(r.episode.title, "").trim(), summary: stringOr(r.episode.summary, "").trim() };
  if (Array.isArray(r?.facts)) return { title: stringOr(r.update_id, "").trim() || "working memory update", summary: r.facts.map((fact) => stringOr(fact?.text, "").trim()).filter(Boolean).join("\n") };
  if (r) {
    return {
      title: stringOr(r.title, "").trim() || stringOr(r.id, "").trim() || "archive payload",
      summary: stringOr(r.summary, "").trim() || stringOr(r.text, "").trim() || canonicalJson(r),
    };
  }
  return { title: "archive payload", summary: stringOr(payload, "").trim() };
}

function contextIdentityItem(item) {
  return {
    item_id: item.item_id,
    source_ref: item.source_ref,
    artifact_sha256: item.artifact_sha256,
    token_estimate: item.token_estimate,
    relevance_score: item.relevance_score,
  };
}

function declaresVectorAuthority(value) {
  const r = asRecord(value);
  if (!r) return false;
  return r.vector_index_authority === true ||
    r.vector_db_authority === true ||
    r.authority === "vector_index" ||
    r.source_of_truth === "vector_index" ||
    r.source_kind === "vector_index";
}

function hasRetrievalSecretLike(value) {
  if (Array.isArray(value)) return value.some(hasRetrievalSecretLike);
  if (value && typeof value === "object") {
    return Object.entries(value).some(([key, nested]) => (!SECRET_FIELD_ALLOWLIST.has(key) && SECRET_FIELD_RE.test(key)) || hasRetrievalSecretLike(nested));
  }
  return typeof value === "string" && SECRET_VALUE_RE.test(value);
}

function clampText(value, max) {
  const s = stringOr(value, "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}
