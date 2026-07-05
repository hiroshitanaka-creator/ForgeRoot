import {
  N_VERSION_AUDIT_ROUTING_SCHEMA_REF,
  validateNVersionAuditRouting,
} from "./audit-routing.js";
import type {
  NVersionAuditProposalRef,
  NVersionAuditRoute,
  NVersionAuditRoutingResult,
} from "./audit-routing.js";

export const EVOLUTION_GUARD_VERSION = 1 as const;
export const EVOLUTION_GUARD_SCHEMA_REF = "urn:forgeroot:mutate-evolution-guard:v1" as const;

export type EvolutionGuardReviewDecision = "approve" | "reject" | "hold";
export type EvolutionGuardFindingSeverity = "low" | "medium" | "high" | "critical";
export type EvolutionGuardStatus = "decision_ready" | "invalid";
export type EvolutionGuardDecision = "evolution_guard_accept" | "evolution_guard_reject" | "evolution_guard_hold" | "invalid_evolution_guard_input";

export interface EvolutionGuardFinding {
  readonly finding_id: string;
  readonly severity: EvolutionGuardFindingSeverity;
  readonly blocking: boolean;
  readonly summary: string;
}

export interface EvolutionGuardReviewEvidence {
  readonly route_id: string;
  readonly reviewer_id: string;
  readonly independence_key: string;
  readonly decision: EvolutionGuardReviewDecision;
  readonly completed_at: string;
  readonly routing_digest: string;
  readonly reviewed_target_paths: readonly string[];
  readonly findings: readonly EvolutionGuardFinding[];
  readonly evidence_digest: string;
}

export interface EvolutionGuardInput {
  readonly now?: string;
  readonly proposal: NVersionAuditProposalRef;
  readonly routing: NVersionAuditRoutingResult;
  readonly reviews: readonly EvolutionGuardReviewEvidence[];
}

export interface EvolutionGuardIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface EvolutionGuardRoutingRef {
  readonly routing_id: string;
  readonly routing_digest: string;
  readonly schema_ref: typeof N_VERSION_AUDIT_ROUTING_SCHEMA_REF | "";
  readonly route_ids: readonly string[];
  readonly required_reviews: number;
  readonly required_quorum: number;
  readonly target_paths: readonly string[];
}

export interface EvolutionGuardQuorumSummary {
  readonly required_reviews: number;
  readonly received_reviews: number;
  readonly required_quorum: number;
  readonly approval_count: number;
  readonly rejection_count: number;
  readonly hold_count: number;
  readonly blocking_finding_count: number;
  readonly missing_route_ids: readonly string[];
}

export interface EvolutionGuardReviewGate {
  readonly risk: "high";
  readonly approval_class: "C";
  readonly escalation_required: true;
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
  readonly reasons: readonly string[];
}

export interface EvolutionGuardGuardrails {
  readonly mutation_execution_authorized: false;
  readonly mutation_pr_generation_allowed: boolean;
  readonly github_transport_authorized: false;
  readonly approval_record_written: false;
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
}

export interface EvolutionGuardRecord {
  readonly guard_id: string;
  readonly class: "evolution_guard_decision";
  readonly proposal_id: string;
  readonly mutation_id: string;
  readonly routing_id: string;
  readonly decision: EvolutionGuardDecision;
  readonly approval_class: "C";
}

export interface EvolutionGuardDecisionResult {
  readonly manifest_version: typeof EVOLUTION_GUARD_VERSION;
  readonly schema_ref: typeof EVOLUTION_GUARD_SCHEMA_REF;
  readonly guard_id: string;
  readonly created_at: string;
  readonly status: EvolutionGuardStatus;
  readonly decision: EvolutionGuardDecision;
  readonly reasons: readonly string[];
  readonly proposal: NVersionAuditProposalRef;
  readonly routing_ref: EvolutionGuardRoutingRef;
  readonly reviews: readonly EvolutionGuardReviewEvidence[];
  readonly quorum: EvolutionGuardQuorumSummary;
  readonly guardrails: EvolutionGuardGuardrails;
  readonly review_gate: EvolutionGuardReviewGate;
  readonly guard_record: EvolutionGuardRecord;
  readonly guard_digest: string;
  readonly dry_run: {
    readonly file_written: false;
    readonly github_api_called: false;
    readonly mutation_executed: false;
    readonly approval_record_written: false;
    readonly auto_merged: false;
  };
  readonly issues?: readonly EvolutionGuardIssue[];
}

export interface EvolutionGuardValidationResult {
  readonly ok: boolean;
  readonly issues: readonly EvolutionGuardIssue[];
}

export const EVOLUTION_GUARD_CONTRACT = {
  consumes: ["high_risk_mutation_proposal_manifest", "n_version_audit_routing_manifest", "independent_review_evidence"],
  produces: ["evolution_guard_decision_manifest"],
  decisions: ["accept", "reject", "hold"],
  validates: [
    "proposal_routing_identity_match",
    "all_routed_reviews_collected_before_accept",
    "independent_reviewer_evidence_match",
    "blocking_findings_reject",
    "class_c_human_review_boundary",
  ],
  forbids: [
    "mutation_execution",
    "live_file_write",
    "github_api_call",
    "approval_record_write",
    "automatic_merge",
  ],
  deterministic: true,
  decisionOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const MANIFEST_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const MUTATION_ID = /^mut-[0-9a-f]{8}$/;
const REVIEWER_ID = /^[a-z][a-z0-9_.-]*$/;
const AGENT_DOCUMENT_PATH = /^\.forge\/agents\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\.forge$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const FINDING_ID = /^finding-[0-9a-f]{8}$/;

export function runEvolutionGuard(input: unknown): EvolutionGuardDecisionResult {
  const envelope = normalizeInputEnvelope(input);
  const createdAt = resolveTimestamp(envelope.now, DEFAULT_NOW);
  const timestampIssues: EvolutionGuardIssue[] = createdAt === null
    ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }]
    : [];
  const shapeIssues = envelope.input === null ? envelope.issues : [...envelope.issues, ...validateInputShape(envelope.input)];
  const issues = [...timestampIssues, ...shapeIssues];
  if (issues.length > 0 || envelope.input === null) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.proposal, envelope.routing, envelope.reviews, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "EvolutionGuard input must be an object" }]);
  }

  const proposal = cloneProposal(envelope.input.proposal);
  const routingRef = summarizeRouting(envelope.input.routing);
  const reviews = envelope.input.reviews.map(cloneReview);
  const quorum = summarizeQuorum(envelope.input.routing, reviews);
  const evaluation = evaluateReviews(envelope.input.routing, reviews, quorum);
  const reviewGateValue = reviewGate();
  const guardrailsValue = guardrails(evaluation.decision);
  const fingerprint = acceptedGuardFingerprint(proposal, routingRef, reviews, quorum, evaluation.decision, evaluation.reasons);
  const guardId = stableId("evolution-guard", [fingerprint]);

  return {
    manifest_version: EVOLUTION_GUARD_VERSION,
    schema_ref: EVOLUTION_GUARD_SCHEMA_REF,
    guard_id: guardId,
    created_at: createdAt ?? DEFAULT_NOW,
    status: "decision_ready",
    decision: evaluation.decision,
    reasons: evaluation.reasons,
    proposal,
    routing_ref: routingRef,
    reviews,
    quorum,
    guardrails: guardrailsValue,
    review_gate: reviewGateValue,
    guard_record: guardRecord(guardId, proposal, routingRef, evaluation.decision),
    guard_digest: canonicalDigest(guardDigestPayload(proposal, routingRef, reviews, quorum, guardrailsValue, reviewGateValue, evaluation.decision, evaluation.reasons)),
    dry_run: dryRunFlags(),
  };
}

