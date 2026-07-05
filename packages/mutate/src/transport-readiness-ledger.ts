import { validateMutationPrTransportResult } from "./mutation-pr-transport.js";
import type { MutationPrTransportResult } from "./mutation-pr-transport.js";

export const TRANSPORT_READINESS_LEDGER_VERSION = 1 as const;
export const TRANSPORT_READINESS_LEDGER_SCHEMA_REF = "urn:forgeroot:transport-readiness-ledger:v1" as const;

export type TransportReadinessStatus = "ready" | "blocked" | "invalid";
export type TransportReadinessDecision = "transport_replay_ready" | "transport_replay_blocked" | "invalid_transport_replay_input";
export type TransportReadinessCheckStatus = "pass" | "fail" | "pending";
export type TransportReadinessCheckCategory = "manifest" | "dry_run" | "review" | "endpoint" | "token" | "git" | "approval" | "manual";

export interface TransportReadinessInput {
  readonly now?: string;
  readonly request: MutationPrTransportResult;
  readonly checks?: readonly TransportReadinessCheckInput[];
  readonly required_check_ids?: readonly string[];
}

export interface TransportReadinessCheckInput {
  readonly check_id: string;
  readonly category: TransportReadinessCheckCategory;
  readonly status: TransportReadinessCheckStatus;
  readonly summary: string;
  readonly evidence_digest?: string;
}

export interface TransportReadinessIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface TransportReadinessCheck {
  readonly check_id: string;
  readonly category: TransportReadinessCheckCategory;
  readonly status: TransportReadinessCheckStatus;
  readonly required: boolean;
  readonly summary: string;
  readonly evidence_digest: string;
}

export interface TransportReadinessLedgerResult {
  readonly manifest_version: typeof TRANSPORT_READINESS_LEDGER_VERSION;
  readonly schema_ref: typeof TRANSPORT_READINESS_LEDGER_SCHEMA_REF;
  readonly ledger_id: string;
  readonly created_at: string;
  readonly status: TransportReadinessStatus;
  readonly decision: TransportReadinessDecision;
  readonly reasons: readonly string[];
  readonly request_ref: {
    readonly request_id: string;
    readonly request_digest: string;
    readonly request_status: string;
    readonly plan_id: string | null;
    readonly repository_full_name: string | null;
  };
  readonly checks: readonly TransportReadinessCheck[];
  readonly summary: {
    readonly pass_count: number;
    readonly fail_count: number;
    readonly pending_count: number;
    readonly required_check_ids: readonly string[];
    readonly missing_required_check_ids: readonly string[];
  };
  readonly runtime_gate: {
    readonly operation: "replay_transport_readiness";
    readonly live_transport_allowed: false;
    readonly dry_run_only: true;
  };
  readonly guards: {
    readonly t052_valid_manifest_required: true;
    readonly no_token_request: true;
    readonly no_token_persistence: true;
    readonly no_github_api_call: true;
    readonly no_git_push: true;
    readonly no_branch_creation: true;
    readonly no_merge_operation: true;
    readonly no_approval_record_write: true;
    readonly no_mutation_execution: true;
    readonly no_file_write: true;
  };
  readonly dry_run: {
    readonly github_api_called: false;
    readonly token_requested: false;
    readonly token_persisted: false;
    readonly branch_created: false;
    readonly git_push_performed: false;
    readonly approval_record_written: false;
    readonly mutation_executed: false;
    readonly file_written: false;
    readonly auto_merged: false;
  };
  readonly ledger_digest: string;
  readonly issues?: readonly TransportReadinessIssue[];
}

export interface TransportReadinessValidationResult {
  readonly ok: boolean;
  readonly issues: readonly TransportReadinessIssue[];
}

