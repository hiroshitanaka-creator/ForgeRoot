export const WORKING_MEMORY_UPDATE_VERSION = 1;
export const WORKING_MEMORY_UPDATE_SCHEMA_REF = "urn:forgeroot:working-memory-update:v1";
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_RE = /(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL|API[_-]?KEY|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghu_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|ghr_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/i;
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);

export function createWorkingMemoryUpdate(input, options: any = {}) {
  const issues = [];
  if (hasSecretLike(input)) return invalid(["secret_like_field_or_value"]);
  const r = asRecord(input);
  if (!r) return invalid(["input_must_be_object"]);
  const maxItems = numberOr(options.max_items, numberOr(r.max_items, 50));
  const createdAt = stringOr(options.created_at, stringOr(r.created_at, new Date().toISOString()));
  const facts = dedupeFacts(Array.isArray(r.facts) ? r.facts : []);
  if (facts.length > maxItems) issues.push("facts_exceed_max_items");
  const source = {
    task_id: stringOr(r.source?.task_id, ""),
    plan_id: nullableString(r.source?.plan_id),
    audit_id: nullableString(r.source?.audit_id),
    pr_number: nullableNumber(r.source?.pr_number),
    artifact_sha256: stringOr(r.source?.artifact_sha256, ""),
    reason: stringOr(r.source?.reason, ""),
  };
  const update = {
    manifest_version: 1,
    schema_ref: WORKING_MEMORY_UPDATE_SCHEMA_REF,
    update_id: stringOr(r.update_id, `forge-memory-update://${stableId([source, facts, createdAt])}`),
    created_at: createdAt,
    max_items: maxItems,
    target: {
      repository: nullableString(r.target?.repository),
      mind_id: stringOr(r.target?.mind_id, "forge://hiroshitanaka-creator/ForgeRoot/mind/root"),
      agent_species: nullableString(r.target?.agent_species),
      memory_layer: "working_memory",
    },
    source,
    facts,
    retention: {
      ttl_days: numberOr(r.retention?.ttl_days, 30),
      keep_last_accepted: r.retention?.keep_last_accepted === undefined ? 10 : r.retention.keep_last_accepted,
      keep_last_rejected: r.retention?.keep_last_rejected === undefined ? 10 : r.retention.keep_last_rejected,
    },
    approval: { approval_class: stringOr(r.approval?.approval_class, "B"), update_requires_pr: true, direct_write_allowed: false },
    guards: { no_direct_forge_write: true, no_runtime_db_authority: true, source_refs_required: true, deterministic_ordering: true, max_items_enforced: true, no_eval_score_update: true, no_github_api_call: true },
    provenance: { generated_by: "forgeroot-memory.working", task: "T030" },
  };
  const validation = validateWorkingMemoryUpdate(update, { max_items: maxItems });
  return validation.ok && issues.length === 0 ? { ok: true, update } : invalid([...issues, ...validation.issues.map((i) => i.code)]);
}