export function validateEvolutionGuardDecision(result: EvolutionGuardDecisionResult): EvolutionGuardValidationResult {
  const issues: EvolutionGuardIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "EvolutionGuard result must be an object");
    return { ok: false, issues };
  }
  const candidate = result as Partial<EvolutionGuardDecisionResult>;
  if (candidate.manifest_version !== EVOLUTION_GUARD_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (candidate.schema_ref !== EVOLUTION_GUARD_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify EvolutionGuard v1");
  if (typeof candidate.created_at !== "string" || !isRfc3339Utc(candidate.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (candidate.status !== "decision_ready" && candidate.status !== "invalid") issue(issues, "status", "invalid_status", "status must be decision_ready or invalid");
  if (candidate.decision !== "evolution_guard_accept" && candidate.decision !== "evolution_guard_reject" && candidate.decision !== "evolution_guard_hold" && candidate.decision !== "invalid_evolution_guard_input") issue(issues, "decision", "invalid_decision", "decision must be an EvolutionGuard decision");
  validateReviewGate(candidate.review_gate, issues);
  validateDryRun(candidate.dry_run, issues);
  validateGuardrails(candidate.guardrails, candidate.decision, issues);
  validateNoSecretMaterial(candidate, "result", issues);
  if (!isRecord(candidate.proposal)) issue(issues, "proposal", "proposal_required", "EvolutionGuard results must carry proposal metadata");
  if (!isRecord(candidate.routing_ref)) issue(issues, "routing_ref", "routing_ref_required", "EvolutionGuard results must carry routing metadata");
  if (!Array.isArray(candidate.reviews)) issue(issues, "reviews", "array_required", "reviews must be an array");
  if (!isRecord(candidate.quorum)) issue(issues, "quorum", "quorum_required", "EvolutionGuard results must carry quorum metadata");
  if (!isRecord(candidate.guard_record)) issue(issues, "guard_record", "guard_record_required", "EvolutionGuard results must carry a guard record");
  if (!Array.isArray(candidate.reasons)) issue(issues, "reasons", "array_required", "reasons must be an array");

  if (candidate.status === "decision_ready" && canValidateDecision(candidate, issues)) validateDecisionReady(candidate, issues);
  if (candidate.status === "invalid" && canValidateDecision(candidate, issues)) validateInvalidDecision(candidate, issues);
  return { ok: issues.length === 0, issues };
}

function validateInputShape(input: EvolutionGuardInput): EvolutionGuardIssue[] {
  const issues: EvolutionGuardIssue[] = [];
  validateProposal(input.proposal, issues, "proposal");
  validateRouting(input.routing, input.proposal, issues);
  validateReviews(input.reviews, input.routing, input.proposal, issues);
  return issues;
}

function validateRouting(routing: NVersionAuditRoutingResult, proposal: NVersionAuditProposalRef, issues: EvolutionGuardIssue[]): void {
  if (!isRecord(routing)) {
    issue(issues, "routing", "routing_must_be_object", "routing must be an object");
    return;
  }
  const routingValidation = validateNVersionAuditRouting(routing);
  if (!routingValidation.ok) issue(issues, "routing", "invalid_t049_routing_manifest", "routing must pass T049 read-back validation before EvolutionGuard");
  const reviewerRoutes = Array.isArray(routing.reviewer_routes) ? routing.reviewer_routes : [];
  if (routing.schema_ref !== N_VERSION_AUDIT_ROUTING_SCHEMA_REF) issue(issues, "routing.schema_ref", "invalid_routing_schema_ref", "routing must be a T049 N-version audit routing manifest");
  if (routing.status !== "routing_ready" || routing.decision !== "n_version_audit_routing_ready") issue(issues, "routing.status", "routing_not_ready", "routing must be ready before EvolutionGuard decision");
  if (!isRecord(routing.proposal)) issue(issues, "routing.proposal", "routing_proposal_required", "routing must carry proposal metadata");
  else {
    if (routing.proposal.proposal_id !== proposal.proposal_id) issue(issues, "routing.proposal.proposal_id", "proposal_id_mismatch", "routing proposal_id must match input proposal");
    if (routing.proposal.mutation_id !== proposal.mutation_id) issue(issues, "routing.proposal.mutation_id", "mutation_id_mismatch", "routing mutation_id must match input proposal");
    if (!arraysEqual(routing.proposal.target_paths, proposal.target_paths)) issue(issues, "routing.proposal.target_paths", "target_paths_mismatch", "routing target paths must match input proposal");
  }
  if (typeof routing.routing_id !== "string" || !MANIFEST_ID.test(routing.routing_id)) issue(issues, "routing.routing_id", "invalid_routing_id", "routing_id must be deterministic");
  if (typeof routing.routing_digest !== "string" || !DIGEST.test(routing.routing_digest)) issue(issues, "routing.routing_digest", "invalid_routing_digest", "routing_digest must be stable");
  if (!Array.isArray(routing.reviewer_routes) || routing.reviewer_routes.length === 0) issue(issues, "routing.reviewer_routes", "routing_routes_required", "routing must include reviewer routes");
  reviewerRoutes.forEach((route, index) => {
    if (!isRecord(route)) issue(issues, `routing.reviewer_routes[${index}]`, "routing_route_object_required", "routing reviewer routes must be objects");
  });
  if (!isRecord(routing.quorum)) {
    issue(issues, "routing.quorum", "routing_quorum_required", "routing must carry quorum metadata");
  } else {
    if (routing.quorum.evolution_guard_handoff !== "all_required_reviews_collected") issue(issues, "routing.quorum.evolution_guard_handoff", "invalid_evolution_guard_handoff", "routing must wait for all required reviews");
    if (routing.quorum.required_reviews !== reviewerRoutes.length) issue(issues, "routing.quorum.required_reviews", "required_reviews_mismatch", "required_reviews must equal reviewer route count");
    if (!Number.isSafeInteger(routing.quorum.required_quorum) || routing.quorum.required_quorum < 2) issue(issues, "routing.quorum.required_quorum", "invalid_required_quorum", "required_quorum must be >= 2");
  }
  if (isRecord(routing.dry_run) && routing.dry_run.evolution_guard_decided !== false) issue(issues, "routing.dry_run.evolution_guard_decided", "routing_guard_decision_forbidden", "T049 routing must not pre-decide EvolutionGuard");
}

function validateReviews(reviews: readonly EvolutionGuardReviewEvidence[], routing: NVersionAuditRoutingResult, proposal: NVersionAuditProposalRef, issues: EvolutionGuardIssue[]): void {
  if (!Array.isArray(reviews)) {
    issue(issues, "reviews", "reviews_must_be_array", "reviews must be an array");
    return;
  }
  const routeIds = new Set((Array.isArray(routing.reviewer_routes) ? routing.reviewer_routes : []).filter(isRecord).map((route) => stringValue(route.route_id) ?? ""));
  const seenRoutes = new Set<string>();
  for (const [index, review] of reviews.entries()) {
    const prefix = `reviews[${index}]`;
    validateReviewEvidence(review, prefix, issues);
    if (seenRoutes.has(review.route_id)) issue(issues, `${prefix}.route_id`, "duplicate_review_route", `${review.route_id} has more than one review`);
    seenRoutes.add(review.route_id);
    if (!routeIds.has(review.route_id)) issue(issues, `${prefix}.route_id`, "unknown_review_route", "review route_id must be present in routing reviewer_routes");
    const route = findRoute(routing.reviewer_routes, review.route_id);
    if (route !== null) validateReviewMatchesRoute(review, route, proposal, routing.routing_digest, prefix, issues);
  }
}

function validateReviewEvidence(review: EvolutionGuardReviewEvidence, prefix: string, issues: EvolutionGuardIssue[]): void {
  if (!isRecord(review)) {
    issue(issues, prefix, "review_must_be_object", "review evidence entries must be objects");
    return;
  }
  if (typeof review.route_id !== "string" || !MANIFEST_ID.test(review.route_id)) issue(issues, `${prefix}.route_id`, "invalid_route_id", "route_id must be deterministic");
  if (typeof review.reviewer_id !== "string" || !REVIEWER_ID.test(review.reviewer_id)) issue(issues, `${prefix}.reviewer_id`, "invalid_reviewer_id", "reviewer_id must be safe");
  if (typeof review.independence_key !== "string" || !REVIEWER_ID.test(review.independence_key)) issue(issues, `${prefix}.independence_key`, "invalid_independence_key", "independence_key must be safe");
  if (review.decision !== "approve" && review.decision !== "reject" && review.decision !== "hold") issue(issues, `${prefix}.decision`, "invalid_review_decision", "review decision must be approve, reject, or hold");
  if (typeof review.completed_at !== "string" || !isRfc3339Utc(review.completed_at)) issue(issues, `${prefix}.completed_at`, "invalid_completed_at", "completed_at must be RFC3339 UTC");
  if (typeof review.routing_digest !== "string" || !DIGEST.test(review.routing_digest)) issue(issues, `${prefix}.routing_digest`, "invalid_routing_digest", "review routing_digest must be stable");
  if (!Array.isArray(review.reviewed_target_paths)) issue(issues, `${prefix}.reviewed_target_paths`, "array_required", "reviewed_target_paths must be an array");
  if (!Array.isArray(review.findings)) issue(issues, `${prefix}.findings`, "array_required", "findings must be an array");
  else review.findings.forEach((finding, findingIndex) => validateFinding(finding, `${prefix}.findings[${findingIndex}]`, issues));
  if (typeof review.evidence_digest !== "string" || !DIGEST.test(review.evidence_digest)) issue(issues, `${prefix}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
}

function validateFinding(finding: EvolutionGuardFinding, prefix: string, issues: EvolutionGuardIssue[]): void {
  if (!isRecord(finding)) {
    issue(issues, prefix, "finding_must_be_object", "findings must be objects");
    return;
  }
  if (typeof finding.finding_id !== "string" || !FINDING_ID.test(finding.finding_id)) issue(issues, `${prefix}.finding_id`, "invalid_finding_id", "finding_id must match finding-<8 hex>");
  if (finding.severity !== "low" && finding.severity !== "medium" && finding.severity !== "high" && finding.severity !== "critical") issue(issues, `${prefix}.severity`, "invalid_finding_severity", "finding severity must be low, medium, high, or critical");
  if (typeof finding.blocking !== "boolean") issue(issues, `${prefix}.blocking`, "invalid_blocking_flag", "blocking must be boolean");
  if (typeof finding.summary !== "string" || finding.summary.trim().length === 0) issue(issues, `${prefix}.summary`, "missing_finding_summary", "finding summary is required");
  else validateNoSecretMaterial(finding.summary, `${prefix}.summary`, issues);
}

function validateReviewMatchesRoute(review: EvolutionGuardReviewEvidence, route: NVersionAuditRoute, proposal: NVersionAuditProposalRef, routingDigest: string, prefix: string, issues: EvolutionGuardIssue[]): void {
  if (review.reviewer_id !== route.reviewer_id) issue(issues, `${prefix}.reviewer_id`, "reviewer_id_mismatch", "review reviewer_id must match route");
  if (review.independence_key !== route.independence_key) issue(issues, `${prefix}.independence_key`, "independence_key_mismatch", "review independence_key must match route");
  if (review.routing_digest !== routingDigest) issue(issues, `${prefix}.routing_digest`, "review_routing_digest_mismatch", "review routing_digest must match routing manifest");
  if (!arraysEqual(review.reviewed_target_paths, proposal.target_paths)) issue(issues, `${prefix}.reviewed_target_paths`, "reviewed_target_paths_mismatch", "reviewed target paths must match proposal target paths");
}

function validateDecisionReady(result: EvolutionGuardDecisionResult, issues: EvolutionGuardIssue[]): void {
  validateProposal(result.proposal, issues, "proposal");
  validateRoutingRef(result.routing_ref, result.proposal, issues);
  validateDecisionReviews(result, issues);
  validateQuorumSummary(result, issues);
  validateGuardRecord(result, issues);
  validateDeterministicGuard(result, issues);
  if (result.issues !== undefined) issue(issues, "issues", "decision_ready_issues_forbidden", "decision-ready guard manifests must not carry validation issues");
}

function validateInvalidDecision(result: EvolutionGuardDecisionResult, issues: EvolutionGuardIssue[]): void {
  if (result.decision !== "invalid_evolution_guard_input") issue(issues, "decision", "invalid_status_decision_mismatch", "invalid status must use invalid_evolution_guard_input");
  if (result.guard_digest !== canonicalDigest(null)) issue(issues, "guard_digest", "invalid_guard_digest_mismatch", "invalid guard manifests must use the invalid digest sentinel");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid guard manifests must carry validation issues");
}

function canValidateDecision(result: Partial<EvolutionGuardDecisionResult>, issues: EvolutionGuardIssue[]): result is EvolutionGuardDecisionResult {
  return isRecord(result.proposal) &&
    isRecord(result.routing_ref) &&
    Array.isArray(result.reviews) &&
    isRecord(result.quorum) &&
    isRecord(result.guardrails) &&
    isRecord(result.review_gate) &&
    isRecord(result.guard_record) &&
    isRecord(result.dry_run) &&
    Array.isArray(result.reasons);
}

function validateRoutingRef(ref: EvolutionGuardRoutingRef, proposal: NVersionAuditProposalRef, issues: EvolutionGuardIssue[]): void {
  if (typeof ref.routing_id !== "string" || !MANIFEST_ID.test(ref.routing_id)) issue(issues, "routing_ref.routing_id", "invalid_routing_id", "routing_id must be deterministic");
  if (typeof ref.routing_digest !== "string" || !DIGEST.test(ref.routing_digest)) issue(issues, "routing_ref.routing_digest", "invalid_routing_digest", "routing_digest must be stable");
  if (ref.schema_ref !== N_VERSION_AUDIT_ROUTING_SCHEMA_REF) issue(issues, "routing_ref.schema_ref", "invalid_routing_schema_ref", "routing_ref schema must be T049");
  if (!Array.isArray(ref.route_ids) || ref.route_ids.length === 0) issue(issues, "routing_ref.route_ids", "route_ids_required", "routing_ref must include route ids");
  if (!Number.isSafeInteger(ref.required_reviews) || ref.required_reviews !== ref.route_ids.length) issue(issues, "routing_ref.required_reviews", "required_reviews_mismatch", "required_reviews must equal route_ids length");
  if (!Number.isSafeInteger(ref.required_quorum) || ref.required_quorum < 2) issue(issues, "routing_ref.required_quorum", "invalid_required_quorum", "required_quorum must be >= 2");
  if (!arraysEqual(ref.target_paths, proposal.target_paths)) issue(issues, "routing_ref.target_paths", "routing_ref_target_paths_mismatch", "routing target paths must match proposal");
}

function validateDecisionReviews(result: EvolutionGuardDecisionResult, issues: EvolutionGuardIssue[]): void {
  const routeIds = new Set(result.routing_ref.route_ids);
  const seenRoutes = new Set<string>();
  for (const [index, review] of result.reviews.entries()) {
    const prefix = `reviews[${index}]`;
    validateReviewEvidence(review, prefix, issues);
    if (!routeIds.has(review.route_id)) issue(issues, `${prefix}.route_id`, "unknown_review_route", "review route_id must be present in routing_ref");
    if (seenRoutes.has(review.route_id)) issue(issues, `${prefix}.route_id`, "duplicate_review_route", `${review.route_id} has more than one review`);
    seenRoutes.add(review.route_id);
    if (review.routing_digest !== result.routing_ref.routing_digest) issue(issues, `${prefix}.routing_digest`, "review_routing_digest_mismatch", "review routing_digest must match routing_ref");
    if (!arraysEqual(review.reviewed_target_paths, result.proposal.target_paths)) issue(issues, `${prefix}.reviewed_target_paths`, "reviewed_target_paths_mismatch", "reviewed target paths must match proposal");
  }
}

function validateQuorumSummary(result: EvolutionGuardDecisionResult, issues: EvolutionGuardIssue[]): void {
  const expected = summarizeQuorumFromRefs(result.routing_ref, result.reviews);
  if (result.quorum.required_reviews !== expected.required_reviews) issue(issues, "quorum.required_reviews", "required_reviews_mismatch", "required_reviews must match routing_ref");
  if (result.quorum.received_reviews !== expected.received_reviews) issue(issues, "quorum.received_reviews", "received_reviews_mismatch", "received_reviews must match reviews length");
  if (result.quorum.required_quorum !== expected.required_quorum) issue(issues, "quorum.required_quorum", "required_quorum_mismatch", "required_quorum must match routing_ref");
  if (result.quorum.approval_count !== expected.approval_count) issue(issues, "quorum.approval_count", "approval_count_mismatch", "approval_count must match approving reviews");
  if (result.quorum.rejection_count !== expected.rejection_count) issue(issues, "quorum.rejection_count", "rejection_count_mismatch", "rejection_count must match rejecting reviews");
  if (result.quorum.hold_count !== expected.hold_count) issue(issues, "quorum.hold_count", "hold_count_mismatch", "hold_count must match held reviews");
  if (result.quorum.blocking_finding_count !== expected.blocking_finding_count) issue(issues, "quorum.blocking_finding_count", "blocking_finding_count_mismatch", "blocking finding count must match reviews");
  if (!arraysEqual(result.quorum.missing_route_ids, expected.missing_route_ids)) issue(issues, "quorum.missing_route_ids", "missing_route_ids_mismatch", "missing route ids must match routing_ref route ids without reviews");
  if (result.decision === "evolution_guard_accept") {
    if (result.quorum.missing_route_ids.length !== 0) issue(issues, "quorum.missing_route_ids", "accepted_with_missing_reviews", "accept decisions require all routed reviews");
    if (result.quorum.approval_count < result.quorum.required_quorum) issue(issues, "quorum.approval_count", "accept_quorum_not_met", "accept decisions require approval quorum");
    if (result.quorum.rejection_count !== 0 || result.quorum.hold_count !== 0 || result.quorum.blocking_finding_count !== 0) issue(issues, "quorum", "accept_blockers_forbidden", "accept decisions cannot have rejects, holds, or blocking findings");
  }
  if (result.decision === "evolution_guard_reject" && result.quorum.rejection_count === 0 && result.quorum.blocking_finding_count === 0) issue(issues, "quorum", "reject_requires_blocker", "reject decisions require a rejecting review or blocking finding");
  if (result.decision === "evolution_guard_hold" && result.quorum.missing_route_ids.length === 0 && result.quorum.hold_count === 0 && result.quorum.approval_count >= result.quorum.required_quorum) issue(issues, "quorum", "hold_requires_incomplete_evidence", "hold decisions require missing reviews, hold reviews, or unmet quorum");
}

function validateGuardRecord(result: EvolutionGuardDecisionResult, issues: EvolutionGuardIssue[]): void {
  if (result.guard_record.guard_id !== result.guard_id) issue(issues, "guard_record.guard_id", "guard_record_id_mismatch", "guard record must reference guard_id");
  if (result.guard_record.class !== "evolution_guard_decision") issue(issues, "guard_record.class", "invalid_guard_record_class", "guard record class must be evolution_guard_decision");
  if (result.guard_record.proposal_id !== result.proposal.proposal_id) issue(issues, "guard_record.proposal_id", "guard_record_proposal_mismatch", "guard record must reference proposal_id");
  if (result.guard_record.mutation_id !== result.proposal.mutation_id) issue(issues, "guard_record.mutation_id", "guard_record_mutation_mismatch", "guard record must reference mutation_id");
  if (result.guard_record.routing_id !== result.routing_ref.routing_id) issue(issues, "guard_record.routing_id", "guard_record_routing_mismatch", "guard record must reference routing_id");
  if (result.guard_record.decision !== result.decision) issue(issues, "guard_record.decision", "guard_record_decision_mismatch", "guard record decision must match result decision");
  if (result.guard_record.approval_class !== "C") issue(issues, "guard_record.approval_class", "class_c_required", "guard record must remain Class C");
}

function validateDeterministicGuard(result: EvolutionGuardDecisionResult, issues: EvolutionGuardIssue[]): void {
  const expectedId = stableId("evolution-guard", [acceptedGuardFingerprint(result.proposal, result.routing_ref, result.reviews, result.quorum, result.decision, result.reasons)]);
  if (result.guard_id !== expectedId) issue(issues, "guard_id", "guard_id_mismatch", "guard_id must match deterministic guard fingerprint");
  const expectedDigest = canonicalDigest(guardDigestPayload(result.proposal, result.routing_ref, result.reviews, result.quorum, result.guardrails, result.review_gate, result.decision, result.reasons));
  if (result.guard_digest !== expectedDigest) issue(issues, "guard_digest", "guard_digest_mismatch", "guard_digest must cover proposal, routing, reviews, quorum, guardrails, review gate, decision, and reasons");
}

function evaluateReviews(routing: NVersionAuditRoutingResult, reviews: readonly EvolutionGuardReviewEvidence[], quorum: EvolutionGuardQuorumSummary): { readonly decision: EvolutionGuardDecision; readonly reasons: readonly string[] } {
  if (quorum.missing_route_ids.length > 0) return { decision: "evolution_guard_hold", reasons: ["missing_required_reviews", "mutation_execution_not_authorized"] };
  if (quorum.blocking_finding_count > 0) return { decision: "evolution_guard_reject", reasons: ["blocking_review_finding", "mutation_execution_not_authorized"] };
  if (reviews.some((review) => review.decision === "reject")) return { decision: "evolution_guard_reject", reasons: ["reviewer_rejection", "mutation_execution_not_authorized"] };
  if (reviews.some((review) => review.decision === "hold")) return { decision: "evolution_guard_hold", reasons: ["reviewer_hold", "mutation_execution_not_authorized"] };
  if (quorum.approval_count >= routing.quorum.required_quorum) return { decision: "evolution_guard_accept", reasons: ["independent_quorum_satisfied", "no_blocking_findings", "mutation_execution_not_authorized"] };
  return { decision: "evolution_guard_hold", reasons: ["approval_quorum_not_met", "mutation_execution_not_authorized"] };
}

function summarizeQuorum(routing: NVersionAuditRoutingResult, reviews: readonly EvolutionGuardReviewEvidence[]): EvolutionGuardQuorumSummary {
  return summarizeQuorumFromRefs(summarizeRouting(routing), reviews);
}

function summarizeQuorumFromRefs(routing: EvolutionGuardRoutingRef, reviews: readonly EvolutionGuardReviewEvidence[]): EvolutionGuardQuorumSummary {
  const reviewedRouteIds = new Set(reviews.map((review) => review.route_id));
  return {
    required_reviews: routing.required_reviews,
    received_reviews: reviews.length,
    required_quorum: routing.required_quorum,
    approval_count: reviews.filter((review) => review.decision === "approve").length,
    rejection_count: reviews.filter((review) => review.decision === "reject").length,
    hold_count: reviews.filter((review) => review.decision === "hold").length,
    blocking_finding_count: reviews.flatMap((review) => review.findings).filter(isBlockingFinding).length,
    missing_route_ids: routing.route_ids.filter((routeId) => !reviewedRouteIds.has(routeId)),
  };
}

function summarizeRouting(routing: NVersionAuditRoutingResult): EvolutionGuardRoutingRef {
  const routes = Array.isArray(routing.reviewer_routes) ? routing.reviewer_routes.filter(isRecord) : [];
  const proposalTargetPaths = isRecord(routing.proposal) && Array.isArray(routing.proposal.target_paths)
    ? routing.proposal.target_paths.filter((entry): entry is string => typeof entry === "string")
    : [];
  return {
    routing_id: typeof routing.routing_id === "string" ? routing.routing_id : "",
    routing_digest: typeof routing.routing_digest === "string" ? routing.routing_digest : "",
    schema_ref: routing.schema_ref === N_VERSION_AUDIT_ROUTING_SCHEMA_REF ? routing.schema_ref : "",
    route_ids: routes.map((route) => stringValue(route.route_id) ?? ""),
    required_reviews: isRecord(routing.quorum) && Number.isSafeInteger(routing.quorum.required_reviews) ? routing.quorum.required_reviews : routes.length,
    required_quorum: isRecord(routing.quorum) && Number.isSafeInteger(routing.quorum.required_quorum) ? routing.quorum.required_quorum : 0,
    target_paths: [...proposalTargetPaths],
  };
}

function normalizeInputEnvelope(input: unknown): {
  readonly input: EvolutionGuardInput | null;
  readonly now?: string;
  readonly proposal: NVersionAuditProposalRef;
  readonly routing: NVersionAuditRoutingResult;
  readonly reviews: readonly EvolutionGuardReviewEvidence[];
  readonly issues: readonly EvolutionGuardIssue[];
} {
  const issues: EvolutionGuardIssue[] = [];
  if (!isRecord(input)) {
    issue(issues, "input", "input_must_be_object", "EvolutionGuard input must be an object");
    return { input: null, proposal: emptyProposal(), routing: emptyRouting(), reviews: [], issues };
  }
  let now: string | undefined;
  if (input.now !== undefined) {
    if (typeof input.now === "string") now = input.now;
    else issue(issues, "now", "now_must_be_string", "now must be a string when provided");
  }
  const proposal = normalizeProposal(input.proposal, issues);
  const routing = isRecord(input.routing) ? input.routing as unknown as NVersionAuditRoutingResult : emptyRouting();
  if (!isRecord(input.routing)) issue(issues, "routing", "routing_must_be_object", "routing must be an object");
  const reviews = normalizeReviews(input.reviews, issues);
  return { input: { now, proposal, routing, reviews }, now, proposal, routing, reviews, issues };
}

function normalizeProposal(value: unknown, issues: EvolutionGuardIssue[]): NVersionAuditProposalRef {
  if (!isRecord(value)) {
    issue(issues, "proposal", "proposal_must_be_object", "proposal must be an object");
    return emptyProposal();
  }
  return {
    proposal_id: stringValue(value.proposal_id) ?? "",
    mutation_id: stringValue(value.mutation_id) ?? "",
    mutation_class: stringValue(value.mutation_class) as NVersionAuditProposalRef["mutation_class"],
    risk: stringValue(value.risk) as NVersionAuditProposalRef["risk"],
    approval_class: stringValue(value.approval_class) as NVersionAuditProposalRef["approval_class"],
    target_paths: normalizeStringArray(value.target_paths, "proposal.target_paths", issues),
    source_digest: stringValue(value.source_digest) ?? "",
  };
}

function normalizeReviews(value: unknown, issues: EvolutionGuardIssue[]): readonly EvolutionGuardReviewEvidence[] {
  if (!Array.isArray(value)) {
    issue(issues, "reviews", "reviews_must_be_array", "reviews must be an array");
    return [];
  }
  return value.map((entry, index) => normalizeReview(entry, `reviews[${index}]`, issues));
}

function normalizeReview(value: unknown, prefix: string, issues: EvolutionGuardIssue[]): EvolutionGuardReviewEvidence {
  if (!isRecord(value)) {
    issue(issues, prefix, "review_must_be_object", "review evidence entries must be objects");
    return emptyReview();
  }
  return {
    route_id: stringValue(value.route_id) ?? "",
    reviewer_id: stringValue(value.reviewer_id) ?? "",
    independence_key: stringValue(value.independence_key) ?? "",
    decision: stringValue(value.decision) as EvolutionGuardReviewDecision,
    completed_at: stringValue(value.completed_at) ?? "",
    routing_digest: stringValue(value.routing_digest) ?? "",
    reviewed_target_paths: normalizeStringArray(value.reviewed_target_paths, `${prefix}.reviewed_target_paths`, issues),
    findings: normalizeFindings(value.findings, `${prefix}.findings`, issues),
    evidence_digest: stringValue(value.evidence_digest) ?? "",
  };
}

function normalizeFindings(value: unknown, path: string, issues: EvolutionGuardIssue[]): readonly EvolutionGuardFinding[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "findings_must_be_array", "findings must be an array");
    return [];
  }
  return value.map((entry, index) => {
    const prefix = `${path}[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, prefix, "finding_must_be_object", "findings must be objects");
      return { finding_id: "", severity: "low", blocking: false, summary: "" };
    }
    const summary = stringValue(entry.summary) ?? "";
    if (containsSecret(summary)) issue(issues, `${prefix}.summary`, "secret_material_forbidden", "finding summary must not contain token or private-key material");
    return {
      finding_id: stringValue(entry.finding_id) ?? "",
      severity: stringValue(entry.severity) as EvolutionGuardFindingSeverity,
      blocking: typeof entry.blocking === "boolean" ? entry.blocking : false,
      summary: containsSecret(summary) ? "" : summary,
    };
  });
}

function invalidResult(createdAt: string, proposal: NVersionAuditProposalRef, routing: NVersionAuditRoutingResult, reviews: readonly EvolutionGuardReviewEvidence[], issues: readonly EvolutionGuardIssue[]): EvolutionGuardDecisionResult {
  const routingRef = summarizeRouting(routing);
  const quorum = summarizeQuorumFromRefs(routingRef, reviews);
  const guardId = stableId("evolution-guard", [canonicalStringify({ proposal, routingRef, reviews, issues })]);
  return {
    manifest_version: EVOLUTION_GUARD_VERSION,
    schema_ref: EVOLUTION_GUARD_SCHEMA_REF,
    guard_id: guardId,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_evolution_guard_input",
    reasons: uniqueStrings(issues.map((entry) => entry.code)),
    proposal: cloneProposal(proposal),
    routing_ref: routingRef,
    reviews: reviews.map(cloneReview),
    quorum,
    guardrails: guardrails("invalid_evolution_guard_input"),
    review_gate: reviewGate(),
    guard_record: guardRecord(guardId, proposal, routingRef, "invalid_evolution_guard_input"),
    guard_digest: canonicalDigest(null),
    dry_run: dryRunFlags(),
    issues,
  };
}

function validateProposal(proposal: NVersionAuditProposalRef, issues: EvolutionGuardIssue[], path: string): void {
  if (typeof proposal.proposal_id !== "string" || !MANIFEST_ID.test(proposal.proposal_id)) issue(issues, `${path}.proposal_id`, "invalid_proposal_id", "proposal_id must be a deterministic manifest id");
  if (typeof proposal.mutation_id !== "string" || !MUTATION_ID.test(proposal.mutation_id)) issue(issues, `${path}.mutation_id`, "invalid_mutation_id", "mutation_id must match mut-<8 hex>");
  if (proposal.mutation_class !== "prompt_patch" && proposal.mutation_class !== "tool_routing" && proposal.mutation_class !== "speciation") issue(issues, `${path}.mutation_class`, "unsupported_mutation_class", "mutation_class must be prompt_patch, tool_routing, or speciation");
  if (proposal.risk !== "high") issue(issues, `${path}.risk`, "high_risk_required", "EvolutionGuard only accepts high-risk proposals");
  if (proposal.approval_class !== "C") issue(issues, `${path}.approval_class`, "class_c_required", "EvolutionGuard only accepts Class C proposals");
  if (typeof proposal.source_digest !== "string" || !DIGEST.test(proposal.source_digest)) issue(issues, `${path}.source_digest`, "invalid_source_digest", "source_digest must be stable");
  if (!Array.isArray(proposal.target_paths) || proposal.target_paths.length === 0) issue(issues, `${path}.target_paths`, "target_paths_required", "proposal must include target paths");
  else {
    for (const [index, targetPath] of proposal.target_paths.entries()) {
      if (typeof targetPath !== "string" || AGENT_DOCUMENT_PATH.exec(targetPath) === null) issue(issues, `${path}.target_paths[${index}]`, "forbidden_document_path", "proposal target paths must be canonical agent documents");
    }
  }
}

function findRoute(routes: unknown, routeId: string): NVersionAuditRoute | null {
  if (!Array.isArray(routes)) return null;
  const route = routes.find((entry) => isRecord(entry) && entry.route_id === routeId);
  return isRecord(route) ? route as unknown as NVersionAuditRoute : null;
}

function isBlockingFinding(finding: EvolutionGuardFinding): boolean {
  return finding.blocking === true || finding.severity === "high" || finding.severity === "critical";
}

function guardrails(decision: EvolutionGuardDecision): EvolutionGuardGuardrails {
  return {
    mutation_execution_authorized: false,
    mutation_pr_generation_allowed: decision === "evolution_guard_accept",
    github_transport_authorized: false,
    approval_record_written: false,
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
  };
}

function reviewGate(): EvolutionGuardReviewGate {
  return {
    risk: "high",
    approval_class: "C",
    escalation_required: true,
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
    reasons: ["evolution_guard_requires_class_c_review", "mutation_execution_not_authorized"],
  };
}

function guardRecord(guardId: string, proposal: NVersionAuditProposalRef, routing: EvolutionGuardRoutingRef, decision: EvolutionGuardDecision): EvolutionGuardRecord {
  return {
    guard_id: guardId,
    class: "evolution_guard_decision",
    proposal_id: proposal.proposal_id,
    mutation_id: proposal.mutation_id,
    routing_id: routing.routing_id,
    decision,
    approval_class: "C",
  };
}

function dryRunFlags(): EvolutionGuardDecisionResult["dry_run"] {
  return {
    file_written: false,
    github_api_called: false,
    mutation_executed: false,
    approval_record_written: false,
    auto_merged: false,
  };
}

function validateReviewGate(value: unknown, issues: EvolutionGuardIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "review_gate", "review_gate_required", "EvolutionGuard results must carry a review gate");
    return;
  }
  if (value.risk !== "high") issue(issues, "review_gate.risk", "high_risk_required", "EvolutionGuard decisions must remain high risk");
  if (value.approval_class !== "C" || value.escalation_required !== true) issue(issues, "review_gate", "class_c_required", "EvolutionGuard decisions must remain Class C review-gated");
  if (value.human_review_required_before_execution !== true) issue(issues, "review_gate.human_review_required_before_execution", "human_review_before_execution_required", "EvolutionGuard decisions must require human review before execution");
  if (value.human_review_required_before_merge !== true) issue(issues, "review_gate.human_review_required_before_merge", "human_review_before_merge_required", "EvolutionGuard decisions must require human review before merge");
  if (!Array.isArray(value.reasons) || !arraysEqual(value.reasons, reviewGate().reasons)) issue(issues, "review_gate.reasons", "review_gate_reasons_mismatch", "review gate reasons must remain canonical");
}