export const TRANSPORT_READINESS_LEDGER_CONTRACT = {
  consumes: ["dry_run_mutation_pr_transport_request_manifest"],
  produces: ["transport_readiness_replay_ledger"],
  validates: ["t052_read_back_validation", "required_checks_pass", "human_review_gate_present", "dry_run_only", "no_live_transport"],
  forbids: ["live_github_transport", "token_request", "token_persistence", "git_push", "branch_creation", "merge_operation", "approval_record_write", "mutation_execution", "file_write"],
  deterministic: true,
  ledgerOnly: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const CHECK_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const CATEGORIES = new Set(["manifest", "dry_run", "review", "endpoint", "token", "git", "approval", "manual"]);
const STATUSES = new Set(["pass", "fail", "pending"]);

export function runTransportReadinessLedger(input: unknown): TransportReadinessLedgerResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.request.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];
  if (issues.length > 0 || envelope.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.request, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "readiness input must be an object" }]);

  const requestValidation = validateMutationPrTransportResult(envelope.input.request);
  if (!requestValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.request, [
      { path: "request", code: "invalid_t052_transport_manifest", message: "request must pass T052 read-back validation" },
      ...requestValidation.issues.map((entry) => ({ path: `request.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }

  const baseChecks = derivedChecks(envelope.input.request);
  const inputChecks = envelope.input.checks ?? [];
  const checkIds = new Set([...baseChecks, ...inputChecks].map((entry) => entry.check_id));
  const requiredCheckIds = envelope.input.required_check_ids ?? [...checkIds];
  const checks: TransportReadinessCheck[] = [...baseChecks, ...inputChecks].map((entry) => ({
    ...entry,
    required: requiredCheckIds.includes(entry.check_id),
    evidence_digest: entry.evidence_digest ?? canonicalDigest({ check_id: entry.check_id, category: entry.category, status: entry.status, summary: entry.summary }),
  }));
  const summary = summarizeChecks(checks, requiredCheckIds);
  const status: TransportReadinessStatus = summary.fail_count === 0 && summary.pending_count === 0 && summary.missing_required_check_ids.length === 0 ? "ready" : "blocked";
  const result = resultFor(createdAt ?? DEFAULT_NOW, envelope.input.request, checks, summary, status);
  const validation = validateTransportReadinessLedgerResult(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.request, validation.issues);
  return result;
}

export function validateTransportReadinessLedgerResult(result: unknown): TransportReadinessValidationResult {
  const issues: TransportReadinessIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "readiness ledger result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== TRANSPORT_READINESS_LEDGER_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== TRANSPORT_READINESS_LEDGER_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T053 readiness ledger v1");
  if (typeof result.ledger_id !== "string" || !ID.test(result.ledger_id)) issue(issues, "ledger_id", "invalid_ledger_id", "ledger_id must be deterministic");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "ready" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be ready, blocked, or invalid");
  if (result.decision !== "transport_replay_ready" && result.decision !== "transport_replay_blocked" && result.decision !== "invalid_transport_replay_input") issue(issues, "decision", "invalid_decision", "decision must be a T053 readiness decision");
  validateRequestRef(result.request_ref, issues);
  const checks = validateChecks(result.checks, issues, result.status === "invalid");
  const summary = validateSummary(result.summary, checks, issues, result.status === "invalid");
  validateRuntimeGate(result.runtime_gate, issues);
  validateGuards(result.guards, issues);
  validateDryRun(result.dry_run, issues);
  validateNoSecretMaterial(result, "result", issues);

  if (result.status === "ready") validateReady(result, summary, issues);
  if (result.status === "blocked") validateBlocked(result, summary, issues);
  if (result.status === "invalid") validateInvalid(result, issues);

  if (typeof result.ledger_digest !== "string" || result.ledger_digest !== canonicalDigest(ledgerDigestPayload(result as unknown as TransportReadinessLedgerResult))) issue(issues, "ledger_digest", "ledger_digest_mismatch", "ledger digest must cover readiness payload");
  if (typeof result.ledger_id === "string" && typeof result.ledger_digest === "string" && result.ledger_id !== stableId("transport-readiness", [result.ledger_digest])) issue(issues, "ledger_id", "ledger_id_mismatch", "ledger_id must match deterministic readiness payload");
  return { ok: issues.length === 0, issues };
}

function resultFor(createdAt: string, request: MutationPrTransportResult, checks: readonly TransportReadinessCheck[], summary: TransportReadinessLedgerResult["summary"], status: "ready" | "blocked"): TransportReadinessLedgerResult {
  const draft: Omit<TransportReadinessLedgerResult, "ledger_id" | "ledger_digest"> = {
    manifest_version: TRANSPORT_READINESS_LEDGER_VERSION,
    schema_ref: TRANSPORT_READINESS_LEDGER_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "ready" ? "transport_replay_ready" : "transport_replay_blocked",
    reasons: status === "ready" ? ["t052_transport_manifest_valid", "required_checks_pass", "live_transport_not_performed"] : reasonsForBlocked(summary),
    request_ref: requestRefFor(request),
    checks,
    summary,
    runtime_gate: runtimeGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
  };
  const digest = canonicalDigest(ledgerDigestPayload(draft));
  return { ...draft, ledger_id: stableId("transport-readiness", [digest]), ledger_digest: digest };
}

function invalidResult(createdAt: string, request: MutationPrTransportResult, issues: readonly TransportReadinessIssue[]): TransportReadinessLedgerResult {
  const summary = { pass_count: 0, fail_count: 0, pending_count: 0, required_check_ids: [], missing_required_check_ids: [] };
  const draft: Omit<TransportReadinessLedgerResult, "ledger_id" | "ledger_digest"> = {
    manifest_version: TRANSPORT_READINESS_LEDGER_VERSION,
    schema_ref: TRANSPORT_READINESS_LEDGER_SCHEMA_REF,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_transport_replay_input",
    reasons: uniqueStrings(["invalid_transport_replay_input", ...issues.map((entry) => entry.code)]),
    request_ref: requestRefFor(request),
    checks: [],
    summary,
    runtime_gate: runtimeGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
    issues,
  };
  const digest = canonicalDigest(ledgerDigestPayload(draft));
  return { ...draft, ledger_id: stableId("transport-readiness", [digest]), ledger_digest: digest };
}

function derivedChecks(request: MutationPrTransportResult): readonly TransportReadinessCheck[] {
  return [
    check("t052-manifest-ready", "manifest", request.status === "transport_request_ready", "T052 transport manifest is ready"),
    check("dry-run-only", "dry_run", request.dry_run === true && request.runtime_gate.live_transport_allowed === false && request.runtime_gate.dry_run_only === true, "transport manifest is dry-run only"),
    check("class-c-human-review-gate", "review", request.review_gate.approval_class === "C" && request.review_gate.human_review_required_before_execution === true && request.review_gate.human_review_required_before_merge === true, "Class C human review gates are present"),
    check("safe-pr-endpoint", "endpoint", request.status === "transport_request_ready" && request.primary_request?.method === "POST" && typeof request.primary_request.path === "string" && request.primary_request.path.endsWith("/pulls") && !request.primary_request.path.includes("/merge"), "primary request targets the PR creation endpoint only"),
    check("no-token-request", "token", request.guards.no_token_request === true && request.guards.no_token_persistence === true, "token requests and persistence are disabled"),
    check("no-git-or-merge", "git", request.guards.no_git_push === true && request.guards.no_branch_creation === true && request.guards.no_merge_operation === true && request.guards.no_default_branch_write === true, "git push, branch creation, merge, and default branch writes are disabled"),
    check("no-approval-or-mutation-write", "approval", request.guards.no_approval_record_write === true && request.guards.no_mutation_execution === true && request.guards.no_github_api_call === true, "approval writes, mutation execution, and GitHub API calls are disabled"),
  ];
}

function check(checkId: string, category: TransportReadinessCheckCategory, passed: boolean, summary: string): TransportReadinessCheck {
  return { check_id: checkId, category, status: passed ? "pass" : "fail", required: true, summary, evidence_digest: canonicalDigest({ checkId, category, passed, summary }) };
}

function summarizeChecks(checks: readonly TransportReadinessCheck[], requiredCheckIds: readonly string[]): TransportReadinessLedgerResult["summary"] {
  const byId = new Map(checks.map((entry) => [entry.check_id, entry]));
  const required = uniqueStrings(requiredCheckIds);
  const requiredChecks = required.map((entry) => byId.get(entry)).filter((entry): entry is TransportReadinessCheck => entry !== undefined);
  return {
    pass_count: requiredChecks.filter((entry) => entry.status === "pass").length,
    fail_count: requiredChecks.filter((entry) => entry.status === "fail").length,
    pending_count: requiredChecks.filter((entry) => entry.status === "pending").length,
    required_check_ids: required,
    missing_required_check_ids: required.filter((entry) => !byId.has(entry)),
  };
}

function normalizeInput(input: unknown): {
  readonly input: TransportReadinessInput | null;
  readonly now?: string;
  readonly request: MutationPrTransportResult;
  readonly issues: readonly TransportReadinessIssue[];
} {
  const issues: TransportReadinessIssue[] = [];
  if (!isRecord(input)) return { input: null, request: emptyRequest(), issues: [{ path: "input", code: "input_must_be_object", message: "readiness input must be an object" }] };
  const request = isRecord(input.request) ? input.request as unknown as MutationPrTransportResult : emptyRequest();
  if (!isRecord(input.request)) issue(issues, "request", "request_must_be_object", "request must be a T052 result object");
  const now = optionalString(input.now, "now", issues);
  const checks = normalizeChecks(input.checks, issues);
  const required = normalizeCheckIds(input.required_check_ids, "required_check_ids", issues);
  return { input: { request, ...(now === undefined ? {} : { now }), ...(checks === undefined ? {} : { checks }), ...(required === undefined ? {} : { required_check_ids: required }) }, now, request, issues };
}

function normalizeChecks(value: unknown, issues: TransportReadinessIssue[]): readonly TransportReadinessCheckInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issue(issues, "checks", "checks_must_be_array", "checks must be an array when provided");
    return [];
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const path = `checks[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, path, "check_must_be_object", "check must be an object");
      return { check_id: "", category: "manual", status: "fail", summary: "" };
    }
    const checkId = typeof entry.check_id === "string" ? entry.check_id : "";
    if (!CHECK_ID.test(checkId)) issue(issues, `${path}.check_id`, "invalid_check_id", "check_id must be lowercase kebab-case");
    if (seen.has(checkId)) issue(issues, `${path}.check_id`, "duplicate_check_id", "check_id values must be unique");
    seen.add(checkId);
    const category = typeof entry.category === "string" && CATEGORIES.has(entry.category) ? entry.category as TransportReadinessCheckCategory : "manual";
    if (entry.category !== category) issue(issues, `${path}.category`, "invalid_category", "category must be a known readiness category");
    const status = typeof entry.status === "string" && STATUSES.has(entry.status) ? entry.status as TransportReadinessCheckStatus : "fail";
    if (entry.status !== status) issue(issues, `${path}.status`, "invalid_check_status", "status must be pass, fail, or pending");
    const summary = typeof entry.summary === "string" && entry.summary.trim().length > 0 ? entry.summary.trim() : "";
    if (summary.length === 0) issue(issues, `${path}.summary`, "summary_required", "summary is required");
    const evidenceDigest = optionalString(entry.evidence_digest, `${path}.evidence_digest`, issues);
    if (evidenceDigest !== undefined && !DIGEST.test(evidenceDigest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
    return { check_id: checkId, category, status, summary, ...(evidenceDigest === undefined ? {} : { evidence_digest: evidenceDigest }) };
  });
}

function normalizeCheckIds(value: unknown, path: string, issues: TransportReadinessIssue[]): readonly string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    issue(issues, path, "check_ids_must_be_array", `${path} must be an array of check ids`);
    return [];
  }
  const ids = value.map((entry, index) => {
    if (typeof entry !== "string" || !CHECK_ID.test(entry)) {
      issue(issues, `${path}[${index}]`, "invalid_check_id", "check ids must be lowercase kebab-case");
      return "";
    }
    return entry;
  }).filter((entry) => entry.length > 0);
  if (new Set(ids).size !== ids.length) issue(issues, path, "duplicate_required_check_id", "required_check_ids must be unique");
  return ids;
}

function validateReady(result: Record<string, unknown>, summary: TransportReadinessLedgerResult["summary"] | null, issues: TransportReadinessIssue[]): void {
  if (result.decision !== "transport_replay_ready") issue(issues, "decision", "ready_decision_mismatch", "ready status must use transport_replay_ready");
  if (summary !== null && (summary.fail_count > 0 || summary.pending_count > 0 || summary.missing_required_check_ids.length > 0)) issue(issues, "summary", "ready_with_unmet_checks", "ready ledgers cannot have failed, pending, or missing required checks");
  if (result.issues !== undefined) issue(issues, "issues", "ready_issues_forbidden", "ready ledgers must not carry issues");
}

function validateBlocked(result: Record<string, unknown>, summary: TransportReadinessLedgerResult["summary"] | null, issues: TransportReadinessIssue[]): void {
  if (result.decision !== "transport_replay_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked status must use transport_replay_blocked");
  if (summary !== null && summary.fail_count === 0 && summary.pending_count === 0 && summary.missing_required_check_ids.length === 0) issue(issues, "summary", "blocked_without_unmet_checks", "blocked ledgers require at least one failed, pending, or missing required check");
  if (result.issues !== undefined) issue(issues, "issues", "blocked_issues_forbidden", "blocked ledgers should encode blockers as checks, not issues");
}

function validateInvalid(result: Record<string, unknown>, issues: TransportReadinessIssue[]): void {
  if (result.decision !== "invalid_transport_replay_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid status must use invalid_transport_replay_input");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid ledgers must carry issues");
}

function validateRequestRef(value: unknown, issues: TransportReadinessIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "request_ref", "request_ref_required", "request_ref must be present");
    return;
  }
  if (typeof value.request_id !== "string" || !ID.test(value.request_id)) issue(issues, "request_ref.request_id", "invalid_request_id", "request_id must be deterministic");
  if (typeof value.request_digest !== "string" || !DIGEST.test(value.request_digest)) issue(issues, "request_ref.request_digest", "invalid_request_digest", "request_digest must be stable");
  if (typeof value.request_status !== "string" || value.request_status.length === 0) issue(issues, "request_ref.request_status", "invalid_request_status", "request_status is required");
  if (value.plan_id !== null && (typeof value.plan_id !== "string" || !ID.test(value.plan_id))) issue(issues, "request_ref.plan_id", "invalid_plan_id", "plan_id must be deterministic when present");
  if (value.repository_full_name !== null && (typeof value.repository_full_name !== "string" || !value.repository_full_name.includes("/"))) issue(issues, "request_ref.repository_full_name", "invalid_repository", "repository_full_name must be owner/repo when present");
}

