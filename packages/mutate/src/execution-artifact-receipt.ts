import { validateTransportExecutionPlanResult } from "./transport-execution-plan.js";
import type { TransportExecutionPlanResult } from "./transport-execution-plan.js";

export const EXECUTION_ARTIFACT_RECEIPT_VERSION = 1 as const;
export const EXECUTION_ARTIFACT_RECEIPT_SCHEMA_REF = "urn:forgeroot:execution-artifact-receipt:v1" as const;

export type ExecutionArtifactReceiptStatus = "artifact_receipt_ready" | "blocked" | "invalid";
export type ExecutionArtifactReceiptDecision = "execution_artifact_receipt_ready" | "execution_artifact_receipt_blocked" | "invalid_execution_artifact_input";

export interface ExecutionArtifactReceiptInput {
  readonly now?: string;
  readonly plan: TransportExecutionPlanResult;
  readonly artifact_label?: string;
}

export interface ExecutionArtifactReceiptIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ExecutionArtifactReceiptResult {
  readonly manifest_version: typeof EXECUTION_ARTIFACT_RECEIPT_VERSION;
  readonly schema_ref: typeof EXECUTION_ARTIFACT_RECEIPT_SCHEMA_REF;
  readonly receipt_id: string;
  readonly created_at: string;
  readonly status: ExecutionArtifactReceiptStatus;
  readonly decision: ExecutionArtifactReceiptDecision;
  readonly reasons: readonly string[];
  readonly plan_ref: {
    readonly execution_plan_id: string;
    readonly execution_plan_digest: string;
    readonly execution_plan_status: string;
    readonly request_id: string;
    readonly approval_verifier_id: string;
  };
  readonly artifact: {
    readonly label: string;
    readonly kind: "dry_run_transport_execution_summary";
    readonly step_count: number;
    readonly action_counts: Readonly<Record<string, number>>;
    readonly step_digest: string;
    readonly write_target: null;
  };
  readonly guards: {
    readonly t055_ready_plan_required: true;
    readonly no_file_write: true;
    readonly no_artifact_persistence: true;
    readonly no_token_request: true;
    readonly no_github_api_call: true;
    readonly no_git_push: true;
    readonly no_branch_creation: true;
    readonly no_merge_operation: true;
    readonly no_mutation_execution: true;
  };
  readonly dry_run: {
    readonly file_written: false;
    readonly artifact_persisted: false;
    readonly token_requested: false;
    readonly github_api_called: false;
    readonly branch_created: false;
    readonly git_push_performed: false;
    readonly mutation_executed: false;
    readonly auto_merged: false;
  };
  readonly receipt_digest: string;
  readonly issues?: readonly ExecutionArtifactReceiptIssue[];
}

export interface ExecutionArtifactReceiptValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ExecutionArtifactReceiptIssue[];
}

