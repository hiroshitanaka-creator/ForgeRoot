import { validateTransportReadinessLedgerResult } from "./transport-readiness-ledger.js";
import type { TransportReadinessLedgerResult } from "./transport-readiness-ledger.js";

export const APPROVAL_RECEIPT_VERIFIER_VERSION = 1 as const;
export const APPROVAL_RECEIPT_VERIFIER_SCHEMA_REF = "urn:forgeroot:approval-receipt-verifier:v1" as const;

export type ApprovalReceiptVerifierStatus = "approved" | "blocked" | "invalid";
export type ApprovalReceiptVerifierDecision = "human_approval_verified" | "human_approval_blocked" | "invalid_human_approval_input";
export type ApprovalReceiptDecision = "approve" | "reject" | "hold";

export interface ApprovalReceiptVerifierInput {
  readonly now?: string;
  readonly ledger: TransportReadinessLedgerResult;
  readonly receipts: readonly ApprovalReceiptInput[];
  readonly policy?: ApprovalReceiptPolicy;
}

export interface ApprovalReceiptPolicy {
  readonly required_approvals?: number;
  readonly allowed_approvers?: readonly string[];
  readonly require_scope_match?: boolean;
}

export interface ApprovalReceiptInput {
  readonly receipt_id: string;
  readonly approver: string;
  readonly approved_at: string;
  readonly decision: ApprovalReceiptDecision;
  readonly statement: string;
  readonly evidence_digest: string;
  readonly scope: {
    readonly ledger_id: string;
    readonly ledger_digest: string;
    readonly request_id: string;
    readonly request_digest: string;
    readonly plan_id: string | null;
  };
}

export interface ApprovalReceiptVerifierIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ApprovalReceiptRecord {
  readonly receipt_id: string;
  readonly approver: string;
  readonly approved_at: string;
  readonly decision: ApprovalReceiptDecision;
  readonly statement_digest: string;
  readonly evidence_digest: string;
  readonly scope: ApprovalReceiptInput["scope"];
}

export interface ApprovalReceiptVerifierResult {
  readonly manifest_version: typeof APPROVAL_RECEIPT_VERIFIER_VERSION;
  readonly schema_ref: typeof APPROVAL_RECEIPT_VERIFIER_SCHEMA_REF;
  readonly verifier_id: string;
  readonly created_at: string;
  readonly status: ApprovalReceiptVerifierStatus;
  readonly decision: ApprovalReceiptVerifierDecision;
  readonly reasons: readonly string[];
  readonly ledger_ref: {
    readonly ledger_id: string;
    readonly ledger_digest: string;
    readonly ledger_status: string;
    readonly request_id: string;
    readonly request_digest: string;
    readonly plan_id: string | null;
  };
  readonly policy: {
    readonly required_approvals: number;
    readonly allowed_approvers: readonly string[] | null;
    readonly require_scope_match: true;
  };
  readonly receipts: readonly ApprovalReceiptRecord[];
  readonly approval_summary: {
    readonly accepted_approvals: number;
    readonly rejected_count: number;
    readonly hold_count: number;
    readonly missing_approvals: number;
    readonly approvers: readonly string[];
  };
  readonly review_gate: {
    readonly approval_class: "C";
    readonly human_review_required_before_execution: true;
    readonly human_review_required_before_merge: true;
    readonly approval_record_write_authorized: false;
  };
  readonly guards: {
    readonly t053_ready_ledger_required: true;
    readonly explicit_receipt_required: true;
    readonly no_approval_record_write: true;
    readonly no_github_api_call: true;
    readonly no_token_request: true;
    readonly no_git_push: true;
    readonly no_branch_creation: true;
    readonly no_merge_operation: true;
    readonly no_mutation_execution: true;
    readonly no_file_write: true;
  };
  readonly dry_run: {
    readonly approval_record_written: false;
    readonly github_api_called: false;
    readonly token_requested: false;
    readonly branch_created: false;
    readonly git_push_performed: false;
    readonly mutation_executed: false;
    readonly file_written: false;
    readonly auto_merged: false;
  };
  readonly approval_digest: string;
  readonly issues?: readonly ApprovalReceiptVerifierIssue[];
}

export interface ApprovalReceiptVerifierValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ApprovalReceiptVerifierIssue[];
}

