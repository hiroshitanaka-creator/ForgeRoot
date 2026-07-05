export const N_VERSION_AUDIT_ROUTING_VERSION = 1 as const;
export const N_VERSION_AUDIT_ROUTING_SCHEMA_REF = "urn:forgeroot:mutate-n-version-audit-routing:v1" as const;

export type NVersionAuditFocus = "architecture" | "security" | "state" | "lineage" | "tests";
export type NVersionAuditMutationClass = "prompt_patch" | "tool_routing" | "speciation";
export type NVersionAuditRoutingStatus = "routing_ready" | "rejected";
export type NVersionAuditRoutingDecision = "n_version_audit_routing_ready" | "blocked_by_reviewer_conflict" | "invalid_audit_routing_input";

export interface NVersionAuditProposalRef {
  readonly proposal_id: string;
  readonly mutation_id: string;
  readonly mutation_class: NVersionAuditMutationClass | "";
  readonly risk: "high" | "";
  readonly approval_class: "C" | "";
  readonly target_paths: readonly string[];
  readonly source_digest: string;
}

export interface NVersionAuditReviewerCandidate {
  readonly reviewer_id: string;
  readonly independence_key: string;
  readonly focuses: readonly NVersionAuditFocus[];
  readonly max_parallel_assignments: number;
  readonly conflict_paths?: readonly string[];
}

export interface NVersionAuditRoutingPolicy {
  readonly min_reviewers: number;
  readonly required_quorum: number;
  readonly required_focuses: readonly NVersionAuditFocus[];
}

export interface NVersionAuditRoutingInput {
  readonly now?: string;
  readonly proposal: NVersionAuditProposalRef;
  readonly reviewers: readonly NVersionAuditReviewerCandidate[];
  readonly policy: NVersionAuditRoutingPolicy;
}

export interface NVersionAuditRoutingIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface NVersionAuditRoute {
  readonly route_id: string;
  readonly lane: string;
  readonly reviewer_id: string;
  readonly independence_key: string;
  readonly focuses: readonly NVersionAuditFocus[];
  readonly assigned_target_paths: readonly string[];
  readonly requires_independent_result: true;
  readonly result_schema_ref: "urn:forgeroot:n-version-audit-result:v1";
}

export interface NVersionAuditQuorum {
  readonly required_reviews: number;
  readonly required_quorum: number;
  readonly minimum_distinct_independence_keys: number;
  readonly required_focuses: readonly NVersionAuditFocus[];
  readonly blocking_findings_policy: "any_blocking_finding_blocks_evolution_guard";
  readonly evolution_guard_handoff: "all_required_reviews_collected";
}

export interface NVersionAuditReviewGate {
  readonly risk: "high";
  readonly approval_class: "C";
  readonly escalation_required: true;
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
  readonly reasons: readonly string[];
}

export interface NVersionAuditRoutingRecord {
  readonly routing_id: string;
  readonly class: "n_version_audit_routing";
  readonly proposal_id: string;
  readonly mutation_id: string;
  readonly target_paths: readonly string[];
  readonly decision: "routed" | "rejected";
  readonly approval_class: "C";
}

export interface NVersionAuditRoutingResult {
  readonly manifest_version: typeof N_VERSION_AUDIT_ROUTING_VERSION;
  readonly schema_ref: typeof N_VERSION_AUDIT_ROUTING_SCHEMA_REF;
  readonly routing_id: string;
  readonly created_at: string;
  readonly status: NVersionAuditRoutingStatus;
  readonly decision: NVersionAuditRoutingDecision;
  readonly reasons: readonly string[];
  readonly proposal: NVersionAuditProposalRef;
  readonly policy: NVersionAuditRoutingPolicy;
  readonly reviewer_routes: readonly NVersionAuditRoute[];
  readonly quorum: NVersionAuditQuorum;
  readonly routing_digest: string;
  readonly review_gate: NVersionAuditReviewGate;
  readonly routing_record: NVersionAuditRoutingRecord;
  readonly dry_run: {
    readonly file_written: false;
    readonly github_api_called: false;
    readonly reviewers_notified: false;
    readonly audit_jobs_started: false;
    readonly evolution_guard_decided: false;
    readonly auto_merged: false;
  };
  readonly issues?: readonly NVersionAuditRoutingIssue[];
}

export interface NVersionAuditRoutingValidationResult {
  readonly ok: boolean;
  readonly issues: readonly NVersionAuditRoutingIssue[];
}

export const N_VERSION_AUDIT_ROUTING_CONTRACT = {
  consumes: ["high_risk_mutation_proposal_manifest", "independent_reviewer_pool", "n_version_audit_policy"],
  produces: ["n_version_audit_routing_manifest"],
  validates: [
    "high_risk_class_c_mutation_proposal",
    "canonical_agent_target_paths",
    "independent_reviewer_quorum",
    "required_focus_coverage",
    "reviewer_conflict_exclusion",
  ],
  forbids: [
    "reviewer_notification",
    "audit_job_execution",
    "evolution_guard_decision",
    "live_file_write",
    "github_api_call",
    "automatic_merge",
  ],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const AGENT_DOCUMENT_PATH = /^\.forge\/agents\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\.forge$/;
const MANIFEST_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const MUTATION_ID = /^mut-[0-9a-f]{8}$/;
const REVIEWER_ID = /^[a-z][a-z0-9_.-]*$/;
const SAFE_REPO_PATH = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9_.\/-]+$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const MAX_REVIEWERS = 5;
const MAX_CANDIDATES = 12;
const AUDIT_FOCUSES: ReadonlySet<string> = new Set(["architecture", "security", "state", "lineage", "tests"]);
const ACCEPTED_REASONS = ["n_version_audit_routing_ready", "class_c_human_review_required", "independent_reviewer_quorum_required"] as const;

