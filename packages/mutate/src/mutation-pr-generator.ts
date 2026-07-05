import { validateEvolutionGuardDecision } from "./evolution-guard.js";
import type { EvolutionGuardDecisionResult } from "./evolution-guard.js";
import type { NVersionAuditProposalRef } from "./audit-routing.js";

export const MUTATION_PR_GENERATOR_VERSION = 1 as const;
export const MUTATION_PR_GENERATOR_SCHEMA_REF = "urn:forgeroot:mutate-pr-generator:v1" as const;

export type MutationPrGeneratorStatus = "pr_manifest_ready" | "blocked" | "invalid";
export type MutationPrGeneratorDecision = "mutation_pr_manifest_ready" | "mutation_pr_blocked_by_guard" | "invalid_mutation_pr_input";

export interface MutationPrGeneratorInput {
  readonly now?: string;
  readonly guard: EvolutionGuardDecisionResult;
  readonly repository?: string;
  readonly base_branch?: string;
  readonly head_branch?: string;
  readonly title?: string;
  readonly body_notes?: readonly string[];
  readonly labels?: readonly string[];
  readonly reviewers?: readonly string[];
}

export interface MutationPrGeneratorIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface MutationPrGuardRef {
  readonly guard_id: string;
  readonly guard_digest: string;
  readonly decision: string;
  readonly proposal_id: string;
  readonly mutation_id: string;
  readonly routing_id: string;
}

export interface MutationPrDraft {
  readonly title: string;
  readonly body: string;
  readonly head: string;
  readonly base: string;
  readonly draft: true;
  readonly maintainer_can_modify: false;
  readonly labels: readonly string[];
  readonly reviewers: readonly string[];
}

export interface MutationPrScope {
  readonly one_task_one_pr: true;
  readonly no_default_branch_write: true;
  readonly target_paths: readonly string[];
  readonly max_files_changed: number;
  readonly max_diff_lines: number;
}

export interface MutationPrReviewGate {
  readonly risk: "high";
  readonly approval_class: "C";
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
  readonly merge_gate: "human_review_required";
}

export interface MutationPrGuards {
  readonly evolution_guard_accept_required: true;
  readonly no_github_api_call: true;
  readonly no_git_push: true;
  readonly no_branch_creation: true;
  readonly no_file_write: true;
  readonly no_approval_record_write: true;
  readonly no_merge_operation: true;
  readonly no_mutation_execution: true;
  readonly no_default_branch_write: true;
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
}

export interface MutationPrGeneratorResult {
  readonly manifest_version: typeof MUTATION_PR_GENERATOR_VERSION;
  readonly schema_ref: typeof MUTATION_PR_GENERATOR_SCHEMA_REF;
  readonly plan_id: string;
  readonly created_at: string;
  readonly status: MutationPrGeneratorStatus;
  readonly decision: MutationPrGeneratorDecision;
  readonly reasons: readonly string[];
  readonly repository: string | null;
  readonly guard_ref: MutationPrGuardRef;
  readonly proposal: NVersionAuditProposalRef;
  readonly pull_request?: MutationPrDraft;
  readonly scope?: MutationPrScope;
  readonly review_gate: MutationPrReviewGate;
  readonly guards: MutationPrGuards;
  readonly provenance: {
    readonly generated_by: "forgeroot-mutation-pr-generator.alpha";
    readonly generator_version: "0.0.0-t051";
    readonly guard_id: string;
    readonly proposal_id: string;
    readonly mutation_id: string;
    readonly routing_id: string;
  };
  readonly plan_digest: string;
  readonly dry_run: {
    readonly file_written: false;
    readonly branch_created: false;
    readonly git_push_performed: false;
    readonly github_api_called: false;
    readonly approval_record_written: false;
    readonly mutation_executed: false;
    readonly auto_merged: false;
  };
  readonly issues?: readonly MutationPrGeneratorIssue[];
}

export interface MutationPrGeneratorValidationResult {
  readonly ok: boolean;
  readonly issues: readonly MutationPrGeneratorIssue[];
}