function validateChecks(value: unknown, issues: TransportReadinessIssue[], allowEmpty: boolean): readonly TransportReadinessCheck[] {
  if (!Array.isArray(value)) {
    issue(issues, "checks", "checks_required", "checks must be an array");
    return [];
  }
  if (!allowEmpty && value.length === 0) issue(issues, "checks", "checks_required", "ready and blocked ledgers require checks");
  const seen = new Set<string>();
  const checks: TransportReadinessCheck[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `checks[${index}]`;
    if (!isRecord(entry)) { issue(issues, path, "check_must_be_object", "check must be an object"); continue; }
    if (typeof entry.check_id !== "string" || !CHECK_ID.test(entry.check_id)) issue(issues, `${path}.check_id`, "invalid_check_id", "check_id must be lowercase kebab-case");
    else if (seen.has(entry.check_id)) issue(issues, `${path}.check_id`, "duplicate_check_id", "check_id values must be unique");
    else seen.add(entry.check_id);
    if (typeof entry.category !== "string" || !CATEGORIES.has(entry.category)) issue(issues, `${path}.category`, "invalid_category", "category must be known");
    if (entry.status !== "pass" && entry.status !== "fail" && entry.status !== "pending") issue(issues, `${path}.status`, "invalid_check_status", "status must be pass, fail, or pending");
    if (entry.required !== true && entry.required !== false) issue(issues, `${path}.required`, "required_must_be_boolean", "required must be boolean");
    if (typeof entry.summary !== "string" || entry.summary.trim().length === 0) issue(issues, `${path}.summary`, "summary_required", "summary is required");
    if (typeof entry.evidence_digest !== "string" || !DIGEST.test(entry.evidence_digest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
    checks.push(entry as unknown as TransportReadinessCheck);
  }
  return checks;
}

function validateSummary(value: unknown, checks: readonly TransportReadinessCheck[], issues: TransportReadinessIssue[], allowEmpty: boolean): TransportReadinessLedgerResult["summary"] | null {
  if (!isRecord(value)) {
    issue(issues, "summary", "summary_required", "summary must be present");
    return null;
  }
  const requiredIds = Array.isArray(value.required_check_ids) ? value.required_check_ids.filter((entry): entry is string => typeof entry === "string") : [];
  const expected = summarizeChecks(checks, requiredIds);
  if (!allowEmpty && requiredIds.length === 0) issue(issues, "summary.required_check_ids", "required_checks_required", "ready and blocked ledgers require required_check_ids");
  for (const key of ["pass_count", "fail_count", "pending_count"] as const) {
    if (value[key] !== expected[key]) issue(issues, `summary.${key}`, "summary_count_mismatch", `${key} must match required checks`);
  }
  if (!arraysEqual(requiredIds, expected.required_check_ids)) issue(issues, "summary.required_check_ids", "required_check_ids_mismatch", "required_check_ids must be canonical");
  const missing = Array.isArray(value.missing_required_check_ids) ? value.missing_required_check_ids.filter((entry): entry is string => typeof entry === "string") : [];
  if (!arraysEqual(missing, expected.missing_required_check_ids)) issue(issues, "summary.missing_required_check_ids", "missing_required_check_ids_mismatch", "missing required checks must match checks");
  return value as unknown as TransportReadinessLedgerResult["summary"];
}

function validateRuntimeGate(value: unknown, issues: TransportReadinessIssue[]): void {
  if (!isRecord(value)) { issue(issues, "runtime_gate", "runtime_gate_required", "runtime_gate must be present"); return; }
  if (value.operation !== "replay_transport_readiness" || value.live_transport_allowed !== false || value.dry_run_only !== true) issue(issues, "runtime_gate", "dry_run_only_required", "readiness replay must remain dry-run only");
}

function validateGuards(value: unknown, issues: TransportReadinessIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of ["t052_valid_manifest_required", "no_token_request", "no_token_persistence", "no_github_api_call", "no_git_push", "no_branch_creation", "no_merge_operation", "no_approval_record_write", "no_mutation_execution", "no_file_write"]) {
    if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
  }
}

function validateDryRun(value: unknown, issues: TransportReadinessIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of ["github_api_called", "token_requested", "token_persisted", "branch_created", "git_push_performed", "approval_record_written", "mutation_executed", "file_written", "auto_merged"]) {
    if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
  }
}

