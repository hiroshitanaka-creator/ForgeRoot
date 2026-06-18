// T030: Deterministic working memory update manifest
// Writes and validates a WorkingMemoryUpdate manifest artifact.
// Does NOT write to .forge directly, does NOT call GitHub APIs,
// does NOT compute eval scores.

export const WORKING_MEMORY_UPDATE_VERSION = 1 as const;
export const WORKING_MEMORY_UPDATE_SCHEMA_REF =
  "urn:forgeroot:working-memory-update:v1" as const;

const DEFAULT_MAX_ITEMS = 100;
const DEFAULT_TTL_DAYS = 90;
const DEFAULT_KEEP_LAST_ACCEPTED = 50;
const DEFAULT_KEEP_LAST_REJECTED = 20;

const RFC3339_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ARTIFACT_SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const UPDATE_ID_PREFIX = "forge-memory-update://";
const TASK_ID_RE = /^T\d+/;

const SECRET_KEY_TERMS = [
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY",
  "CREDENTIAL",
] as const;

const VALID_APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);

export interface WorkingMemoryFact {
  readonly id: string;
  readonly text: string;
  readonly confidence: number;
  readonly source_ref: string;
  readonly tags: readonly string[];
}

export interface WorkingMemoryUpdate {
  readonly manifest_version: 1;
  readonly schema_ref: typeof WORKING_MEMORY_UPDATE_SCHEMA_REF;
  readonly update_id: string;
  readonly created_at: string;
  readonly target: {
    readonly repository: string | null;
    readonly mind_id: string;
    readonly agent_species: string | null;
    readonly memory_layer: "working_memory";
  };
  readonly source: {
    readonly task_id: string;
    readonly plan_id: string | null;
    readonly audit_id: string | null;
    readonly pr_number: number | null;
    readonly artifact_sha256: string;
    readonly reason: string;
  };
  readonly facts: readonly WorkingMemoryFact[];
  readonly retention: {
    readonly ttl_days: number;
    readonly keep_last_accepted: number;
    readonly keep_last_rejected: number;
  };
  readonly approval: {
    readonly approval_class: "A" | "B" | "C" | "D";
    readonly update_requires_pr: true;
    readonly direct_write_allowed: false;
  };
  readonly guards: {
    readonly no_direct_forge_write: true;
    readonly no_runtime_db_authority: true;
    readonly source_refs_required: true;
    readonly deterministic_ordering: true;
    readonly max_items_enforced: true;
    readonly no_eval_score_update: true;
    readonly no_github_api_call: true;
  };
  readonly provenance: {
    readonly generated_by: "forgeroot-memory.working";
    readonly task: "T030";
  };
}

export interface WorkingMemoryUpdateResult {
  readonly ok: boolean;
  readonly update?: WorkingMemoryUpdate;
  readonly errors?: readonly string[];
}

export interface WorkingMemoryUpdateValidationResult {
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

function scanForSecretKeys(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = scanForSecretKeys(item);
      if (found !== null) return found;
    }
    return null;
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (hasSecretLikeKey(key)) return key;
    const nested = scanForSecretKeys(
      (obj as Record<string, unknown>)[key],
    );
    if (nested !== null) return nested;
  }
  return null;
}

function normalizeFact(
  raw: unknown,
  index: number,
  errors: string[],
): WorkingMemoryFact | null {
  const r = asRecord(raw);
  if (r === null) {
    errors.push(`fact[${index}]_must_be_object`);
    return null;
  }
  const id =
    typeof r.id === "string" ? r.id.trim() : "";
  const text =
    typeof r.text === "string" ? r.text.trim() : "";
  const source_ref =
    typeof r.source_ref === "string" ? r.source_ref.trim() : "";
  const confidence =
    typeof r.confidence === "number" ? r.confidence : NaN;

  let invalid = false;
  if (id.length === 0) {
    errors.push(`fact[${index}].id_required`);
    invalid = true;
  }
  if (text.length === 0) {
    errors.push(`fact[${index}].text_required`);
    invalid = true;
  }
  if (source_ref.length === 0) {
    errors.push(`fact[${index}].source_ref_required`);
    invalid = true;
  }
  if (isNaN(confidence) || confidence < 0 || confidence > 1) {
    errors.push(`fact[${index}].confidence_must_be_0_to_1`);
    invalid = true;
  }
  if (invalid) return null;

  const rawTags = Array.isArray(r.tags) ? r.tags : [];
  const tags = [...new Set(
    rawTags
      .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      .map((t) => t.trim()),
  )].sort();

  return { id, text, confidence, source_ref, tags };
}