function validateDryRun(value: unknown, issues: EvolutionGuardIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "EvolutionGuard results must carry dry-run flags");
    return;
  }
  if (value.file_written !== false) issue(issues, "dry_run.file_written", "file_write_forbidden", "EvolutionGuard must not write files");
  if (value.github_api_called !== false) issue(issues, "dry_run.github_api_called", "github_api_forbidden", "EvolutionGuard must not call GitHub APIs");
  if (value.mutation_executed !== false) issue(issues, "dry_run.mutation_executed", "mutation_execution_forbidden", "EvolutionGuard must not execute mutations");
  if (value.approval_record_written !== false) issue(issues, "dry_run.approval_record_written", "approval_record_write_forbidden", "EvolutionGuard must not write approval records");
  if (value.auto_merged !== false) issue(issues, "dry_run.auto_merged", "auto_merge_forbidden", "EvolutionGuard must not auto-merge");
}

function validateGuardrails(value: unknown, decision: unknown, issues: EvolutionGuardIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guardrails", "guardrails_required", "EvolutionGuard results must carry guardrails");
    return;
  }
  if (value.mutation_execution_authorized !== false) issue(issues, "guardrails.mutation_execution_authorized", "mutation_execution_forbidden", "EvolutionGuard must not authorize mutation execution");
  if (value.github_transport_authorized !== false) issue(issues, "guardrails.github_transport_authorized", "github_transport_forbidden", "EvolutionGuard must not authorize GitHub transport");
  if (value.approval_record_written !== false) issue(issues, "guardrails.approval_record_written", "approval_record_write_forbidden", "EvolutionGuard must not write approval records");
  if (value.human_review_required_before_execution !== true) issue(issues, "guardrails.human_review_required_before_execution", "human_review_before_execution_required", "human review before execution must remain required");
  if (value.human_review_required_before_merge !== true) issue(issues, "guardrails.human_review_required_before_merge", "human_review_before_merge_required", "human review before merge must remain required");
  if (value.mutation_pr_generation_allowed !== (decision === "evolution_guard_accept")) issue(issues, "guardrails.mutation_pr_generation_allowed", "pr_generation_gate_mismatch", "PR generation can only be allowed after an accept decision");
}

