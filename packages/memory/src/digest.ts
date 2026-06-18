export const EPISODE_DIGEST_VERSION = 1;
export const EPISODE_DIGEST_SCHEMA_REF = "urn:forgeroot:episode-digest:v1";
const HASH_RE = /^sha256:[0-9a-f]{64}$/;
const UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SECRET_RE = /(TOKEN|SECRET|PASSWORD|PRIVATE_KEY|CREDENTIAL)/i;
const TYPES = new Set(["accepted","rejected","blocked","quarantined","failed","reverted","unknown"]);
const RELIABILITY = new Set(["high","medium","low","unknown"]);
export function createEpisodeDigest(input, options: any = {}) {
  if (hasSecretLike(input)) return invalid(["secret_like_field_or_value"]);
  const r = asRecord(input); if (!r) return invalid(["input_must_be_object"]);
  const createdAt = stringOr(options.created_at, stringOr(r.created_at, new Date().toISOString()));
  const digest = {
    manifest_version: 1,
    schema_ref: EPISODE_DIGEST_SCHEMA_REF,
    digest_id: stringOr(r.digest_id, `forge-episode-digest://${stableId([r.source, r.episode, createdAt])}`),
    created_at: createdAt,
    episode: { type: stringOr(r.episode?.type, "unknown"), title: stringOr(r.episode?.title, ""), summary: stringOr(r.episode?.summary, ""), reliability: stringOr(r.episode?.reliability, "unknown") },
    source: { repository: nullableString(r.source?.repository), task_id: stringOr(r.source?.task_id, ""), plan_id: nullableString(r.source?.plan_id), audit_id: nullableString(r.source?.audit_id), pr_number: nullableNumber(r.source?.pr_number), commit_sha: nullableString(r.source?.commit_sha), artifact_sha256: stringOr(r.source?.artifact_sha256, "") },
    links: { related_plan_ids: uniqueSorted(Array.isArray(r.links?.related_plan_ids) ? r.links.related_plan_ids.map(String) : []), related_audit_ids: uniqueSorted(Array.isArray(r.links?.related_audit_ids) ? r.links.related_audit_ids.map(String) : []), related_pr_numbers: uniqueSortedNumbers(Array.isArray(r.links?.related_pr_numbers) ? r.links.related_pr_numbers : []) },
    retention: { preserve_rejected: true, preserve_blocked: true, pack_candidate: Boolean(r.retention?.pack_candidate) },
    guards: { source_refs_required: true, no_missing_source_guessing: true, deterministic_ordering: true, no_eval_score_update: true, no_mutation_generation: true, no_github_api_call: true },
    provenance: { generated_by: "forgeroot-memory.digest", task: "T031" },
  };
  const validation = validateEpisodeDigest(digest);
  return validation.ok ? { ok: true, digest } : { ok: false, issues: validation.issues };
}
export function validateEpisodeDigest(value) {
  const issues = []; const r = asRecord(value); if (!r) return { ok:false, issues:[issue("", "must_be_object")] };
  if (hasSecretLike(value)) issues.push(issue("", "secret_like_field_or_value"));
  if (r.manifest_version !== 1) issues.push(issue("manifest_version", "must_equal_1"));
  if (r.schema_ref !== EPISODE_DIGEST_SCHEMA_REF) issues.push(issue("schema_ref", "must_match_schema_ref"));
  if (!starts(stringOr(r.digest_id, ""), "forge-episode-digest://")) issues.push(issue("digest_id", "must_use_forge_episode_digest_uri"));
  if (!UTC_RE.test(stringOr(r.created_at, ""))) issues.push(issue("created_at", "must_be_rfc3339_utc"));
  const type = stringOr(r.episode?.type, ""); const rel = stringOr(r.episode?.reliability, "");
  if (!TYPES.has(type)) issues.push(issue("episode.type", "invalid"));
  if (!RELIABILITY.has(rel)) issues.push(issue("episode.reliability", "invalid"));
  if (type === "unknown" && rel !== "unknown") issues.push(issue("episode.reliability", "unknown_type_requires_unknown_reliability"));
  if (!nonEmpty(r.episode?.title) || r.episode.title.length > 160) issues.push(issue("episode.title", "required_max_160"));
  if (!nonEmpty(r.episode?.summary) || r.episode.summary.length > 1200) issues.push(issue("episode.summary", "required_max_1200"));
  if (!nonEmpty(r.source?.task_id)) issues.push(issue("source.task_id", "required"));
  if (!HASH_RE.test(stringOr(r.source?.artifact_sha256, ""))) issues.push(issue("source.artifact_sha256", "required_sha256"));
  validateSortedUniqueStrings(r.links?.related_plan_ids, "links.related_plan_ids", issues);
  validateSortedUniqueStrings(r.links?.related_audit_ids, "links.related_audit_ids", issues);
  validateSortedUniqueNumbers(r.links?.related_pr_numbers, "links.related_pr_numbers", issues);
  if (r.retention?.preserve_rejected !== true || r.retention?.preserve_blocked !== true) issues.push(issue("retention", "must_preserve_rejected_and_blocked"));
  ["source_refs_required","no_missing_source_guessing","deterministic_ordering","no_eval_score_update","no_mutation_generation","no_github_api_call"].forEach((g)=>{ if (r.guards?.[g] !== true) issues.push(issue(`guards.${g}`, "must_be_true")); });
  return { ok: issues.length === 0, issues };
}
function validateSortedUniqueStrings(v,path,issues){ if (!Array.isArray(v) || !v.every((x)=>typeof x === "string") || !isSorted(v) || new Set(v).size !== v.length) issues.push(issue(path,"must_be_sorted_unique_strings")); }
function validateSortedUniqueNumbers(v,path,issues){ if (!Array.isArray(v) || !v.every((x)=>typeof x === "number") || !isSorted(v) || new Set(v).size !== v.length) issues.push(issue(path,"must_be_sorted_unique_numbers")); }
function hasSecretLike(v){ if (Array.isArray(v)) return v.some(hasSecretLike); if (v && typeof v === "object") return Object.entries(v).some(([k,val]) => SECRET_RE.test(k) || hasSecretLike(val)); return typeof v === "string" && SECRET_RE.test(v); }
function stableId(parts){ return encodeURIComponent(JSON.stringify(parts)).replace(/%/g, "").slice(0,48); } function invalid(codes){ return { ok:false, issues:[...new Set(codes)].map((code)=>({path:"", code}))}; }
function asRecord(v): any { return v && typeof v === "object" && !Array.isArray(v) ? v : null; } function stringOr(v,d){ return typeof v === "string" ? v : d; } function nullableString(v){ return typeof v === "string" ? v : null; } function nullableNumber(v){ return typeof v === "number" ? v : null; } function nonEmpty(v){ return typeof v === "string" && v.trim().length > 0; } function starts(v,p){ return typeof v === "string" && v.startsWith(p); } function uniqueSorted(a){ return [...new Set(a.map((x)=>x.trim()).filter(Boolean))].sort(); } function uniqueSortedNumbers(a){ return [...new Set(a.filter((x)=>typeof x === "number"))].sort((x: any,y: any)=>x-y); } function isSorted(a){ return a.every((x,i)=>i===0 || a[i-1] <= x); } function issue(path, code){ return { path, code }; }