export function validateWorkingMemoryUpdate(value, options: any = {}) {
  const issues = [];
  const r = asRecord(value);
  if (!r) return { ok: false, issues: [{ path: "", code: "must_be_object" }] };
  if (hasSecretLike(value)) issues.push(issue("", "secret_like_field_or_value"));
  if (r.manifest_version !== 1) issues.push(issue("manifest_version", "must_equal_1"));
  if (r.schema_ref !== WORKING_MEMORY_UPDATE_SCHEMA_REF) issues.push(issue("schema_ref", "must_match_schema_ref"));
  if (!starts(stringOr(r.update_id, ""), "forge-memory-update://")) issues.push(issue("update_id", "must_use_forge_memory_update_uri"));
  if (!UTC_RE.test(stringOr(r.created_at, ""))) issues.push(issue("created_at", "must_be_rfc3339_utc"));
  if (r.target?.memory_layer !== "working_memory") issues.push(issue("target.memory_layer", "must_be_working_memory"));
  if (!starts(stringOr(r.source?.task_id, ""), "T")) issues.push(issue("source.task_id", "required_task_id_starting_with_T"));
  if (!HASH_RE.test(stringOr(r.source?.artifact_sha256, ""))) issues.push(issue("source.artifact_sha256", "required_sha256"));
  if (!nonEmpty(r.source?.reason)) issues.push(issue("source.reason", "required"));
  if (r.source?.pr_number !== null && r.source?.pr_number !== undefined && !(Number.isInteger(r.source.pr_number) && r.source.pr_number > 0)) issues.push(issue("source.pr_number", "must_be_positive_integer_or_null"));
  const facts = Array.isArray(r.facts) ? r.facts : [];
  const maxItems = numberOr(options.max_items, numberOr(r.max_items, 50));
  if (facts.length === 0) issues.push(issue("facts", "required_non_empty"));
  if (facts.length > maxItems) issues.push(issue("facts", "exceeds_max_items"));
  if (!isSorted(facts.map((f) => stringOr(f?.id, "")))) issues.push(issue("facts", "must_be_sorted_by_id"));
  const seen = new Set();
  facts.forEach((f, idx) => {
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
  ["no_direct_forge_write","no_runtime_db_authority","source_refs_required","deterministic_ordering","max_items_enforced","no_eval_score_update","no_github_api_call"].forEach((g) => { if (r.guards?.[g] !== true) issues.push(issue(`guards.${g}`, "must_be_true")); });
  if (!nonEmpty(r.provenance?.generated_by) || !nonEmpty(r.provenance?.task)) issues.push(issue("provenance", "required_generated_by_and_task"));
  return { ok: issues.length === 0, issues };
}
function dedupeFacts(facts) { const m = new Map(); for (const f of facts) { const id = stringOr(f?.id, "").trim(); const k = normalizeId(id); if (!m.has(k)) m.set(k, { id, text: stringOr(f?.text, "").trim(), confidence: Number(f?.confidence), source_ref: stringOr(f?.source_ref, "").trim(), tags: uniqueSorted(Array.isArray(f?.tags) ? f.tags.map(String) : []) }); } return [...m.values()].sort((a,b)=>a.id.localeCompare(b.id)); }
function hasSecretLike(v) { if (Array.isArray(v)) return v.some(hasSecretLike); if (v && typeof v === "object") return Object.entries(v).some(([k,val]) => SECRET_RE.test(k) || hasSecretLike(val)); return typeof v === "string" && SECRET_RE.test(v); }
function stableId(parts) {
  const s = JSON.stringify(parts);
  let h1 = 0x811c9dc5, h2 = 0x9e3779b9;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul((h2 ^ c) + ((h2 << 6) + (h2 >>> 2)), 2654435761) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
function invalid(codes) { return { ok: false, issues: [...new Set(codes)].map((code) => ({ path: "", code })) }; }
function asRecord(v): any { return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
function stringOr(v,d){ return typeof v === "string" ? v : d; } function nullableString(v){ return typeof v === "string" ? v : null; } function nullableNumber(v){ return typeof v === "number" ? v : null; } function numberOr(v,d){ return typeof v === "number" && Number.isFinite(v) ? v : d; } function nonEmpty(v){ return typeof v === "string" && v.trim().length > 0; } function positiveNumber(v){ return typeof v === "number" && v > 0; } function isNonNegativeInt(v){ return Number.isInteger(v) && v >= 0; } function starts(v,p){ return typeof v === "string" && v.startsWith(p); } function normalizeId(v){ return stringOr(v, "").trim().toLowerCase(); } function uniqueSorted(a){ return [...new Set(a.map((x)=>x.trim()).filter(Boolean))].sort((x: any,y: any)=>x.localeCompare(y)); } function isSorted(a){ return a.every((x,i)=>i===0 || String(a[i-1]).localeCompare(String(x)) <= 0); } function issue(path, code){ return { path, code }; }
