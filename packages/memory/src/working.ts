import {
  HASH_RE, hasSecretLike, isValidRfc3339Utc, stableId, invalid, issue, asRecord,
  stringOr, presentOr, nullableOr, canonicalStringArray, numberOr, nonEmpty, positiveNumber,
  isNonNegativeInt, normalizeId, uniqueSorted, isSorted, ordinalCompareByField,
  isManifestUri, checkAllowedKeys, validateNullableNonEmptyString, validateOptionalPrNumber,
} from "./contract.js";

export const WORKING_MEMORY_UPDATE_VERSION = 1;
export const WORKING_MEMORY_UPDATE_SCHEMA_REF = "urn:forgeroot:working-memory-update:v1";
const UPDATE_URI_PREFIX = "forge-memory-update://";
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const TOP_KEYS = new Set(["manifest_version", "schema_ref", "update_id", "created_at", "max_items", "target", "source", "facts", "retention", "approval", "guards", "provenance"]);
const TARGET_KEYS = new Set(["repository", "mind_id", "agent_species", "memory_layer"]);
const SOURCE_KEYS = new Set(["task_id", "plan_id", "audit_id", "pr_number", "artifact_sha256", "reason"]);
const FACT_KEYS = new Set(["id", "text", "confidence", "source_ref", "tags"]);
const RETENTION_KEYS = new Set(["ttl_days", "keep_last_accepted", "keep_last_rejected"]);
const APPROVAL_KEYS = new Set(["approval_class", "update_requires_pr", "direct_write_allowed"]);
const GUARD_KEYS = ["no_direct_forge_write", "no_runtime_db_authority", "source_refs_required", "deterministic_ordering", "max_items_enforced", "no_eval_score_update", "no_github_api_call"];
const PROVENANCE_KEYS = new Set(["generated_by", "task"]);

export function createWorkingMemoryUpdate(input, options: any = {}) {
  const issues = [];
  if (hasSecretLike(input)) return invalid(["secret_like_field_or_value"]);
  const r = asRecord(input);
  if (!r) return invalid(["input_must_be_object"]);
  // Caller-supplied values are preserved as-is when present so that invalid
  // input fails validation instead of being silently rewritten to a default.
  const maxItems = options.max_items !== undefined ? options.max_items : r.max_items !== undefined ? r.max_items : 50;
  // created_at has no wall-clock default: the T030 contract requires the same
  // input to produce the same manifest, so the caller must supply it.
  const createdAt = options.created_at !== undefined ? options.created_at : r.created_at;
  const facts = dedupeFacts(Array.isArray(r.facts) ? r.facts : []);
  if (typeof maxItems === "number" && facts.length > maxItems) issues.push("facts_exceed_max_items");
  const source = {
    task_id: stringOr(r.source?.task_id, ""),
    plan_id: nullableOr(r.source?.plan_id),
    audit_id: nullableOr(r.source?.audit_id),
    pr_number: nullableOr(r.source?.pr_number),
    artifact_sha256: stringOr(r.source?.artifact_sha256, ""),
    reason: stringOr(r.source?.reason, ""),
  };
  const target = {
    repository: nullableOr(r.target?.repository),
    mind_id: presentOr(r.target?.mind_id, "forge://hiroshitanaka-creator/ForgeRoot/mind/root"),
    agent_species: nullableOr(r.target?.agent_species),
    memory_layer: "working_memory",
  };
  const update = {
    manifest_version: 1,
    schema_ref: WORKING_MEMORY_UPDATE_SCHEMA_REF,
    update_id: presentOr(r.update_id, `${UPDATE_URI_PREFIX}${stableId([target, source, facts, createdAt])}`),
    created_at: createdAt,
    max_items: maxItems,
    target,
    source,
    facts,
    retention: {
      ttl_days: r.retention?.ttl_days === undefined ? 30 : r.retention.ttl_days,
      keep_last_accepted: r.retention?.keep_last_accepted === undefined ? 10 : r.retention.keep_last_accepted,
      keep_last_rejected: r.retention?.keep_last_rejected === undefined ? 10 : r.retention.keep_last_rejected,
    },
    approval: { approval_class: presentOr(r.approval?.approval_class, "B"), update_requires_pr: true, direct_write_allowed: false },
    guards: { no_direct_forge_write: true, no_runtime_db_authority: true, source_refs_required: true, deterministic_ordering: true, max_items_enforced: true, no_eval_score_update: true, no_github_api_call: true },
    provenance: { generated_by: "forgeroot-memory.working", task: "T030" },
  };
  const validation = validateWorkingMemoryUpdate(update, { max_items: typeof maxItems === "number" ? maxItems : undefined });
  return validation.ok && issues.length === 0 ? { ok: true, update } : invalid([...issues, ...validation.issues.map((i) => i.code)]);
}

