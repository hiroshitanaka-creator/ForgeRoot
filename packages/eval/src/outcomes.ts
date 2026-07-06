export const MERGE_OUTCOME_VERSION = 1 as const;
export const MERGE_OUTCOME_SCHEMA_REF = "urn:forgeroot:merge-outcome:v1" as const;

export type MergeOutcomeKind = "merged" | "rejected" | "stale" | "reverted" | "quarantined" | "unknown";
export type MergeOutcomeStatus = "ready" | "unknown" | "invalid";
export type ReviewOutcomeKind = "approved" | "changes_requested" | "review_required" | "commented" | "unknown";
export type CiOutcomeKind = "passed" | "failed" | "pending" | "cancelled" | "skipped" | "unknown";

export interface MergeOutcomePullRequestRef {
  readonly repository: string;
  readonly number: number;
  readonly url?: string | null;
  readonly head_ref: string;
  readonly base_ref: string;
  readonly head_sha: string;
  readonly state: "open" | "closed";
  readonly merged?: boolean;
  readonly merged_at?: string | null;
  readonly merge_commit_sha?: string | null;
  readonly closed_at?: string | null;
}

export interface MergeOutcomeCommitTrailerRef {
  readonly key: string;
  readonly value: string;
  readonly source_commit_sha?: string;
}

export interface MergeOutcomeReviewInput {
  readonly outcome: ReviewOutcomeKind;
  readonly reviewed_commit_sha?: string | null;
  readonly reviewer_refs?: readonly string[];
  readonly decided_at?: string | null;
}

export interface MergeOutcomeCiInput {
  readonly outcome: CiOutcomeKind;
  readonly required_check_count: number;
  readonly passed_check_count: number;
  readonly failed_check_names?: readonly string[];
  readonly decided_at?: string | null;
}

export interface MergeOutcomeRevertInput {
  readonly reverted_by_pr?: MergeOutcomePullRequestRef | null;
  readonly revert_commit_sha?: string | null;
  readonly reverted_at?: string | null;
  readonly reason?: string | null;
}

export interface MergeOutcomeQuarantineInput {
  readonly quarantined: boolean;
  readonly reasons: readonly string[];
  readonly policy_ref?: string | null;
  readonly decided_at?: string | null;
}

export interface MergeOutcomeStaleInput {
  readonly stale: boolean;
  readonly stale_as_of: string;
  readonly reason: string;
}

export interface MergeOutcomeSourceInput {
  readonly task_id: string;
  readonly pr: MergeOutcomePullRequestRef;
  readonly commit_trailers: readonly MergeOutcomeCommitTrailerRef[];
}

export interface MergeOutcomeCollectorInput {
  readonly now?: string;
  readonly source: MergeOutcomeSourceInput;
  readonly review?: MergeOutcomeReviewInput;
  readonly ci?: MergeOutcomeCiInput;
  readonly revert?: MergeOutcomeRevertInput | null;
  readonly quarantine?: MergeOutcomeQuarantineInput | null;
  readonly stale?: MergeOutcomeStaleInput | null;
}

export interface MergeOutcomeIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface MergeOutcomeManifest {
  readonly manifest_version: typeof MERGE_OUTCOME_VERSION;
  readonly schema_ref: typeof MERGE_OUTCOME_SCHEMA_REF;
  readonly outcome_id: string;
  readonly collected_at: string;
  readonly status: MergeOutcomeStatus;
  readonly outcome: MergeOutcomeKind;
  readonly reasons: readonly string[];
  readonly source: {
    readonly task_id: string;
    readonly pr: MergeOutcomePullRequestRef;
    readonly commit_trailers: readonly MergeOutcomeCommitTrailerRef[];
  };
  readonly review_outcome: {
    readonly outcome: ReviewOutcomeKind;
    readonly reviewed_commit_sha: string | null;
    readonly reviewer_refs: readonly string[];
    readonly decided_at: string | null;
  };
  readonly ci_outcome: {
    readonly outcome: CiOutcomeKind;
    readonly required_check_count: number;
    readonly passed_check_count: number;
    readonly failed_check_names: readonly string[];
    readonly decided_at: string | null;
  };
  readonly revert_linkage: {
    readonly reverted_by_pr: MergeOutcomePullRequestRef | null;
    readonly revert_commit_sha: string | null;
    readonly reverted_at: string | null;
    readonly reason: string | null;
  };
  readonly quarantine: {
    readonly quarantined: boolean;
    readonly reasons: readonly string[];
    readonly policy_ref: string | null;
    readonly decided_at: string | null;
  };
  readonly stale: {
    readonly stale: boolean;
    readonly stale_as_of: string | null;
    readonly reason: string | null;
  };
  readonly evidence: {
    readonly outcome_evidence: readonly string[];
    readonly missing_outcome_evidence: boolean;
    readonly source_pr_metadata_present: boolean;
    readonly task_ref_present: boolean;
    readonly commit_trailer_refs_present: boolean;
  };
  readonly guards: {
    readonly no_github_api_call: true;
    readonly no_outcome_guessing: true;
    readonly no_score_calculation: true;
    readonly no_memory_write: true;
    readonly no_auto_rollback: true;
  };
  readonly issues?: readonly MergeOutcomeIssue[];
}