function acceptedGuardFingerprint(proposal: NVersionAuditProposalRef, routingRef: EvolutionGuardRoutingRef, reviews: readonly EvolutionGuardReviewEvidence[], quorum: EvolutionGuardQuorumSummary, decision: EvolutionGuardDecision, reasons: readonly string[]): string {
  return canonicalStringify({ proposal, routingRef, reviews, quorum, decision, reasons });
}

function guardDigestPayload(proposal: NVersionAuditProposalRef, routingRef: EvolutionGuardRoutingRef, reviews: readonly EvolutionGuardReviewEvidence[], quorum: EvolutionGuardQuorumSummary, guardrailsValue: EvolutionGuardGuardrails, gate: EvolutionGuardReviewGate, decision: EvolutionGuardDecision, reasons: readonly string[]): Readonly<Record<string, unknown>> {
  return { proposal, routingRef, reviews, quorum, guardrails: guardrailsValue, review_gate: gate, decision, reasons };
}

function emptyProposal(): NVersionAuditProposalRef {
  return { proposal_id: "", mutation_id: "", mutation_class: "", risk: "", approval_class: "", target_paths: [], source_digest: "" };
}

function emptyRouting(): NVersionAuditRoutingResult {
  return {
    manifest_version: 1,
    schema_ref: N_VERSION_AUDIT_ROUTING_SCHEMA_REF,
    routing_id: "",
    created_at: DEFAULT_NOW,
    status: "rejected",
    decision: "invalid_audit_routing_input",
    reasons: [],
    proposal: emptyProposal(),
    policy: { min_reviewers: 0, required_quorum: 0, required_focuses: [] },
    reviewer_routes: [],
    quorum: { required_reviews: 0, required_quorum: 0, minimum_distinct_independence_keys: 0, required_focuses: [], blocking_findings_policy: "any_blocking_finding_blocks_evolution_guard", evolution_guard_handoff: "all_required_reviews_collected" },
    routing_digest: "",
    review_gate: { risk: "high", approval_class: "C", escalation_required: true, human_review_required_before_execution: true, human_review_required_before_merge: true, reasons: [] },
    routing_record: { routing_id: "", class: "n_version_audit_routing", proposal_id: "", mutation_id: "", target_paths: [], decision: "rejected", approval_class: "C" },
    dry_run: { file_written: false, github_api_called: false, reviewers_notified: false, audit_jobs_started: false, evolution_guard_decided: false, auto_merged: false },
    issues: [],
  };
}

