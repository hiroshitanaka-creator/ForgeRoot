import { validateApprovalReceiptVerifierResult } from "./approval-receipt-verifier.js";
import type { ApprovalReceiptVerifierResult } from "./approval-receipt-verifier.js";
import { validateMutationPrTransportResult } from "./mutation-pr-transport.js";
import type { MutationPrTransportResult } from "./mutation-pr-transport.js";

export const TRANSPORT_EXECUTION_PLAN_VERSION = 1 as const;
export const TRANSPORT_EXECUTION_PLAN_SCHEMA_REF = "urn:forgeroot:transport-execution-plan:v1" as const;

export type TransportExecutionPlanStatus = "execution_plan_ready" | "blocked" | "invalid";
export type TransportExecutionPlanDecision = "dry_run_execution_plan_ready" | "execution_plan_blocked" | "invalid_execution_plan_input";
export type TransportExecutionPlanStepAction = "validate_approval" | "create_pull_request" | "add_labels" | "request_reviewers";

export interface TransportExecutionPlanInput {
  readonly now?: string;
  readonly approval: ApprovalReceiptVerifierResult;
  readonly request: MutationPrTransportResult;
}

export interface TransportExecutionPlanIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface TransportExecutionPlanStep {
  readonly step_id: string;
  readonly action: TransportExecutionPlanStepAction;
  readonly status: "planned_not_executed" | "blocked";
  readonly after: string | null;
  readonly method: "POST" | null;
  readonly path: string;
  readonly body_digest: string | null;
  readonly requires_future_live_approval: true;
  readonly executed: false;
}

export interface TransportExecutionPlanResult {
  readonly manifest_version: typeof TRANSPORT_EXECUTION_PLAN_VERSION;
  readonly schema_ref: typeof TRANSPORT_EXECUTION_PLAN_SCHEMA_REF;
  readonly execution_plan_id: string;
  readonly created_at: string;
  readonly status: TransportExecutionPlanStatus;
  readonly decision: TransportExecutionPlanDecision;
  readonly reasons: readonly string[];
  readonly approval_ref: {
    readonly verifier_id: string;
    readonly approval_digest: string;
    readonly approval_status: string;
    readonly ledger_id: string;
  };
  readonly request_ref: {
    readonly request_id: string;
    readonly request_digest: string;
    readonly plan_id: string | null;
    readonly repository_full_name: string | null;
  };
  readonly steps: readonly TransportExecutionPlanStep[];
  readonly runtime_gate: {
    readonly operation: "plan_transport_execution";
    readonly live_transport_authorized: false;
    readonly dry_run_only: true;
  };
  readonly guards: {
    readonly t054_approved_required: true;
    readonly t052_ready_request_required: true;
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
    readonly token_requested: false;
    readonly token_persisted: false;
    readonly github_api_called: false;
    readonly branch_created: false;
    readonly git_push_performed: false;
    readonly approval_record_written: false;
    readonly mutation_executed: false;
    readonly file_written: false;
    readonly auto_merged: false;
  };
  readonly execution_plan_digest: string;
  readonly issues?: readonly TransportExecutionPlanIssue[];
}

export interface TransportExecutionPlanValidationResult {
  readonly ok: boolean;
  readonly issues: readonly TransportExecutionPlanIssue[];
}