export const EXECUTION_ARTIFACT_RECEIPT_CONTRACT = {
  consumes: ["dry_run_transport_execution_plan_manifest"],
  produces: ["execution_artifact_receipt_manifest"],
  validates: ["t055_read_back_validation", "unexecuted_step_summary", "no_artifact_persistence", "no_file_write"],
  forbids: ["file_write", "artifact_persistence", "token_request", "github_api_call", "git_push", "branch_creation", "merge_operation", "mutation_execution"],
  deterministic: true,
  receiptOnly: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const LABEL = /^[A-Za-z0-9_.:-]{1,80}$/;

export function runExecutionArtifactReceipt(input: unknown): ExecutionArtifactReceiptResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.plan.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];
  if (issues.length > 0 || envelope.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.plan, envelope.label, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "artifact receipt input must be an object" }]);

  const planValidation = validateTransportExecutionPlanResult(envelope.input.plan);
  if (!planValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, envelope.label, [
      { path: "plan", code: "invalid_t055_execution_plan", message: "plan must pass T055 read-back validation" },
      ...planValidation.issues.map((entry) => ({ path: `plan.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }
  if (envelope.input.plan.status !== "execution_plan_ready") return blockedResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, envelope.label);
  const result = readyResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, envelope.label);
  const validation = validateExecutionArtifactReceiptResult(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, envelope.label, validation.issues);
  return result;
}

export function validateExecutionArtifactReceiptResult(result: unknown): ExecutionArtifactReceiptValidationResult {
  const issues: ExecutionArtifactReceiptIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "artifact receipt result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== EXECUTION_ARTIFACT_RECEIPT_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== EXECUTION_ARTIFACT_RECEIPT_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T056 artifact receipt v1");
  if (typeof result.receipt_id !== "string" || !ID.test(result.receipt_id)) issue(issues, "receipt_id", "invalid_receipt_id", "receipt_id must be deterministic");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "artifact_receipt_ready" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be artifact_receipt_ready, blocked, or invalid");
  if (result.decision !== "execution_artifact_receipt_ready" && result.decision !== "execution_artifact_receipt_blocked" && result.decision !== "invalid_execution_artifact_input") issue(issues, "decision", "invalid_decision", "decision must be a T056 artifact receipt decision");
  validatePlanRef(result.plan_ref, issues);
  validateArtifact(result.artifact, issues);
  validateGuards(result.guards, issues);
  validateDryRun(result.dry_run, issues);
  validateNoSecretMaterial(result, "result", issues);
  if (result.status === "artifact_receipt_ready") validateReady(result, issues);
  if (result.status === "blocked") validateBlocked(result, issues);
  if (result.status === "invalid") validateInvalid(result, issues);
  const expectedDigest = canonicalDigest(receiptDigestPayload(result as unknown as ExecutionArtifactReceiptResult));
  if (result.receipt_digest !== expectedDigest) issue(issues, "receipt_digest", "receipt_digest_mismatch", "receipt digest must cover artifact receipt payload");
  if (typeof result.receipt_id === "string" && result.receipt_id !== stableId("execution-artifact-receipt", [expectedDigest])) issue(issues, "receipt_id", "receipt_id_mismatch", "receipt_id must match deterministic payload");
  return { ok: issues.length === 0, issues };
}

function readyResult(createdAt: string, plan: TransportExecutionPlanResult, label: string): ExecutionArtifactReceiptResult {
  const draft = draftFor(createdAt, "artifact_receipt_ready", "execution_artifact_receipt_ready", ["t055_execution_plan_ready", "artifact_receipt_not_persisted"], plan, label);
  const digest = canonicalDigest(receiptDigestPayload(draft));
  return { ...draft, receipt_id: stableId("execution-artifact-receipt", [digest]), receipt_digest: digest };
}

function blockedResult(createdAt: string, plan: TransportExecutionPlanResult, label: string): ExecutionArtifactReceiptResult {
  const draft = draftFor(createdAt, "blocked", "execution_artifact_receipt_blocked", ["t055_execution_plan_not_ready", "artifact_receipt_not_generated"], plan, label);
  const digest = canonicalDigest(receiptDigestPayload(draft));
  return { ...draft, receipt_id: stableId("execution-artifact-receipt", [digest]), receipt_digest: digest };
}

function invalidResult(createdAt: string, plan: TransportExecutionPlanResult, label: string, issues: readonly ExecutionArtifactReceiptIssue[]): ExecutionArtifactReceiptResult {
  const draft = { ...draftFor(createdAt, "invalid", "invalid_execution_artifact_input", ["invalid_execution_artifact_input", ...issues.map((entry) => entry.code)], plan, label), issues };
  const digest = canonicalDigest(receiptDigestPayload(draft));
  return { ...draft, receipt_id: stableId("execution-artifact-receipt", [digest]), receipt_digest: digest };
}

function draftFor(createdAt: string, status: ExecutionArtifactReceiptStatus, decision: ExecutionArtifactReceiptDecision, reasons: readonly string[], plan: TransportExecutionPlanResult, label: string): Omit<ExecutionArtifactReceiptResult, "receipt_id" | "receipt_digest"> {
  return {
    manifest_version: EXECUTION_ARTIFACT_RECEIPT_VERSION,
    schema_ref: EXECUTION_ARTIFACT_RECEIPT_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision,
    reasons: uniqueStrings(reasons),
    plan_ref: planRefFor(plan),
    artifact: artifactFor(plan, label),
    guards: guards(),
    dry_run: dryRunFlags(),
  };
}

function artifactFor(plan: TransportExecutionPlanResult, label: string): ExecutionArtifactReceiptResult["artifact"] {
  const actionCounts: Record<string, number> = {};
  for (const step of plan.steps ?? []) actionCounts[step.action] = (actionCounts[step.action] ?? 0) + 1;
  return {
    label,
    kind: "dry_run_transport_execution_summary",
    step_count: Array.isArray(plan.steps) ? plan.steps.length : 0,
    action_counts: actionCounts,
    step_digest: canonicalDigest(plan.steps ?? []),
    write_target: null,
  };
}

function normalizeInput(input: unknown): {
  readonly input: ExecutionArtifactReceiptInput | null;
  readonly now?: string;
  readonly plan: TransportExecutionPlanResult;
  readonly label: string;
  readonly issues: readonly ExecutionArtifactReceiptIssue[];
} {
  const issues: ExecutionArtifactReceiptIssue[] = [];
  if (!isRecord(input)) return { input: null, plan: emptyPlan(), label: "t056-artifact", issues: [{ path: "input", code: "input_must_be_object", message: "artifact receipt input must be an object" }] };
  const plan = isRecord(input.plan) ? input.plan as unknown as TransportExecutionPlanResult : emptyPlan();
  if (!isRecord(input.plan)) issue(issues, "plan", "plan_must_be_object", "plan must be a T055 execution plan object");
  const now = optionalString(input.now, "now", issues);
  const label = optionalString(input.artifact_label, "artifact_label", issues) ?? "t056-artifact";
  if (!LABEL.test(label)) issue(issues, "artifact_label", "invalid_artifact_label", "artifact_label must be a safe short label");
  return { input: { plan, artifact_label: label, ...(now === undefined ? {} : { now }) }, now, plan, label, issues };
}

function validateReady(result: Record<string, unknown>, issues: ExecutionArtifactReceiptIssue[]): void {
  if (result.decision !== "execution_artifact_receipt_ready") issue(issues, "decision", "ready_decision_mismatch", "ready status must use execution_artifact_receipt_ready");
  if (result.issues !== undefined) issue(issues, "issues", "ready_issues_forbidden", "ready receipts must not carry issues");
}

function validateBlocked(result: Record<string, unknown>, issues: ExecutionArtifactReceiptIssue[]): void {
  if (result.decision !== "execution_artifact_receipt_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked status must use execution_artifact_receipt_blocked");
  if (result.issues !== undefined) issue(issues, "issues", "blocked_issues_forbidden", "blocked receipts should encode blockers as reasons");
}

function validateInvalid(result: Record<string, unknown>, issues: ExecutionArtifactReceiptIssue[]): void {
  if (result.decision !== "invalid_execution_artifact_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid status must use invalid_execution_artifact_input");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid receipts must carry issues");
}

function validatePlanRef(value: unknown, issues: ExecutionArtifactReceiptIssue[]): void {
  if (!isRecord(value)) { issue(issues, "plan_ref", "plan_ref_required", "plan_ref must be present"); return; }
  for (const key of ["execution_plan_id", "request_id", "approval_verifier_id"] as const) if (typeof value[key] !== "string" || !ID.test(value[key])) issue(issues, `plan_ref.${key}`, `invalid_${key}`, `${key} must be deterministic`);
  if (typeof value.execution_plan_digest !== "string" || !DIGEST.test(value.execution_plan_digest)) issue(issues, "plan_ref.execution_plan_digest", "invalid_execution_plan_digest", "execution_plan_digest must be stable");
  if (typeof value.execution_plan_status !== "string" || value.execution_plan_status.length === 0) issue(issues, "plan_ref.execution_plan_status", "invalid_execution_plan_status", "execution_plan_status is required");
}

function validateArtifact(value: unknown, issues: ExecutionArtifactReceiptIssue[]): void {
  if (!isRecord(value)) { issue(issues, "artifact", "artifact_required", "artifact must be present"); return; }
  if (typeof value.label !== "string" || !LABEL.test(value.label)) issue(issues, "artifact.label", "invalid_artifact_label", "artifact label must be safe");
  if (value.kind !== "dry_run_transport_execution_summary") issue(issues, "artifact.kind", "invalid_artifact_kind", "artifact kind must be dry_run_transport_execution_summary");
  if (typeof value.step_count !== "number" || !Number.isSafeInteger(value.step_count) || value.step_count < 0) issue(issues, "artifact.step_count", "invalid_step_count", "step_count must be non-negative");
  if (!isRecord(value.action_counts)) issue(issues, "artifact.action_counts", "action_counts_required", "action_counts must be present");
  if (typeof value.step_digest !== "string" || !DIGEST.test(value.step_digest)) issue(issues, "artifact.step_digest", "invalid_step_digest", "step_digest must be stable");
  if (value.write_target !== null) issue(issues, "artifact.write_target", "write_target_forbidden", "artifact receipt must not declare a write target");
}

function validateGuards(value: unknown, issues: ExecutionArtifactReceiptIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of ["t055_ready_plan_required", "no_file_write", "no_artifact_persistence", "no_token_request", "no_github_api_call", "no_git_push", "no_branch_creation", "no_merge_operation", "no_mutation_execution"]) {
    if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
  }
}

function validateDryRun(value: unknown, issues: ExecutionArtifactReceiptIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of ["file_written", "artifact_persisted", "token_requested", "github_api_called", "branch_created", "git_push_performed", "mutation_executed", "auto_merged"]) {
    if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
  }
}

function planRefFor(plan: TransportExecutionPlanResult): ExecutionArtifactReceiptResult["plan_ref"] {
  return {
    execution_plan_id: typeof plan.execution_plan_id === "string" && ID.test(plan.execution_plan_id) ? plan.execution_plan_id : stableId("transport-execution-plan-invalid", [canonicalStringify(plan)]),
    execution_plan_digest: typeof plan.execution_plan_digest === "string" && DIGEST.test(plan.execution_plan_digest) ? plan.execution_plan_digest : canonicalDigest(null),
    execution_plan_status: typeof plan.status === "string" ? plan.status : "invalid",
    request_id: isRecord(plan.request_ref) && typeof plan.request_ref.request_id === "string" && ID.test(plan.request_ref.request_id) ? plan.request_ref.request_id : stableId("mutation-pr-transport-invalid", [canonicalStringify(plan)]),
    approval_verifier_id: isRecord(plan.approval_ref) && typeof plan.approval_ref.verifier_id === "string" && ID.test(plan.approval_ref.verifier_id) ? plan.approval_ref.verifier_id : stableId("approval-receipt-verifier-invalid", [canonicalStringify(plan)]),
  };
}

function guards(): ExecutionArtifactReceiptResult["guards"] {
  return { t055_ready_plan_required: true, no_file_write: true, no_artifact_persistence: true, no_token_request: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_mutation_execution: true };
}

function dryRunFlags(): ExecutionArtifactReceiptResult["dry_run"] {
  return { file_written: false, artifact_persisted: false, token_requested: false, github_api_called: false, branch_created: false, git_push_performed: false, mutation_executed: false, auto_merged: false };
}

function receiptDigestPayload(value: Omit<ExecutionArtifactReceiptResult, "receipt_id" | "receipt_digest"> | ExecutionArtifactReceiptResult): Readonly<Record<string, unknown>> {
  return { status: value.status, decision: value.decision, reasons: value.reasons, plan_ref: value.plan_ref, artifact: value.artifact, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] };
}

function emptyPlan(): TransportExecutionPlanResult {
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:transport-execution-plan:v1",
    execution_plan_id: "transport-execution-plan-invalid-00000000",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_execution_plan_input",
    reasons: [],
    approval_ref: { verifier_id: "approval-receipt-verifier-invalid-00000000", approval_digest: canonicalDigest(null), approval_status: "invalid", ledger_id: "transport-readiness-invalid-00000000" },
    request_ref: { request_id: "mutation-pr-transport-invalid-00000000", request_digest: canonicalDigest(null), plan_id: null, repository_full_name: null },
    steps: [],
    runtime_gate: { operation: "plan_transport_execution", live_transport_authorized: false, dry_run_only: true },
    guards: { t054_approved_required: true, t052_ready_request_required: true, no_token_request: true, no_token_persistence: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_approval_record_write: true, no_mutation_execution: true, no_file_write: true },
    dry_run: { token_requested: false, token_persisted: false, github_api_called: false, branch_created: false, git_push_performed: false, approval_record_written: false, mutation_executed: false, file_written: false, auto_merged: false },
    execution_plan_digest: canonicalDigest(null),
    issues: [],
  };
}

function validateNoSecretMaterial(value: unknown, path: string, issues: ExecutionArtifactReceiptIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "artifact receipts must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function optionalString(value: unknown, path: string, issues: ExecutionArtifactReceiptIssue[]): string | undefined {
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

function issue(issues: ExecutionArtifactReceiptIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
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

export const createExecutionArtifactReceipt = runExecutionArtifactReceipt;
export const summarizeTransportExecutionArtifact = runExecutionArtifactReceipt;
export const runT056ExecutionArtifactReceipt = runExecutionArtifactReceipt;
export const validateExecutionArtifactReceipt = validateExecutionArtifactReceiptResult;
export const validateT056ExecutionArtifactReceipt = validateExecutionArtifactReceiptResult;
