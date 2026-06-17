// T031: Deterministic episode digest manifest
// Writes and validates an EpisodeDigest manifest artifact.
// Does NOT write to .forge directly, does NOT call GitHub APIs,
// does NOT compute eval scores, does NOT guess missing source refs.

export const EPISODE_DIGEST_VERSION = 1 as const;
export const EPISODE_DIGEST_SCHEMA_REF =
  "urn:forgeroot:episode-digest:v1" as const;

const DIGEST_ID_PREFIX = "forge-episode-digest://";
const MAX_SUMMARY_LENGTH = 1200;
const MAX_TITLE_LENGTH = 160;

const RFC3339_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ARTIFACT_SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const TASK_ID_RE = /^T\d+/;

const VALID_EPISODE_TYPES = new Set([
  "accepted",
  "rejected",
  "blocked",
  "quarantined",
  "failed",
  "reverted",
  "unknown",
] as const);

const VALID_RELIABILITY = new Set([
  "high",
  "medium",
  "low",
  "unknown",
] as const);

const SECRET_KEY_TERMS = [
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY",
  "CREDENTIAL",
] as const;

export type EpisodeType =
  | "accepted"
  | "rejected"
  | "blocked"
  | "quarantined"
  | "failed"
  | "reverted"
  | "unknown";

export type EpisodeReliability = "high" | "medium" | "low" | "unknown";

export interface EpisodeDigest {
  readonly manifest_version: 1;
  readonly schema_ref: typeof EPISODE_DIGEST_SCHEMA_REF;
  readonly digest_id: string;
  readonly created_at: string;
  readonly episode: {
    readonly type: EpisodeType;
    readonly title: string;
    readonly summary: string;
    readonly reliability: EpisodeReliability;
  };
  readonly source: {
    readonly repository: string | null;
    readonly task_id: string;
    readonly plan_id: string | null;
    readonly audit_id: string | null;
    readonly pr_number: number | null;
    readonly commit_sha: string | null;
    readonly artifact_sha256: string;
  };
  readonly links: {
    readonly related_plan_ids: readonly string[];
    readonly related_audit_ids: readonly string[];
    readonly related_pr_numbers: readonly number[];
  };
  readonly retention: {
    readonly preserve_rejected: true;
    readonly preserve_blocked: true;
    readonly pack_candidate: boolean;
  };
  readonly guards: {
    readonly source_refs_required: true;
    readonly no_missing_source_guessing: true;
    readonly deterministic_ordering: true;
    readonly no_eval_score_update: true;
    readonly no_mutation_generation: true;
    readonly no_github_api_call: true;
  };
  readonly provenance: {
    readonly generated_by: "forgeroot-memory.digest";
    readonly task: "T031";
  };
}

export interface EpisodeDigestResult {
  readonly ok: boolean;
  readonly digest?: EpisodeDigest;
  readonly errors?: readonly string[];
}

export interface EpisodeDigestValidationResult {
  readonly ok: boolean;
  readonly issues?: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hasSecretLikeKey(key: string): boolean {
  const upper = key.toUpperCase();
  return SECRET_KEY_TERMS.some((term) => upper.includes(term));
}

function hasSecretLikeValue(value: unknown): boolean {
  if (typeof value === "string") {
    const upper = value.toUpperCase();
    return SECRET_KEY_TERMS.some((term) => upper.includes(term));
  }
  return false;
}

function scanForSecrets(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) {
    if (hasSecretLikeValue(obj)) return `value:${String(obj).slice(0, 20)}`;
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = scanForSecrets(item);
      if (found !== null) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (hasSecretLikeKey(key)) return `key:${key}`;
    const nested = scanForSecrets((obj as Record<string, unknown>)[key]);
    if (nested !== null) return nested;
  }
  return null;
}