export const APPROVAL_RECEIPT_VERIFIER_CONTRACT = {
  consumes: ["transport_readiness_replay_ledger", "human_approval_receipt"],
  produces: ["human_approval_receipt_verification_manifest"],
  validates: ["t053_ready_ledger", "receipt_scope_digest_match", "required_human_approvals", "approver_policy", "no_approval_record_write"],
  forbids: ["approval_record_write", "live_github_transport", "token_request", "git_push", "branch_creation", "merge_operation", "mutation_execution", "file_write"],
  deterministic: true,
  verifierOnly: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const APPROVER = /^[A-Za-z0-9_.-]+$/;

export function runApprovalReceiptVerifier(input: unknown): ApprovalReceiptVerifierResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.ledger.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];
  if (issues.length > 0 || envelope.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.ledger, envelope.receipts, envelope.policy, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "approval verifier input must be an object" }]);

  const ledgerValidation = validateTransportReadinessLedgerResult(envelope.input.ledger);
  if (!ledgerValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.ledger, envelope.input.receipts, envelope.input.policy, [
      { path: "ledger", code: "invalid_t053_readiness_ledger", message: "ledger must pass T053 read-back validation" },
      ...ledgerValidation.issues.map((entry) => ({ path: `ledger.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }

  const receiptIssues = validateReceiptSemantics(envelope.input.ledger, envelope.input.receipts, envelope.input.policy);
  if (receiptIssues.some((entry) => entry.code.endsWith("_mismatch") || entry.code.startsWith("invalid_") || entry.code === "duplicate_receipt_id" || entry.code === "secret_material_forbidden")) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.ledger, envelope.input.receipts, envelope.input.policy, receiptIssues);
  }

  const result = resultFor(createdAt ?? DEFAULT_NOW, envelope.input.ledger, envelope.input.receipts, envelope.input.policy, receiptIssues);
  const validation = validateApprovalReceiptVerifierResult(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.ledger, envelope.input.receipts, envelope.input.policy, validation.issues);
  return result;
}

export function validateApprovalReceiptVerifierResult(result: unknown): ApprovalReceiptVerifierValidationResult {
  const issues: ApprovalReceiptVerifierIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "approval verifier result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== APPROVAL_RECEIPT_VERIFIER_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== APPROVAL_RECEIPT_VERIFIER_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T054 approval verifier v1");
  if (typeof result.verifier_id !== "string" || !ID.test(result.verifier_id)) issue(issues, "verifier_id", "invalid_verifier_id", "verifier_id must be deterministic");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "approved" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be approved, blocked, or invalid");
  if (result.decision !== "human_approval_verified" && result.decision !== "human_approval_blocked" && result.decision !== "invalid_human_approval_input") issue(issues, "decision", "invalid_decision", "decision must be a T054 approval verifier decision");
  validateLedgerRef(result.ledger_ref, issues);
  const policy = validatePolicy(result.policy, issues);
  const receipts = validateReceipts(result.receipts, issues);
  const summary = validateSummary(result.approval_summary, receipts, policy, issues);
  validateReviewGate(result.review_gate, issues);
  validateGuards(result.guards, issues);
  validateDryRun(result.dry_run, issues);
  validateNoSecretMaterial(result, "result", issues);

  if (result.status === "approved") validateApproved(result, summary, issues);
  if (result.status === "blocked") validateBlocked(result, summary, issues);
  if (result.status === "invalid") validateInvalid(result, issues);

  const expectedDigest = canonicalDigest(approvalDigestPayload(result as unknown as ApprovalReceiptVerifierResult));
  if (result.approval_digest !== expectedDigest) issue(issues, "approval_digest", "approval_digest_mismatch", "approval digest must cover verifier payload");
  if (typeof result.verifier_id === "string" && result.verifier_id !== stableId("approval-receipt-verifier", [expectedDigest])) issue(issues, "verifier_id", "verifier_id_mismatch", "verifier_id must match deterministic approval payload");
  return { ok: issues.length === 0, issues };
}

function resultFor(createdAt: string, ledger: TransportReadinessLedgerResult, receipts: readonly ApprovalReceiptRecord[], policy: ApprovalReceiptVerifierResult["policy"], semanticIssues: readonly ApprovalReceiptVerifierIssue[]): ApprovalReceiptVerifierResult {
  const summary = summarizeReceipts(receipts, policy.required_approvals);
  const status: ApprovalReceiptVerifierStatus = ledger.status === "ready" && semanticIssues.length === 0 && summary.missing_approvals === 0 && summary.rejected_count === 0 && summary.hold_count === 0 ? "approved" : "blocked";
  const draft: Omit<ApprovalReceiptVerifierResult, "verifier_id" | "approval_digest"> = {
    manifest_version: APPROVAL_RECEIPT_VERIFIER_VERSION,
    schema_ref: APPROVAL_RECEIPT_VERIFIER_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "approved" ? "human_approval_verified" : "human_approval_blocked",
    reasons: status === "approved" ? ["t053_readiness_ledger_ready", "required_human_approvals_present", "approval_record_not_written"] : reasonsForBlocked(ledger, summary, semanticIssues),
    ledger_ref: ledgerRefFor(ledger),
    policy,
    receipts,
    approval_summary: summary,
    review_gate: reviewGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
  };
  const digest = canonicalDigest(approvalDigestPayload(draft));
  return { ...draft, verifier_id: stableId("approval-receipt-verifier", [digest]), approval_digest: digest };
}

function invalidResult(createdAt: string, ledger: TransportReadinessLedgerResult, receipts: readonly ApprovalReceiptRecord[], policy: ApprovalReceiptVerifierResult["policy"], issues: readonly ApprovalReceiptVerifierIssue[]): ApprovalReceiptVerifierResult {
  const draft: Omit<ApprovalReceiptVerifierResult, "verifier_id" | "approval_digest"> = {
    manifest_version: APPROVAL_RECEIPT_VERIFIER_VERSION,
    schema_ref: APPROVAL_RECEIPT_VERIFIER_SCHEMA_REF,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_human_approval_input",
    reasons: uniqueStrings(["invalid_human_approval_input", ...issues.map((entry) => entry.code)]),
    ledger_ref: ledgerRefFor(ledger),
    policy,
    receipts,
    approval_summary: summarizeReceipts(receipts, policy.required_approvals),
    review_gate: reviewGate(),
    guards: guards(),
    dry_run: dryRunFlags(),
    issues,
  };
  const digest = canonicalDigest(approvalDigestPayload(draft));
  return { ...draft, verifier_id: stableId("approval-receipt-verifier", [digest]), approval_digest: digest };
}

function normalizeInput(input: unknown): {
  readonly input: {
    readonly now?: string;
    readonly ledger: TransportReadinessLedgerResult;
    readonly receipts: readonly ApprovalReceiptRecord[];
    readonly policy: ApprovalReceiptVerifierResult["policy"];
  } | null;
  readonly now?: string;
  readonly ledger: TransportReadinessLedgerResult;
  readonly receipts: readonly ApprovalReceiptRecord[];
  readonly policy: ApprovalReceiptVerifierResult["policy"];
  readonly issues: readonly ApprovalReceiptVerifierIssue[];
} {
  const issues: ApprovalReceiptVerifierIssue[] = [];
  if (!isRecord(input)) return { input: null, ledger: emptyLedger(), receipts: [], policy: defaultPolicy(), issues: [{ path: "input", code: "input_must_be_object", message: "approval verifier input must be an object" }] };
  const ledger = isRecord(input.ledger) ? input.ledger as unknown as TransportReadinessLedgerResult : emptyLedger();
  if (!isRecord(input.ledger)) issue(issues, "ledger", "ledger_must_be_object", "ledger must be a T053 result object");
  const now = optionalString(input.now, "now", issues);
  const policy = normalizePolicy(input.policy, issues);
  const receipts = normalizeReceipts(input.receipts, issues);
  return { input: { ledger, receipts, policy, ...(now === undefined ? {} : { now }) }, now, ledger, receipts, policy, issues };
}

function normalizePolicy(value: unknown, issues: ApprovalReceiptVerifierIssue[]): ApprovalReceiptVerifierResult["policy"] {
  if (value === undefined) return defaultPolicy();
  if (!isRecord(value)) {
    issue(issues, "policy", "policy_must_be_object", "policy must be an object when provided");
    return defaultPolicy();
  }
  const requiredValue = value.required_approvals;
  const required = requiredValue === undefined ? 1 : requiredValue;
  if (typeof required !== "number" || !Number.isSafeInteger(required) || required < 1 || required > 8) issue(issues, "policy.required_approvals", "invalid_required_approvals", "required_approvals must be 1..8");
  const approvers = normalizeApprovers(value.allowed_approvers, "policy.allowed_approvers", issues);
  if (value.require_scope_match !== undefined && value.require_scope_match !== true) issue(issues, "policy.require_scope_match", "scope_match_required", "scope matching cannot be disabled");
  return { required_approvals: typeof required === "number" && Number.isSafeInteger(required) && required >= 1 && required <= 8 ? required : 1, allowed_approvers: approvers, require_scope_match: true };
}

function defaultPolicy(): ApprovalReceiptVerifierResult["policy"] {
  return { required_approvals: 1, allowed_approvers: null, require_scope_match: true };
}

function normalizeApprovers(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): readonly string[] | null {
  if (value === undefined) return null;
  if (!Array.isArray(value)) {
    issue(issues, path, "approvers_must_be_array", "allowed_approvers must be an array when provided");
    return [];
  }
  const normalized = value.map((entry, index) => {
    if (typeof entry !== "string" || !APPROVER.test(stripAt(entry))) {
      issue(issues, `${path}[${index}]`, "invalid_approver", "approver must be a safe login");
      return "";
    }
    return stripAt(entry);
  }).filter((entry) => entry.length > 0);
  if (new Set(normalized).size !== normalized.length) issue(issues, path, "duplicate_approver", "allowed_approvers must be unique");
  return normalized;
}

function normalizeReceipts(value: unknown, issues: ApprovalReceiptVerifierIssue[]): readonly ApprovalReceiptRecord[] {
  if (!Array.isArray(value)) {
    issue(issues, "receipts", "receipts_must_be_array", "receipts must be an array");
    return [];
  }
  const seen = new Set<string>();
  return value.map((entry, index) => {
    const path = `receipts[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, path, "receipt_must_be_object", "receipt must be an object");
      return emptyReceipt();
    }
    const receiptId = typeof entry.receipt_id === "string" ? entry.receipt_id : "";
    if (!ID.test(receiptId)) issue(issues, `${path}.receipt_id`, "invalid_receipt_id", "receipt_id must be deterministic");
    if (seen.has(receiptId)) issue(issues, `${path}.receipt_id`, "duplicate_receipt_id", "receipt_id values must be unique");
    seen.add(receiptId);
    const approver = typeof entry.approver === "string" ? stripAt(entry.approver) : "";
    if (!APPROVER.test(approver)) issue(issues, `${path}.approver`, "invalid_approver", "approver must be a safe login");
    const approvedAt = typeof entry.approved_at === "string" && isRfc3339Utc(entry.approved_at) ? entry.approved_at : "";
    if (approvedAt.length === 0) issue(issues, `${path}.approved_at`, "invalid_approved_at", "approved_at must be RFC3339 UTC");
    const decision = entry.decision === "approve" || entry.decision === "reject" || entry.decision === "hold" ? entry.decision : "hold";
    if (entry.decision !== decision) issue(issues, `${path}.decision`, "invalid_receipt_decision", "decision must be approve, reject, or hold");
    const statement = typeof entry.statement === "string" && entry.statement.trim().length > 0 ? entry.statement.trim() : "";
    if (statement.length === 0) issue(issues, `${path}.statement`, "statement_required", "statement is required");
    validateNoSecretMaterial(statement, `${path}.statement`, issues);
    const evidenceDigest = typeof entry.evidence_digest === "string" && DIGEST.test(entry.evidence_digest) ? entry.evidence_digest : "";
    if (evidenceDigest.length === 0) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
    const scope = normalizeScope(entry.scope, `${path}.scope`, issues);
    return {
      receipt_id: receiptId,
      approver,
      approved_at: approvedAt,
      decision,
      statement_digest: canonicalDigest(statement),
      evidence_digest: evidenceDigest,
      scope,
    };
  });
}

function normalizeScope(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): ApprovalReceiptInput["scope"] {
  if (!isRecord(value)) {
    issue(issues, path, "scope_must_be_object", "scope must be an object");
    return { ledger_id: "", ledger_digest: "", request_id: "", request_digest: "", plan_id: null };
  }
  const ledgerId = scopedId(value.ledger_id, `${path}.ledger_id`, issues);
  const ledgerDigest = scopedDigest(value.ledger_digest, `${path}.ledger_digest`, issues);
  const requestId = scopedId(value.request_id, `${path}.request_id`, issues);
  const requestDigest = scopedDigest(value.request_digest, `${path}.request_digest`, issues);
  let planId: string | null = null;
  if (value.plan_id !== null && value.plan_id !== undefined) planId = scopedId(value.plan_id, `${path}.plan_id`, issues);
  return { ledger_id: ledgerId, ledger_digest: ledgerDigest, request_id: requestId, request_digest: requestDigest, plan_id: planId };
}

function validateReceiptSemantics(ledger: TransportReadinessLedgerResult, receipts: readonly ApprovalReceiptRecord[], policy: ApprovalReceiptVerifierResult["policy"]): readonly ApprovalReceiptVerifierIssue[] {
  const issues: ApprovalReceiptVerifierIssue[] = [];
  const ref = ledgerRefFor(ledger);
  for (const [index, receipt] of receipts.entries()) {
    const path = `receipts[${index}]`;
    if (receipt.scope.ledger_id !== ref.ledger_id) issue(issues, `${path}.scope.ledger_id`, "ledger_id_mismatch", "receipt must reference the current ledger_id");
    if (receipt.scope.ledger_digest !== ref.ledger_digest) issue(issues, `${path}.scope.ledger_digest`, "ledger_digest_mismatch", "receipt must reference the current ledger_digest");
    if (receipt.scope.request_id !== ref.request_id) issue(issues, `${path}.scope.request_id`, "request_id_mismatch", "receipt must reference the current request_id");
    if (receipt.scope.request_digest !== ref.request_digest) issue(issues, `${path}.scope.request_digest`, "request_digest_mismatch", "receipt must reference the current request_digest");
    if (receipt.scope.plan_id !== ref.plan_id) issue(issues, `${path}.scope.plan_id`, "plan_id_mismatch", "receipt must reference the current plan_id");
    if (policy.allowed_approvers !== null && !policy.allowed_approvers.includes(receipt.approver)) issue(issues, `${path}.approver`, "approver_not_allowed", "approver is not allowed by policy");
    validateNoSecretMaterial(receipt, path, issues);
  }
  return issues;
}

function summarizeReceipts(receipts: readonly ApprovalReceiptRecord[], requiredApprovals: number): ApprovalReceiptVerifierResult["approval_summary"] {
  const approvers = uniqueStrings(receipts.filter((entry) => entry.decision === "approve").map((entry) => entry.approver));
  const rejected = receipts.filter((entry) => entry.decision === "reject").length;
  const hold = receipts.filter((entry) => entry.decision === "hold").length;
  return {
    accepted_approvals: approvers.length,
    rejected_count: rejected,
    hold_count: hold,
    missing_approvals: Math.max(0, requiredApprovals - approvers.length),
    approvers,
  };
}

function reasonsForBlocked(ledger: TransportReadinessLedgerResult, summary: ApprovalReceiptVerifierResult["approval_summary"], semanticIssues: readonly ApprovalReceiptVerifierIssue[]): readonly string[] {
  const reasons = ["human_approval_blocked"];
  if (ledger.status !== "ready") reasons.push("t053_ledger_not_ready");
  if (summary.missing_approvals > 0) reasons.push("missing_required_approvals");
  if (summary.rejected_count > 0) reasons.push("receipt_rejected");
  if (summary.hold_count > 0) reasons.push("receipt_hold");
  if (semanticIssues.some((entry) => entry.code === "approver_not_allowed")) reasons.push("approver_not_allowed");
  return uniqueStrings(reasons);
}

function validateApproved(result: Record<string, unknown>, summary: ApprovalReceiptVerifierResult["approval_summary"] | null, issues: ApprovalReceiptVerifierIssue[]): void {
  if (result.decision !== "human_approval_verified") issue(issues, "decision", "approved_decision_mismatch", "approved status must use human_approval_verified");
  if (summary !== null && (summary.missing_approvals > 0 || summary.rejected_count > 0 || summary.hold_count > 0)) issue(issues, "approval_summary", "approved_with_unmet_receipts", "approved results require enough approvals and no reject or hold receipts");
  if (result.issues !== undefined) issue(issues, "issues", "approved_issues_forbidden", "approved results must not carry issues");
}

function validateBlocked(result: Record<string, unknown>, summary: ApprovalReceiptVerifierResult["approval_summary"] | null, issues: ApprovalReceiptVerifierIssue[]): void {
  if (result.decision !== "human_approval_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked status must use human_approval_blocked");
  const reasons = Array.isArray(result.reasons) ? result.reasons : [];
  if (summary !== null && summary.missing_approvals === 0 && summary.rejected_count === 0 && summary.hold_count === 0 && isRecord(result.ledger_ref) && result.ledger_ref.ledger_status === "ready" && !reasons.includes("approver_not_allowed")) issue(issues, "approval_summary", "blocked_without_reason", "blocked results require an unmet approval condition");
  if (result.issues !== undefined) issue(issues, "issues", "blocked_issues_forbidden", "blocked results should encode blockers as reasons");
}

function validateInvalid(result: Record<string, unknown>, issues: ApprovalReceiptVerifierIssue[]): void {
  if (result.decision !== "invalid_human_approval_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid status must use invalid_human_approval_input");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid results must carry issues");
}

function validateLedgerRef(value: unknown, issues: ApprovalReceiptVerifierIssue[]): void {
  if (!isRecord(value)) { issue(issues, "ledger_ref", "ledger_ref_required", "ledger_ref must be present"); return; }
  for (const key of ["ledger_id", "request_id"] as const) if (typeof value[key] !== "string" || !ID.test(value[key])) issue(issues, `ledger_ref.${key}`, `invalid_${key}`, `${key} must be deterministic`);
  for (const key of ["ledger_digest", "request_digest"] as const) if (typeof value[key] !== "string" || !DIGEST.test(value[key])) issue(issues, `ledger_ref.${key}`, `invalid_${key}`, `${key} must be stable`);
  if (typeof value.ledger_status !== "string" || value.ledger_status.length === 0) issue(issues, "ledger_ref.ledger_status", "invalid_ledger_status", "ledger_status is required");
  if (value.plan_id !== null && (typeof value.plan_id !== "string" || !ID.test(value.plan_id))) issue(issues, "ledger_ref.plan_id", "invalid_plan_id", "plan_id must be deterministic when present");
}

function validatePolicy(value: unknown, issues: ApprovalReceiptVerifierIssue[]): ApprovalReceiptVerifierResult["policy"] | null {
  if (!isRecord(value)) { issue(issues, "policy", "policy_required", "policy must be present"); return null; }
  const required = value.required_approvals;
  if (typeof required !== "number" || !Number.isSafeInteger(required) || required < 1 || required > 8) issue(issues, "policy.required_approvals", "invalid_required_approvals", "required_approvals must be 1..8");
  if (value.allowed_approvers !== null && (!Array.isArray(value.allowed_approvers) || value.allowed_approvers.some((entry) => typeof entry !== "string" || !APPROVER.test(entry)))) issue(issues, "policy.allowed_approvers", "invalid_allowed_approvers", "allowed_approvers must be safe logins or null");
  if (value.require_scope_match !== true) issue(issues, "policy.require_scope_match", "scope_match_required", "scope matching must be required");
  return value as unknown as ApprovalReceiptVerifierResult["policy"];
}

function validateReceipts(value: unknown, issues: ApprovalReceiptVerifierIssue[]): readonly ApprovalReceiptRecord[] {
  if (!Array.isArray(value)) { issue(issues, "receipts", "receipts_required", "receipts must be an array"); return []; }
  const seen = new Set<string>();
  const receipts: ApprovalReceiptRecord[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `receipts[${index}]`;
    if (!isRecord(entry)) { issue(issues, path, "receipt_must_be_object", "receipt must be an object"); continue; }
    if (typeof entry.receipt_id !== "string" || !ID.test(entry.receipt_id)) issue(issues, `${path}.receipt_id`, "invalid_receipt_id", "receipt_id must be deterministic");
    else if (seen.has(entry.receipt_id)) issue(issues, `${path}.receipt_id`, "duplicate_receipt_id", "receipt_id values must be unique");
    else seen.add(entry.receipt_id);
    if (typeof entry.approver !== "string" || !APPROVER.test(entry.approver)) issue(issues, `${path}.approver`, "invalid_approver", "approver must be safe");
    if (typeof entry.approved_at !== "string" || !isRfc3339Utc(entry.approved_at)) issue(issues, `${path}.approved_at`, "invalid_approved_at", "approved_at must be RFC3339 UTC");
    if (entry.decision !== "approve" && entry.decision !== "reject" && entry.decision !== "hold") issue(issues, `${path}.decision`, "invalid_receipt_decision", "decision must be approve, reject, or hold");
    if (typeof entry.statement_digest !== "string" || !DIGEST.test(entry.statement_digest)) issue(issues, `${path}.statement_digest`, "invalid_statement_digest", "statement_digest must be stable");
    if (typeof entry.evidence_digest !== "string" || !DIGEST.test(entry.evidence_digest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
    validateScope(entry.scope, `${path}.scope`, issues);
    receipts.push(entry as unknown as ApprovalReceiptRecord);
  }
  return receipts;
}

function validateScope(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "scope_required", "scope must be present"); return; }
  for (const key of ["ledger_id", "request_id"] as const) if (typeof value[key] !== "string" || !ID.test(value[key])) issue(issues, `${path}.${key}`, `invalid_${key}`, `${key} must be deterministic`);
  for (const key of ["ledger_digest", "request_digest"] as const) if (typeof value[key] !== "string" || !DIGEST.test(value[key])) issue(issues, `${path}.${key}`, `invalid_${key}`, `${key} must be stable`);
  if (value.plan_id !== null && (typeof value.plan_id !== "string" || !ID.test(value.plan_id))) issue(issues, `${path}.plan_id`, "invalid_plan_id", "plan_id must be deterministic when present");
}

function validateSummary(value: unknown, receipts: readonly ApprovalReceiptRecord[], policy: ApprovalReceiptVerifierResult["policy"] | null, issues: ApprovalReceiptVerifierIssue[]): ApprovalReceiptVerifierResult["approval_summary"] | null {
  if (!isRecord(value)) { issue(issues, "approval_summary", "approval_summary_required", "approval_summary must be present"); return null; }
  const required = policy?.required_approvals ?? 1;
  const expected = summarizeReceipts(receipts, required);
  for (const key of ["accepted_approvals", "rejected_count", "hold_count", "missing_approvals"] as const) if (value[key] !== expected[key]) issue(issues, `approval_summary.${key}`, "approval_summary_mismatch", `${key} must match receipts`);
  const approvers = Array.isArray(value.approvers) ? value.approvers.filter((entry): entry is string => typeof entry === "string") : [];
  if (!arraysEqual(approvers, expected.approvers)) issue(issues, "approval_summary.approvers", "approval_summary_mismatch", "approvers must match approved receipts");
  return value as unknown as ApprovalReceiptVerifierResult["approval_summary"];
}

function validateReviewGate(value: unknown, issues: ApprovalReceiptVerifierIssue[]): void {
  if (!isRecord(value)) { issue(issues, "review_gate", "review_gate_required", "review_gate must be present"); return; }
  if (value.approval_class !== "C" || value.human_review_required_before_execution !== true || value.human_review_required_before_merge !== true || value.approval_record_write_authorized !== false) issue(issues, "review_gate", "class_c_human_review_required", "Class C human review gates must remain enabled and record writes unauthorized");
}

function validateGuards(value: unknown, issues: ApprovalReceiptVerifierIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of ["t053_ready_ledger_required", "explicit_receipt_required", "no_approval_record_write", "no_github_api_call", "no_token_request", "no_git_push", "no_branch_creation", "no_merge_operation", "no_mutation_execution", "no_file_write"]) {
    if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
  }
}

