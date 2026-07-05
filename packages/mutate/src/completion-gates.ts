import { validateExecutionArtifactReceiptResult } from "./execution-artifact-receipt.js";
import type { ExecutionArtifactReceiptResult } from "./execution-artifact-receipt.js";

export const ROLLOUT_GATE_CHECKLIST_VERSION = 1 as const;
export const ROLLOUT_GATE_CHECKLIST_SCHEMA_REF = "urn:forgeroot:rollout-gate-checklist:v1" as const;
export const POST_TRANSPORT_AUDIT_PLAN_VERSION = 1 as const;
export const POST_TRANSPORT_AUDIT_PLAN_SCHEMA_REF = "urn:forgeroot:post-transport-audit-plan:v1" as const;
export const LINEAGE_HANDOFF_PACK_VERSION = 1 as const;
export const LINEAGE_HANDOFF_PACK_SCHEMA_REF = "urn:forgeroot:lineage-handoff-pack:v1" as const;

export type GateStatus = "pass" | "fail" | "pending";
export type RolloutGateChecklistStatus = "rollout_gate_ready" | "blocked" | "invalid";
export type PostTransportAuditPlanStatus = "audit_plan_ready" | "blocked" | "invalid";
export type LineageHandoffPackStatus = "handoff_pack_ready" | "blocked" | "invalid";

export interface CompletionGateIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface RolloutGateCheckInput {
  readonly gate_id: string;
  readonly status: GateStatus;
  readonly summary: string;
  readonly evidence_digest?: string;
}

export interface RolloutGateCheck {
  readonly gate_id: string;
  readonly status: GateStatus;
  readonly summary: string;
  readonly required: true;
  readonly evidence_digest: string;
}

export interface RolloutGateChecklistInput {
  readonly now?: string;
  readonly receipt: ExecutionArtifactReceiptResult;
  readonly checks?: readonly RolloutGateCheckInput[];
}

export interface RolloutGateChecklistResult {
  readonly manifest_version: typeof ROLLOUT_GATE_CHECKLIST_VERSION;
  readonly schema_ref: typeof ROLLOUT_GATE_CHECKLIST_SCHEMA_REF;
  readonly checklist_id: string;
  readonly created_at: string;
  readonly status: RolloutGateChecklistStatus;
  readonly decision: "rollout_gate_ready" | "rollout_gate_blocked" | "invalid_rollout_gate_input";
  readonly reasons: readonly string[];
  readonly receipt_ref: {
    readonly receipt_id: string;
    readonly receipt_digest: string;
    readonly receipt_status: string;
    readonly execution_plan_id: string;
  };
  readonly checks: readonly RolloutGateCheck[];
  readonly summary: {
    readonly pass_count: number;
    readonly fail_count: number;
    readonly pending_count: number;
  };
  readonly guards: CompletionGuards;
  readonly dry_run: CompletionDryRun;
  readonly checklist_digest: string;
  readonly issues?: readonly CompletionGateIssue[];
}

export interface PostTransportAuditPlanInput {
  readonly now?: string;
  readonly checklist: RolloutGateChecklistResult;
}

export interface AuditPlanStep {
  readonly step_id: string;
  readonly action: "verify_artifact_receipt" | "inspect_rollout_gates" | "confirm_no_side_effects" | "prepare_human_audit";
  readonly status: "planned_not_executed" | "blocked";
  readonly executed: false;
  readonly evidence_digest: string;
}

export interface PostTransportAuditPlanResult {
  readonly manifest_version: typeof POST_TRANSPORT_AUDIT_PLAN_VERSION;
  readonly schema_ref: typeof POST_TRANSPORT_AUDIT_PLAN_SCHEMA_REF;
  readonly audit_plan_id: string;
  readonly created_at: string;
  readonly status: PostTransportAuditPlanStatus;
  readonly decision: "post_transport_audit_plan_ready" | "post_transport_audit_plan_blocked" | "invalid_post_transport_audit_input";
  readonly reasons: readonly string[];
  readonly checklist_ref: {
    readonly checklist_id: string;
    readonly checklist_digest: string;
    readonly checklist_status: string;
    readonly receipt_id: string;
  };
  readonly audit_steps: readonly AuditPlanStep[];
  readonly guards: CompletionGuards;
  readonly dry_run: CompletionDryRun;
  readonly audit_plan_digest: string;
  readonly issues?: readonly CompletionGateIssue[];
}

export interface LineageHandoffPackInput {
  readonly now?: string;
  readonly audit_plan: PostTransportAuditPlanResult;
}