function requestRefFor(request: MutationPrTransportResult): TransportReadinessLedgerResult["request_ref"] {
  const requestId = typeof request.request_id === "string" && ID.test(request.request_id) ? request.request_id : stableId("mutation-pr-transport-invalid", [canonicalStringify(request)]);
  const requestDigest = typeof request.request_digest === "string" && DIGEST.test(request.request_digest) ? request.request_digest : canonicalDigest(null);
  const planId = isRecord(request.plan_ref) && typeof request.plan_ref.plan_id === "string" && ID.test(request.plan_ref.plan_id) ? request.plan_ref.plan_id : null;
  const repository = isRecord(request.repository) && typeof request.repository.full_name === "string" ? request.repository.full_name : null;
  return { request_id: requestId, request_digest: requestDigest, request_status: typeof request.status === "string" ? request.status : "invalid", plan_id: planId, repository_full_name: repository };
}

function reasonsForBlocked(summary: TransportReadinessLedgerResult["summary"]): readonly string[] {
  const reasons = ["transport_replay_blocked"];
  if (summary.fail_count > 0) reasons.push("required_check_failed");
  if (summary.pending_count > 0) reasons.push("required_check_pending");
  if (summary.missing_required_check_ids.length > 0) reasons.push("required_check_missing");
  return reasons;
}