function validateDryRun(value: unknown, issues: ApprovalReceiptVerifierIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of ["approval_record_written", "github_api_called", "token_requested", "branch_created", "git_push_performed", "mutation_executed", "file_written", "auto_merged"]) {
    if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
  }
}

function ledgerRefFor(ledger: TransportReadinessLedgerResult): ApprovalReceiptVerifierResult["ledger_ref"] {
  return {
    ledger_id: typeof ledger.ledger_id === "string" && ID.test(ledger.ledger_id) ? ledger.ledger_id : stableId("transport-readiness-invalid", [canonicalStringify(ledger)]),
    ledger_digest: typeof ledger.ledger_digest === "string" && DIGEST.test(ledger.ledger_digest) ? ledger.ledger_digest : canonicalDigest(null),
    ledger_status: typeof ledger.status === "string" ? ledger.status : "invalid",
    request_id: isRecord(ledger.request_ref) && typeof ledger.request_ref.request_id === "string" && ID.test(ledger.request_ref.request_id) ? ledger.request_ref.request_id : stableId("mutation-pr-transport-invalid", [canonicalStringify(ledger)]),
    request_digest: isRecord(ledger.request_ref) && typeof ledger.request_ref.request_digest === "string" && DIGEST.test(ledger.request_ref.request_digest) ? ledger.request_ref.request_digest : canonicalDigest(null),
    plan_id: isRecord(ledger.request_ref) && typeof ledger.request_ref.plan_id === "string" && ID.test(ledger.request_ref.plan_id) ? ledger.request_ref.plan_id : null,
  };
}