function emptyReview(): EvolutionGuardReviewEvidence {
  return { route_id: "", reviewer_id: "", independence_key: "", decision: "hold", completed_at: "", routing_digest: "", reviewed_target_paths: [], findings: [], evidence_digest: "" };
}

function cloneProposal(proposal: NVersionAuditProposalRef): NVersionAuditProposalRef {
  return { ...proposal, target_paths: [...proposal.target_paths] };
}

function cloneReview(review: EvolutionGuardReviewEvidence): EvolutionGuardReviewEvidence {
  return {
    route_id: review.route_id,
    reviewer_id: review.reviewer_id,
    independence_key: review.independence_key,
    decision: review.decision,
    completed_at: review.completed_at,
    routing_digest: review.routing_digest,
    reviewed_target_paths: [...review.reviewed_target_paths],
    findings: review.findings.map((finding) => ({ ...finding })),
    evidence_digest: review.evidence_digest,
  };
}

function normalizeStringArray(value: unknown, path: string, issues: EvolutionGuardIssue[]): readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "string_array_required", `${path} must be an array`);
    return [];
  }
  return value.map((entry) => typeof entry === "string" ? entry : "");
}

function validateNoSecretMaterial(value: unknown, path: string, issues: EvolutionGuardIssue[]): void {
  if (typeof value === "string") {
    if (containsSecret(value)) issue(issues, path, "secret_material_forbidden", "EvolutionGuard manifests must not contain token or private-key material");
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

function issue(issues: EvolutionGuardIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function resolveTimestamp(value: string | undefined, fallback: string): string | null { return value === undefined ? fallback : isRfc3339Utc(value) ? value : null; }
function isRfc3339Utc(value: string): boolean {
  if (!RFC3339_UTC.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === normalized;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values)]; }
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const evaluateEvolutionGuard = runEvolutionGuard;
export const createEvolutionGuardDecision = runEvolutionGuard;
export const runT050EvolutionGuard = runEvolutionGuard;
export const validateT050EvolutionGuardDecision = validateEvolutionGuardDecision;