export const TRANSPORT_EXECUTION_PLAN_CONTRACT = {
  consumes: ["human_approval_receipt_verification_manifest", "dry_run_mutation_pr_transport_request_manifest"],
  produces: ["dry_run_transport_execution_plan_manifest"],
  validates: ["t054_approved_verification", "t052_ready_request", "approval_request_scope_match", "no_step_executed", "no_live_transport"],
  forbids: ["token_request", "token_persistence", "github_api_call", "git_push", "branch_creation", "merge_operation", "approval_record_write", "mutation_execution", "file_write"],
  deterministic: true,
  executionPlanOnly: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;

export function runTransportExecutionPlan(input: unknown): TransportExecutionPlanResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.approval.created_at || envelope.request.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];
  if (issues.length > 0 || envelope.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.approval, envelope.request, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "execution plan input must be an object" }]);

  const approvalValidation = validateApprovalReceiptVerifierResult(envelope.input.approval);
  const requestValidation = validateMutationPrTransportResult(envelope.input.request);
  if (!approvalValidation.ok || !requestValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.approval, envelope.input.request, [
      ...(approvalValidation.ok ? [] : [{ path: "approval", code: "invalid_t054_approval_verification", message: "approval must pass T054 read-back validation" }]),
      ...approvalValidation.issues.map((entry) => ({ path: `approval.${entry.path}`, code: entry.code, message: entry.message })),
      ...(requestValidation.ok ? [] : [{ path: "request", code: "invalid_t052_transport_request", message: "request must pass T052 read-back validation" }]),
      ...requestValidation.issues.map((entry) => ({ path: `request.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }

  const scopeIssues = scopeIssuesFor(envelope.input.approval, envelope.input.request);
  if (scopeIssues.length > 0) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.approval, envelope.input.request, scopeIssues);
  if (envelope.input.approval.status !== "approved" || envelope.input.request.status !== "transport_request_ready") return blockedResult(createdAt ?? DEFAULT_NOW, envelope.input.approval, envelope.input.request);

  const result = readyResult(createdAt ?? DEFAULT_NOW, envelope.input.approval, envelope.input.request);
  const validation = validateTransportExecutionPlanResult(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.approval, envelope.input.request, validation.issues);
  return result;
}

export function validateTransportExecutionPlanResult(result: unknown): TransportExecutionPlanValidationResult {
  const issues: TransportExecutionPlanIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "execution plan result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== TRANSPORT_EXECUTION_PLAN_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== TRANSPORT_EXECUTION_PLAN_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T055 transport execution plan v1");
  if (typeof result.execution_plan_id !== "string" || !ID.test(result.execution_plan_id)) issue(issues, "execution_plan_id", "invalid_execution_plan_id", "execution_plan_id must be deterministic");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "execution_plan_ready" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be execution_plan_ready, blocked, or invalid");
  if (result.decision !== "dry_run_execution_plan_ready" && result.decision !== "execution_plan_blocked" && result.decision !== "invalid_execution_plan_input") issue(issues, "decision", "invalid_decision", "decision must be a T055 execution plan decision");
  validateApprovalRef(result.approval_ref, issues);
  validateRequestRef(result.request_ref, issues);
  validateSteps(result.steps, result.status === "invalid", result.request_ref, issues);
  validateRuntimeGate(result.runtime_gate, issues);
  validateGuards(result.guards, issues);
  validateDryRun(result.dry_run, issues);
  validateNoSecretMaterial(result, "result", issues);

  if (result.status === "execution_plan_ready") validateReady(result, issues);
  if (result.status === "blocked") validateBlocked(result, issues);
  if (result.status === "invalid") validateInvalid(result, issues);

  const expectedDigest = canonicalDigest(executionPlanDigestPayload(result as unknown as TransportExecutionPlanResult));
  if (result.execution_plan_digest !== expectedDigest) issue(issues, "execution_plan_digest", "execution_plan_digest_mismatch", "execution plan digest must cover payload");
  if (typeof result.execution_plan_id === "string" && result.execution_plan_id !== stableId("transport-execution-plan", [expectedDigest])) issue(issues, "execution_plan_id", "execution_plan_id_mismatch", "execution_plan_id must match deterministic payload");
  return { ok: issues.length === 0, issues };
}

function readyResult(createdAt: string, approval: ApprovalReceiptVerifierResult, request: MutationPrTransportResult): TransportExecutionPlanResult {
  const steps = stepsFor(request, "planned_not_executed");
  const draft: Omit<TransportExecutionPlanResult, "execution_plan_id" | "execution_plan_digest"> = {
    manifest_version: TRANSPORT_EXECUTION_PLAN_VERSION,
    schema_ref: TRANSPORT_EXECUTION_PLAN_SCHEMA_REF,
    created_at: createdAt,
    status: "execution_plan_ready",
    decision: "dry_run_execution_plan_ready",
    reasons: ["t054_approval_verified", "t052_request_ready", "execution_plan_not_executed"],
    approval_ref: approvalRefFor(approval),
    request_ref: requestRefFor(request),
    steps,
    runtime_gate: runtimeGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
  };
  const digest = canonicalDigest(executionPlanDigestPayload(draft));
  return { ...draft, execution_plan_id: stableId("transport-execution-plan", [digest]), execution_plan_digest: digest };
}

function blockedResult(createdAt: string, approval: ApprovalReceiptVerifierResult, request: MutationPrTransportResult): TransportExecutionPlanResult {
  const steps = stepsFor(request, "blocked");
  const reasons = ["execution_plan_blocked"];
  if (approval.status !== "approved") reasons.push("t054_approval_not_approved");
  if (request.status !== "transport_request_ready") reasons.push("t052_request_not_ready");
  const draft: Omit<TransportExecutionPlanResult, "execution_plan_id" | "execution_plan_digest"> = {
    manifest_version: TRANSPORT_EXECUTION_PLAN_VERSION,
    schema_ref: TRANSPORT_EXECUTION_PLAN_SCHEMA_REF,
    created_at: createdAt,
    status: "blocked",
    decision: "execution_plan_blocked",
    reasons: uniqueStrings(reasons),
    approval_ref: approvalRefFor(approval),
    request_ref: requestRefFor(request),
    steps,
    runtime_gate: runtimeGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
  };
  const digest = canonicalDigest(executionPlanDigestPayload(draft));
  return { ...draft, execution_plan_id: stableId("transport-execution-plan", [digest]), execution_plan_digest: digest };
}

function invalidResult(createdAt: string, approval: ApprovalReceiptVerifierResult, request: MutationPrTransportResult, issues: readonly TransportExecutionPlanIssue[]): TransportExecutionPlanResult {
  const draft: Omit<TransportExecutionPlanResult, "execution_plan_id" | "execution_plan_digest"> = {
    manifest_version: TRANSPORT_EXECUTION_PLAN_VERSION,
    schema_ref: TRANSPORT_EXECUTION_PLAN_SCHEMA_REF,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_execution_plan_input",
    reasons: uniqueStrings(["invalid_execution_plan_input", ...issues.map((entry) => entry.code)]),
    approval_ref: approvalRefFor(approval),
    request_ref: requestRefFor(request),
    steps: [],
    runtime_gate: runtimeGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
    issues,
  };
  const digest = canonicalDigest(executionPlanDigestPayload(draft));
  return { ...draft, execution_plan_id: stableId("transport-execution-plan", [digest]), execution_plan_digest: digest };
}

function stepsFor(request: MutationPrTransportResult, status: "planned_not_executed" | "blocked"): readonly TransportExecutionPlanStep[] {
  const steps: TransportExecutionPlanStep[] = [
    step("validate-approval", "validate_approval", status, null, null, "local://approval-verification", null),
  ];
  if (request.primary_request !== undefined) steps.push(step("create-pull-request", "create_pull_request", status, "validate-approval", request.primary_request.method, request.primary_request.path, canonicalDigest(request.primary_request.body)));
  for (const [index, requestStep] of (request.post_create_requests ?? []).entries()) {
    const action = requestStep.name === "add_labels_to_pull_request_issue" ? "add_labels" : "request_reviewers";
    steps.push(step(`${action.replace("_", "-")}-${index + 1}`, action, status, "create-pull-request", requestStep.method, requestStep.path_template, canonicalDigest(requestStep.body)));
  }
  return steps;
}

function step(stepId: string, action: TransportExecutionPlanStepAction, status: "planned_not_executed" | "blocked", after: string | null, method: "POST" | null, path: string, bodyDigest: string | null): TransportExecutionPlanStep {
  return { step_id: stepId, action, status, after, method, path, body_digest: bodyDigest, requires_future_live_approval: true, executed: false };
}

function normalizeInput(input: unknown): {
  readonly input: TransportExecutionPlanInput | null;
  readonly now?: string;
  readonly approval: ApprovalReceiptVerifierResult;
  readonly request: MutationPrTransportResult;
  readonly issues: readonly TransportExecutionPlanIssue[];
} {
  const issues: TransportExecutionPlanIssue[] = [];
  if (!isRecord(input)) return { input: null, approval: emptyApproval(), request: emptyRequest(), issues: [{ path: "input", code: "input_must_be_object", message: "execution plan input must be an object" }] };
  const approval = isRecord(input.approval) ? input.approval as unknown as ApprovalReceiptVerifierResult : emptyApproval();
  if (!isRecord(input.approval)) issue(issues, "approval", "approval_must_be_object", "approval must be a T054 result object");
  const request = isRecord(input.request) ? input.request as unknown as MutationPrTransportResult : emptyRequest();
  if (!isRecord(input.request)) issue(issues, "request", "request_must_be_object", "request must be a T052 result object");
  const now = optionalString(input.now, "now", issues);
  return { input: { approval, request, ...(now === undefined ? {} : { now }) }, now, approval, request, issues };
}

function scopeIssuesFor(approval: ApprovalReceiptVerifierResult, request: MutationPrTransportResult): readonly TransportExecutionPlanIssue[] {
  const issues: TransportExecutionPlanIssue[] = [];
  if (approval.ledger_ref.request_id !== request.request_id) issue(issues, "approval.ledger_ref.request_id", "request_id_mismatch", "approval must reference the request being planned");
  if (approval.ledger_ref.request_digest !== request.request_digest) issue(issues, "approval.ledger_ref.request_digest", "request_digest_mismatch", "approval must reference the request digest being planned");
  const requestPlanId = request.plan_ref.plan_id;
  if (approval.ledger_ref.plan_id !== requestPlanId) issue(issues, "approval.ledger_ref.plan_id", "plan_id_mismatch", "approval must reference the request plan_id being planned");
  return issues;
}

function validateReady(result: Record<string, unknown>, issues: TransportExecutionPlanIssue[]): void {
  if (result.decision !== "dry_run_execution_plan_ready") issue(issues, "decision", "ready_decision_mismatch", "ready status must use dry_run_execution_plan_ready");
  if (Array.isArray(result.steps) && result.steps.length < 2) issue(issues, "steps", "ready_steps_required", "ready plans must include approval and PR creation steps");
  if (result.issues !== undefined) issue(issues, "issues", "ready_issues_forbidden", "ready plans must not carry issues");
}

function validateBlocked(result: Record<string, unknown>, issues: TransportExecutionPlanIssue[]): void {
  if (result.decision !== "execution_plan_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked status must use execution_plan_blocked");
  if (result.issues !== undefined) issue(issues, "issues", "blocked_issues_forbidden", "blocked plans should encode blockers as reasons");
}

function validateInvalid(result: Record<string, unknown>, issues: TransportExecutionPlanIssue[]): void {
  if (result.decision !== "invalid_execution_plan_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid status must use invalid_execution_plan_input");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid plans must carry issues");
}

function validateApprovalRef(value: unknown, issues: TransportExecutionPlanIssue[]): void {
  if (!isRecord(value)) { issue(issues, "approval_ref", "approval_ref_required", "approval_ref must be present"); return; }
  for (const key of ["verifier_id", "ledger_id"] as const) if (typeof value[key] !== "string" || !ID.test(value[key])) issue(issues, `approval_ref.${key}`, `invalid_${key}`, `${key} must be deterministic`);
  if (typeof value.approval_digest !== "string" || !DIGEST.test(value.approval_digest)) issue(issues, "approval_ref.approval_digest", "invalid_approval_digest", "approval_digest must be stable");
  if (typeof value.approval_status !== "string" || value.approval_status.length === 0) issue(issues, "approval_ref.approval_status", "invalid_approval_status", "approval_status is required");
}

function validateRequestRef(value: unknown, issues: TransportExecutionPlanIssue[]): void {
  if (!isRecord(value)) { issue(issues, "request_ref", "request_ref_required", "request_ref must be present"); return; }
  if (typeof value.request_id !== "string" || !ID.test(value.request_id)) issue(issues, "request_ref.request_id", "invalid_request_id", "request_id must be deterministic");
  if (typeof value.request_digest !== "string" || !DIGEST.test(value.request_digest)) issue(issues, "request_ref.request_digest", "invalid_request_digest", "request_digest must be stable");
  if (value.plan_id !== null && (typeof value.plan_id !== "string" || !ID.test(value.plan_id))) issue(issues, "request_ref.plan_id", "invalid_plan_id", "plan_id must be deterministic when present");
  if (value.repository_full_name !== null && (typeof value.repository_full_name !== "string" || !value.repository_full_name.includes("/"))) issue(issues, "request_ref.repository_full_name", "invalid_repository", "repository_full_name must be owner/repo when present");
}

function validateSteps(value: unknown, allowEmpty: boolean, requestRef: unknown, issues: TransportExecutionPlanIssue[]): void {
  if (!Array.isArray(value)) { issue(issues, "steps", "steps_required", "steps must be an array"); return; }
  if (!allowEmpty && value.length === 0) issue(issues, "steps", "steps_required", "ready or blocked plans must carry steps");
  const seen = new Set<string>();
  for (const [index, entry] of value.entries()) {
    const path = `steps[${index}]`;
    if (!isRecord(entry)) { issue(issues, path, "step_must_be_object", "step must be an object"); continue; }
    if (typeof entry.step_id !== "string" || entry.step_id.length === 0 || seen.has(entry.step_id)) issue(issues, `${path}.step_id`, "invalid_step_id", "step_id must be unique");
    else seen.add(entry.step_id);
    if (entry.action !== "validate_approval" && entry.action !== "create_pull_request" && entry.action !== "add_labels" && entry.action !== "request_reviewers") issue(issues, `${path}.action`, "invalid_action", "action must be a known transport plan action");
    if (entry.status !== "planned_not_executed" && entry.status !== "blocked") issue(issues, `${path}.status`, "invalid_step_status", "step status must be planned_not_executed or blocked");
    if (entry.method !== null && entry.method !== "POST") issue(issues, `${path}.method`, "invalid_method", "transport plan method must be POST or null");
    if (typeof entry.path !== "string" || entry.path.includes("/merge")) issue(issues, `${path}.path`, "unsafe_step_path", "step path must be local or a non-merge GitHub endpoint");
    validateActionPath(entry, path, requestRef, issues);
    if (entry.body_digest !== null && (typeof entry.body_digest !== "string" || !DIGEST.test(entry.body_digest))) issue(issues, `${path}.body_digest`, "invalid_body_digest", "body_digest must be stable when present");
    if (entry.requires_future_live_approval !== true) issue(issues, `${path}.requires_future_live_approval`, "future_live_approval_required", "future live approval must be required");
    if (entry.executed !== false) issue(issues, `${path}.executed`, "step_execution_forbidden", "steps must not be executed");
  }
}

function validateActionPath(entry: Record<string, unknown>, path: string, requestRef: unknown, issues: TransportExecutionPlanIssue[]): void {
  const repository = isRecord(requestRef) && typeof requestRef.repository_full_name === "string" ? requestRef.repository_full_name : null;
  const expected = expectedStepPath(entry.action, repository);
  if (expected !== null && entry.path !== expected) issue(issues, `${path}.path`, "action_path_mismatch", "step path must match its action");
  if (entry.action === "validate_approval") {
    if (entry.method !== null || entry.after !== null || entry.body_digest !== null) issue(issues, path, "approval_step_shape_mismatch", "approval validation step must remain local and bodyless");
  } else if (entry.method !== "POST") {
    issue(issues, `${path}.method`, "invalid_method", "transport action steps must use POST");
  }
}

function expectedStepPath(action: unknown, repository: string | null): string | null {
  if (action === "validate_approval") return "local://approval-verification";
  if (repository === null) return null;
  if (action === "create_pull_request") return `/repos/${repository}/pulls`;
  if (action === "add_labels") return `/repos/${repository}/issues/{pull_number}/labels`;
  if (action === "request_reviewers") return `/repos/${repository}/pulls/{pull_number}/requested_reviewers`;
  return null;
}

function validateRuntimeGate(value: unknown, issues: TransportExecutionPlanIssue[]): void {
  if (!isRecord(value)) { issue(issues, "runtime_gate", "runtime_gate_required", "runtime_gate must be present"); return; }
  if (value.operation !== "plan_transport_execution" || value.live_transport_authorized !== false || value.dry_run_only !== true) issue(issues, "runtime_gate", "dry_run_only_required", "execution plan must remain dry-run only");
}

function validateGuards(value: unknown, issues: TransportExecutionPlanIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of ["t054_approved_required", "t052_ready_request_required", "no_token_request", "no_token_persistence", "no_github_api_call", "no_git_push", "no_branch_creation", "no_merge_operation", "no_approval_record_write", "no_mutation_execution", "no_file_write"]) {
    if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
  }
}

function validateDryRun(value: unknown, issues: TransportExecutionPlanIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of ["token_requested", "token_persisted", "github_api_called", "branch_created", "git_push_performed", "approval_record_written", "mutation_executed", "file_written", "auto_merged"]) {
    if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
  }
}

function approvalRefFor(approval: ApprovalReceiptVerifierResult): TransportExecutionPlanResult["approval_ref"] {
  return {
    verifier_id: typeof approval.verifier_id === "string" && ID.test(approval.verifier_id) ? approval.verifier_id : stableId("approval-receipt-verifier-invalid", [canonicalStringify(approval)]),
    approval_digest: typeof approval.approval_digest === "string" && DIGEST.test(approval.approval_digest) ? approval.approval_digest : canonicalDigest(null),
    approval_status: typeof approval.status === "string" ? approval.status : "invalid",
    ledger_id: isRecord(approval.ledger_ref) && typeof approval.ledger_ref.ledger_id === "string" && ID.test(approval.ledger_ref.ledger_id) ? approval.ledger_ref.ledger_id : stableId("transport-readiness-invalid", [canonicalStringify(approval)]),
  };
}

function requestRefFor(request: MutationPrTransportResult): TransportExecutionPlanResult["request_ref"] {
  return {
    request_id: typeof request.request_id === "string" && ID.test(request.request_id) ? request.request_id : stableId("mutation-pr-transport-invalid", [canonicalStringify(request)]),
    request_digest: typeof request.request_digest === "string" && DIGEST.test(request.request_digest) ? request.request_digest : canonicalDigest(null),
    plan_id: isRecord(request.plan_ref) && typeof request.plan_ref.plan_id === "string" && ID.test(request.plan_ref.plan_id) ? request.plan_ref.plan_id : null,
    repository_full_name: isRecord(request.repository) && typeof request.repository.full_name === "string" ? request.repository.full_name : null,
  };
}

function runtimeGate(): TransportExecutionPlanResult["runtime_gate"] {
  return { operation: "plan_transport_execution", live_transport_authorized: false, dry_run_only: true };
}

function guards(): TransportExecutionPlanResult["guards"] {
  return { t054_approved_required: true, t052_ready_request_required: true, no_token_request: true, no_token_persistence: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_approval_record_write: true, no_mutation_execution: true, no_file_write: true };
}

function dryRunFlags(): TransportExecutionPlanResult["dry_run"] {
  return { token_requested: false, token_persisted: false, github_api_called: false, branch_created: false, git_push_performed: false, approval_record_written: false, mutation_executed: false, file_written: false, auto_merged: false };
}

function executionPlanDigestPayload(value: Omit<TransportExecutionPlanResult, "execution_plan_id" | "execution_plan_digest"> | TransportExecutionPlanResult): Readonly<Record<string, unknown>> {
  return { status: value.status, decision: value.decision, reasons: value.reasons, approval_ref: value.approval_ref, request_ref: value.request_ref, steps: value.steps, runtime_gate: value.runtime_gate, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] };
}

function emptyApproval(): ApprovalReceiptVerifierResult {
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:approval-receipt-verifier:v1",
    verifier_id: "approval-receipt-verifier-invalid-00000000",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_human_approval_input",
    reasons: [],
    ledger_ref: { ledger_id: "transport-readiness-invalid-00000000", ledger_digest: canonicalDigest(null), ledger_status: "invalid", request_id: "mutation-pr-transport-invalid-00000000", request_digest: canonicalDigest(null), plan_id: null },
    policy: { required_approvals: 1, allowed_approvers: null, require_scope_match: true },
    receipts: [],
    approval_summary: { accepted_approvals: 0, rejected_count: 0, hold_count: 0, missing_approvals: 1, approvers: [] },
    review_gate: { approval_class: "C", human_review_required_before_execution: true, human_review_required_before_merge: true, approval_record_write_authorized: false },
    guards: { t053_ready_ledger_required: true, explicit_receipt_required: true, no_approval_record_write: true, no_github_api_call: true, no_token_request: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_mutation_execution: true, no_file_write: true },
    dry_run: { approval_record_written: false, github_api_called: false, token_requested: false, branch_created: false, git_push_performed: false, mutation_executed: false, file_written: false, auto_merged: false },
    approval_digest: canonicalDigest(null),
    issues: [],
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

function validateNoSecretMaterial(value: unknown, path: string, issues: TransportExecutionPlanIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "execution plans must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function optionalString(value: unknown, path: string, issues: TransportExecutionPlanIssue[]): string | undefined {
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

function issue(issues: TransportExecutionPlanIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
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

export const createTransportExecutionPlan = runTransportExecutionPlan;
export const planApprovedTransportExecution = runTransportExecutionPlan;
export const runT055TransportExecutionPlan = runTransportExecutionPlan;
export const validateTransportExecutionPlan = validateTransportExecutionPlanResult;
export const validateT055TransportExecutionPlan = validateTransportExecutionPlanResult;