function reviewGate(): ApprovalReceiptVerifierResult["review_gate"] {
  return { approval_class: "C", human_review_required_before_execution: true, human_review_required_before_merge: true, approval_record_write_authorized: false };
}

function guards(): ApprovalReceiptVerifierResult["guards"] {
  return { t053_ready_ledger_required: true, explicit_receipt_required: true, no_approval_record_write: true, no_github_api_call: true, no_token_request: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_mutation_execution: true, no_file_write: true };
}

function dryRunFlags(): ApprovalReceiptVerifierResult["dry_run"] {
  return { approval_record_written: false, github_api_called: false, token_requested: false, branch_created: false, git_push_performed: false, mutation_executed: false, file_written: false, auto_merged: false };
}

function approvalDigestPayload(value: Omit<ApprovalReceiptVerifierResult, "verifier_id" | "approval_digest"> | ApprovalReceiptVerifierResult): Readonly<Record<string, unknown>> {
  return { status: value.status, decision: value.decision, reasons: value.reasons, ledger_ref: value.ledger_ref, policy: value.policy, receipts: value.receipts, approval_summary: value.approval_summary, review_gate: value.review_gate, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] };
}

function emptyLedger(): TransportReadinessLedgerResult {
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:transport-readiness-ledger:v1",
    ledger_id: "transport-readiness-invalid-00000000",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_transport_replay_input",
    reasons: [],
    request_ref: { request_id: "mutation-pr-transport-invalid-00000000", request_digest: canonicalDigest(null), request_status: "invalid", plan_id: null, repository_full_name: null },
    checks: [],
    summary: { pass_count: 0, fail_count: 0, pending_count: 0, required_check_ids: [], missing_required_check_ids: [] },
    runtime_gate: { operation: "replay_transport_readiness", live_transport_allowed: false, dry_run_only: true },
    guards: { t052_valid_manifest_required: true, no_token_request: true, no_token_persistence: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_approval_record_write: true, no_mutation_execution: true, no_file_write: true },
    dry_run: { github_api_called: false, token_requested: false, token_persisted: false, branch_created: false, git_push_performed: false, approval_record_written: false, mutation_executed: false, file_written: false, auto_merged: false },
    ledger_digest: canonicalDigest(null),
    issues: [],
  };
}