export interface MergeOutcomeValidationResult {
  readonly ok: boolean;
  readonly issues: readonly MergeOutcomeIssue[];
}

export const MERGE_OUTCOME_CONTRACT = {
  consumes: ["source_pr_metadata", "review_outcome", "ci_outcome", "revert_linkage", "commit_trailer_refs"],
  produces: ["merge_outcome_manifest"],
  validates: ["source_pr_metadata_reference", "task_ref", "commit_trailer_refs", "review_outcome", "ci_outcome", "revert_linkage"],
  distinguishes: ["merged", "rejected", "stale", "reverted", "quarantined", "unknown"],
  forbids: ["github_api_polling", "outcome_guessing", "score_calculation", "memory_write", "auto_rollback"],
  deterministic: true,
  manifestOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-06T00:00:00Z";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_REF = /^[A-Za-z0-9._\/-]+$/;
const SHA = /^(?:[a-f0-9]{7,64}|sha256:[a-f0-9]{64})$/;
const TASK_ID = /^T[0-9]{3}(?:[-_][A-Za-z0-9._-]+)?$/;
const REVIEW_OUTCOMES = new Set(["approved", "changes_requested", "review_required", "commented", "unknown"]);
const CI_OUTCOMES = new Set(["passed", "failed", "pending", "cancelled", "skipped", "unknown"]);

type EvidenceResolution = Pick<MergeOutcomeManifest, "status" | "outcome" | "reasons"> & { readonly evidence: readonly string[] };

export function collectMergeOutcome(input: MergeOutcomeCollectorInput): MergeOutcomeManifest {
  const issues = validateInput(input);
  const collectedAt = resolveTimestamp(input?.now, DEFAULT_NOW);
  if (collectedAt === null) issues.push(issue("now", "invalid_timestamp", "now must be RFC3339 UTC when provided"));

  const base = manifestBase(input, collectedAt ?? DEFAULT_NOW);
  if (issues.length > 0) {
    return {
      ...base,
      status: "invalid",
      outcome: "unknown",
      reasons: unique(["invalid_merge_outcome_input", ...issues.map((entry) => entry.code)]),
      evidence: { ...base.evidence, outcome_evidence: [], missing_outcome_evidence: true },
      issues,
    };
  }

  const resolution = resolveOutcome(input);
  return {
    ...base,
    status: resolution.status,
    outcome: resolution.outcome,
    reasons: resolution.reasons,
    evidence: { ...base.evidence, outcome_evidence: resolution.evidence, missing_outcome_evidence: resolution.outcome === "unknown" },
  };
}

export function validateMergeOutcomeManifest(manifest: MergeOutcomeManifest): MergeOutcomeValidationResult {
  const issues: MergeOutcomeIssue[] = [];
  if (manifest.manifest_version !== MERGE_OUTCOME_VERSION) issues.push(issue("manifest_version", "invalid_manifest_version", "manifest_version must be 1"));
  if (manifest.schema_ref !== MERGE_OUTCOME_SCHEMA_REF) issues.push(issue("schema_ref", "invalid_schema_ref", "schema_ref must identify merge outcome v1"));
  if (!RFC3339_UTC.test(manifest.collected_at)) issues.push(issue("collected_at", "invalid_timestamp", "collected_at must be RFC3339 UTC"));
  if (!manifest.outcome_id.startsWith("merge-outcome-")) issues.push(issue("outcome_id", "invalid_outcome_id", "outcome_id must use merge-outcome prefix"));
  if (!["ready", "unknown", "invalid"].includes(manifest.status)) issues.push(issue("status", "invalid_status", "status is not allowed"));
  if (!["merged", "rejected", "stale", "reverted", "quarantined", "unknown"].includes(manifest.outcome)) issues.push(issue("outcome", "invalid_outcome", "outcome is not allowed"));
  if (manifest.status === "ready" && manifest.outcome === "unknown") issues.push(issue("outcome", "ready_requires_known_outcome", "ready outcome manifests must have explicit outcome evidence"));
  if (manifest.status === "unknown" && manifest.evidence.missing_outcome_evidence !== true) issues.push(issue("evidence.missing_outcome_evidence", "unknown_requires_missing_evidence", "unknown status must record missing evidence"));
  if (manifest.guards.no_github_api_call !== true) issues.push(issue("guards.no_github_api_call", "guard_must_be_true", "collector must not call GitHub APIs"));
  if (manifest.guards.no_outcome_guessing !== true) issues.push(issue("guards.no_outcome_guessing", "guard_must_be_true", "collector must not guess outcomes"));
  if (manifest.guards.no_score_calculation !== true) issues.push(issue("guards.no_score_calculation", "guard_must_be_true", "collector must not calculate scores"));
  if (manifest.guards.no_memory_write !== true) issues.push(issue("guards.no_memory_write", "guard_must_be_true", "collector must not write memory"));
  if (manifest.guards.no_auto_rollback !== true) issues.push(issue("guards.no_auto_rollback", "guard_must_be_true", "collector must not roll back"));
  return { ok: issues.length === 0, issues };
}

function validateInput(input: MergeOutcomeCollectorInput): MergeOutcomeIssue[] {
  const issues: MergeOutcomeIssue[] = [];
  if (!input || typeof input !== "object") return [issue("input", "must_be_object", "input must be an object")];
  validateSource(issues, input.source);
  validateReview(issues, input.review);
  validateCi(issues, input.ci);
  validateRevert(issues, input.revert);
  validateQuarantine(issues, input.quarantine);
  validateStale(issues, input.stale);
  return issues;
}

function validateSource(issues: MergeOutcomeIssue[], source: MergeOutcomeSourceInput): void {
  if (!source || typeof source !== "object") {
    issues.push(issue("source", "required", "source is required"));
    return;
  }
  if (typeof source.task_id !== "string" || !TASK_ID.test(source.task_id)) issues.push(issue("source.task_id", "invalid_task_id", "source.task_id must be a T### task reference"));
  validatePr(issues, "source.pr", source.pr);
  if (!Array.isArray(source.commit_trailers) || source.commit_trailers.length === 0) {
    issues.push(issue("source.commit_trailers", "commit_trailers_required", "commit trailer refs are required"));
  } else {
    source.commit_trailers.forEach((trailer, index) => validateTrailer(issues, `source.commit_trailers.${index}`, trailer));
  }
}

function validatePr(issues: MergeOutcomeIssue[], path: string, pr: MergeOutcomePullRequestRef | null | undefined): void {
  if (!pr || typeof pr !== "object") {
    issues.push(issue(path, "required", "pull request metadata is required"));
    return;
  }
  if (typeof pr.repository !== "string" || !REPOSITORY.test(pr.repository)) issues.push(issue(`${path}.repository`, "invalid_repository", "repository must be owner/repo"));
  if (!Number.isSafeInteger(pr.number) || pr.number <= 0) issues.push(issue(`${path}.number`, "invalid_number", "pull request number must be a positive integer"));
  if (pr.url !== undefined && pr.url !== null && (typeof pr.url !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[0-9]+$/.test(pr.url))) issues.push(issue(`${path}.url`, "invalid_url", "pull request url must be a GitHub PR URL"));
  if (typeof pr.head_ref !== "string" || !SAFE_REF.test(pr.head_ref) || pr.head_ref === pr.base_ref) issues.push(issue(`${path}.head_ref`, "invalid_head_ref", "head_ref must be a safe non-base ref"));
  if (typeof pr.base_ref !== "string" || !SAFE_REF.test(pr.base_ref)) issues.push(issue(`${path}.base_ref`, "invalid_base_ref", "base_ref must be safe"));
  if (typeof pr.head_sha !== "string" || !SHA.test(pr.head_sha)) issues.push(issue(`${path}.head_sha`, "invalid_sha", "head_sha must be a commit sha"));
  if (pr.state !== "open" && pr.state !== "closed") issues.push(issue(`${path}.state`, "invalid_state", "state must be open or closed"));
  if (pr.merged !== undefined && typeof pr.merged !== "boolean") issues.push(issue(`${path}.merged`, "invalid_boolean", "merged must be boolean when provided"));
  if (pr.merged_at !== undefined && pr.merged_at !== null && !RFC3339_UTC.test(pr.merged_at)) issues.push(issue(`${path}.merged_at`, "invalid_timestamp", "merged_at must be RFC3339 UTC"));
  if (pr.merge_commit_sha !== undefined && pr.merge_commit_sha !== null && !SHA.test(pr.merge_commit_sha)) issues.push(issue(`${path}.merge_commit_sha`, "invalid_sha", "merge_commit_sha must be a commit sha"));
  if (pr.closed_at !== undefined && pr.closed_at !== null && !RFC3339_UTC.test(pr.closed_at)) issues.push(issue(`${path}.closed_at`, "invalid_timestamp", "closed_at must be RFC3339 UTC"));
}

function validateTrailer(issues: MergeOutcomeIssue[], path: string, trailer: MergeOutcomeCommitTrailerRef): void {
  if (!trailer || typeof trailer !== "object") {
    issues.push(issue(path, "must_be_object", "commit trailer ref must be an object"));
    return;
  }
  if (typeof trailer.key !== "string" || trailer.key.length === 0) issues.push(issue(`${path}.key`, "required", "commit trailer key is required"));
  if (typeof trailer.value !== "string" || trailer.value.length === 0) issues.push(issue(`${path}.value`, "required", "commit trailer value is required"));
  if (trailer.source_commit_sha !== undefined && (typeof trailer.source_commit_sha !== "string" || !SHA.test(trailer.source_commit_sha))) issues.push(issue(`${path}.source_commit_sha`, "invalid_sha", "source_commit_sha must be a commit sha"));
}

function validateReview(issues: MergeOutcomeIssue[], review: MergeOutcomeReviewInput | null | undefined): void {
  if (review === undefined) return;
  if (!review || typeof review !== "object") {
    issues.push(issue("review", "must_be_object", "review must be an object when provided"));
    return;
  }
  if (!REVIEW_OUTCOMES.has(review.outcome)) issues.push(issue("review.outcome", "invalid_review_outcome", "review outcome is not allowed"));
  if (review.reviewed_commit_sha !== undefined && review.reviewed_commit_sha !== null && !SHA.test(review.reviewed_commit_sha)) issues.push(issue("review.reviewed_commit_sha", "invalid_sha", "reviewed_commit_sha must be a commit sha"));
  if (review.decided_at !== undefined && review.decided_at !== null && !RFC3339_UTC.test(review.decided_at)) issues.push(issue("review.decided_at", "invalid_timestamp", "decided_at must be RFC3339 UTC"));
  if (review.reviewer_refs !== undefined && (!Array.isArray(review.reviewer_refs) || review.reviewer_refs.some((ref) => typeof ref !== "string" || ref.length === 0))) issues.push(issue("review.reviewer_refs", "invalid_refs", "reviewer_refs must be non-empty strings"));
}

function validateCi(issues: MergeOutcomeIssue[], ci: MergeOutcomeCiInput | null | undefined): void {
  if (ci === undefined) return;
  if (!ci || typeof ci !== "object") {
    issues.push(issue("ci", "must_be_object", "ci must be an object when provided"));
    return;
  }
  if (!CI_OUTCOMES.has(ci.outcome)) issues.push(issue("ci.outcome", "invalid_ci_outcome", "CI outcome is not allowed"));
  if (!Number.isSafeInteger(ci.required_check_count) || ci.required_check_count < 0) issues.push(issue("ci.required_check_count", "invalid_count", "required_check_count must be non-negative integer"));
  if (!Number.isSafeInteger(ci.passed_check_count) || ci.passed_check_count < 0) issues.push(issue("ci.passed_check_count", "invalid_count", "passed_check_count must be non-negative integer"));
  if (Number.isSafeInteger(ci.required_check_count) && Number.isSafeInteger(ci.passed_check_count) && ci.passed_check_count > ci.required_check_count) issues.push(issue("ci.passed_check_count", "count_mismatch", "passed_check_count cannot exceed required_check_count"));
  if (ci.failed_check_names !== undefined && (!Array.isArray(ci.failed_check_names) || ci.failed_check_names.some((name) => typeof name !== "string" || name.length === 0))) issues.push(issue("ci.failed_check_names", "invalid_names", "failed_check_names must be non-empty strings"));
  if (ci.decided_at !== undefined && ci.decided_at !== null && !RFC3339_UTC.test(ci.decided_at)) issues.push(issue("ci.decided_at", "invalid_timestamp", "decided_at must be RFC3339 UTC"));
}

function validateRevert(issues: MergeOutcomeIssue[], revert: MergeOutcomeRevertInput | null | undefined): void {
  if (revert === undefined || revert === null) return;
  if (typeof revert !== "object") {
    issues.push(issue("revert", "must_be_object", "revert must be an object when provided"));
    return;
  }
  if (revert.reverted_by_pr !== undefined && revert.reverted_by_pr !== null) validatePr(issues, "revert.reverted_by_pr", revert.reverted_by_pr);
  if (revert.revert_commit_sha !== undefined && revert.revert_commit_sha !== null && !SHA.test(revert.revert_commit_sha)) issues.push(issue("revert.revert_commit_sha", "invalid_sha", "revert_commit_sha must be a commit sha"));
  if (revert.reverted_at !== undefined && revert.reverted_at !== null && !RFC3339_UTC.test(revert.reverted_at)) issues.push(issue("revert.reverted_at", "invalid_timestamp", "reverted_at must be RFC3339 UTC"));
}

function validateQuarantine(issues: MergeOutcomeIssue[], quarantine: MergeOutcomeQuarantineInput | null | undefined): void {
  if (quarantine === undefined || quarantine === null) return;
  if (typeof quarantine !== "object") {
    issues.push(issue("quarantine", "must_be_object", "quarantine must be an object when provided"));
    return;
  }
  const reasons = Array.isArray(quarantine.reasons) ? quarantine.reasons : [];
  if (typeof quarantine.quarantined !== "boolean") issues.push(issue("quarantine.quarantined", "invalid_boolean", "quarantined must be boolean"));
  if (!Array.isArray(quarantine.reasons) || quarantine.reasons.some((reason) => typeof reason !== "string" || reason.length === 0)) issues.push(issue("quarantine.reasons", "invalid_reasons", "quarantine reasons must be non-empty strings"));
  if (quarantine.quarantined === true && reasons.length === 0) issues.push(issue("quarantine.reasons", "reasons_required", "quarantine evidence requires reasons"));
  if (quarantine.policy_ref !== undefined && quarantine.policy_ref !== null && (typeof quarantine.policy_ref !== "string" || quarantine.policy_ref.length === 0)) issues.push(issue("quarantine.policy_ref", "invalid_ref", "policy_ref must be a non-empty string"));
  if (quarantine.decided_at !== undefined && quarantine.decided_at !== null && !RFC3339_UTC.test(quarantine.decided_at)) issues.push(issue("quarantine.decided_at", "invalid_timestamp", "decided_at must be RFC3339 UTC"));
}

function validateStale(issues: MergeOutcomeIssue[], stale: MergeOutcomeStaleInput | null | undefined): void {
  if (stale === undefined || stale === null) return;
  if (typeof stale !== "object") {
    issues.push(issue("stale", "must_be_object", "stale must be an object when provided"));
    return;
  }
  if (typeof stale.stale !== "boolean") issues.push(issue("stale.stale", "invalid_boolean", "stale must be boolean"));
  if (typeof stale.stale_as_of !== "string" || !RFC3339_UTC.test(stale.stale_as_of)) issues.push(issue("stale.stale_as_of", "invalid_timestamp", "stale_as_of must be RFC3339 UTC"));
  if (typeof stale.reason !== "string" || stale.reason.length === 0) issues.push(issue("stale.reason", "required", "stale reason is required"));
}

function manifestBase(input: MergeOutcomeCollectorInput, collectedAt: string): Omit<MergeOutcomeManifest, "status" | "outcome" | "reasons"> {
  const source = input?.source;
  const pr = normalizePr(source?.pr);
  const review = input?.review;
  const ci = input?.ci;
  const revert = input?.revert ?? null;
  const quarantine = input?.quarantine ?? null;
  const stale = input?.stale ?? null;
  const reviewOutcome = REVIEW_OUTCOMES.has(String(review?.outcome)) ? (review?.outcome as ReviewOutcomeKind) : "unknown";
  const ciOutcome = CI_OUTCOMES.has(String(ci?.outcome)) ? (ci?.outcome as CiOutcomeKind) : "unknown";
  return {
    manifest_version: MERGE_OUTCOME_VERSION,
    schema_ref: MERGE_OUTCOME_SCHEMA_REF,
    outcome_id: stableId("merge-outcome", [collectedAt, source?.task_id ?? "", pr.repository ?? "", String(pr.number ?? ""), pr.head_sha ?? "", pr.merge_commit_sha ?? "", revert?.revert_commit_sha ?? ""]),
    collected_at: collectedAt,
    source: {
      task_id: typeof source?.task_id === "string" ? source.task_id : "",
      pr,
      commit_trailers: normalizeTrailers(source?.commit_trailers),
    },
    review_outcome: {
      outcome: reviewOutcome,
      reviewed_commit_sha: stringOrNull(review?.reviewed_commit_sha),
      reviewer_refs: Array.isArray(review?.reviewer_refs) ? review.reviewer_refs : [],
      decided_at: stringOrNull(review?.decided_at),
    },
    ci_outcome: {
      outcome: ciOutcome,
      required_check_count: integerOrZero(ci?.required_check_count),
      passed_check_count: integerOrZero(ci?.passed_check_count),
      failed_check_names: Array.isArray(ci?.failed_check_names) ? ci.failed_check_names : [],
      decided_at: stringOrNull(ci?.decided_at),
    },
    revert_linkage: {
      reverted_by_pr: revert?.reverted_by_pr && typeof revert.reverted_by_pr === "object" ? normalizePr(revert.reverted_by_pr) : null,
      revert_commit_sha: stringOrNull(revert?.revert_commit_sha),
      reverted_at: stringOrNull(revert?.reverted_at),
      reason: stringOrNull(revert?.reason),
    },
    quarantine: {
      quarantined: quarantine?.quarantined === true,
      reasons: Array.isArray(quarantine?.reasons) ? quarantine.reasons : [],
      policy_ref: stringOrNull(quarantine?.policy_ref),
      decided_at: stringOrNull(quarantine?.decided_at),
    },
    stale: {
      stale: stale?.stale === true,
      stale_as_of: stringOrNull(stale?.stale_as_of),
      reason: stringOrNull(stale?.reason),
    },
    evidence: {
      outcome_evidence: [],
      missing_outcome_evidence: true,
      source_pr_metadata_present: prMetadataPresent(source?.pr),
      task_ref_present: typeof source?.task_id === "string" && TASK_ID.test(source.task_id),
      commit_trailer_refs_present: Array.isArray(source?.commit_trailers) && source.commit_trailers.length > 0,
    },
    guards: {
      no_github_api_call: true,
      no_outcome_guessing: true,
      no_score_calculation: true,
      no_memory_write: true,
      no_auto_rollback: true,
    },
  };
}

function resolveOutcome(input: MergeOutcomeCollectorInput): EvidenceResolution {
  const evidence: string[] = [];
  if (input.quarantine?.quarantined === true) {
    evidence.push("quarantine.quarantined:true", ...input.quarantine.reasons.map((reason) => `quarantine.reason:${reason}`));
    return { status: "ready", outcome: "quarantined", reasons: unique(["explicit_quarantine_evidence"]), evidence };
  }
  if (input.revert?.revert_commit_sha || input.revert?.reverted_by_pr) {
    evidence.push(input.revert.revert_commit_sha ? `revert.commit:${input.revert.revert_commit_sha}` : "revert.pr", input.revert.reverted_by_pr ? `revert.pr:${input.revert.reverted_by_pr.repository}#${input.revert.reverted_by_pr.number}` : "");
    return { status: "ready", outcome: "reverted", reasons: unique(["explicit_revert_linkage"]), evidence: evidence.filter(Boolean) };
  }
  if (input.source.pr.merged === true && typeof input.source.pr.merge_commit_sha === "string") {
    evidence.push("source.pr.merged:true", `source.pr.merge_commit_sha:${input.source.pr.merge_commit_sha}`);
    return { status: "ready", outcome: "merged", reasons: unique(["explicit_merge_metadata"]), evidence };
  }
  if (input.review?.outcome === "changes_requested" && input.source.pr.state === "closed" && input.source.pr.merged === false) {
    evidence.push("review.outcome:changes_requested", "source.pr.state:closed", "source.pr.merged:false");
    return { status: "ready", outcome: "rejected", reasons: unique(["explicit_review_rejection"]), evidence };
  }
  if (input.stale?.stale === true) {
    evidence.push("stale.stale:true", `stale.stale_as_of:${input.stale.stale_as_of}`, `stale.reason:${input.stale.reason}`);
    return { status: "ready", outcome: "stale", reasons: unique(["explicit_stale_evidence"]), evidence };
  }
  return { status: "unknown", outcome: "unknown", reasons: ["missing_explicit_outcome_evidence"], evidence: [] };
}

function emptyPr(): MergeOutcomePullRequestRef {
  return { repository: "", number: 0, url: null, head_ref: "", base_ref: "", head_sha: "", state: "open", merged: false, merged_at: null, merge_commit_sha: null, closed_at: null };
}

function normalizePr(pr: MergeOutcomePullRequestRef | null | undefined): MergeOutcomePullRequestRef {
  if (!pr || typeof pr !== "object") return emptyPr();
  return {
    repository: stringOrEmpty(pr.repository),
    number: Number.isSafeInteger(pr.number) ? pr.number : 0,
    url: stringOrNull(pr.url),
    head_ref: stringOrEmpty(pr.head_ref),
    base_ref: stringOrEmpty(pr.base_ref),
    head_sha: stringOrEmpty(pr.head_sha),
    state: pr.state === "closed" ? "closed" : "open",
    merged: typeof pr.merged === "boolean" ? pr.merged : false,
    merged_at: stringOrNull(pr.merged_at),
    merge_commit_sha: stringOrNull(pr.merge_commit_sha),
    closed_at: stringOrNull(pr.closed_at),
  };
}

function normalizeTrailers(value: unknown): MergeOutcomeCommitTrailerRef[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const trailer = entry as Partial<MergeOutcomeCommitTrailerRef>;
      const base = { key: stringOrEmpty(trailer.key), value: stringOrEmpty(trailer.value) };
      return typeof trailer.source_commit_sha === "string" ? { ...base, source_commit_sha: trailer.source_commit_sha } : base;
    })
    .filter((entry): entry is MergeOutcomeCommitTrailerRef => entry !== null);
}

function stringOrEmpty(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function integerOrZero(value: unknown): number {
  return Number.isSafeInteger(value) ? (value as number) : 0;
}

function prMetadataPresent(pr: MergeOutcomePullRequestRef | undefined): boolean {
  return typeof pr?.repository === "string" && REPOSITORY.test(pr.repository) && Number.isSafeInteger(pr.number) && pr.number > 0 && typeof pr.head_sha === "string" && SHA.test(pr.head_sha);
}

function resolveTimestamp(value: string | undefined, fallback: string): string | null {
  return value === undefined ? fallback : RFC3339_UTC.test(value) ? value : null;
}

function issue(path: string, code: string, message: string): MergeOutcomeIssue {
  return { path, code, message };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export const collectPrOutcome = collectMergeOutcome;
export const collectPullRequestOutcome = collectMergeOutcome;
export const validateT036MergeOutcomeManifest = validateMergeOutcomeManifest;