export interface LineageHandoffPackResult {
  readonly manifest_version: typeof LINEAGE_HANDOFF_PACK_VERSION;
  readonly schema_ref: typeof LINEAGE_HANDOFF_PACK_SCHEMA_REF;
  readonly handoff_pack_id: string;
  readonly created_at: string;
  readonly status: LineageHandoffPackStatus;
  readonly decision: "lineage_handoff_pack_ready" | "lineage_handoff_pack_blocked" | "invalid_lineage_handoff_input";
  readonly reasons: readonly string[];
  readonly audit_ref: {
    readonly audit_plan_id: string;
    readonly audit_plan_digest: string;
    readonly audit_plan_status: string;
    readonly checklist_id: string;
  };
  readonly handoff_entries: readonly {
    readonly entry_id: string;
    readonly kind: "artifact_receipt" | "rollout_gate" | "audit_plan" | "safety_boundary";
    readonly digest: string;
    readonly persisted: false;
  }[];
  readonly guards: CompletionGuards;
  readonly dry_run: CompletionDryRun;
  readonly handoff_digest: string;
  readonly issues?: readonly CompletionGateIssue[];
}

export interface CompletionValidationResult {
  readonly ok: boolean;
  readonly issues: readonly CompletionGateIssue[];
}

interface CompletionGuards {
  readonly no_file_write: true;
  readonly no_artifact_persistence: true;
  readonly no_token_request: true;
  readonly no_github_api_call: true;
  readonly no_git_push: true;
  readonly no_branch_creation: true;
  readonly no_merge_operation: true;
  readonly no_mutation_execution: true;
}

interface CompletionDryRun {
  readonly file_written: false;
  readonly artifact_persisted: false;
  readonly token_requested: false;
  readonly github_api_called: false;
  readonly branch_created: false;
  readonly git_push_performed: false;
  readonly mutation_executed: false;
  readonly auto_merged: false;
}

export const ROLLOUT_GATE_CHECKLIST_CONTRACT = {
  consumes: ["execution_artifact_receipt_manifest"],
  produces: ["rollout_gate_checklist_manifest"],
  validates: ["t056_artifact_receipt", "required_gates_pass", "no_side_effects"],
  forbids: ["file_write", "artifact_persistence", "token_request", "github_api_call", "git_push", "branch_creation", "merge_operation", "mutation_execution"],
  deterministic: true,
  dryRunOnly: true,
} as const;

export const POST_TRANSPORT_AUDIT_PLAN_CONTRACT = {
  consumes: ["rollout_gate_checklist_manifest"],
  produces: ["post_transport_audit_plan_manifest"],
  validates: ["t057_rollout_gate_ready", "audit_steps_unexecuted", "no_side_effects"],
  forbids: ["file_write", "artifact_persistence", "token_request", "github_api_call", "git_push", "branch_creation", "merge_operation", "mutation_execution"],
  deterministic: true,
  dryRunOnly: true,
} as const;