function generateUpdateId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `${UPDATE_ID_PREFIX}${ts}-${rnd}`;
}

function resolveCreatedAt(raw: unknown): string {
  if (typeof raw === "string" && RFC3339_UTC_RE.test(raw)) return raw;
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

export function createWorkingMemoryUpdate(
  input: unknown,
  options?: unknown,
): WorkingMemoryUpdateResult {
  const errors: string[] = [];

  const r = asRecord(input);
  if (r === null) return { ok: false, errors: ["input_must_be_object"] };

  const secretKey = scanForSecretKeys(input);
  if (secretKey !== null) {
    return { ok: false, errors: [`secret_like_key_detected:${secretKey}`] };
  }

  const opts = asRecord(options) ?? {};
  const maxItems =
    typeof opts.max_items === "number" && opts.max_items > 0
      ? Math.floor(opts.max_items)
      : DEFAULT_MAX_ITEMS;

  const update_id =
    typeof r.update_id === "string" &&
    r.update_id.startsWith(UPDATE_ID_PREFIX)
      ? r.update_id
      : generateUpdateId();

  const created_at = resolveCreatedAt(r.created_at);

  // target
  const targetRaw = asRecord(r.target);
  let mind_id = "";
  let repository: string | null = null;
  let agent_species: string | null = null;
  if (targetRaw === null) {
    errors.push("target_required");
  } else {
    mind_id =
      typeof targetRaw.mind_id === "string"
        ? targetRaw.mind_id.trim()
        : "";
    if (mind_id.length === 0) errors.push("target.mind_id_required");
    repository =
      typeof targetRaw.repository === "string"
        ? targetRaw.repository
        : null;
    agent_species =
      typeof targetRaw.agent_species === "string"
        ? targetRaw.agent_species
        : null;
  }

  // source
  const sourceRaw = asRecord(r.source);
  let task_id = "";
  let artifact_sha256 = "";
  let reason = "";
  let plan_id: string | null = null;
  let audit_id: string | null = null;
  let pr_number: number | null = null;
  if (sourceRaw === null) {
    errors.push("source_required");
  } else {
    task_id =
      typeof sourceRaw.task_id === "string"
        ? sourceRaw.task_id.trim()
        : "";
    if (!TASK_ID_RE.test(task_id))
      errors.push("source.task_id_must_start_with_T");
    artifact_sha256 =
      typeof sourceRaw.artifact_sha256 === "string"
        ? sourceRaw.artifact_sha256.trim()
        : "";
    if (!ARTIFACT_SHA256_RE.test(artifact_sha256))
      errors.push("source.artifact_sha256_required_sha256:<64hex>");
    reason =
      typeof sourceRaw.reason === "string"
        ? sourceRaw.reason.trim()
        : "";
    if (reason.length === 0) errors.push("source.reason_required");
    plan_id =
      typeof sourceRaw.plan_id === "string" ? sourceRaw.plan_id : null;
    audit_id =
      typeof sourceRaw.audit_id === "string" ? sourceRaw.audit_id : null;
    pr_number =
      typeof sourceRaw.pr_number === "number" ? sourceRaw.pr_number : null;
  }

  // facts
  const rawFacts = Array.isArray(r.facts) ? r.facts : [];
  if (rawFacts.length === 0) errors.push("facts_required");

  const seenIds = new Map<string, number>();
  const normalizedFacts: WorkingMemoryFact[] = [];
  for (let i = 0; i < rawFacts.length; i++) {
    const fact = normalizeFact(rawFacts[i], i, errors);
    if (fact === null) continue;
    const normId = fact.id.toLowerCase();
    if (seenIds.has(normId)) continue; // deterministic dedupe: keep first occurrence
    seenIds.set(normId, i);
    normalizedFacts.push(fact);
  }

  const sortedFacts = [...normalizedFacts].sort((a, b) =>
    a.id.localeCompare(b.id),
  );

  if (sortedFacts.length > maxItems) {
    errors.push(
      `max_items_exceeded:${sortedFacts.length}>${maxItems}`,
    );
  }

  if (errors.length > 0) return { ok: false, errors };

  // retention
  const retentionRaw = asRecord(r.retention);
  const ttl_days =
    retentionRaw &&
    typeof retentionRaw.ttl_days === "number" &&
    retentionRaw.ttl_days > 0
      ? retentionRaw.ttl_days
      : DEFAULT_TTL_DAYS;
  const keep_last_accepted =
    retentionRaw &&
    typeof retentionRaw.keep_last_accepted === "number" &&
    retentionRaw.keep_last_accepted >= 0
      ? retentionRaw.keep_last_accepted
      : DEFAULT_KEEP_LAST_ACCEPTED;
  const keep_last_rejected =
    retentionRaw &&
    typeof retentionRaw.keep_last_rejected === "number" &&
    retentionRaw.keep_last_rejected >= 0
      ? retentionRaw.keep_last_rejected
      : DEFAULT_KEEP_LAST_REJECTED;

  // approval
  const approvalRaw = asRecord(r.approval);
  const approval_class: "A" | "B" | "C" | "D" =
    approvalRaw &&
    typeof approvalRaw.approval_class === "string" &&
    VALID_APPROVAL_CLASSES.has(approvalRaw.approval_class)
      ? (approvalRaw.approval_class as "A" | "B" | "C" | "D")
      : "B";

  const update: WorkingMemoryUpdate = {
    manifest_version: 1,
    schema_ref: WORKING_MEMORY_UPDATE_SCHEMA_REF,
    update_id,
    created_at,
    target: {
      repository,
      mind_id,
      agent_species,
      memory_layer: "working_memory",
    },
    source: {
      task_id,
      plan_id,
      audit_id,
      pr_number,
      artifact_sha256,
      reason,
    },
    facts: sortedFacts,
    retention: { ttl_days, keep_last_accepted, keep_last_rejected },
    approval: {
      approval_class,
      update_requires_pr: true,
      direct_write_allowed: false,
    },
    guards: {
      no_direct_forge_write: true,
      no_runtime_db_authority: true,
      source_refs_required: true,
      deterministic_ordering: true,
      max_items_enforced: true,
      no_eval_score_update: true,
      no_github_api_call: true,
    },
    provenance: {
      generated_by: "forgeroot-memory.working",
      task: "T030",
    },
  };

  return { ok: true, update };
}

export function validateWorkingMemoryUpdate(
  value: unknown,
): WorkingMemoryUpdateValidationResult {
  const issues: string[] = [];

  const r = asRecord(value);
  if (r === null) return { ok: false, issues: ["value_must_be_object"] };

  const secretKey = scanForSecretKeys(value);
  if (secretKey !== null) issues.push(`secret_like_key_detected:${secretKey}`);

  if (r.manifest_version !== 1) issues.push("manifest_version_must_be_1");
  if (r.schema_ref !== WORKING_MEMORY_UPDATE_SCHEMA_REF)
    issues.push("schema_ref_mismatch");
  if (
    typeof r.update_id !== "string" ||
    !r.update_id.startsWith(UPDATE_ID_PREFIX)
  )
    issues.push(`update_id_must_start_with_forge-memory-update://`);
  if (
    typeof r.created_at !== "string" ||
    !RFC3339_UTC_RE.test(r.created_at)
  )
    issues.push("created_at_must_be_rfc3339_utc");

  const target = asRecord(r.target);
  if (target === null) {
    issues.push("target_must_be_object");
  } else {
    if (
      typeof target.mind_id !== "string" ||
      target.mind_id.trim().length === 0
    )
      issues.push("target.mind_id_required");
    if (target.memory_layer !== "working_memory")
      issues.push("target.memory_layer_must_be_working_memory");
  }

  const source = asRecord(r.source);
  if (source === null) {
    issues.push("source_must_be_object");
  } else {
    if (
      typeof source.task_id !== "string" ||
      !TASK_ID_RE.test(source.task_id)
    )
      issues.push("source.task_id_must_start_with_T");
    if (
      typeof source.artifact_sha256 !== "string" ||
      !ARTIFACT_SHA256_RE.test(source.artifact_sha256)
    )
      issues.push("source.artifact_sha256_required_sha256:<64hex>");
    if (
      typeof source.reason !== "string" ||
      source.reason.trim().length === 0
    )
      issues.push("source.reason_required");
  }

  const facts = r.facts;
  if (!Array.isArray(facts)) {
    issues.push("facts_must_be_array");
  } else {
    if (facts.length === 0) issues.push("facts_must_not_be_empty");
    const seenIds = new Set<string>();
    let prevId: string | null = null;
    for (let i = 0; i < facts.length; i++) {
      const fact = asRecord(facts[i]);
      if (fact === null) {
        issues.push(`fact[${i}]_must_be_object`);
        continue;
      }
      const id = typeof fact.id === "string" ? fact.id : "";
      if (id.length === 0) issues.push(`fact[${i}].id_required`);
      if (
        typeof fact.text !== "string" ||
        fact.text.trim().length === 0
      )
        issues.push(`fact[${i}].text_required`);
      if (
        typeof fact.source_ref !== "string" ||
        fact.source_ref.trim().length === 0
      )
        issues.push(`fact[${i}].source_ref_required`);
      if (
        typeof fact.confidence !== "number" ||
        fact.confidence < 0 ||
        fact.confidence > 1
      )
        issues.push(`fact[${i}].confidence_must_be_0_to_1`);

      const normId = id.toLowerCase();
      if (seenIds.has(normId))
        issues.push(`fact[${i}].duplicate_id:${id}`);
      seenIds.add(normId);

      if (prevId !== null && id.localeCompare(prevId) < 0)
        issues.push(
          `fact[${i}].ordering_violation:${id}_before_${prevId}`,
        );
      prevId = id;

      if (!Array.isArray(fact.tags)) {
        issues.push(`fact[${i}].tags_must_be_array`);
      } else {
        const seenTags = new Set<string>();
        let prevTag: string | null = null;
        for (const tag of fact.tags) {
          if (typeof tag !== "string") {
            issues.push(`fact[${i}].tag_must_be_string`);
            continue;
          }
          if (seenTags.has(tag))
            issues.push(`fact[${i}].duplicate_tag:${tag}`);
          seenTags.add(tag);
          if (prevTag !== null && tag.localeCompare(prevTag) < 0)
            issues.push(`fact[${i}].tags_not_sorted`);
          prevTag = tag;
        }
      }
    }
  }

  const retention = asRecord(r.retention);
  if (retention === null) {
    issues.push("retention_must_be_object");
  } else {
    if (typeof retention.ttl_days !== "number" || retention.ttl_days <= 0)
      issues.push("retention.ttl_days_must_be_positive_number");
    if (
      typeof retention.keep_last_accepted !== "number" ||
      retention.keep_last_accepted < 0
    )
      issues.push("retention.keep_last_accepted_must_be_non_negative_number");
    if (
      typeof retention.keep_last_rejected !== "number" ||
      retention.keep_last_rejected < 0
    )
      issues.push("retention.keep_last_rejected_must_be_non_negative_number");
  }

  const approval = asRecord(r.approval);
  if (approval === null) {
    issues.push("approval_must_be_object");
  } else {
    if (approval.update_requires_pr !== true)
      issues.push("approval.update_requires_pr_must_be_true");
    if (approval.direct_write_allowed !== false)
      issues.push("approval.direct_write_allowed_must_be_false");
  }

  const guards = asRecord(r.guards);
  if (guards === null) {
    issues.push("guards_must_be_object");
  } else {
    const required = [
      "no_direct_forge_write",
      "no_runtime_db_authority",
      "source_refs_required",
      "deterministic_ordering",
      "max_items_enforced",
      "no_eval_score_update",
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
    if (provenance.generated_by !== "forgeroot-memory.working")
      issues.push("provenance.generated_by_mismatch");
    if (provenance.task !== "T030")
      issues.push("provenance.task_must_be_T030");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}