export function createNVersionAuditRouting(input: unknown): NVersionAuditRoutingResult {
  const envelope = normalizeInputEnvelope(input);
  const createdAt = resolveTimestamp(envelope.now, DEFAULT_NOW);
  const timestampIssues: NVersionAuditRoutingIssue[] = createdAt === null
    ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }]
    : [];
  const shapeIssues = envelope.input === null ? envelope.issues : [...envelope.issues, ...validateInputShape(envelope.input)];
  const selection = envelope.input === null ? emptySelection() : selectReviewers(envelope.input.proposal, envelope.input.reviewers, envelope.input.policy);
  const routingIssues = envelope.input === null || shapeIssues.length > 0 ? [] : validateRoutingCoverage(envelope.input, selection);
  const issues = [...timestampIssues, ...shapeIssues, ...routingIssues];

  if (issues.length > 0) {
    const decision: NVersionAuditRoutingDecision = issues.some((entry) => ["insufficient_independent_reviewers", "required_focus_uncovered", "required_quorum_unavailable", "reviewer_conflict_with_target"].includes(entry.code))
      ? "blocked_by_reviewer_conflict"
      : "invalid_audit_routing_input";
    return { ...invalidResult(createdAt ?? DEFAULT_NOW, envelope.proposal, envelope.policy, issues), decision };
  }
  if (envelope.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.proposal, envelope.policy, [{ path: "input", code: "input_must_be_object", message: "audit routing input must be an object" }]);

  const proposal = cloneProposal(envelope.input.proposal);
  const policy = clonePolicy(envelope.input.policy);
  const routes = createRoutes(proposal, selection.selected);
  const quorum = createQuorum(policy, routes.length);
  const reviewGateValue = reviewGate();
  const fingerprint = acceptedRoutingFingerprint(proposal, policy, routes);
  const routingId = stableId("audit-routing", [fingerprint]);
  const reasons = [...ACCEPTED_REASONS, ...(selection.conflicted_reviewers.length > 0 ? ["conflicted_reviewers_excluded"] : [])];

  return {
    manifest_version: N_VERSION_AUDIT_ROUTING_VERSION,
    schema_ref: N_VERSION_AUDIT_ROUTING_SCHEMA_REF,
    routing_id: routingId,
    created_at: createdAt ?? DEFAULT_NOW,
    status: "routing_ready",
    decision: "n_version_audit_routing_ready",
    reasons,
    proposal,
    policy,
    reviewer_routes: routes,
    quorum,
    routing_digest: canonicalDigest(routingDigestPayload(proposal, routes, quorum, reviewGateValue)),
    review_gate: reviewGateValue,
    routing_record: routingRecord(routingId, proposal, "routed"),
    dry_run: dryRunFlags(),
  };
}