function emptyReceipt(): ApprovalReceiptRecord {
  return { receipt_id: "", approver: "", approved_at: "", decision: "hold", statement_digest: canonicalDigest(""), evidence_digest: canonicalDigest(null), scope: { ledger_id: "", ledger_digest: "", request_id: "", request_digest: "", plan_id: null } };
}

function scopedId(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): string {
  if (typeof value !== "string" || !ID.test(value)) { issue(issues, path, "invalid_scope_id", "scope id must be deterministic"); return ""; }
  return value;
}

function scopedDigest(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): string {
  if (typeof value !== "string" || !DIGEST.test(value)) { issue(issues, path, "invalid_scope_digest", "scope digest must be stable"); return ""; }
  return value;
}

function stripAt(value: string): string { return value.replace(/^@/, "").trim(); }

function validateNoSecretMaterial(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "approval verifier manifests must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function optionalString(value: unknown, path: string, issues: ApprovalReceiptVerifierIssue[]): string | undefined {
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

function issue(issues: ApprovalReceiptVerifierIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
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

export const verifyApprovalReceipt = runApprovalReceiptVerifier;
export const createApprovalReceiptVerification = runApprovalReceiptVerifier;
export const runT054ApprovalReceiptVerifier = runApprovalReceiptVerifier;
export const validateApprovalReceiptVerification = validateApprovalReceiptVerifierResult;
export const validateT054ApprovalReceiptVerifier = validateApprovalReceiptVerifierResult;