export function validateWorkingMemoryUpdate(value, options: any = {}) {
  const issues = [];
  const r = asRecord(value);
  if (!r) return { ok: false, issues: [{ path: "", code: "must_be_object" }] };
  if (hasSecretLike(value)) issues.push(issue("", "secret_like_field_or_value"));
  checkAllowedKeys(r, TOP_KEYS, "", issues);
  checkAllowedKeys(r.target, TARGET_KEYS, "target", issues);
  checkAllowedKeys(r.source, SOURCE_KEYS, "source", issues);
  checkAllowedKeys(r.retention, RETENTION_KEYS, "retention", issues);
  checkAllowedKeys(r.approval, APPROVAL_KEYS, "approval", issues);
  checkAllowedKeys(r.guards, new Set(GUARD_KEYS), "guards", issues);
  checkAllowedKeys(r.provenance, PROVENANCE_KEYS, "provenance", issues);
  if (r.manifest_version !== 1) issues.push(issue("manifest_version", "must_equal_1"));
  if (r.schema_ref !== WORKING_MEMORY_UPDATE_SCHEMA_REF) issues.push(issue("schema_ref", "must_match_schema_ref"));
  if (!isManifestUri(stringOr(r.update_id, ""), UPDATE_URI_PREFIX)) issues.push(issue("update_id", "must_use_forge_memory_update_uri"));
  if (!isValidRfc3339Utc(r.created_at)) issues.push(issue("created_at", "must_be_rfc3339_utc"));
  if (r.target?.memory_layer !== "working_memory") issues.push(issue("target.memory_layer", "must_be_working_memory"));
  if (!nonEmpty(r.target?.mind_id)) issues.push(issue("target.mind_id", "required"));
  validateNullableNonEmptyString(r.target?.repository, "target.repository", issues);
  validateNullableNonEmptyString(r.target?.agent_species, "target.agent_species", issues);
  if (!starts(stringOr(r.source?.task_id, ""), "T")) issues.push(issue("source.task_id", "required_task_id_starting_with_T"));
  if (!HASH_RE.test(stringOr(r.source?.artifact_sha256, ""))) issues.push(issue("source.artifact_sha256", "required_sha256"));
  if (!nonEmpty(r.source?.reason)) issues.push(issue("source.reason", "required"));
  validateNullableNonEmptyString(r.source?.plan_id, "source.plan_id", issues);
  validateNullableNonEmptyString(r.source?.audit_id, "source.audit_id", issues);
  validateOptionalPrNumber(r.source?.pr_number, "source.pr_number", issues);
  const facts = Array.isArray(r.facts) ? r.facts : [];
  const maxItems = numberOr(options.max_items, numberOr(r.max_items, 50));
  if (facts.length === 0) issues.push(issue("facts", "required_non_empty"));
  if (facts.length > maxItems) issues.push(issue("facts", "exceeds_max_items"));
  if (!isSorted(facts.map((f) => stringOr(f?.id, "")))) issues.push(issue("facts", "must_be_sorted_by_id"));
  const seen = new Set();
  facts.forEach((f, idx) => {
    checkAllowedKeys(f, FACT_KEYS, `facts.${idx}`, issues);
    const id = stringOr(f?.id, "");
    const normalized = normalizeId(id);
    if (seen.has(normalized)) issues.push(issue(`facts.${idx}.id`, "duplicate_normalized_id"));
    seen.add(normalized);
    if (!nonEmpty(id)) issues.push(issue(`facts.${idx}.id`, "required"));
    if (!nonEmpty(f?.text)) issues.push(issue(`facts.${idx}.text`, "required"));
    if (!nonEmpty(f?.source_ref)) issues.push(issue(`facts.${idx}.source_ref`, "required"));
    if (!Number.isFinite(f?.confidence) || f.confidence < 0 || f.confidence > 1) issues.push(issue(`facts.${idx}.confidence`, "must_be_0_to_1"));
    const tags = Array.isArray(f?.tags) ? f.tags : [];
    if (!tags.every((t) => typeof t === "string") || !isSorted(tags) || new Set(tags).size !== tags.length) issues.push(issue(`facts.${idx}.tags`, "must_be_sorted_unique_strings"));
  });
  if (!positiveNumber(r.retention?.ttl_days)) issues.push(issue("retention.ttl_days", "required_positive"));
  if (!isNonNegativeInt(r.retention?.keep_last_accepted)) issues.push(issue("retention.keep_last_accepted", "must_be_non_negative_integer"));
  if (!isNonNegativeInt(r.retention?.keep_last_rejected)) issues.push(issue("retention.keep_last_rejected", "must_be_non_negative_integer"));
  if (r.max_items !== undefined && !positiveNumber(r.max_items)) issues.push(issue("max_items", "must_be_positive_number"));
  if (!APPROVAL_CLASSES.has(stringOr(r.approval?.approval_class, ""))) issues.push(issue("approval.approval_class", "must_be_one_of_a_b_c_d"));
  if (r.approval?.update_requires_pr !== true || r.approval?.direct_write_allowed !== false) issues.push(issue("approval", "must_require_pr_and_disallow_direct_write"));
  GUARD_KEYS.forEach((g) => { if (r.guards?.[g] !== true) issues.push(issue(`guards.${g}`, "must_be_true")); });
  if (!nonEmpty(r.provenance?.generated_by) || !nonEmpty(r.provenance?.task)) issues.push(issue("provenance", "required_generated_by_and_task"));
  return { ok: issues.length === 0, issues };
}

function starts(v, p) { return typeof v === "string" && v.startsWith(p); }
function dedupeFacts(facts) { const m = new Map(); for (const f of facts) { const id = stringOr(f?.id, "").trim(); const k = normalizeId(id); if (!m.has(k)) m.set(k, { id, text: stringOr(f?.text, "").trim(), confidence: f?.confidence, source_ref: stringOr(f?.source_ref, "").trim(), tags: canonicalStringArray(f?.tags, uniqueSorted) }); } return [...m.values()].sort(ordinalCompareByField("id")); }