export const LINEAGE_HANDOFF_PACK_CONTRACT = {
  consumes: ["post_transport_audit_plan_manifest"],
  produces: ["lineage_handoff_pack_manifest"],
  validates: ["t058_audit_plan_ready", "handoff_entries_not_persisted", "no_side_effects"],
  forbids: ["file_write", "artifact_persistence", "token_request", "github_api_call", "git_push", "branch_creation", "merge_operation", "mutation_execution"],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const GATE_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

export function runRolloutGateChecklist(input: unknown): RolloutGateChecklistResult {
  const envelope = normalizeRolloutInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.receipt.created_at || DEFAULT_NOW);
  const issues = [...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be RFC3339 UTC" }] : []), ...envelope.issues];
  if (issues.length > 0 || envelope.input === null) return invalidChecklist(createdAt ?? DEFAULT_NOW, envelope.receipt, [], issues);
  const validation = validateExecutionArtifactReceiptResult(envelope.input.receipt);
  if (!validation.ok) return invalidChecklist(createdAt ?? DEFAULT_NOW, envelope.input.receipt, [], [{ path: "receipt", code: "invalid_t056_artifact_receipt", message: "receipt must pass T056 validation" }, ...validation.issues.map((entry) => ({ path: `receipt.${entry.path}`, code: entry.code, message: entry.message }))]);
  const checks = [...derivedRolloutChecks(envelope.input.receipt), ...(envelope.input.checks ?? []).map(normalizeGateCheck)];
  const summary = summarizeChecks(checks);
  const status: RolloutGateChecklistStatus = envelope.input.receipt.status === "artifact_receipt_ready" && summary.fail_count === 0 && summary.pending_count === 0 ? "rollout_gate_ready" : "blocked";
  const result = checklistResult(createdAt ?? DEFAULT_NOW, envelope.input.receipt, checks, summary, status);
  const readBack = validateRolloutGateChecklistResult(result);
  if (!readBack.ok) return invalidChecklist(createdAt ?? DEFAULT_NOW, envelope.input.receipt, checks, readBack.issues);
  return result;
}

export function runPostTransportAuditPlan(input: unknown): PostTransportAuditPlanResult {
  const envelope = normalizeAuditInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.checklist.created_at || DEFAULT_NOW);
  const issues = [...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be RFC3339 UTC" }] : []), ...envelope.issues];
  if (issues.length > 0 || envelope.input === null) return invalidAuditPlan(createdAt ?? DEFAULT_NOW, envelope.checklist, issues);
  const validation = validateRolloutGateChecklistResult(envelope.input.checklist);
  if (!validation.ok) return invalidAuditPlan(createdAt ?? DEFAULT_NOW, envelope.input.checklist, [{ path: "checklist", code: "invalid_t057_rollout_gate", message: "checklist must pass T057 validation" }, ...validation.issues.map((entry) => ({ path: `checklist.${entry.path}`, code: entry.code, message: entry.message }))]);
  const status: PostTransportAuditPlanStatus = envelope.input.checklist.status === "rollout_gate_ready" ? "audit_plan_ready" : "blocked";
  const result = auditPlanResult(createdAt ?? DEFAULT_NOW, envelope.input.checklist, status);
  const readBack = validatePostTransportAuditPlanResult(result);
  if (!readBack.ok) return invalidAuditPlan(createdAt ?? DEFAULT_NOW, envelope.input.checklist, readBack.issues);
  return result;
}

export function runLineageHandoffPack(input: unknown): LineageHandoffPackResult {
  const envelope = normalizeHandoffInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.audit_plan.created_at || DEFAULT_NOW);
  const issues = [...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be RFC3339 UTC" }] : []), ...envelope.issues];
  if (issues.length > 0 || envelope.input === null) return invalidHandoff(createdAt ?? DEFAULT_NOW, envelope.audit_plan, issues);
  const validation = validatePostTransportAuditPlanResult(envelope.input.audit_plan);
  if (!validation.ok) return invalidHandoff(createdAt ?? DEFAULT_NOW, envelope.input.audit_plan, [{ path: "audit_plan", code: "invalid_t058_audit_plan", message: "audit_plan must pass T058 validation" }, ...validation.issues.map((entry) => ({ path: `audit_plan.${entry.path}`, code: entry.code, message: entry.message }))]);
  const status: LineageHandoffPackStatus = envelope.input.audit_plan.status === "audit_plan_ready" ? "handoff_pack_ready" : "blocked";
  const result = handoffResult(createdAt ?? DEFAULT_NOW, envelope.input.audit_plan, status);
  const readBack = validateLineageHandoffPackResult(result);
  if (!readBack.ok) return invalidHandoff(createdAt ?? DEFAULT_NOW, envelope.input.audit_plan, readBack.issues);
  return result;
}

export function validateRolloutGateChecklistResult(result: unknown): CompletionValidationResult {
  const issues: CompletionGateIssue[] = [];
  if (!baseValidate(result, ROLLOUT_GATE_CHECKLIST_VERSION, ROLLOUT_GATE_CHECKLIST_SCHEMA_REF, issues)) return { ok: false, issues };
  const value = result as unknown as RolloutGateChecklistResult;
  validateRef(value.receipt_ref, "receipt_ref", issues);
  if (!Array.isArray(value.checks)) issue(issues, "checks", "checks_required", "checks must be an array");
  else value.checks.forEach((entry, index) => validateGateCheck(entry, `checks[${index}]`, issues));
  validateSummary(value.summary, value.checks ?? [], issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value.status, value.decision, value.issues, issues, ["rollout_gate_ready", "rollout_gate_blocked", "invalid_rollout_gate_input"]);
  validateDigest(value as unknown as Record<string, unknown>, "checklist_digest", "checklist_id", "rollout-gate-checklist", (candidate) => checklistDigestPayload(candidate as RolloutGateChecklistResult), issues);
  return { ok: issues.length === 0, issues };
}

export function validatePostTransportAuditPlanResult(result: unknown): CompletionValidationResult {
  const issues: CompletionGateIssue[] = [];
  if (!baseValidate(result, POST_TRANSPORT_AUDIT_PLAN_VERSION, POST_TRANSPORT_AUDIT_PLAN_SCHEMA_REF, issues)) return { ok: false, issues };
  const value = result as unknown as PostTransportAuditPlanResult;
  validateRef(value.checklist_ref, "checklist_ref", issues);
  if (!Array.isArray(value.audit_steps)) issue(issues, "audit_steps", "audit_steps_required", "audit_steps must be an array");
  else value.audit_steps.forEach((entry, index) => validateAuditStep(entry, `audit_steps[${index}]`, issues));
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value.status, value.decision, value.issues, issues, ["post_transport_audit_plan_ready", "post_transport_audit_plan_blocked", "invalid_post_transport_audit_input"]);
  validateDigest(value as unknown as Record<string, unknown>, "audit_plan_digest", "audit_plan_id", "post-transport-audit-plan", (candidate) => auditPlanDigestPayload(candidate as PostTransportAuditPlanResult), issues);
  return { ok: issues.length === 0, issues };
}