export function validateNVersionAuditRouting(result: NVersionAuditRoutingResult): NVersionAuditRoutingValidationResult {
  const issues: NVersionAuditRoutingIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "audit routing result must be an object");
    return { ok: false, issues };
  }
  const candidate = result as Partial<NVersionAuditRoutingResult>;
  const status = typeof candidate.status === "string" ? candidate.status : "";
  if (candidate.manifest_version !== N_VERSION_AUDIT_ROUTING_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (candidate.schema_ref !== N_VERSION_AUDIT_ROUTING_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify N-version audit routing v1");
  if (typeof candidate.created_at !== "string" || !isRfc3339Utc(candidate.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (status !== "routing_ready" && status !== "rejected") issue(issues, "status", "invalid_status", "status must be routing_ready or rejected");
  validateReviewGate(candidate.review_gate, issues);
  validateDryRun(candidate.dry_run, issues);
  if (!isRecord(candidate.proposal)) issue(issues, "proposal", "proposal_required", "routing manifests must carry proposal metadata");
  if (!isRecord(candidate.policy)) issue(issues, "policy", "policy_required", "routing manifests must carry policy metadata");
  if (!Array.isArray(candidate.reviewer_routes)) issue(issues, "reviewer_routes", "array_required", "reviewer_routes must be an array");
  if (!isRecord(candidate.quorum)) issue(issues, "quorum", "quorum_required", "routing manifests must carry quorum metadata");
  if (!isRecord(candidate.routing_record)) issue(issues, "routing_record", "routing_record_required", "routing manifests must carry a routing record");
  if (!Array.isArray(candidate.reasons)) issue(issues, "reasons", "array_required", "reasons must be an array");

  if (status === "routing_ready" && canValidateAccepted(candidate, issues)) validateAcceptedRouting(candidate, issues);
  if (status === "rejected" && canValidateRejected(candidate, issues)) validateRejectedRouting(candidate, issues);
  return { ok: issues.length === 0, issues };
}

function validateAcceptedRouting(result: NVersionAuditRoutingResult, issues: NVersionAuditRoutingIssue[]): void {
  if (result.decision !== "n_version_audit_routing_ready") issue(issues, "decision", "invalid_accepted_decision", "accepted routing manifests must use n_version_audit_routing_ready");
  const acceptedReasons = [...ACCEPTED_REASONS, ...(result.reasons.includes("conflicted_reviewers_excluded") ? ["conflicted_reviewers_excluded"] : [])];
  if (!arraysEqual(result.reasons, acceptedReasons)) issue(issues, "reasons", "accepted_reasons_mismatch", "accepted routing manifests must carry canonical ready reasons");
  if (result.issues !== undefined) issue(issues, "issues", "accepted_issues_forbidden", "accepted routing manifests must not carry validation issues");
  validateProposal(result.proposal, issues, "proposal");
  validatePolicy(result.policy, issues, "policy");
  validateRoutes(result.proposal, result.policy, result.reviewer_routes, issues);
  validateQuorum(result.policy, result.reviewer_routes, result.quorum, issues);
  validateRoutingRecord(result, issues);
  const expectedRoutingId = stableId("audit-routing", [acceptedRoutingFingerprint(result.proposal, result.policy, result.reviewer_routes)]);
  if (result.routing_id !== expectedRoutingId) issue(issues, "routing_id", "routing_id_mismatch", "routing_id must match the deterministic routing fingerprint");
  const expectedDigest = canonicalDigest(routingDigestPayload(result.proposal, result.reviewer_routes, result.quorum, result.review_gate));
  if (result.routing_digest !== expectedDigest) issue(issues, "routing_digest", "routing_digest_mismatch", "routing_digest must cover proposal, routes, quorum, and review gate");
}

function validateRejectedRouting(result: NVersionAuditRoutingResult, issues: NVersionAuditRoutingIssue[]): void {
  if (result.decision !== "blocked_by_reviewer_conflict" && result.decision !== "invalid_audit_routing_input") issue(issues, "decision", "invalid_rejected_decision", "rejected routing manifests must use a known rejected decision");
  if (result.reviewer_routes.length !== 0) issue(issues, "reviewer_routes", "rejected_routes_forbidden", "rejected routing manifests must not carry reviewer routes");
  if (result.routing_digest !== canonicalDigest(null)) issue(issues, "routing_digest", "rejected_digest_mismatch", "rejected routing manifests must use the rejected digest sentinel");
  if (result.routing_record.decision !== "rejected") issue(issues, "routing_record.decision", "invalid_rejected_routing_record_decision", "rejected routing records must remain rejected");
}

function canValidateAccepted(result: Partial<NVersionAuditRoutingResult>, issues: NVersionAuditRoutingIssue[]): result is NVersionAuditRoutingResult {
  return canValidateCommon(result, issues);
}

function canValidateRejected(result: Partial<NVersionAuditRoutingResult>, issues: NVersionAuditRoutingIssue[]): result is NVersionAuditRoutingResult {
  return canValidateCommon(result, issues);
}

function canValidateCommon(result: Partial<NVersionAuditRoutingResult>, issues: NVersionAuditRoutingIssue[]): result is NVersionAuditRoutingResult {
  let ok = true;
  const routeEntries = result.reviewer_routes;
  if (Array.isArray(routeEntries)) {
    for (const [index, entry] of routeEntries.entries()) {
      if (!isRecord(entry)) {
        issue(issues, `reviewer_routes[${index}]`, "object_required", "reviewer route entries must be objects");
        ok = false;
      }
    }
  } else {
    ok = false;
  }
  return ok &&
    isRecord(result.proposal) &&
    isRecord(result.policy) &&
    Array.isArray(result.reviewer_routes) &&
    isRecord(result.quorum) &&
    isRecord(result.routing_record) &&
    isRecord(result.review_gate) &&
    isRecord(result.dry_run) &&
    Array.isArray(result.reasons);
}

function validateInputShape(input: NVersionAuditRoutingInput): NVersionAuditRoutingIssue[] {
  const issues: NVersionAuditRoutingIssue[] = [];
  validateProposal(input.proposal, issues, "proposal");
  validatePolicy(input.policy, issues, "policy");
  validateReviewerCandidates(input.reviewers, issues);
  return issues;
}

function validateProposal(proposal: NVersionAuditProposalRef, issues: NVersionAuditRoutingIssue[], path: string): void {
  if (typeof proposal.proposal_id !== "string" || !MANIFEST_ID.test(proposal.proposal_id)) issue(issues, `${path}.proposal_id`, "invalid_proposal_id", "proposal_id must be a deterministic manifest id");
  if (typeof proposal.mutation_id !== "string" || !MUTATION_ID.test(proposal.mutation_id)) issue(issues, `${path}.mutation_id`, "invalid_mutation_id", "mutation_id must match mut-<8 hex>");
  if (proposal.mutation_class !== "prompt_patch" && proposal.mutation_class !== "tool_routing" && proposal.mutation_class !== "speciation") issue(issues, `${path}.mutation_class`, "unsupported_mutation_class", "mutation_class must be prompt_patch, tool_routing, or speciation");
  if (proposal.risk !== "high") issue(issues, `${path}.risk`, "high_risk_required", "N-version audit routing only accepts high-risk proposals");
  if (proposal.approval_class !== "C") issue(issues, `${path}.approval_class`, "class_c_required", "N-version audit routing only accepts Class C proposals");
  if (typeof proposal.source_digest !== "string" || !DIGEST.test(proposal.source_digest)) issue(issues, `${path}.source_digest`, "invalid_source_digest", "source_digest must be a stable digest string");
  if (!Array.isArray(proposal.target_paths) || proposal.target_paths.length === 0) {
    issue(issues, `${path}.target_paths`, "target_paths_required", "proposal must include at least one target path");
    return;
  }
  const seen = new Set<string>();
  for (const [index, targetPath] of proposal.target_paths.entries()) {
    if (typeof targetPath !== "string" || AGENT_DOCUMENT_PATH.exec(targetPath) === null) issue(issues, `${path}.target_paths[${index}]`, "forbidden_document_path", "proposal target paths must be canonical .forge/agents/<species>.forge documents");
    if (seen.has(targetPath)) issue(issues, `${path}.target_paths[${index}]`, "duplicate_target_path", `${targetPath} is duplicated`);
    seen.add(targetPath);
  }
}

function validatePolicy(policy: NVersionAuditRoutingPolicy, issues: NVersionAuditRoutingIssue[], path: string): void {
  if (!Number.isSafeInteger(policy.min_reviewers) || policy.min_reviewers < 2) issue(issues, `${path}.min_reviewers`, "invalid_min_reviewers", "min_reviewers must be an integer >= 2");
  else if (policy.min_reviewers > MAX_REVIEWERS) issue(issues, `${path}.min_reviewers`, "reviewer_budget_exceeded", `min_reviewers must be <= ${MAX_REVIEWERS}`);
  if (!Number.isSafeInteger(policy.required_quorum) || policy.required_quorum < 2) issue(issues, `${path}.required_quorum`, "invalid_required_quorum", "required_quorum must be an integer >= 2");
  else if (Number.isSafeInteger(policy.min_reviewers) && policy.required_quorum > policy.min_reviewers) issue(issues, `${path}.required_quorum`, "required_quorum_exceeds_min_reviewers", "required_quorum must be <= min_reviewers");
  validateFocusArray(policy.required_focuses, `${path}.required_focuses`, issues, true);
}

function validateReviewerCandidates(reviewers: readonly NVersionAuditReviewerCandidate[], issues: NVersionAuditRoutingIssue[]): void {
  if (!Array.isArray(reviewers)) {
    issue(issues, "reviewers", "reviewers_must_be_array", "reviewers must be an array");
    return;
  }
  if (reviewers.length === 0) issue(issues, "reviewers", "reviewer_pool_empty", "reviewer pool must contain candidates");
  if (reviewers.length > MAX_CANDIDATES) issue(issues, "reviewers", "reviewer_pool_too_large", `reviewer pool must contain <= ${MAX_CANDIDATES} candidates`);
  const seenReviewers = new Set<string>();
  for (const [index, reviewer] of reviewers.entries()) {
    const prefix = `reviewers[${index}]`;
    if (typeof reviewer.reviewer_id !== "string" || !REVIEWER_ID.test(reviewer.reviewer_id)) issue(issues, `${prefix}.reviewer_id`, "invalid_reviewer_id", "reviewer_id must be a safe lowercase id");
    else if (seenReviewers.has(reviewer.reviewer_id)) issue(issues, `${prefix}.reviewer_id`, "duplicate_reviewer_id", `${reviewer.reviewer_id} is duplicated`);
    seenReviewers.add(typeof reviewer.reviewer_id === "string" ? reviewer.reviewer_id : "");
    if (typeof reviewer.independence_key !== "string" || !REVIEWER_ID.test(reviewer.independence_key)) issue(issues, `${prefix}.independence_key`, "invalid_independence_key", "independence_key must be a safe lowercase id");
    validateFocusArray(reviewer.focuses, `${prefix}.focuses`, issues, true);
    if (!Number.isSafeInteger(reviewer.max_parallel_assignments) || reviewer.max_parallel_assignments < 1) issue(issues, `${prefix}.max_parallel_assignments`, "invalid_max_parallel_assignments", "max_parallel_assignments must be a positive integer");
    if (reviewer.conflict_paths !== undefined) validateSafePathArray(reviewer.conflict_paths, `${prefix}.conflict_paths`, issues);
  }
}

function validateRoutingCoverage(input: NVersionAuditRoutingInput, selection: ReviewerSelection): NVersionAuditRoutingIssue[] {
  const issues: NVersionAuditRoutingIssue[] = [];
  if (selection.conflicted_reviewers.length > 0 && selection.selected.length < input.policy.min_reviewers) {
    issue(issues, "reviewers", "reviewer_conflict_with_target", "one or more reviewers conflict with proposal target paths");
  }
  if (selection.selected.length < input.policy.min_reviewers) {
    issue(issues, "reviewers", "insufficient_independent_reviewers", "not enough independent eligible reviewers are available");
  }
  if (input.policy.required_quorum > selection.selected.length) issue(issues, "policy.required_quorum", "required_quorum_unavailable", "required quorum exceeds selected independent reviewers");
  const covered = new Set(selection.selected.flatMap((entry) => entry.focuses));
  for (const focus of input.policy.required_focuses) {
    if (!covered.has(focus)) issue(issues, "policy.required_focuses", "required_focus_uncovered", `${focus} focus is not covered by selected reviewers`);
  }
  return issues;
}

interface ReviewerSelection {
  readonly selected: readonly NVersionAuditReviewerCandidate[];
  readonly conflicted_reviewers: readonly NVersionAuditReviewerCandidate[];
}

function emptySelection(): ReviewerSelection {
  return { selected: [], conflicted_reviewers: [] };
}

function selectReviewers(proposal: NVersionAuditProposalRef, reviewers: readonly NVersionAuditReviewerCandidate[], policy: NVersionAuditRoutingPolicy): ReviewerSelection {
  const conflicted = reviewers.filter((reviewer) => hasTargetConflict(reviewer, proposal.target_paths));
  const eligible = reviewers
    .filter((reviewer) => !hasTargetConflict(reviewer, proposal.target_paths))
    .filter((reviewer) => reviewer.max_parallel_assignments > 0)
    .slice()
    .sort((left, right) => left.reviewer_id.localeCompare(right.reviewer_id));
  const selected: NVersionAuditReviewerCandidate[] = [];
  const usedKeys = new Set<string>();
  for (const reviewer of eligible) {
    if (usedKeys.has(reviewer.independence_key)) continue;
    selected.push(cloneReviewer(reviewer));
    usedKeys.add(reviewer.independence_key);
    const covered = new Set(selected.flatMap((entry) => entry.focuses));
    const hasFocusCoverage = policy.required_focuses.every((focus) => covered.has(focus));
    if (selected.length >= policy.min_reviewers && hasFocusCoverage) break;
  }
  return { selected, conflicted_reviewers: conflicted.map(cloneReviewer) };
}

function createRoutes(proposal: NVersionAuditProposalRef, reviewers: readonly NVersionAuditReviewerCandidate[]): readonly NVersionAuditRoute[] {
  return reviewers.map((reviewer, index) => {
    const focuses = uniqueFocuses(reviewer.focuses);
    const assignedTargetPaths = [...proposal.target_paths];
    return {
      route_id: stableId("audit-route", [proposal.proposal_id, proposal.mutation_id, reviewer.reviewer_id, reviewer.independence_key, focuses.join(","), assignedTargetPaths.join(",")]),
      lane: `n${index + 1}`,
      reviewer_id: reviewer.reviewer_id,
      independence_key: reviewer.independence_key,
      focuses,
      assigned_target_paths: assignedTargetPaths,
      requires_independent_result: true,
      result_schema_ref: "urn:forgeroot:n-version-audit-result:v1",
    };
  });
}

function validateRoutes(proposal: NVersionAuditProposalRef, policy: NVersionAuditRoutingPolicy, routes: readonly NVersionAuditRoute[], issues: NVersionAuditRoutingIssue[]): void {
  if (routes.length < policy.min_reviewers) issue(issues, "reviewer_routes", "insufficient_independent_reviewers", "accepted routing manifests must contain at least policy.min_reviewers routes");
  const reviewerIds = new Set<string>();
  const independenceKeys = new Set<string>();
  const covered = new Set<NVersionAuditFocus>();
  for (const [index, route] of routes.entries()) {
    const prefix = `reviewer_routes[${index}]`;
    if (typeof route.route_id !== "string" || !MANIFEST_ID.test(route.route_id)) issue(issues, `${prefix}.route_id`, "invalid_route_id", "route_id must be deterministic");
    const expectedRouteId = stableId("audit-route", [proposal.proposal_id, proposal.mutation_id, route.reviewer_id, route.independence_key, route.focuses.join(","), route.assigned_target_paths.join(",")]);
    if (route.route_id !== expectedRouteId) issue(issues, `${prefix}.route_id`, "route_id_mismatch", "route_id must match proposal and reviewer route contents");
    if (route.lane !== `n${index + 1}`) issue(issues, `${prefix}.lane`, "lane_mismatch", "lanes must be n1..nN in route order");
    if (typeof route.reviewer_id !== "string" || !REVIEWER_ID.test(route.reviewer_id)) issue(issues, `${prefix}.reviewer_id`, "invalid_reviewer_id", "reviewer_id must be safe");
    if (reviewerIds.has(route.reviewer_id)) issue(issues, `${prefix}.reviewer_id`, "duplicate_reviewer_id", `${route.reviewer_id} is duplicated in routes`);
    reviewerIds.add(route.reviewer_id);
    if (typeof route.independence_key !== "string" || !REVIEWER_ID.test(route.independence_key)) issue(issues, `${prefix}.independence_key`, "invalid_independence_key", "independence_key must be safe");
    if (independenceKeys.has(route.independence_key)) issue(issues, `${prefix}.independence_key`, "duplicate_independence_key", `${route.independence_key} is reused in routes`);
    independenceKeys.add(route.independence_key);
    validateFocusArray(route.focuses, `${prefix}.focuses`, issues, true);
    for (const focus of route.focuses) covered.add(focus);
    if (!arraysEqual(route.assigned_target_paths, proposal.target_paths)) issue(issues, `${prefix}.assigned_target_paths`, "assigned_target_paths_mismatch", "each reviewer route must receive all proposal target paths");
    if (route.requires_independent_result !== true) issue(issues, `${prefix}.requires_independent_result`, "independent_result_required", "each route must require an independent result");
    if (route.result_schema_ref !== "urn:forgeroot:n-version-audit-result:v1") issue(issues, `${prefix}.result_schema_ref`, "invalid_result_schema_ref", "route result schema ref must be canonical");
  }
  for (const focus of policy.required_focuses) {
    if (!covered.has(focus)) issue(issues, "policy.required_focuses", "required_focus_uncovered", `${focus} focus is not covered by reviewer routes`);
  }
}

function validateQuorum(policy: NVersionAuditRoutingPolicy, routes: readonly NVersionAuditRoute[], quorum: NVersionAuditQuorum, issues: NVersionAuditRoutingIssue[]): void {
  if (quorum.required_reviews !== routes.length) issue(issues, "quorum.required_reviews", "required_reviews_mismatch", "required_reviews must equal reviewer_routes length");
  if (quorum.required_quorum !== policy.required_quorum) issue(issues, "quorum.required_quorum", "required_quorum_mismatch", "quorum must preserve policy.required_quorum");
  if (quorum.minimum_distinct_independence_keys !== routes.length) issue(issues, "quorum.minimum_distinct_independence_keys", "minimum_distinct_independence_keys_mismatch", "minimum distinct independence keys must equal route count");
  if (!arraysEqual(quorum.required_focuses, policy.required_focuses)) issue(issues, "quorum.required_focuses", "required_focuses_mismatch", "quorum required focuses must match policy");
  if (quorum.blocking_findings_policy !== "any_blocking_finding_blocks_evolution_guard") issue(issues, "quorum.blocking_findings_policy", "invalid_blocking_findings_policy", "blocking findings must block EvolutionGuard handoff");
  if (quorum.evolution_guard_handoff !== "all_required_reviews_collected") issue(issues, "quorum.evolution_guard_handoff", "invalid_evolution_guard_handoff", "EvolutionGuard handoff must wait for all required reviews");
}

function validateRoutingRecord(result: NVersionAuditRoutingResult, issues: NVersionAuditRoutingIssue[]): void {
  if (result.routing_record.routing_id !== result.routing_id) issue(issues, "routing_record.routing_id", "routing_record_id_mismatch", "routing_record routing_id must match routing_id");
  if (result.routing_record.class !== "n_version_audit_routing") issue(issues, "routing_record.class", "invalid_routing_record_class", "routing record class must be n_version_audit_routing");
  if (result.routing_record.proposal_id !== result.proposal.proposal_id) issue(issues, "routing_record.proposal_id", "routing_record_proposal_mismatch", "routing record must reference proposal_id");
  if (result.routing_record.mutation_id !== result.proposal.mutation_id) issue(issues, "routing_record.mutation_id", "routing_record_mutation_mismatch", "routing record must reference mutation_id");
  if (!arraysEqual(result.routing_record.target_paths, result.proposal.target_paths)) issue(issues, "routing_record.target_paths", "routing_record_target_paths_mismatch", "routing record target paths must match proposal target paths");
  if (result.routing_record.decision !== "routed") issue(issues, "routing_record.decision", "invalid_accepted_routing_record_decision", "accepted routing records must be routed");
  if (result.routing_record.approval_class !== "C") issue(issues, "routing_record.approval_class", "class_c_required", "routing record must remain Class C");
}

function validateReviewGate(value: unknown, issues: NVersionAuditRoutingIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "review_gate", "review_gate_required", "routing manifests must carry a review gate");
    return;
  }
  if (value.risk !== "high") issue(issues, "review_gate.risk", "high_risk_required", "routing manifests must remain high risk");
  if (value.approval_class !== "C" || value.escalation_required !== true) issue(issues, "review_gate", "class_c_required", "routing manifests must remain Class C review-gated");
  if (value.human_review_required_before_execution !== true) issue(issues, "review_gate.human_review_required_before_execution", "human_review_before_execution_required", "routing manifests must require human review before execution");
  if (value.human_review_required_before_merge !== true) issue(issues, "review_gate.human_review_required_before_merge", "human_review_before_merge_required", "routing manifests must require human review before merge");
  if (!Array.isArray(value.reasons) || !arraysEqual(value.reasons, reviewGate().reasons)) issue(issues, "review_gate.reasons", "review_gate_reasons_mismatch", "review gate reasons must remain canonical");
}

function validateDryRun(value: unknown, issues: NVersionAuditRoutingIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "routing manifests must carry dry-run flags");
    return;
  }
  if (value.file_written !== false) issue(issues, "dry_run.file_written", "file_write_forbidden", "routing must not write files");
  if (value.github_api_called !== false) issue(issues, "dry_run.github_api_called", "github_api_forbidden", "routing must not call GitHub APIs");
  if (value.reviewers_notified !== false) issue(issues, "dry_run.reviewers_notified", "reviewer_notification_forbidden", "routing must not notify reviewers");
  if (value.audit_jobs_started !== false) issue(issues, "dry_run.audit_jobs_started", "audit_job_execution_forbidden", "routing must not start audit jobs");
  if (value.evolution_guard_decided !== false) issue(issues, "dry_run.evolution_guard_decided", "evolution_guard_decision_forbidden", "routing must not make EvolutionGuard decisions");
  if (value.auto_merged !== false) issue(issues, "dry_run.auto_merged", "auto_merge_forbidden", "routing must not auto-merge");
}

