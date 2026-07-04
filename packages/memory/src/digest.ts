import {
  HASH_RE, hasSecretLike, isValidRfc3339Utc, stableId, invalid, issue, asRecord,
  stringOr, nullableString, nullableNumber, nonEmpty, uniqueSorted, uniqueSortedNumbers,
  isManifestUri, checkAllowedKeys, validateNullableNonEmptyString, validateOptionalPrNumber,
  validateSortedUniqueStrings, validateSortedUniqueNumbers,
} from "./contract.js";

export const EPISODE_DIGEST_VERSION = 1;
export const EPISODE_DIGEST_SCHEMA_REF = "urn:forgeroot:episode-digest:v1";
const DIGEST_URI_PREFIX = "forge-episode-digest://";
const TYPES = new Set(["accepted", "rejected", "blocked", "quarantined", "failed", "reverted", "unknown"]);
const RELIABILITY = new Set(["high", "medium", "low", "unknown"]);
const TOP_KEYS = new Set(["manifest_version", "schema_ref", "digest_id", "created_at", "episode", "source", "links", "retention", "guards", "provenance"]);
const EPISODE_KEYS = new Set(["type", "title", "summary", "reliability"]);
const SOURCE_KEYS = new Set(["repository", "task_id", "plan_id", "audit_id", "pr_number", "commit_sha", "outcome_ref", "artifact_sha256"]);
const LINK_KEYS = new Set(["related_plan_ids", "related_audit_ids", "related_pr_numbers"]);
const RETENTION_KEYS = new Set(["preserve_rejected", "preserve_blocked", "pack_candidate"]);
const GUARD_KEYS = ["source_refs_required", "no_missing_source_guessing", "deterministic_ordering", "no_eval_score_update", "no_mutation_generation", "no_github_api_call"];
const PROVENANCE_KEYS = new Set(["generated_by", "task"]);

export function createEpisodeDigest(input, options: any = {}) {
  if (hasSecretLike(input)) return invalid(["secret_like_field_or_value"]);
  const r = asRecord(input); if (!r) return invalid(["input_must_be_object"]);
  // Preserve caller-supplied values when present so bad input fails
  // validation instead of being silently rewritten to a default.
  const createdAt = options.created_at !== undefined ? options.created_at : r.created_at !== undefined ? r.created_at : new Date().toISOString();
  const episode = { type: stringOr(r.episode?.type, "unknown"), title: stringOr(r.episode?.title, ""), summary: stringOr(r.episode?.summary, ""), reliability: stringOr(r.episode?.reliability, "unknown") };
  const source = { repository: nullableString(r.source?.repository), task_id: stringOr(r.source?.task_id, ""), plan_id: nullableString(r.source?.plan_id), audit_id: nullableString(r.source?.audit_id), pr_number: nullableNumber(r.source?.pr_number), commit_sha: nullableString(r.source?.commit_sha), outcome_ref: nullableString(r.source?.outcome_ref), artifact_sha256: stringOr(r.source?.artifact_sha256, "") };
  const links = { related_plan_ids: uniqueSorted(Array.isArray(r.links?.related_plan_ids) ? r.links.related_plan_ids.map(String) : []), related_audit_ids: uniqueSorted(Array.isArray(r.links?.related_audit_ids) ? r.links.related_audit_ids.map(String) : []), related_pr_numbers: uniqueSortedNumbers(Array.isArray(r.links?.related_pr_numbers) ? r.links.related_pr_numbers : []) };
  const digest = {
    manifest_version: 1,
    schema_ref: EPISODE_DIGEST_SCHEMA_REF,
    digest_id: stringOr(r.digest_id, `${DIGEST_URI_PREFIX}${stableId([source, episode, links, createdAt])}`),
    created_at: createdAt,
    episode,
    source,
    links,
    retention: { preserve_rejected: true, preserve_blocked: true, pack_candidate: r.retention?.pack_candidate === undefined ? false : r.retention.pack_candidate },
    guards: { source_refs_required: true, no_missing_source_guessing: true, deterministic_ordering: true, no_eval_score_update: true, no_mutation_generation: true, no_github_api_call: true },
    provenance: { generated_by: "forgeroot-memory.digest", task: "T031" },
  };
  const validation = validateEpisodeDigest(digest);
  return validation.ok ? { ok: true, digest } : { ok: false, issues: validation.issues };
}