function runtimeGate(): TransportReadinessLedgerResult["runtime_gate"] {
  return { operation: "replay_transport_readiness", live_transport_allowed: false, dry_run_only: true };
}

function guards(): TransportReadinessLedgerResult["guards"] {
  return {
    t052_valid_manifest_required: true,
    no_token_request: true,
    no_token_persistence: true,
    no_github_api_call: true,
    no_git_push: true,
    no_branch_creation: true,
    no_merge_operation: true,
    no_approval_record_write: true,
    no_mutation_execution: true,
    no_file_write: true,
  };
}

function dryRunFlags(): TransportReadinessLedgerResult["dry_run"] {
  return {
    github_api_called: false,
    token_requested: false,
    token_persisted: false,
    branch_created: false,
    git_push_performed: false,
    approval_record_written: false,
    mutation_executed: false,
    file_written: false,
    auto_merged: false,
  };
}

function ledgerDigestPayload(value: Omit<TransportReadinessLedgerResult, "ledger_id" | "ledger_digest"> | TransportReadinessLedgerResult): Readonly<Record<string, unknown>> {
  return {
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    request_ref: value.request_ref,
    checks: value.checks,
    summary: value.summary,
    runtime_gate: value.runtime_gate,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function emptyRequest(): MutationPrTransportResult {
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:mutate-pr-transport-request:v1",
    request_id: "mutation-pr-transport-invalid-00000000",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_transport_input",
    reasons: [],
    dry_run: true,
    plan_ref: { plan_id: "", plan_digest: "", guard_id: "", mutation_id: "" },
    repository: null,
    review_gate: { approval_class: "C", risk: "high", human_review_required_before_execution: true, human_review_required_before_merge: true, merge_gate: "human_review_required" },
    runtime_gate: { operation: "open_pull_request", live_transport_allowed: false, dry_run_only: true },
    guards: { t051_ready_manifest_required: true, dry_run_only: true, no_token_request: true, no_token_persistence: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_auto_approval: true, no_approval_record_write: true, no_mutation_execution: true, no_default_branch_write: true },
    request_digest: canonicalDigest(null),
    issues: [],
  };
}

function validateNoSecretMaterial(value: unknown, path: string, issues: TransportReadinessIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "readiness ledgers must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function optionalString(value: unknown, path: string, issues: TransportReadinessIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") { issue(issues, path, "string_required", `${path} must be a string when provided`); return undefined; }
  return value;
}

function resolveTimestamp(value: string | undefined, fallback: string): string | null {
  if (value !== undefined) return isRfc3339Utc(value) ? value : null;
  return isRfc3339Utc(fallback) ? fallback : DEFAULT_NOW;
}

function isRfc3339Utc(value: string): boolean {
  if (!RFC3339_UTC.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === normalized;
}

function issue(issues: TransportReadinessIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values.filter((value) => value.length > 0))]; }
function canonicalDigest(value: unknown): string { return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`; }
function canonicalStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const createTransportReadinessLedger = runTransportReadinessLedger;
export const replayMutationPrTransportReadiness = runTransportReadinessLedger;
export const runT053TransportReadinessLedger = runTransportReadinessLedger;
export const validateTransportReadinessLedger = validateTransportReadinessLedgerResult;
export const validateT053TransportReadinessLedger = validateTransportReadinessLedgerResult;