export function validateLineageHandoffPackResult(result: unknown): CompletionValidationResult {
  const issues: CompletionGateIssue[] = [];
  if (!baseValidate(result, LINEAGE_HANDOFF_PACK_VERSION, LINEAGE_HANDOFF_PACK_SCHEMA_REF, issues)) return { ok: false, issues };
  const value = result as unknown as LineageHandoffPackResult;
  validateRef(value.audit_ref, "audit_ref", issues);
  if (!Array.isArray(value.handoff_entries)) issue(issues, "handoff_entries", "handoff_entries_required", "handoff_entries must be an array");
  else value.handoff_entries.forEach((entry, index) => validateHandoffEntry(entry, `handoff_entries[${index}]`, issues));
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value.status, value.decision, value.issues, issues, ["lineage_handoff_pack_ready", "lineage_handoff_pack_blocked", "invalid_lineage_handoff_input"]);
  validateDigest(value as unknown as Record<string, unknown>, "handoff_digest", "handoff_pack_id", "lineage-handoff-pack", (candidate) => handoffDigestPayload(candidate as LineageHandoffPackResult), issues);
  return { ok: issues.length === 0, issues };
}

function checklistResult(createdAt: string, receipt: ExecutionArtifactReceiptResult, checks: readonly RolloutGateCheck[], summary: RolloutGateChecklistResult["summary"], status: RolloutGateChecklistStatus): RolloutGateChecklistResult {
  const draft: Omit<RolloutGateChecklistResult, "checklist_id" | "checklist_digest"> = {
    manifest_version: ROLLOUT_GATE_CHECKLIST_VERSION,
    schema_ref: ROLLOUT_GATE_CHECKLIST_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "rollout_gate_ready" ? "rollout_gate_ready" : "rollout_gate_blocked",
    reasons: status === "rollout_gate_ready" ? ["t056_artifact_receipt_ready", "rollout_gates_pass"] : ["rollout_gate_blocked"],
    receipt_ref: receiptRefFor(receipt),
    checks,
    summary,
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(checklistDigestPayload(draft));
  return { ...draft, checklist_id: stableId("rollout-gate-checklist", [digest]), checklist_digest: digest };
}

function invalidChecklist(createdAt: string, receipt: ExecutionArtifactReceiptResult, checks: readonly RolloutGateCheck[], issues: readonly CompletionGateIssue[]): RolloutGateChecklistResult {
  const draft = { ...checklistResult(createdAt, receipt, checks, summarizeChecks(checks), "invalid"), decision: "invalid_rollout_gate_input" as const, reasons: uniqueStrings(["invalid_rollout_gate_input", ...issues.map((entry) => entry.code)]), issues };
  const digest = canonicalDigest(checklistDigestPayload(draft));
  return { ...draft, checklist_id: stableId("rollout-gate-checklist", [digest]), checklist_digest: digest };
}

function auditPlanResult(createdAt: string, checklist: RolloutGateChecklistResult, status: PostTransportAuditPlanStatus): PostTransportAuditPlanResult {
  const stepStatus = status === "audit_plan_ready" ? "planned_not_executed" : "blocked";
  const steps: readonly AuditPlanStep[] = ["verify_artifact_receipt", "inspect_rollout_gates", "confirm_no_side_effects", "prepare_human_audit"].map((action) => ({ step_id: action.replaceAll("_", "-"), action: action as AuditPlanStep["action"], status: stepStatus, executed: false, evidence_digest: canonicalDigest({ action, checklist_id: checklist.checklist_id }) }));
  const draft: Omit<PostTransportAuditPlanResult, "audit_plan_id" | "audit_plan_digest"> = {
    manifest_version: POST_TRANSPORT_AUDIT_PLAN_VERSION,
    schema_ref: POST_TRANSPORT_AUDIT_PLAN_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "audit_plan_ready" ? "post_transport_audit_plan_ready" : "post_transport_audit_plan_blocked",
    reasons: status === "audit_plan_ready" ? ["t057_rollout_gate_ready", "audit_steps_not_executed"] : ["post_transport_audit_plan_blocked"],
    checklist_ref: checklistRefFor(checklist),
    audit_steps: steps,
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(auditPlanDigestPayload(draft));
  return { ...draft, audit_plan_id: stableId("post-transport-audit-plan", [digest]), audit_plan_digest: digest };
}

function invalidAuditPlan(createdAt: string, checklist: RolloutGateChecklistResult, issues: readonly CompletionGateIssue[]): PostTransportAuditPlanResult {
  const draft = { ...auditPlanResult(createdAt, checklist, "invalid"), decision: "invalid_post_transport_audit_input" as const, reasons: uniqueStrings(["invalid_post_transport_audit_input", ...issues.map((entry) => entry.code)]), issues };
  const digest = canonicalDigest(auditPlanDigestPayload(draft));
  return { ...draft, audit_plan_id: stableId("post-transport-audit-plan", [digest]), audit_plan_digest: digest };
}

function handoffResult(createdAt: string, auditPlan: PostTransportAuditPlanResult, status: LineageHandoffPackStatus): LineageHandoffPackResult {
  const entries = ["artifact_receipt", "rollout_gate", "audit_plan", "safety_boundary"].map((kind) => ({ entry_id: `${kind.replace("_", "-")}-${fnv1a(`${kind}:${auditPlan.audit_plan_id}`).toString(16).padStart(8, "0")}`, kind: kind as LineageHandoffPackResult["handoff_entries"][number]["kind"], digest: canonicalDigest({ kind, audit_plan_id: auditPlan.audit_plan_id }), persisted: false as const }));
  const draft: Omit<LineageHandoffPackResult, "handoff_pack_id" | "handoff_digest"> = {
    manifest_version: LINEAGE_HANDOFF_PACK_VERSION,
    schema_ref: LINEAGE_HANDOFF_PACK_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "handoff_pack_ready" ? "lineage_handoff_pack_ready" : "lineage_handoff_pack_blocked",
    reasons: status === "handoff_pack_ready" ? ["t058_audit_plan_ready", "handoff_entries_not_persisted"] : ["lineage_handoff_pack_blocked"],
    audit_ref: auditRefFor(auditPlan),
    handoff_entries: entries,
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(handoffDigestPayload(draft));
  return { ...draft, handoff_pack_id: stableId("lineage-handoff-pack", [digest]), handoff_digest: digest };
}

function invalidHandoff(createdAt: string, auditPlan: PostTransportAuditPlanResult, issues: readonly CompletionGateIssue[]): LineageHandoffPackResult {
  const draft = { ...handoffResult(createdAt, auditPlan, "invalid"), decision: "invalid_lineage_handoff_input" as const, reasons: uniqueStrings(["invalid_lineage_handoff_input", ...issues.map((entry) => entry.code)]), issues };
  const digest = canonicalDigest(handoffDigestPayload(draft));
  return { ...draft, handoff_pack_id: stableId("lineage-handoff-pack", [digest]), handoff_digest: digest };
}

function derivedRolloutChecks(receipt: ExecutionArtifactReceiptResult): readonly RolloutGateCheck[] {
  return [
    normalizeGateCheck({ gate_id: "artifact-receipt-ready", status: receipt.status === "artifact_receipt_ready" ? "pass" : "fail", summary: "T056 artifact receipt is ready", evidence_digest: receipt.receipt_digest }),
    normalizeGateCheck({ gate_id: "artifact-not-persisted", status: receipt.dry_run.artifact_persisted === false && receipt.artifact.write_target === null ? "pass" : "fail", summary: "artifact was not persisted" }),
    normalizeGateCheck({ gate_id: "no-live-side-effects", status: receipt.dry_run.github_api_called === false && receipt.dry_run.file_written === false && receipt.dry_run.git_push_performed === false ? "pass" : "fail", summary: "no live side effects occurred" }),
  ];
}

function normalizeGateCheck(input: RolloutGateCheckInput): RolloutGateCheck {
  return { gate_id: input.gate_id, status: input.status, summary: input.summary, required: true, evidence_digest: input.evidence_digest ?? canonicalDigest(input) };
}

function summarizeChecks(checks: readonly RolloutGateCheck[]): RolloutGateChecklistResult["summary"] {
  return { pass_count: checks.filter((entry) => entry.status === "pass").length, fail_count: checks.filter((entry) => entry.status === "fail").length, pending_count: checks.filter((entry) => entry.status === "pending").length };
}

function normalizeRolloutInput(input: unknown) {
  const issues: CompletionGateIssue[] = [];
  if (!isRecord(input)) return { input: null, now: undefined, receipt: emptyReceipt(), issues };
  const receipt = isRecord(input.receipt) ? input.receipt as unknown as ExecutionArtifactReceiptResult : emptyReceipt();
  if (!isRecord(input.receipt)) issue(issues, "receipt", "receipt_must_be_object", "receipt must be a T056 result object");
  const checks = Array.isArray(input.checks) ? input.checks.map((entry, index) => normalizeInputGate(entry, `checks[${index}]`, issues)) : undefined;
  if (input.checks !== undefined && !Array.isArray(input.checks)) issue(issues, "checks", "checks_must_be_array", "checks must be an array");
  return { input: { receipt, ...(checks === undefined ? {} : { checks }) }, now: optionalString(input.now, "now", issues), receipt, issues };
}

function normalizeAuditInput(input: unknown) {
  const issues: CompletionGateIssue[] = [];
  if (!isRecord(input)) return { input: null, now: undefined, checklist: emptyChecklist(), issues };
  const checklist = isRecord(input.checklist) ? input.checklist as unknown as RolloutGateChecklistResult : emptyChecklist();
  if (!isRecord(input.checklist)) issue(issues, "checklist", "checklist_must_be_object", "checklist must be a T057 result object");
  return { input: { checklist }, now: optionalString(input.now, "now", issues), checklist, issues };
}

function normalizeHandoffInput(input: unknown) {
  const issues: CompletionGateIssue[] = [];
  if (!isRecord(input)) return { input: null, now: undefined, audit_plan: emptyAuditPlan(), issues };
  const auditPlan = isRecord(input.audit_plan) ? input.audit_plan as unknown as PostTransportAuditPlanResult : emptyAuditPlan();
  if (!isRecord(input.audit_plan)) issue(issues, "audit_plan", "audit_plan_must_be_object", "audit_plan must be a T058 result object");
  return { input: { audit_plan: auditPlan }, now: optionalString(input.now, "now", issues), audit_plan: auditPlan, issues };
}

function normalizeInputGate(value: unknown, path: string, issues: CompletionGateIssue[]): RolloutGateCheckInput {
  if (!isRecord(value)) { issue(issues, path, "gate_must_be_object", "gate must be an object"); return { gate_id: "", status: "fail", summary: "" }; }
  const gateId = typeof value.gate_id === "string" ? value.gate_id : "";
  if (!GATE_ID.test(gateId)) issue(issues, `${path}.gate_id`, "invalid_gate_id", "gate_id must be lowercase kebab-case");
  const status = value.status === "pass" || value.status === "fail" || value.status === "pending" ? value.status : "fail";
  if (status !== value.status) issue(issues, `${path}.status`, "invalid_gate_status", "status must be pass, fail, or pending");
  const summary = typeof value.summary === "string" && value.summary.trim().length > 0 ? value.summary.trim() : "";
  if (summary.length === 0) issue(issues, `${path}.summary`, "summary_required", "summary is required");
  const evidenceDigest = optionalString(value.evidence_digest, `${path}.evidence_digest`, issues);
  if (evidenceDigest !== undefined && !DIGEST.test(evidenceDigest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
  return { gate_id: gateId, status, summary, ...(evidenceDigest === undefined ? {} : { evidence_digest: evidenceDigest }) };
}

function validateGateCheck(value: unknown, path: string, issues: CompletionGateIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "gate_must_be_object", "gate must be an object"); return; }
  if (typeof value.gate_id !== "string" || !GATE_ID.test(value.gate_id)) issue(issues, `${path}.gate_id`, "invalid_gate_id", "gate_id must be lowercase kebab-case");
  if (value.status !== "pass" && value.status !== "fail" && value.status !== "pending") issue(issues, `${path}.status`, "invalid_gate_status", "status must be pass, fail, or pending");
  if (value.required !== true) issue(issues, `${path}.required`, "required_gate_expected", "gate must be required");
  if (typeof value.summary !== "string" || value.summary.length === 0) issue(issues, `${path}.summary`, "summary_required", "summary is required");
  if (typeof value.evidence_digest !== "string" || !DIGEST.test(value.evidence_digest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
}

function validateSummary(summary: unknown, checks: readonly RolloutGateCheck[], issues: CompletionGateIssue[]): void {
  if (!isRecord(summary)) { issue(issues, "summary", "summary_required", "summary must be present"); return; }
  const expected = summarizeChecks(checks);
  for (const key of ["pass_count", "fail_count", "pending_count"] as const) if (summary[key] !== expected[key]) issue(issues, `summary.${key}`, "summary_mismatch", `${key} must match checks`);
}

function validateAuditStep(value: unknown, path: string, issues: CompletionGateIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "audit_step_must_be_object", "audit step must be an object"); return; }
  if (typeof value.step_id !== "string" || value.step_id.length === 0) issue(issues, `${path}.step_id`, "invalid_step_id", "step_id is required");
  if (value.executed !== false) issue(issues, `${path}.executed`, "step_execution_forbidden", "audit steps must not execute");
  if (typeof value.evidence_digest !== "string" || !DIGEST.test(value.evidence_digest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
}

function validateHandoffEntry(value: unknown, path: string, issues: CompletionGateIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "handoff_entry_must_be_object", "handoff entry must be an object"); return; }
  if (typeof value.entry_id !== "string" || value.entry_id.length === 0) issue(issues, `${path}.entry_id`, "invalid_entry_id", "entry_id is required");
  if (value.persisted !== false) issue(issues, `${path}.persisted`, "handoff_persistence_forbidden", "handoff entries must not be persisted");
  if (typeof value.digest !== "string" || !DIGEST.test(value.digest)) issue(issues, `${path}.digest`, "invalid_digest", "digest must be stable");
}

function baseValidate(result: unknown, version: number, schemaRef: string, issues: CompletionGateIssue[]): result is Record<string, unknown> {
  if (!isRecord(result)) { issue(issues, "result", "result_must_be_object", "result must be an object"); return false; }
  if (result.manifest_version !== version) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must match");
  if (result.schema_ref !== schemaRef) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must match");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  return true;
}

function validateRef(value: unknown, path: string, issues: CompletionGateIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "ref_required", "ref must be present"); return; }
  for (const [key, entry] of Object.entries(value)) {
    if (key.endsWith("digest")) { if (typeof entry !== "string" || !DIGEST.test(entry)) issue(issues, `${path}.${key}`, "invalid_digest", `${key} must be stable`); }
    else if (key.endsWith("id")) { if (typeof entry !== "string" || !ID.test(entry)) issue(issues, `${path}.${key}`, "invalid_id", `${key} must be deterministic`); }
    else if (typeof entry !== "string" || entry.length === 0) issue(issues, `${path}.${key}`, "invalid_ref_value", `${key} must be present`);
  }
}

function validateGuards(value: unknown, issues: CompletionGateIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: CompletionGateIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(status: string, decision: string, issuesValue: unknown, issues: CompletionGateIssue[], decisions: readonly string[]): void {
  if (!decisions.includes(decision)) issue(issues, "decision", "invalid_decision", "decision is invalid");
  if (status === "invalid") {
    if (!Array.isArray(issuesValue) || issuesValue.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid results must carry issues");
  } else if (issuesValue !== undefined) issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid results must not carry issues");
}

function validateDigest(value: Record<string, unknown>, digestKey: string, idKey: string, prefix: string, payload: (value: unknown) => unknown, issues: CompletionGateIssue[]): void {
  const expected = canonicalDigest(payload(value));
  if (value[digestKey] !== expected) issue(issues, digestKey, `${digestKey}_mismatch`, `${digestKey} must cover payload`);
  if (value[idKey] !== stableId(prefix, [expected])) issue(issues, idKey, `${idKey}_mismatch`, `${idKey} must match payload`);
}

function receiptRefFor(receipt: ExecutionArtifactReceiptResult): RolloutGateChecklistResult["receipt_ref"] {
  return { receipt_id: receipt.receipt_id, receipt_digest: receipt.receipt_digest, receipt_status: receipt.status, execution_plan_id: receipt.plan_ref.execution_plan_id };
}
function checklistRefFor(checklist: RolloutGateChecklistResult): PostTransportAuditPlanResult["checklist_ref"] {
  return { checklist_id: checklist.checklist_id, checklist_digest: checklist.checklist_digest, checklist_status: checklist.status, receipt_id: checklist.receipt_ref.receipt_id };
}
function auditRefFor(audit: PostTransportAuditPlanResult): LineageHandoffPackResult["audit_ref"] {
  return { audit_plan_id: audit.audit_plan_id, audit_plan_digest: audit.audit_plan_digest, audit_plan_status: audit.status, checklist_id: audit.checklist_ref.checklist_id };
}

function checklistDigestPayload(value: Omit<RolloutGateChecklistResult, "checklist_id" | "checklist_digest"> | RolloutGateChecklistResult): unknown { return { status: value.status, decision: value.decision, reasons: value.reasons, receipt_ref: value.receipt_ref, checks: value.checks, summary: value.summary, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] }; }
function auditPlanDigestPayload(value: Omit<PostTransportAuditPlanResult, "audit_plan_id" | "audit_plan_digest"> | PostTransportAuditPlanResult): unknown { return { status: value.status, decision: value.decision, reasons: value.reasons, checklist_ref: value.checklist_ref, audit_steps: value.audit_steps, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] }; }
function handoffDigestPayload(value: Omit<LineageHandoffPackResult, "handoff_pack_id" | "handoff_digest"> | LineageHandoffPackResult): unknown { return { status: value.status, decision: value.decision, reasons: value.reasons, audit_ref: value.audit_ref, handoff_entries: value.handoff_entries, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] }; }