function normalizeInputEnvelope(input: unknown): {
  readonly input: NVersionAuditRoutingInput | null;
  readonly now?: string;
  readonly proposal: NVersionAuditProposalRef;
  readonly policy: NVersionAuditRoutingPolicy;
  readonly issues: readonly NVersionAuditRoutingIssue[];
} {
  const issues: NVersionAuditRoutingIssue[] = [];
  if (!isRecord(input)) {
    issue(issues, "input", "input_must_be_object", "audit routing input must be an object");
    return { input: null, proposal: emptyProposal(), policy: emptyPolicy(), issues };
  }
  let now: string | undefined;
  if (input.now !== undefined) {
    if (typeof input.now === "string") now = input.now;
    else issue(issues, "now", "now_must_be_string", "now must be a string when provided");
  }
  const proposal = normalizeProposal(input.proposal, issues);
  const reviewers = normalizeReviewers(input.reviewers, issues);
  const policy = normalizePolicy(input.policy, issues);
  return { input: { now, proposal, reviewers, policy }, now, proposal, policy, issues };
}

function normalizeProposal(value: unknown, issues: NVersionAuditRoutingIssue[]): NVersionAuditProposalRef {
  if (!isRecord(value)) {
    issue(issues, "proposal", "proposal_must_be_object", "proposal must be an object");
    return emptyProposal();
  }
  return {
    proposal_id: stringValue(value.proposal_id) ?? "",
    mutation_id: stringValue(value.mutation_id) ?? "",
    mutation_class: stringValue(value.mutation_class) as NVersionAuditMutationClass | "",
    risk: stringValue(value.risk) as "high" | "",
    approval_class: stringValue(value.approval_class) as "C" | "",
    target_paths: normalizeStringArray(value.target_paths, "proposal.target_paths", issues),
    source_digest: stringValue(value.source_digest) ?? "",
  };
}