export function validateEpisodeDigest(value) {
  const issues = []; const r = asRecord(value); if (!r) return { ok: false, issues: [issue("", "must_be_object")] };
  if (hasSecretLike(value)) issues.push(issue("", "secret_like_field_or_value"));
  checkAllowedKeys(r, TOP_KEYS, "", issues);
  checkAllowedKeys(r.episode, EPISODE_KEYS, "episode", issues);
  checkAllowedKeys(r.source, SOURCE_KEYS, "source", issues);
  checkAllowedKeys(r.links, LINK_KEYS, "links", issues);
  checkAllowedKeys(r.retention, RETENTION_KEYS, "retention", issues);
  checkAllowedKeys(r.guards, new Set(GUARD_KEYS), "guards", issues);
  checkAllowedKeys(r.provenance, PROVENANCE_KEYS, "provenance", issues);
  if (r.manifest_version !== 1) issues.push(issue("manifest_version", "must_equal_1"));
  if (r.schema_ref !== EPISODE_DIGEST_SCHEMA_REF) issues.push(issue("schema_ref", "must_match_schema_ref"));
  if (!isManifestUri(stringOr(r.digest_id, ""), DIGEST_URI_PREFIX)) issues.push(issue("digest_id", "must_use_forge_episode_digest_uri"));
  if (!isValidRfc3339Utc(r.created_at)) issues.push(issue("created_at", "must_be_rfc3339_utc"));
  const type = stringOr(r.episode?.type, ""); const rel = stringOr(r.episode?.reliability, "");
  if (!TYPES.has(type)) issues.push(issue("episode.type", "invalid"));
  if (!RELIABILITY.has(rel)) issues.push(issue("episode.reliability", "invalid"));
  if (type === "unknown" && rel !== "unknown") issues.push(issue("episode.reliability", "unknown_type_requires_unknown_reliability"));
  if (!nonEmpty(r.episode?.title) || r.episode.title.length > 160) issues.push(issue("episode.title", "required_max_160"));
  if (!nonEmpty(r.episode?.summary) || r.episode.summary.length > 1200) issues.push(issue("episode.summary", "required_max_1200"));
  if (!nonEmpty(r.source?.task_id)) issues.push(issue("source.task_id", "required"));
  if (!HASH_RE.test(stringOr(r.source?.artifact_sha256, ""))) issues.push(issue("source.artifact_sha256", "required_sha256"));
  validateNullableNonEmptyString(r.source?.repository, "source.repository", issues);
  validateNullableNonEmptyString(r.source?.plan_id, "source.plan_id", issues);
  validateNullableNonEmptyString(r.source?.audit_id, "source.audit_id", issues);
  validateNullableNonEmptyString(r.source?.commit_sha, "source.commit_sha", issues);
  validateNullableNonEmptyString(r.source?.outcome_ref, "source.outcome_ref", issues);
  validateOptionalPrNumber(r.source?.pr_number, "source.pr_number", issues);
  validateSortedUniqueStrings(r.links?.related_plan_ids, "links.related_plan_ids", issues);
  validateSortedUniqueStrings(r.links?.related_audit_ids, "links.related_audit_ids", issues);
  validateSortedUniqueNumbers(r.links?.related_pr_numbers, "links.related_pr_numbers", issues);
  if (r.retention?.preserve_rejected !== true || r.retention?.preserve_blocked !== true) issues.push(issue("retention", "must_preserve_rejected_and_blocked"));
  if (typeof r.retention?.pack_candidate !== "boolean") issues.push(issue("retention.pack_candidate", "must_be_boolean"));
  GUARD_KEYS.forEach((g) => { if (r.guards?.[g] !== true) issues.push(issue(`guards.${g}`, "must_be_true")); });
  if (!nonEmpty(r.provenance?.generated_by) || !nonEmpty(r.provenance?.task)) issues.push(issue("provenance", "required_generated_by_and_task"));
  return { ok: issues.length === 0, issues };
}