function guards(): CompletionGuards { return { no_file_write: true, no_artifact_persistence: true, no_token_request: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_mutation_execution: true }; }
function dryRun(): CompletionDryRun { return { file_written: false, artifact_persisted: false, token_requested: false, github_api_called: false, branch_created: false, git_push_performed: false, mutation_executed: false, auto_merged: false }; }

function emptyReceipt(): ExecutionArtifactReceiptResult {
  return { manifest_version: 1, schema_ref: "urn:forgeroot:execution-artifact-receipt:v1", receipt_id: "execution-artifact-receipt-invalid-00000000", created_at: DEFAULT_NOW, status: "invalid", decision: "invalid_execution_artifact_input", reasons: [], plan_ref: { execution_plan_id: "transport-execution-plan-invalid-00000000", execution_plan_digest: canonicalDigest(null), execution_plan_status: "invalid", request_id: "mutation-pr-transport-invalid-00000000", approval_verifier_id: "approval-receipt-verifier-invalid-00000000" }, artifact: { label: "empty", kind: "dry_run_transport_execution_summary", step_count: 0, action_counts: {}, step_digest: canonicalDigest(null), write_target: null }, guards: { t055_ready_plan_required: true, no_file_write: true, no_artifact_persistence: true, no_token_request: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_mutation_execution: true }, dry_run: dryRun(), receipt_digest: canonicalDigest(null), issues: [] };
}
function emptyChecklist(): RolloutGateChecklistResult { return checklistResult(DEFAULT_NOW, emptyReceipt(), [], summarizeChecks([]), "invalid"); }
function emptyAuditPlan(): PostTransportAuditPlanResult { return auditPlanResult(DEFAULT_NOW, emptyChecklist(), "invalid"); }