function normalizeReviewers(value: unknown, issues: NVersionAuditRoutingIssue[]): readonly NVersionAuditReviewerCandidate[] {
  if (!Array.isArray(value)) {
    issue(issues, "reviewers", "reviewers_must_be_array", "reviewers must be an array");
    return [];
  }
  return value.map((entry, index) => {
    const prefix = `reviewers[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, prefix, "reviewer_must_be_object", "reviewer candidates must be objects");
      return { reviewer_id: "", independence_key: "", focuses: [], max_parallel_assignments: 0, conflict_paths: [] };
    }
    return {
      reviewer_id: stringValue(entry.reviewer_id) ?? "",
      independence_key: stringValue(entry.independence_key) ?? "",
      focuses: normalizeFocusArray(entry.focuses, `${prefix}.focuses`, issues),
      max_parallel_assignments: numberValue(entry.max_parallel_assignments),
      ...(entry.conflict_paths === undefined ? {} : { conflict_paths: normalizeStringArray(entry.conflict_paths, `${prefix}.conflict_paths`, issues) }),
    };
  });
}

function normalizePolicy(value: unknown, issues: NVersionAuditRoutingIssue[]): NVersionAuditRoutingPolicy {
  if (!isRecord(value)) {
    issue(issues, "policy", "policy_must_be_object", "policy must be an object");
    return emptyPolicy();
  }
  return {
    min_reviewers: numberValue(value.min_reviewers),
    required_quorum: numberValue(value.required_quorum),
    required_focuses: normalizeFocusArray(value.required_focuses, "policy.required_focuses", issues),
  };
}

function normalizeFocusArray(value: unknown, path: string, issues: NVersionAuditRoutingIssue[]): readonly NVersionAuditFocus[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "focuses_must_be_array", `${path} must be an array`);
    return [];
  }
  return value.map((entry) => typeof entry === "string" ? entry as NVersionAuditFocus : "" as NVersionAuditFocus);
}

function normalizeStringArray(value: unknown, path: string, issues: NVersionAuditRoutingIssue[]): readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "string_array_required", `${path} must be an array`);
    return [];
  }
  return value.map((entry) => typeof entry === "string" ? entry : "");
}

function validateFocusArray(value: readonly NVersionAuditFocus[], path: string, issues: NVersionAuditRoutingIssue[], requireNonEmpty: boolean): void {
  if (!Array.isArray(value)) {
    issue(issues, path, "focuses_must_be_array", `${path} must be an array`);
    return;
  }
  if (requireNonEmpty && value.length === 0) issue(issues, path, "focuses_required", `${path} must not be empty`);
  const seen = new Set<string>();
  for (const [index, focus] of value.entries()) {
    if (!AUDIT_FOCUSES.has(focus)) issue(issues, `${path}[${index}]`, "invalid_audit_focus", "audit focus is not supported");
    if (seen.has(focus)) issue(issues, `${path}[${index}]`, "duplicate_audit_focus", `${focus} is duplicated`);
    seen.add(focus);
  }
}

function validateSafePathArray(value: readonly string[], path: string, issues: NVersionAuditRoutingIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, path, "string_array_required", `${path} must be an array`);
    return;
  }
  for (const [index, entry] of value.entries()) {
    if (typeof entry !== "string" || !SAFE_REPO_PATH.test(entry)) issue(issues, `${path}[${index}]`, "unsafe_conflict_path", "conflict paths must be safe repository-relative paths");
  }
}

function hasTargetConflict(reviewer: NVersionAuditReviewerCandidate, targetPaths: readonly string[]): boolean {
  const conflicts = reviewer.conflict_paths ?? [];
  return conflicts.some((conflict) => targetPaths.some((target) => pathConflicts(normalizeRepoPath(conflict), normalizeRepoPath(target))));
}

function pathConflicts(conflict: string, target: string): boolean {
  return conflict === target || target.startsWith(`${conflict}/`) || conflict.startsWith(`${target}/`);
}

function normalizeRepoPath(value: string): string {
  return value.replace(/\/+$/g, "");
}

function invalidResult(createdAt: string, proposal: NVersionAuditProposalRef, policy: NVersionAuditRoutingPolicy, issues: readonly NVersionAuditRoutingIssue[]): NVersionAuditRoutingResult {
  const normalizedProposal = cloneProposal(proposal);
  const normalizedPolicy = clonePolicy(policy);
  const fingerprint = canonicalStringify({ proposal: normalizedProposal, policy: normalizedPolicy, issues });
  const routingId = stableId("audit-routing", [fingerprint]);
  return {
    manifest_version: N_VERSION_AUDIT_ROUTING_VERSION,
    schema_ref: N_VERSION_AUDIT_ROUTING_SCHEMA_REF,
    routing_id: routingId,
    created_at: createdAt,
    status: "rejected",
    decision: "invalid_audit_routing_input",
    reasons: uniqueStrings(issues.map((entry) => entry.code)),
    proposal: normalizedProposal,
    policy: normalizedPolicy,
    reviewer_routes: [],
    quorum: createQuorum(normalizedPolicy, 0),
    routing_digest: canonicalDigest(null),
    review_gate: reviewGate(),
    routing_record: routingRecord(routingId, normalizedProposal, "rejected"),
    dry_run: dryRunFlags(),
    issues,
  };
}

function createQuorum(policy: NVersionAuditRoutingPolicy, routeCount: number): NVersionAuditQuorum {
  return {
    required_reviews: routeCount,
    required_quorum: policy.required_quorum,
    minimum_distinct_independence_keys: routeCount,
    required_focuses: [...policy.required_focuses],
    blocking_findings_policy: "any_blocking_finding_blocks_evolution_guard",
    evolution_guard_handoff: "all_required_reviews_collected",
  };
}

function reviewGate(): NVersionAuditReviewGate {
  return {
    risk: "high",
    approval_class: "C",
    escalation_required: true,
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
    reasons: ["n_version_audit_requires_class_c_review", "evolution_guard_handoff_requires_independent_quorum"],
  };
}

function routingRecord(routingId: string, proposal: NVersionAuditProposalRef, decision: "routed" | "rejected"): NVersionAuditRoutingRecord {
  return {
    routing_id: routingId,
    class: "n_version_audit_routing",
    proposal_id: proposal.proposal_id,
    mutation_id: proposal.mutation_id,
    target_paths: [...proposal.target_paths],
    decision,
    approval_class: "C",
  };
}

function dryRunFlags(): NVersionAuditRoutingResult["dry_run"] {
  return {
    file_written: false,
    github_api_called: false,
    reviewers_notified: false,
    audit_jobs_started: false,
    evolution_guard_decided: false,
    auto_merged: false,
  };
}

function routingDigestPayload(proposal: NVersionAuditProposalRef, routes: readonly NVersionAuditRoute[], quorum: NVersionAuditQuorum, gate: NVersionAuditReviewGate): Readonly<Record<string, unknown>> {
  return { proposal, routes, quorum, review_gate: gate };
}

function acceptedRoutingFingerprint(proposal: NVersionAuditProposalRef, policy: NVersionAuditRoutingPolicy, routes: readonly NVersionAuditRoute[]): string {
  return canonicalStringify({
    proposal,
    policy,
    routes: routes.map((route) => ({
      reviewer_id: route.reviewer_id,
      independence_key: route.independence_key,
      focuses: route.focuses,
      assigned_target_paths: route.assigned_target_paths,
    })),
  });
}

function emptyProposal(): NVersionAuditProposalRef {
  return { proposal_id: "", mutation_id: "", mutation_class: "", risk: "", approval_class: "", target_paths: [], source_digest: "" };
}

function emptyPolicy(): NVersionAuditRoutingPolicy {
  return { min_reviewers: 0, required_quorum: 0, required_focuses: [] };
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

function clonePolicy(policy: NVersionAuditRoutingPolicy): NVersionAuditRoutingPolicy {
  return { min_reviewers: policy.min_reviewers, required_quorum: policy.required_quorum, required_focuses: [...policy.required_focuses] };
}

function cloneReviewer(reviewer: NVersionAuditReviewerCandidate): NVersionAuditReviewerCandidate {
  return {
    reviewer_id: reviewer.reviewer_id,
    independence_key: reviewer.independence_key,
    focuses: [...reviewer.focuses],
    max_parallel_assignments: reviewer.max_parallel_assignments,
    ...(reviewer.conflict_paths === undefined ? {} : { conflict_paths: [...reviewer.conflict_paths] }),
  };
}

function uniqueFocuses(values: readonly NVersionAuditFocus[]): readonly NVersionAuditFocus[] {
  return [...new Set(values)];
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

function issue(issues: NVersionAuditRoutingIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
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
function numberValue(value: unknown): number { return typeof value === "number" ? value : Number.NaN; }
function uniqueStrings(values: readonly string[]): string[] { return [...new Set(values)]; }
function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean { return left.length === right.length && left.every((entry, index) => entry === right[index]); }
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const routeNVersionAudit = createNVersionAuditRouting;
export const runNVersionAuditRouting = createNVersionAuditRouting;
export const runT049NVersionAuditRouting = createNVersionAuditRouting;
export const validateT049NVersionAuditRouting = validateNVersionAuditRouting;