export const MUTATION_PR_GENERATOR_CONTRACT = {
  consumes: ["evolution_guard_decision_manifest"],
  produces: ["mutation_pull_request_plan_manifest"],
  validates: [
    "accepted_evolution_guard_only",
    "safe_branch_refs",
    "canonical_mutation_targets",
    "class_c_review_gate_preserved",
    "no_transport_side_effects",
  ],
  forbids: [
    "github_api_call",
    "git_push",
    "branch_creation",
    "file_write",
    "approval_record_write",
    "merge_operation",
    "mutation_execution",
  ],
  deterministic: true,
  manifestOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REVIEWER = /^[A-Za-z0-9_.-]+$/;
const AGENT_DOCUMENT_PATH = /^\.forge\/agents\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\.forge$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const MANIFEST_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const MUTATION_ID = /^mut-[0-9a-f]{8}$/;
const MAX_LABEL_LENGTH = 64;
const MAX_TITLE_LENGTH = 120;

export function runMutationPrGenerator(input: unknown): MutationPrGeneratorResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.guard.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];

  if (issues.length > 0 || envelope.input === null) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.guard, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "mutation PR generator input must be an object" }]);
  }

  const guardValidation = validateEvolutionGuardDecision(envelope.input.guard);
  if (!guardValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.guard, [
      { path: "guard", code: "invalid_evolution_guard_manifest", message: "guard must pass T050 read-back validation" },
      ...guardValidation.issues.map((entry) => ({ path: `guard.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }

  if (envelope.input.guard.status !== "decision_ready" || envelope.input.guard.decision !== "evolution_guard_accept" || envelope.input.guard.guardrails.mutation_pr_generation_allowed !== true) {
    return blockedResult(createdAt ?? DEFAULT_NOW, envelope.input.guard);
  }

  const proposal = cloneProposal(envelope.input.guard.proposal);
  const guardRef = guardRefFor(envelope.input.guard);
  const repository = envelope.input.repository ?? null;
  const base = envelope.input.base_branch ?? "main";
  const head = envelope.input.head_branch ?? defaultHeadBranch(proposal);
  const pullRequest = {
    title: titleFor(proposal, envelope.input.title),
    body: bodyFor(envelope.input.guard, envelope.input.body_notes),
    head,
    base,
    draft: true,
    maintainer_can_modify: false,
    labels: labelsFor(proposal, envelope.input.labels),
    reviewers: reviewersFor(envelope.input.reviewers),
  } satisfies MutationPrDraft;
  const scope = scopeFor(proposal);
  const reviewGateValue = reviewGate();
  const guardsValue = guards();
  const planDigest = canonicalDigest(planDigestPayload(repository, guardRef, proposal, pullRequest, scope, reviewGateValue, guardsValue));
  const planId = stableId("mutation-pr", [planDigest]);
  const result: MutationPrGeneratorResult = {
    manifest_version: MUTATION_PR_GENERATOR_VERSION,
    schema_ref: MUTATION_PR_GENERATOR_SCHEMA_REF,
    plan_id: planId,
    created_at: createdAt ?? DEFAULT_NOW,
    status: "pr_manifest_ready",
    decision: "mutation_pr_manifest_ready",
    reasons: ["evolution_guard_accepted", "mutation_pr_manifest_ready", "github_transport_not_performed"],
    repository,
    guard_ref: guardRef,
    proposal,
    pull_request: pullRequest,
    scope,
    review_gate: reviewGateValue,
    guards: guardsValue,
    provenance: provenanceFor(guardRef),
    plan_digest: planDigest,
    dry_run: dryRunFlags(),
  };
  const validation = validateMutationPrGeneratorResult(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.guard, validation.issues);
  return result;
}

export function validateMutationPrGeneratorResult(result: unknown): MutationPrGeneratorValidationResult {
  const issues: MutationPrGeneratorIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "mutation PR generator result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== MUTATION_PR_GENERATOR_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== MUTATION_PR_GENERATOR_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T051 mutation PR generator v1");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "pr_manifest_ready" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be pr_manifest_ready, blocked, or invalid");
  if (result.decision !== "mutation_pr_manifest_ready" && result.decision !== "mutation_pr_blocked_by_guard" && result.decision !== "invalid_mutation_pr_input") issue(issues, "decision", "invalid_decision", "decision must be a T051 mutation PR decision");
  validateDryRun(result.dry_run, issues);
  validateGuards(result.guards, issues);
  validateReviewGate(result.review_gate, issues);
  validateGuardRef(result.guard_ref, issues);
  if (!isRecord(result.proposal)) issue(issues, "proposal", "proposal_required", "result must carry proposal metadata");
  if (!isRecord(result.provenance)) issue(issues, "provenance", "provenance_required", "result must carry provenance");
  if (!Array.isArray(result.reasons)) issue(issues, "reasons", "reasons_required", "result must carry reasons");
  validateNoSecretMaterial(result, "result", issues);

  if (result.status === "pr_manifest_ready" && canValidateReady(result, issues)) validateReadyResult(result as unknown as MutationPrGeneratorResult, issues);
  if (result.status === "blocked" && canValidateTerminal(result, issues)) validateBlockedResult(result as unknown as MutationPrGeneratorResult, issues);
  if (result.status === "invalid" && canValidateTerminal(result, issues)) validateInvalidResult(result as unknown as MutationPrGeneratorResult, issues);
  return { ok: issues.length === 0, issues };
}

function validateReadyResult(result: MutationPrGeneratorResult, issues: MutationPrGeneratorIssue[]): void {
  const pullRequest = result.pull_request as MutationPrDraft;
  const scope = result.scope as MutationPrScope;
  if (result.decision !== "mutation_pr_manifest_ready") issue(issues, "decision", "ready_decision_mismatch", "ready status must use mutation_pr_manifest_ready");
  if (result.guard_ref.decision !== "evolution_guard_accept") issue(issues, "guard_ref.decision", "guard_not_accepted", "ready PR manifests require accepted EvolutionGuard decisions");
  validateProposal(result.proposal, issues);
  validatePullRequest(pullRequest, result.proposal, issues);
  validateScope(scope, result.proposal, issues);
  validateProvenance(result, issues);
  const expectedDigest = canonicalDigest(planDigestPayload(result.repository, result.guard_ref, result.proposal, pullRequest, scope, result.review_gate, result.guards));
  if (result.plan_digest !== expectedDigest) issue(issues, "plan_digest", "plan_digest_mismatch", "plan digest must cover the ready PR plan payload");
  if (result.plan_id !== stableId("mutation-pr", [expectedDigest])) issue(issues, "plan_id", "plan_id_mismatch", "plan_id must match deterministic ready PR payload");
  if (result.issues !== undefined) issue(issues, "issues", "ready_issues_forbidden", "ready PR manifests must not carry issues");
}

function validateBlockedResult(result: MutationPrGeneratorResult, issues: MutationPrGeneratorIssue[]): void {
  if (result.decision !== "mutation_pr_blocked_by_guard") issue(issues, "decision", "blocked_decision_mismatch", "blocked status must use mutation_pr_blocked_by_guard");
  if (result.guard_ref.decision === "evolution_guard_accept") issue(issues, "guard_ref.decision", "blocked_accepted_guard_mismatch", "accepted guards should not produce blocked PR manifests");
  validateTerminalNoPr(result, issues);
}

function validateInvalidResult(result: MutationPrGeneratorResult, issues: MutationPrGeneratorIssue[]): void {
  if (result.decision !== "invalid_mutation_pr_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid status must use invalid_mutation_pr_input");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid results must carry issues");
  validateTerminalNoPr(result, issues);
}

function validateTerminalNoPr(result: MutationPrGeneratorResult, issues: MutationPrGeneratorIssue[]): void {
  if (result.pull_request !== undefined) issue(issues, "pull_request", "terminal_pr_forbidden", "blocked or invalid results must not carry pull_request");
  if (result.scope !== undefined) issue(issues, "scope", "terminal_scope_forbidden", "blocked or invalid results must not carry ready scope");
  if (result.plan_digest !== canonicalDigest(null)) issue(issues, "plan_digest", "terminal_digest_mismatch", "blocked or invalid results must use the terminal digest sentinel");
}

function canValidateReady(result: Record<string, unknown>, issues: MutationPrGeneratorIssue[]): boolean {
  let ok = true;
  if (!isRecord(result.pull_request)) { issue(issues, "pull_request", "pull_request_required", "ready results must carry pull_request"); ok = false; }
  if (!isRecord(result.scope)) { issue(issues, "scope", "scope_required", "ready results must carry scope"); ok = false; }
  return ok && commonReadyShape(result);
}

function canValidateTerminal(result: Record<string, unknown>, issues: MutationPrGeneratorIssue[]): boolean {
  return commonReadyShape(result) && Array.isArray(result.reasons);
}

function commonReadyShape(result: Record<string, unknown>): boolean {
  return isRecord(result.guard_ref) && isRecord(result.proposal) && isRecord(result.review_gate) && isRecord(result.guards) && isRecord(result.dry_run) && isRecord(result.provenance);
}

function normalizeInput(input: unknown): {
  readonly input: MutationPrGeneratorInput | null;
  readonly now?: string;
  readonly guard: EvolutionGuardDecisionResult;
  readonly issues: readonly MutationPrGeneratorIssue[];
} {
  const issues: MutationPrGeneratorIssue[] = [];
  if (!isRecord(input)) return { input: null, guard: emptyGuard(), issues: [{ path: "input", code: "input_must_be_object", message: "mutation PR generator input must be an object" }] };
  const guard = isRecord(input.guard) ? input.guard as unknown as EvolutionGuardDecisionResult : emptyGuard();
  if (!isRecord(input.guard)) issue(issues, "guard", "guard_must_be_object", "guard must be an EvolutionGuard result object");
  const now = optionalString(input.now, "now", issues);
  const repository = optionalString(input.repository, "repository", issues);
  if (repository !== undefined && !REPOSITORY.test(repository)) issue(issues, "repository", "invalid_repository", "repository must be owner/repo");
  const baseBranch = optionalString(input.base_branch, "base_branch", issues);
  if (baseBranch !== undefined && !isSafeRef(baseBranch)) issue(issues, "base_branch", "unsafe_base_branch", "base_branch must be a safe git ref");
  const headBranch = optionalString(input.head_branch, "head_branch", issues);
  if (headBranch !== undefined && !isSafeRef(headBranch)) issue(issues, "head_branch", "unsafe_head_branch", "head_branch must be a safe git ref");
  if (headBranch !== undefined && baseBranch !== undefined && isDefaultBranchTarget(headBranch, baseBranch)) issue(issues, "head_branch", "default_branch_write_forbidden", "head_branch must not target the base/default branch");
  const title = optionalString(input.title, "title", issues);
  if (title !== undefined && sanitizeTitle(title).length === 0) issue(issues, "title", "empty_title", "title must contain visible text");
  const bodyNotes = normalizeStringArray(input.body_notes, "body_notes", issues, true) ?? [];
  const labels = normalizeStringArray(input.labels, "labels", issues, true) ?? [];
  labels.forEach((label, index) => {
    if (normalizeLabel(label) === null) issue(issues, `labels[${index}]`, "unsafe_label", "labels must be non-empty, single-line, and <= 64 chars");
  });
  const reviewers = normalizeStringArray(input.reviewers, "reviewers", issues, true) ?? [];
  reviewers.forEach((reviewer, index) => {
    if (!REVIEWER.test(reviewer.replace(/^@/, ""))) issue(issues, `reviewers[${index}]`, "unsafe_reviewer", "reviewers must be safe GitHub logins");
  });
  return {
    input: {
      guard,
      ...(now === undefined ? {} : { now }),
      ...(repository === undefined ? {} : { repository }),
      ...(baseBranch === undefined ? {} : { base_branch: baseBranch }),
      ...(headBranch === undefined ? {} : { head_branch: headBranch }),
      ...(title === undefined ? {} : { title }),
      ...(bodyNotes.length === 0 ? {} : { body_notes: bodyNotes }),
      ...(labels.length === 0 ? {} : { labels }),
      ...(reviewers.length === 0 ? {} : { reviewers }),
    },
    now,
    guard,
    issues,
  };
}

function validatePullRequest(value: MutationPrDraft | undefined, proposal: NVersionAuditProposalRef, issues: MutationPrGeneratorIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "pull_request", "pull_request_required", "pull_request must be present");
    return;
  }
  if (typeof value.title !== "string" || sanitizeTitle(value.title).length === 0 || value.title.length > MAX_TITLE_LENGTH) issue(issues, "pull_request.title", "invalid_title", "title must be non-empty and <= 120 chars");
  if (typeof value.body !== "string" || !value.body.includes(proposal.mutation_id) || !value.body.includes("No GitHub API call")) issue(issues, "pull_request.body", "invalid_body", "body must preserve mutation and safety context");
  if (typeof value.head !== "string" || !isSafeRef(value.head) || !value.head.startsWith("codex/")) issue(issues, "pull_request.head", "unsafe_head_branch", "head must be a safe codex/* branch");
  if (typeof value.base !== "string" || !isSafeRef(value.base)) issue(issues, "pull_request.base", "unsafe_base_branch", "base must be a safe branch");
  if (typeof value.head === "string" && typeof value.base === "string" && isDefaultBranchTarget(value.head, value.base)) issue(issues, "pull_request.head", "default_branch_write_forbidden", "head must not target base/default branch");
  if (value.draft !== true) issue(issues, "pull_request.draft", "draft_required", "mutation PR plans must be draft");
  if (value.maintainer_can_modify !== false) issue(issues, "pull_request.maintainer_can_modify", "maintainer_modify_forbidden", "maintainer_can_modify must remain false");
  if (!Array.isArray(value.labels) || value.labels.some((entry) => typeof entry !== "string" || normalizeLabel(entry) === null)) issue(issues, "pull_request.labels", "unsafe_labels", "labels must be safe strings");
  if (!Array.isArray(value.reviewers) || value.reviewers.some((entry) => typeof entry !== "string" || !REVIEWER.test(entry))) issue(issues, "pull_request.reviewers", "unsafe_reviewers", "reviewers must be safe GitHub logins");
}

function validateScope(value: MutationPrScope | undefined, proposal: NVersionAuditProposalRef, issues: MutationPrGeneratorIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "scope", "scope_required", "scope must be present");
    return;
  }
  if (value.one_task_one_pr !== true) issue(issues, "scope.one_task_one_pr", "one_task_one_pr_required", "one_task_one_pr must remain true");
  if (value.no_default_branch_write !== true) issue(issues, "scope.no_default_branch_write", "default_branch_write_forbidden", "no_default_branch_write must remain true");
  if (!arraysEqual(value.target_paths, proposal.target_paths)) issue(issues, "scope.target_paths", "target_paths_mismatch", "scope target paths must match proposal target paths");
  if (!Number.isSafeInteger(value.max_files_changed) || value.max_files_changed < proposal.target_paths.length) issue(issues, "scope.max_files_changed", "invalid_file_budget", "max_files_changed must cover proposal targets");
  if (!Number.isSafeInteger(value.max_diff_lines) || value.max_diff_lines <= 0) issue(issues, "scope.max_diff_lines", "invalid_diff_budget", "max_diff_lines must be positive");
}

function validateProposal(proposal: NVersionAuditProposalRef, issues: MutationPrGeneratorIssue[]): void {
  if (typeof proposal.proposal_id !== "string" || !MANIFEST_ID.test(proposal.proposal_id)) issue(issues, "proposal.proposal_id", "invalid_proposal_id", "proposal_id must be deterministic");
  if (typeof proposal.mutation_id !== "string" || !MUTATION_ID.test(proposal.mutation_id)) issue(issues, "proposal.mutation_id", "invalid_mutation_id", "mutation_id must be mut-<8 hex>");
  if (proposal.risk !== "high") issue(issues, "proposal.risk", "high_risk_required", "mutation PR generation only accepts high-risk proposals");
  if (proposal.approval_class !== "C") issue(issues, "proposal.approval_class", "class_c_required", "mutation PR generation only accepts Class C proposals");
  if (!Array.isArray(proposal.target_paths) || proposal.target_paths.length === 0 || proposal.target_paths.some((entry) => typeof entry !== "string" || !AGENT_DOCUMENT_PATH.test(entry))) issue(issues, "proposal.target_paths", "canonical_agent_targets_required", "proposal target paths must be canonical agent documents");
}

function validateGuardRef(ref: unknown, issues: MutationPrGeneratorIssue[]): void {
  if (!isRecord(ref)) {
    issue(issues, "guard_ref", "guard_ref_required", "guard_ref must be present");
    return;
  }
  if (typeof ref.guard_id !== "string" || !MANIFEST_ID.test(ref.guard_id)) issue(issues, "guard_ref.guard_id", "invalid_guard_id", "guard_id must be deterministic");
  if (typeof ref.guard_digest !== "string" || !DIGEST.test(ref.guard_digest)) issue(issues, "guard_ref.guard_digest", "invalid_guard_digest", "guard_digest must be stable");
  if (typeof ref.proposal_id !== "string" || !MANIFEST_ID.test(ref.proposal_id)) issue(issues, "guard_ref.proposal_id", "invalid_proposal_id", "proposal_id must be deterministic");
  if (typeof ref.mutation_id !== "string" || !MUTATION_ID.test(ref.mutation_id)) issue(issues, "guard_ref.mutation_id", "invalid_mutation_id", "mutation_id must be mut-<8 hex>");
  if (typeof ref.routing_id !== "string" || !MANIFEST_ID.test(ref.routing_id)) issue(issues, "guard_ref.routing_id", "invalid_routing_id", "routing_id must be deterministic");
}

function validateReviewGate(value: unknown, issues: MutationPrGeneratorIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "review_gate", "review_gate_required", "review_gate must be present");
    return;
  }
  if (value.risk !== "high") issue(issues, "review_gate.risk", "high_risk_required", "review gate must remain high risk");
  if (value.approval_class !== "C") issue(issues, "review_gate.approval_class", "class_c_required", "review gate must remain Class C");
  if (value.human_review_required_before_execution !== true) issue(issues, "review_gate.human_review_required_before_execution", "human_review_before_execution_required", "human review before execution is required");
  if (value.human_review_required_before_merge !== true || value.merge_gate !== "human_review_required") issue(issues, "review_gate.merge", "human_review_before_merge_required", "human review before merge is required");
}

function validateGuards(value: unknown, issues: MutationPrGeneratorIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  for (const key of ["evolution_guard_accept_required", "no_github_api_call", "no_git_push", "no_branch_creation", "no_file_write", "no_approval_record_write", "no_merge_operation", "no_mutation_execution", "no_default_branch_write", "human_review_required_before_execution", "human_review_required_before_merge"]) {
    if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
  }
}

function validateDryRun(value: unknown, issues: MutationPrGeneratorIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  for (const key of ["file_written", "branch_created", "git_push_performed", "github_api_called", "approval_record_written", "mutation_executed", "auto_merged"]) {
    if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
  }
}

function validateProvenance(result: MutationPrGeneratorResult, issues: MutationPrGeneratorIssue[]): void {
  if (result.provenance.generated_by !== "forgeroot-mutation-pr-generator.alpha") issue(issues, "provenance.generated_by", "invalid_generator", "generated_by must be canonical");
  if (result.provenance.guard_id !== result.guard_ref.guard_id) issue(issues, "provenance.guard_id", "provenance_guard_mismatch", "provenance must reference guard");
  if (result.provenance.proposal_id !== result.proposal.proposal_id) issue(issues, "provenance.proposal_id", "provenance_proposal_mismatch", "provenance must reference proposal");
  if (result.provenance.mutation_id !== result.proposal.mutation_id) issue(issues, "provenance.mutation_id", "provenance_mutation_mismatch", "provenance must reference mutation");
  if (result.provenance.routing_id !== result.guard_ref.routing_id) issue(issues, "provenance.routing_id", "provenance_routing_mismatch", "provenance must reference routing");
}

function invalidResult(createdAt: string, guard: EvolutionGuardDecisionResult, issues: readonly MutationPrGeneratorIssue[]): MutationPrGeneratorResult {
  const guardRef = guardRefFor(guard);
  const planId = stableId("mutation-pr-invalid", [canonicalStringify({ guardRef, issues })]);
  return terminalResult(createdAt, guard, guardRef, planId, "invalid", "invalid_mutation_pr_input", ["invalid_mutation_pr_input", ...issues.map((entry) => entry.code)], issues);
}

function blockedResult(createdAt: string, guard: EvolutionGuardDecisionResult): MutationPrGeneratorResult {
  const guardRef = guardRefFor(guard);
  const planId = stableId("mutation-pr-blocked", [canonicalStringify(guardRef)]);
  return terminalResult(createdAt, guard, guardRef, planId, "blocked", "mutation_pr_blocked_by_guard", ["guard_not_accepted", "mutation_pr_not_generated"]);
}

function terminalResult(createdAt: string, guard: EvolutionGuardDecisionResult, guardRef: MutationPrGuardRef, planId: string, status: "blocked" | "invalid", decision: "mutation_pr_blocked_by_guard" | "invalid_mutation_pr_input", reasons: readonly string[], issues?: readonly MutationPrGeneratorIssue[]): MutationPrGeneratorResult {
  return {
    manifest_version: MUTATION_PR_GENERATOR_VERSION,
    schema_ref: MUTATION_PR_GENERATOR_SCHEMA_REF,
    plan_id: planId,
    created_at: createdAt,
    status,
    decision,
    reasons: uniqueStrings(reasons),
    repository: null,
    guard_ref: guardRef,
    proposal: cloneProposal(guard.proposal ?? emptyProposal()),
    review_gate: reviewGate(),
    guards: guards(),
    provenance: provenanceFor(guardRef),
    plan_digest: canonicalDigest(null),
    dry_run: dryRunFlags(),
    ...(issues === undefined ? {} : { issues }),
  };
}

function guardRefFor(guard: EvolutionGuardDecisionResult): MutationPrGuardRef {
  return {
    guard_id: typeof guard.guard_id === "string" ? guard.guard_id : "",
    guard_digest: typeof guard.guard_digest === "string" ? guard.guard_digest : "",
    decision: typeof guard.decision === "string" ? guard.decision : "",
    proposal_id: isRecord(guard.proposal) && typeof guard.proposal.proposal_id === "string" ? guard.proposal.proposal_id : "",
    mutation_id: isRecord(guard.proposal) && typeof guard.proposal.mutation_id === "string" ? guard.proposal.mutation_id : "",
    routing_id: isRecord(guard.routing_ref) && typeof guard.routing_ref.routing_id === "string" ? guard.routing_ref.routing_id : "",
  };
}

function reviewGate(): MutationPrReviewGate {
  return {
    risk: "high",
    approval_class: "C",
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
    merge_gate: "human_review_required",
  };
}

function guards(): MutationPrGuards {
  return {
    evolution_guard_accept_required: true,
    no_github_api_call: true,
    no_git_push: true,
    no_branch_creation: true,
    no_file_write: true,
    no_approval_record_write: true,
    no_merge_operation: true,
    no_mutation_execution: true,
    no_default_branch_write: true,
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
  };
}

function dryRunFlags(): MutationPrGeneratorResult["dry_run"] {
  return {
    file_written: false,
    branch_created: false,
    git_push_performed: false,
    github_api_called: false,
    approval_record_written: false,
    mutation_executed: false,
    auto_merged: false,
  };
}

function scopeFor(proposal: NVersionAuditProposalRef): MutationPrScope {
  return {
    one_task_one_pr: true,
    no_default_branch_write: true,
    target_paths: [...proposal.target_paths],
    max_files_changed: Math.max(1, proposal.target_paths.length),
    max_diff_lines: Math.max(200, proposal.target_paths.length * 100),
  };
}

function titleFor(proposal: NVersionAuditProposalRef, override: string | undefined): string {
  const base = sanitizeTitle(override ?? `[ForgeRoot] ${proposal.mutation_class} ${proposal.mutation_id} mutation proposal`);
  return base.length > MAX_TITLE_LENGTH ? base.slice(0, MAX_TITLE_LENGTH).trimEnd() : base;
}

function bodyFor(guard: EvolutionGuardDecisionResult, notes: readonly string[] | undefined): string {
  const proposal = guard.proposal;
  const lines = [
    "## ForgeRoot mutation PR manifest",
    "",
    "This is a deterministic T051 PR plan manifest. It did not create a branch, push commits, call GitHub APIs, write approval records, execute mutations, or merge.",
    "",
    "### Guard",
    `- Guard ID: ${guard.guard_id}`,
    `- Guard decision: ${guard.decision}`,
    `- Guard digest: ${guard.guard_digest}`,
    "",
    "### Proposal",
    `- Proposal ID: ${proposal.proposal_id}`,
    `- Mutation ID: ${proposal.mutation_id}`,
    `- Mutation class: ${proposal.mutation_class}`,
    "",
    "### Target paths",
    ...proposal.target_paths.map((targetPath) => `- ${targetPath}`),
    "",
    "### Safety",
    "- No GitHub API call",
    "- No git push",
    "- No branch creation",
    "- No approval record write",
    "- No mutation execution",
    "- No merge operation",
    "- Human review required before execution and merge",
    ...(notes === undefined || notes.length === 0 ? [] : ["", "### Notes", ...notes.map((note) => `- ${note}`)]),
  ];
  return `${lines.join("\n")}\n`;
}

function labelsFor(proposal: NVersionAuditProposalRef, extra: readonly string[] | undefined): readonly string[] {
  return uniqueStrings(["forge:mutation-pr", "class:C", "risk:high", `mutation:${proposal.mutation_class}`, ...(extra ?? [])])
    .map(normalizeLabel)
    .filter((label): label is string => label !== null);
}

function reviewersFor(values: readonly string[] | undefined): readonly string[] {
  return uniqueStrings((values ?? []).map((value) => value.replace(/^@/, "").trim()).filter((value) => REVIEWER.test(value)));
}

function defaultHeadBranch(proposal: NVersionAuditProposalRef): string {
  return `codex/t051-${proposal.mutation_id}-${slug(proposal.proposal_id)}`.slice(0, 96);
}

function provenanceFor(ref: MutationPrGuardRef): MutationPrGeneratorResult["provenance"] {
  return {
    generated_by: "forgeroot-mutation-pr-generator.alpha",
    generator_version: "0.0.0-t051",
    guard_id: ref.guard_id,
    proposal_id: ref.proposal_id,
    mutation_id: ref.mutation_id,
    routing_id: ref.routing_id,
  };
}

function planDigestPayload(repository: string | null, guardRef: MutationPrGuardRef, proposal: NVersionAuditProposalRef, pullRequest: MutationPrDraft, scope: MutationPrScope, gate: MutationPrReviewGate, guardsValue: MutationPrGuards): Readonly<Record<string, unknown>> {
  return { repository, guard_ref: guardRef, proposal, pull_request: pullRequest, scope, review_gate: gate, guards: guardsValue };
}

function emptyGuard(): EvolutionGuardDecisionResult {
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:mutate-evolution-guard:v1",
    guard_id: "",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_evolution_guard_input",
    reasons: [],
    proposal: emptyProposal(),
    routing_ref: { routing_id: "", routing_digest: "", schema_ref: "", route_ids: [], required_reviews: 0, required_quorum: 0, target_paths: [] },
    reviews: [],
    quorum: { required_reviews: 0, received_reviews: 0, required_quorum: 0, approval_count: 0, rejection_count: 0, hold_count: 0, blocking_finding_count: 0, missing_route_ids: [] },
    guardrails: { mutation_execution_authorized: false, mutation_pr_generation_allowed: false, github_transport_authorized: false, approval_record_written: false, human_review_required_before_execution: true, human_review_required_before_merge: true },
    review_gate: { risk: "high", approval_class: "C", escalation_required: true, human_review_required_before_execution: true, human_review_required_before_merge: true, reasons: [] },
    guard_record: { guard_id: "", class: "evolution_guard_decision", proposal_id: "", mutation_id: "", routing_id: "", decision: "invalid_evolution_guard_input", approval_class: "C" },
    guard_digest: canonicalDigest(null),
    dry_run: { file_written: false, github_api_called: false, mutation_executed: false, approval_record_written: false, auto_merged: false },
    issues: [],
  };
}

function emptyProposal(): NVersionAuditProposalRef {
  return { proposal_id: "", mutation_id: "", mutation_class: "", risk: "", approval_class: "", target_paths: [], source_digest: "" };
}

function cloneProposal(proposal: NVersionAuditProposalRef): NVersionAuditProposalRef {
  return {
    proposal_id: proposal.proposal_id,
    mutation_id: proposal.mutation_id,
    mutation_class: proposal.mutation_class,
    risk: proposal.risk,
    approval_class: proposal.approval_class,
    target_paths: [...proposal.target_paths],
    source_digest: proposal.source_digest,
  };
}

function optionalString(value: unknown, path: string, issues: MutationPrGeneratorIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
  return value;
}

function normalizeStringArray(value: unknown, path: string, issues: MutationPrGeneratorIssue[], optional: boolean): readonly string[] | undefined {
  if (value === undefined && optional) return undefined;
  if (!Array.isArray(value)) {
    issue(issues, path, "string_array_required", `${path} must be an array of strings`);
    return [];
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      issue(issues, `${path}[${index}]`, "string_required", "array entry must be a string");
      return "";
    }
    return entry;
  });
}

function normalizeLabel(value: string): string | null {
  if (/[\r\n\t]/.test(value)) return null;
  const label = value.replace(/\s+/g, " ").trim();
  return label.length === 0 || label.length > MAX_LABEL_LENGTH ? null : label;
}

function validateNoSecretMaterial(value: unknown, path: string, issues: MutationPrGeneratorIssue[]): void {
  if (typeof value === "string") {
    if (containsSecret(value)) issue(issues, path, "secret_material_forbidden", "mutation PR manifests must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues));
    return;
  }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function containsSecret(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key");
}

function sanitizeTitle(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
}

function isSafeRef(value: string): boolean {
  return SAFE_REF.test(value) && !value.includes("..") && !value.startsWith("/") && !value.endsWith("/") && !value.endsWith(".lock");
}

function isDefaultBranchTarget(branch: string, defaultBranch: string): boolean {
  const left = branch.toLowerCase().replace(/^refs\/heads\//, "");
  const right = defaultBranch.toLowerCase().replace(/^refs\/heads\//, "");
  return left === right || left === "main" || left === "master" || left === "trunk";
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

function issue(issues: MutationPrGeneratorIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values.filter((value) => value.length > 0))]; }
function slug(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "mutation"; }
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

export const createMutationPrManifest = runMutationPrGenerator;
export const generateMutationPrManifest = runMutationPrGenerator;
export const runT051MutationPrGenerator = runMutationPrGenerator;
export const validateMutationPrManifest = validateMutationPrGeneratorResult;
export const validateT051MutationPrGenerator = validateMutationPrGeneratorResult;