function optionalString(value: unknown, path: string, issues: CompletionGateIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") { issue(issues, path, "string_required", `${path} must be a string when provided`); return undefined; }
  return value;
}
function resolveTimestamp(value: string | undefined, fallback: string): string | null { if (value !== undefined) return isRfc3339Utc(value) ? value : null; return isRfc3339Utc(fallback) ? fallback : DEFAULT_NOW; }
function isRfc3339Utc(value: string): boolean { if (!RFC3339_UTC.test(value)) return false; const parsed = new Date(value); if (Number.isNaN(parsed.getTime())) return false; const normalized = value.includes(".") ? value : value.replace("Z", ".000Z"); return parsed.toISOString() === normalized; }
function issue(issues: CompletionGateIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
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

export const createRolloutGateChecklist = runRolloutGateChecklist;
export const runT057RolloutGateChecklist = runRolloutGateChecklist;
export const validateT057RolloutGateChecklist = validateRolloutGateChecklistResult;
export const createPostTransportAuditPlan = runPostTransportAuditPlan;
export const runT058PostTransportAuditPlan = runPostTransportAuditPlan;
export const validateT058PostTransportAuditPlan = validatePostTransportAuditPlanResult;
export const createLineageHandoffPack = runLineageHandoffPack;
export const runT059LineageHandoffPack = runLineageHandoffPack;
export const validateT059LineageHandoffPack = validateLineageHandoffPackResult;