function generateDigestId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${DIGEST_ID_PREFIX}${ts}-${rnd}`;
}

function resolveCreatedAt(raw: unknown): string {
  if (typeof raw === "string" && RFC3339_UTC_RE.test(raw)) return raw;
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

function sortedUniqueStrings(raw: unknown): readonly string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
      .map((v) => v.trim()),
  )].sort();
}

function sortedUniqueNumbers(raw: unknown): readonly number[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(
    raw.filter((v): v is number => typeof v === "number" && isFinite(v)),
  )].sort((a, b) => a - b);
}

export function createEpisodeDigest(
  input: unknown,
  _options?: unknown,
): EpisodeDigestResult {
  const errors: string[] = [];

  const r = asRecord(input);
  if (r === null) return { ok: false, errors: ["input_must_be_object"] };

  const secretHit = scanForSecrets(input);
  if (secretHit !== null)
    return { ok: false, errors: [`secret_like_content_detected:${secretHit}`] };

  const digest_id =
    typeof r.digest_id === "string" &&
    r.digest_id.startsWith(DIGEST_ID_PREFIX)
      ? r.digest_id
      : generateDigestId();

  const created_at = resolveCreatedAt(r.created_at);

  // episode
  const episodeRaw = asRecord(r.episode);
  let episodeType: EpisodeType = "unknown";
  let title = "";
  let summary = "";
  let reliability: EpisodeReliability = "unknown";
  if (episodeRaw === null) {
    errors.push("episode_required");
  } else {
    const rawType = episodeRaw.type;
    if (typeof rawType === "string" && VALID_EPISODE_TYPES.has(rawType as EpisodeType)) {
      episodeType = rawType as EpisodeType;
    } else {
      errors.push(
        `episode.type_must_be_one_of:${[...VALID_EPISODE_TYPES].join(",")}`,
      );
    }
    title =
      typeof episodeRaw.title === "string" ? episodeRaw.title.trim() : "";
    if (title.length === 0) errors.push("episode.title_required");
    if (title.length > MAX_TITLE_LENGTH)
      errors.push(
        `episode.title_exceeds_max_length:${title.length}>${MAX_TITLE_LENGTH}`,
      );
    summary =
      typeof episodeRaw.summary === "string"
        ? episodeRaw.summary.trim()
        : "";
    if (summary.length > MAX_SUMMARY_LENGTH)
      errors.push(
        `episode.summary_exceeds_max_length:${summary.length}>${MAX_SUMMARY_LENGTH}`,
      );
    const rawReliability = episodeRaw.reliability;
    if (
      typeof rawReliability === "string" &&
      VALID_RELIABILITY.has(rawReliability as EpisodeReliability)
    ) {
      reliability = rawReliability as EpisodeReliability;
    } else {
      errors.push(
        `episode.reliability_must_be_one_of:${[...VALID_RELIABILITY].join(",")}`,
      );
    }
    if (episodeType === "unknown" && reliability !== "unknown") {
      errors.push(
        "episode.type_unknown_requires_reliability_unknown",
      );
    }
  }

  // source
  const sourceRaw = asRecord(r.source);
  let task_id = "";
  let artifact_sha256 = "";
  let srcRepository: string | null = null;
  let plan_id: string | null = null;
  let audit_id: string | null = null;
  let pr_number: number | null = null;
  let commit_sha: string | null = null;
  if (sourceRaw === null) {
    errors.push("source_required");
  } else {
    task_id =
      typeof sourceRaw.task_id === "string"
        ? sourceRaw.task_id.trim()
        : "";
    if (!TASK_ID_RE.test(task_id))
      errors.push("source.task_id_required_starts_with_T");
    artifact_sha256 =
      typeof sourceRaw.artifact_sha256 === "string"
        ? sourceRaw.artifact_sha256.trim()
        : "";
    if (!ARTIFACT_SHA256_RE.test(artifact_sha256))
      errors.push("source.artifact_sha256_required_sha256:<64hex>");
    srcRepository =
      typeof sourceRaw.repository === "string"
        ? sourceRaw.repository
        : null;
    plan_id =
      typeof sourceRaw.plan_id === "string" ? sourceRaw.plan_id : null;
    audit_id =
      typeof sourceRaw.audit_id === "string" ? sourceRaw.audit_id : null;
    pr_number =
      typeof sourceRaw.pr_number === "number" ? sourceRaw.pr_number : null;
    commit_sha =
      typeof sourceRaw.commit_sha === "string" ? sourceRaw.commit_sha : null;
  }

  if (errors.length > 0) return { ok: false, errors };

  // links
  const linksRaw = asRecord(r.links);
  const related_plan_ids = sortedUniqueStrings(linksRaw?.related_plan_ids);
  const related_audit_ids = sortedUniqueStrings(linksRaw?.related_audit_ids);
  const related_pr_numbers = sortedUniqueNumbers(linksRaw?.related_pr_numbers);

  // retention
  const retentionRaw = asRecord(r.retention);
  const pack_candidate =
    retentionRaw && typeof retentionRaw.pack_candidate === "boolean"
      ? retentionRaw.pack_candidate
      : false;

  const digest: EpisodeDigest = {
    manifest_version: 1,
    schema_ref: EPISODE_DIGEST_SCHEMA_REF,
    digest_id,
    created_at,
    episode: { type: episodeType, title, summary, reliability },
    source: {
      repository: srcRepository,
      task_id,
      plan_id,
      audit_id,
      pr_number,
      commit_sha,
      artifact_sha256,
    },
    links: { related_plan_ids, related_audit_ids, related_pr_numbers },
    retention: {
      preserve_rejected: true,
      preserve_blocked: true,
      pack_candidate,
    },
    guards: {
      source_refs_required: true,
      no_missing_source_guessing: true,
      deterministic_ordering: true,
      no_eval_score_update: true,
      no_mutation_generation: true,
      no_github_api_call: true,
    },
    provenance: {
      generated_by: "forgeroot-memory.digest",
      task: "T031",
    },
  };

  return { ok: true, digest };
}

export function validateEpisodeDigest(
  value: unknown,
): EpisodeDigestValidationResult {
  const issues: string[] = [];

  const r = asRecord(value);
  if (r === null) return { ok: false, issues: ["value_must_be_object"] };

  const secretHit = scanForSecrets(value);
  if (secretHit !== null)
    issues.push(`secret_like_content_detected:${secretHit}`);

  if (r.manifest_version !== 1) issues.push("manifest_version_must_be_1");
  if (r.schema_ref !== EPISODE_DIGEST_SCHEMA_REF)
    issues.push("schema_ref_mismatch");
  if (
    typeof r.digest_id !== "string" ||
    !r.digest_id.startsWith(DIGEST_ID_PREFIX)
  )
    issues.push("digest_id_must_start_with_forge-episode-digest://");
  if (
    typeof r.created_at !== "string" ||
    !RFC3339_UTC_RE.test(r.created_at)
  )
    issues.push("created_at_must_be_rfc3339_utc");

  const episode = asRecord(r.episode);
  if (episode === null) {
    issues.push("episode_must_be_object");
  } else {
    const ep_type = episode.type;
    if (
      typeof ep_type !== "string" ||
      !VALID_EPISODE_TYPES.has(ep_type as EpisodeType)
    )
      issues.push(
        `episode.type_must_be_one_of:${[...VALID_EPISODE_TYPES].join(",")}`,
      );
    const ep_title =
      typeof episode.title === "string" ? episode.title : "";
    if (ep_title.trim().length === 0) issues.push("episode.title_required");
    if (ep_title.length > MAX_TITLE_LENGTH)
      issues.push(
        `episode.title_exceeds_max_length:${ep_title.length}>${MAX_TITLE_LENGTH}`,
      );
    const ep_summary =
      typeof episode.summary === "string" ? episode.summary : "";
    if (ep_summary.length > MAX_SUMMARY_LENGTH)
      issues.push(
        `episode.summary_exceeds_max_length:${ep_summary.length}>${MAX_SUMMARY_LENGTH}`,
      );
    const ep_reliability = episode.reliability;
    if (
      typeof ep_reliability !== "string" ||
      !VALID_RELIABILITY.has(ep_reliability as EpisodeReliability)
    )
      issues.push(
        `episode.reliability_must_be_one_of:${[...VALID_RELIABILITY].join(",")}`,
      );
    if (ep_type === "unknown" && ep_reliability !== "unknown")
      issues.push("episode.type_unknown_requires_reliability_unknown");
  }

  const source = asRecord(r.source);
  if (source === null) {
    issues.push("source_must_be_object");
  } else {
    if (
      typeof source.task_id !== "string" ||
      !TASK_ID_RE.test(source.task_id)
    )
      issues.push("source.task_id_required_starts_with_T");
    if (
      typeof source.artifact_sha256 !== "string" ||
      !ARTIFACT_SHA256_RE.test(source.artifact_sha256)
    )
      issues.push("source.artifact_sha256_required_sha256:<64hex>");
  }

  const links = asRecord(r.links);
  if (links !== null) {
    if (Array.isArray(links.related_plan_ids)) {
      const ids = links.related_plan_ids as unknown[];
      for (let i = 1; i < ids.length; i++) {
        if (
          typeof ids[i] === "string" &&
          typeof ids[i - 1] === "string" &&
          (ids[i] as string).localeCompare(ids[i - 1] as string) < 0
        )
          issues.push("links.related_plan_ids_not_sorted");
      }
    }
    if (Array.isArray(links.related_audit_ids)) {
      const ids = links.related_audit_ids as unknown[];
      for (let i = 1; i < ids.length; i++) {
        if (
          typeof ids[i] === "string" &&
          typeof ids[i - 1] === "string" &&
          (ids[i] as string).localeCompare(ids[i - 1] as string) < 0
        )
          issues.push("links.related_audit_ids_not_sorted");
      }
    }
    if (Array.isArray(links.related_pr_numbers)) {
      const nums = links.related_pr_numbers as unknown[];
      for (let i = 1; i < nums.length; i++) {
        if (
          typeof nums[i] === "number" &&
          typeof nums[i - 1] === "number" &&
          (nums[i] as number) < (nums[i - 1] as number)
        )
          issues.push("links.related_pr_numbers_not_sorted");
      }
    }
  }

  const retention = asRecord(r.retention);
  if (retention === null) {
    issues.push("retention_must_be_object");
  } else {
    if (retention.preserve_rejected !== true)
      issues.push("retention.preserve_rejected_must_be_true");
    if (retention.preserve_blocked !== true)
      issues.push("retention.preserve_blocked_must_be_true");
  }

  const guards = asRecord(r.guards);
  if (guards === null) {
    issues.push("guards_must_be_object");
  } else {
    const required = [
      "source_refs_required",
      "no_missing_source_guessing",
      "deterministic_ordering",
      "no_eval_score_update",
      "no_mutation_generation",
      "no_github_api_call",
    ] as const;
    for (const g of required) {
      if (guards[g] !== true) issues.push(`guards.${g}_must_be_true`);
    }
  }

  const provenance = asRecord(r.provenance);
  if (provenance === null) {
    issues.push("provenance_must_be_object");
  } else {
    if (provenance.generated_by !== "forgeroot-memory.digest")
      issues.push("provenance.generated_by_mismatch");
    if (provenance.task !== "T031")
      issues.push("provenance.task_must_be_T031");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
