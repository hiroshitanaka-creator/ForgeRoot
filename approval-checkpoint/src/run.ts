import { validateGitHubPullRequestCreationRequest as validateT025GitHubPullRequestCreationRequest } from "../../github-pr-adapter/dist/index.js";

export const APPROVAL_CHECKPOINT_VERSION = 1;
export const TRANSPORT_AUTHORIZATION_SCHEMA_REF = "urn:forgeroot:transport-authorization:v1";
export const GITHUB_PR_CREATE_REQUEST_SCHEMA_REF = "urn:forgeroot:github-pr-create-request:v1";

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SAFE_REF = /^[A-Za-z0-9._\/-]+$/;
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const TRANSPORT_RUNTIME_MODES = new Set(["evolve", "federate"]);
const QUARANTINE_RUNTIME_MODES = new Set(["quarantine", "halted"]);
const SELF_APPROVER_MARKERS = ["github-app://forgeroot", "forgeroot-bot", "github-actions[bot]"];
const GOVERNANCE_MUTATION_PREFIXES = [
  ".github/workflows/",
  ".github/actions/",
  ".github/dependabot.yml",
  ".forge/policies/",
  ".forge/network/",
  ".forge/mind.forge",
  "apps/github-app/app-manifest.json",
  "secrets/",
];
const FORBIDDEN_PERMISSION_KEYS = new Set(["administration", "workflows", "secrets", "dependabot_secrets", "environments", "repository_hooks", "organization_hooks"]);

export const APPROVAL_CHECKPOINT_CONTRACT = {
  consumes: ["github_pull_request_creation_request"],
  produces: ["trusted_transport_authorization", "transport_authorization"],
  validates: [
    "github_pr_creation_request_manifest",
    "source_issue_traceability",
    "approval_class_policy",
    "runtime_mode_checkpoint",
    "rate_limit_checkpoint",
    "requested_mutation_surface",
    "human_review_before_merge_preservation",
    "no_secret_material_in_authorization",
  ],
  decisions: ["authorize", "hold", "quarantine", "invalid"],
  forbids: [
    "live_github_api_transport",
    "github_api_transport",
    "pull_request_creation_in_checkpoint",
    "merge_operation",
    "auto_merge",
    "auto_approval",
    "default_branch_write",
    "workflow_mutation",
    "policy_mutation",
    "permission_mutation",
    "memory_or_evaluation_updates",
    "network_or_federation_behavior",
    "self_approval",
    "token_persistence",
  ],
  githubAppOnly: true,
  oneTaskOnePr: true,
  checkpointOnly: true,
  transportRequiresAuthorizationManifest: true,
};

export function runApprovalCheckpoint(input = {}) {
  const auditTrail = [
    "approval_checkpoint:T026",
    "contract:trusted_transport_authorization_only",
    "contract:no_live_github_api_transport",
    "contract:no_merge_no_auto_approval",
    "contract:no_memory_evaluation_or_federation_update",
  ];

  const request = input.request ?? input.githubRequest ?? input.githubPullRequestCreationRequest ?? input.githubPRRequest;
  const requestValidation = validateGitHubPullRequestCreationRequestForApproval(request);
  if (!requestValidation.ok) {
    return invalidResult(["invalid_approval_checkpoint_input", ...requestValidation.issues.map(formatIssue)], [...auditTrail, "request:invalid"], requestValidation.issues);
  }

  const surface = requestedSurfaceFromRequest(request);
  const quarantineIssues = quarantineIssuesFor(request, surface, input);
  if (quarantineIssues.length > 0) {
    return {
      status: "quarantined",
      decision: "quarantine",
      reasons: uniqueStrings(["trusted_transport_quarantined", ...quarantineIssues.map(formatIssue)]),
      auditTrail: [...auditTrail, "quarantine:triggered", "transport_authorization:none"],
      requestedSurface: surface,
      issues: quarantineIssues,
    };
  }

  const holdIssues = holdIssuesFor(request, surface, input);
  if (holdIssues.length > 0) {
    return {
      status: "held",
      decision: "hold",
      reasons: uniqueStrings(["trusted_transport_held", ...holdIssues.map(formatIssue)]),
      auditTrail: [...auditTrail, "checkpoint:held", "transport_authorization:none"],
      requestedSurface: surface,
      issues: holdIssues,
    };
  }

  const createdAt = resolveTimestamp(input.now, stringValue(request.created_at));
  if (createdAt === null) {
    const tsIssue = issue("/approval/created_at", "rfc3339", "created_at must be an RFC3339 UTC timestamp");
    return invalidResult([formatIssue(tsIssue)], [...auditTrail, "timestamp:invalid"], [tsIssue]);
  }

  const authorization = buildTransportAuthorization(request, surface, input, createdAt);
  const authorizationValidation = validateTransportAuthorization(authorization);
  if (!authorizationValidation.ok) {
    return invalidResult(["generated_transport_authorization_failed_validation", ...authorizationValidation.issues.map(formatIssue)], [...auditTrail, "authorization:invalid"], authorizationValidation.issues);
  }

  return {
    status: "authorized",
    decision: "authorize",
    authorization,
    reasons: uniqueStrings([
      "trusted_transport_authorized",
      `authorization:${authorization.authorization_id}`,
      `request:${authorization.request_id}`,
      `repository:${authorization.repository.full_name}`,
      `head:${authorization.requested_surface.head}`,
      `base:${authorization.requested_surface.base}`,
    ]),
    auditTrail: [...auditTrail, "checkpoint:passed", "transport_authorization:ready", "github_mutation:not_performed_by_checkpoint"],
  };
}

export const evaluateApprovalCheckpoint = runApprovalCheckpoint;
export const checkApprovalCheckpoint = runApprovalCheckpoint;
export const authorizeGitHubPullRequestTransport = runApprovalCheckpoint;
export const authorizeGithubPullRequestTransport = runApprovalCheckpoint;
export const authorizePullRequestTransport = runApprovalCheckpoint;
export const checkpointApproval = runApprovalCheckpoint;
export const checkpointPullRequestTransport = runApprovalCheckpoint;

export function validateGitHubPullRequestCreationRequestForApproval(value) {
  const t025 = validateT025GitHubPullRequestCreationRequest(value);
  const issues = [...(Array.isArray(t025.issues) ? t025.issues : [])];
  const root = asRecord(value);
  if (root === null) return { ok: false, issues: uniqueIssues(issues.length > 0 ? issues : [issue("/request", "type", "GitHub PR creation request must be an object")]) };

  const auth = asRecord(root.authentication);
  const tokenRequest = asRecord(auth?.token_request);
  const permissions = asRecord(tokenRequest?.permissions);
  if (permissions !== null) {
    for (const [key, permission] of Object.entries(permissions)) {
      if (FORBIDDEN_PERMISSION_KEYS.has(key) && permission !== undefined && permission !== null && permission !== "none") {
        issues.push(issue(`/request/authentication/token_request/permissions/${key}`, "forbidden_permission", `${key} permission is outside approval checkpoint transport scope`));
      }
    }
  }

  const primary = asRecord(root.primary_request);
  if (primary !== null && endpointLooksLikeMerge(stringValue(primary.path) ?? "")) issues.push(issue("/request/primary_request/path", "forbidden_endpoint", "approval checkpoint cannot authorize merge endpoints"));
  for (const [index, item] of arrayValue(root.post_create_requests).entries()) {
    const request = asRecord(item);
    const path = stringValue(request?.path) ?? stringValue(request?.path_template) ?? "";
    if (endpointLooksLikeMerge(path)) issues.push(issue(`/request/post_create_requests/${index}/path`, "forbidden_endpoint", "approval checkpoint cannot authorize merge endpoints"));
  }

  const review = asRecord(root.review_gate);
  const approvalClass = stringValue(review?.approval_class);
  const risk = stringValue(review?.risk);
  if (approvalClass !== null && !APPROVAL_CLASSES.has(approvalClass)) issues.push(issue("/request/review_gate/approval_class", "enum", "approval_class must be A, B, C, or D"));
  if (risk !== null && !RISKS.has(risk)) issues.push(issue("/request/review_gate/risk", "enum", "risk must be low, medium, high, or critical"));

  return { ok: issues.length === 0, issues: uniqueIssues(issues) };
}

export const validateGitHubPRCreationRequestForApproval = validateGitHubPullRequestCreationRequestForApproval;
export const validateGithubPullRequestCreationRequestForApproval = validateGitHubPullRequestCreationRequestForApproval;
export const validateGithubPRCreationRequestForApproval = validateGitHubPullRequestCreationRequestForApproval;

export function validateTransportAuthorization(value) {
  const issues = [];
  const root = asRecord(value);
  if (root === null) return { ok: false, issues: [issue("/authorization", "type", "transport authorization must be an object")] };
  expectLiteral(root, "manifest_version", APPROVAL_CHECKPOINT_VERSION, issues, "/authorization");
  expectLiteral(root, "schema_ref", TRANSPORT_AUTHORIZATION_SCHEMA_REF, issues, "/authorization");
  expectString(root, "authorization_id", issues, "/authorization", "forge-approval://");
  expectRfc3339(root, "created_at", issues, "/authorization");
  expectLiteral(root, "status", "authorized_for_trusted_transport", issues, "/authorization");
  expectLiteral(root, "decision", "authorize_transport", issues, "/authorization");
  expectString(root, "request_id", issues, "/authorization", "forge-github-pr://");
  expectString(root, "composition_id", issues, "/authorization", "forge-pr://");
  expectString(root, "plan_id", issues, "/authorization", "forge-plan://");
  expectString(root, "audit_id", issues, "/authorization", "forge-audit://");
  validateRepository(root.repository, issues);
  validateReviewGate(root.review_gate, issues, "/authorization/review_gate");
  validateRequestedSurface(root.requested_surface, issues);
  validateAuthorizationGates(root.gates, issues);
  validateAuthorizationTransport(root.transport, issues);
  validateRuntimeGateSummary(root.runtime_gate, issues);
  validateRateLimitGateSummary(root.rate_limit_gate, issues);
  validateAuthorizationGuards(root.guards, issues);
  if (!Array.isArray(root.human_approvals)) issues.push(issue("/authorization/human_approvals", "array", "human_approvals must be an array"));
  validateNoSecretMaterial(root, "/authorization", issues);
  return { ok: issues.length === 0, issues: uniqueIssues(issues) };
}

export const validateApprovalCheckpointAuthorization = validateTransportAuthorization;
export const validateTrustedTransportAuthorization = validateTransportAuthorization;
export const validatePullRequestTransportAuthorization = validateTransportAuthorization;
export const validatePRTransportAuthorization = validateTransportAuthorization;

function quarantineIssuesFor(request, surface, input) {
  const issues = [];
  const runtime = normalizedRuntime(input.runtime, request.runtime_gate);
  if (runtime.mode !== null && QUARANTINE_RUNTIME_MODES.has(runtime.mode)) issues.push(issue("/runtime/mode", "runtime_quarantine", `runtime mode ${runtime.mode} requires quarantine before transport`));
  if (runtime.kill_switch_engaged === true) issues.push(issue("/runtime/kill_switch_engaged", "kill_switch", "kill switch is engaged"));

  const review = asRecord(request.review_gate) ?? {};
  const approvalClass = stringValue(review.approval_class);
  const risk = stringValue(review.risk);
  if (approvalClass === "D") issues.push(issue("/request/review_gate/approval_class", "human_only", "Class D transport must remain manual and outside this checkpoint"));
  if (risk === "critical") issues.push(issue("/request/review_gate/risk", "critical_risk", "critical-risk transport must be quarantined for manual governance"));

  const auth = asRecord(request.authentication);
  const tokenRequest = asRecord(auth?.token_request);
  const permissions = asRecord(tokenRequest?.permissions);
  if (permissions !== null) {
    for (const [key, permission] of Object.entries(permissions)) {
      if (FORBIDDEN_PERMISSION_KEYS.has(key) && permission !== undefined && permission !== null && permission !== "none") issues.push(issue(`/request/authentication/token_request/permissions/${key}`, "forbidden_permission", `${key} permission is outside T026 transport scope`));
    }
  }

  for (const [path, kind] of [...surface.changed_paths.map((path) => [path, "changed_path"]), ...surface.mutable_paths.map((path) => [path, "mutable_path"])]) {
    if (isGovernanceMutationPath(path)) issues.push(issue(`/surface/${kind}`, "governance_mutation", `governance mutation path '${path}' is outside T026 transport scope`));
  }
  if (endpointLooksLikeMerge(surface.primary_endpoint)) issues.push(issue("/surface/primary_endpoint", "forbidden_endpoint", "merge endpoints are outside approval checkpoint scope"));
  for (const [index, endpoint] of surface.post_create_endpoints.entries()) {
    if (endpointLooksLikeMerge(endpoint)) issues.push(issue(`/surface/post_create_endpoints/${index}`, "forbidden_endpoint", "merge endpoints are outside approval checkpoint scope"));
  }
  return uniqueIssues(issues);
}

function holdIssuesFor(request, surface, input) {
  const issues = [];
  const review = asRecord(request.review_gate) ?? {};
  const approvalClass = stringValue(review.approval_class) ?? "B";
  const risk = stringValue(review.risk) ?? "medium";

  if (request.dry_run === true) issues.push(issue("/request/dry_run", "dry_run_only", "dry-run requests are held before live trusted transport"));

  const runtime = normalizedRuntime(input.runtime, request.runtime_gate);
  if (!runtimeGateAllowsTransport(runtime)) issues.push(issue("/runtime", "runtime_gate", "runtime gate does not currently authorize open_pull_request transport"));

  const rate = normalizedRateLimit(input.rateLimit, request.rate_limit_gate);
  if (!rateLimitGateAllowsTransport(rate)) issues.push(issue("/rateLimit", "rate_gate", "rate-limit gate does not currently allow content-creating PR transport"));

  if (surface.source_issue === null) issues.push(issue("/surface/source_issue", "traceability", "source issue must be traceable before trusted transport"));

  const humanReviewRequired = booleanValue(review.human_review_required_before_merge) ?? true;
  if ((approvalClass !== "A" || risk !== "low") && humanReviewRequired !== true) issues.push(issue("/request/review_gate/human_review_required_before_merge", "review_gate", "non-low-risk transport must preserve human review before merge"));

  const approvalPolicy = approvalRequirementFor(approvalClass, risk);
  const approvals = normalizedHumanApprovals(input.humanApproval, input.humanApprovals ?? input.approvals, request, approvalClass, risk);
  if (approvals.valid.length < approvalPolicy.count) issues.push(issue("/human_approvals", "approval_required", approvalPolicy.reason));
  if (approvalPolicy.codeOwnerRequired && !approvals.valid.some((approval) => approval.code_owner === true)) issues.push(issue("/human_approvals", "code_owner_required", "Class C transport requires a code-owner approval record"));
  if (approvals.invalid.length > 0) issues.push(...approvals.invalid);

  return uniqueIssues(issues);
}

function buildTransportAuthorization(request, surface, input, createdAt) {
  const review = asRecord(request.review_gate) ?? {};
  const runtime = normalizedRuntime(input.runtime, request.runtime_gate);
  const rate = normalizedRateLimit(input.rateLimit, request.rate_limit_gate);
  const approvalClass = stringValue(review.approval_class) ?? "B";
  const risk = stringValue(review.risk) ?? "medium";
  const approvals = normalizedHumanApprovals(input.humanApproval, input.humanApprovals ?? input.approvals, request, approvalClass, risk).valid;
  const requiredCount = approvalRequirementFor(approvalClass, risk).count;
  const authorizationId = `forge-approval://${stableSlug(stringValue(request.request_id) ?? "request")}-${stableHash(`${request.request_id}:${createdAt}:${approvals.map((approval) => approval.approval_ref).join(",")}`).slice(0, 8)}`;
  return {
    manifest_version: APPROVAL_CHECKPOINT_VERSION,
    schema_ref: TRANSPORT_AUTHORIZATION_SCHEMA_REF,
    authorization_id: authorizationId,
    created_at: createdAt,
    status: "authorized_for_trusted_transport",
    decision: "authorize_transport",
    request_id: request.request_id,
    composition_id: request.composition_id,
    plan_id: request.plan_id,
    audit_id: request.audit_id,
    repository: request.repository,
    review_gate: {
      approval_class: approvalClass,
      risk,
      human_review_required_before_merge: booleanValue(review.human_review_required_before_merge) ?? true,
      merge_gate: stringValue(review.merge_gate) ?? "human_review_required",
      human_approval_count: approvals.length,
      required_human_approval_count: requiredCount,
    },
    requested_surface: surface,
    human_approvals: approvals,
    runtime_gate: {
      operation: "open_pull_request",
      mode: runtime.mode,
      allowed: runtime.allowed,
      mutating_lane_open: runtime.mutating_lane_open,
      kill_switch_engaged: runtime.kill_switch_engaged,
      cooldown_until: runtime.cooldown_until,
      live_transport_allowed: true,
    },
    rate_limit_gate: {
      write_lane_available: rate.write_lane_available,
      content_create_allowed: rate.content_create_allowed,
      retry_after_seconds: rate.retry_after_seconds,
      min_delay_ms: rate.min_delay_ms,
      jitter_ms: rate.jitter_ms,
      live_transport_allowed: true,
    },
    transport: {
      authorized_operation: "create_pull_request",
      primary_request: request.primary_request,
      post_create_requests: request.post_create_requests,
      idempotency_key: request.idempotency_key,
      token_source: "github_app_installation",
      token_material_included: false,
      execute_after: "rate_governor_queue",
    },
    gates: {
      trusted_transport: "authorized",
      github_api_transport: "deferred_to_transport_worker",
      pull_request_creation: "authorized_after_rate_governor",
      merge: "not_authorized",
      approval: "not_authorized",
      memory: "not_authorized",
      federation: "not_authorized",
    },
    guards: {
      github_app_installation_token_only: true,
      no_pat_or_user_token: true,
      no_token_persistence: true,
      no_secret_material_in_authorization: true,
      no_live_github_transport_in_checkpoint: true,
      no_pull_request_creation_in_checkpoint: true,
      no_merge_operation: true,
      no_auto_merge: true,
      no_auto_approval: true,
      no_default_branch_write: true,
      head_branch_not_default: true,
      human_review_before_merge_preserved: true,
      one_task_one_pr: true,
      no_workflow_or_policy_mutation: true,
      no_memory_or_evaluation_update: true,
      no_network_or_federation_behavior: true,
      no_self_approval: true,
    },
    provenance: {
      generated_by: "forgeroot-approval-checkpoint.alpha",
      approval_checkpoint_version: "0.0.0-t026",
      source_request_id: request.request_id,
      source_issue: surface.source_issue,
    },
  };
}

function requestedSurfaceFromRequest(request) {
  const primary = asRecord(request.primary_request) ?? {};
  const body = asRecord(primary.body) ?? {};
  const prBody = stringValue(body.body) ?? "";
  return {
    operation: "open_pull_request",
    primary_endpoint: stringValue(primary.path) ?? "",
    post_create_endpoints: arrayValue(request.post_create_requests).map((item) => {
      const record = asRecord(item);
      return stringValue(record?.path) ?? stringValue(record?.path_template) ?? "";
    }).filter((value) => value.length > 0),
    title: stringValue(body.title) ?? "",
    head: stringValue(body.head) ?? "",
    base: stringValue(body.base) ?? "",
    draft: booleanValue(body.draft) ?? true,
    maintainer_can_modify: body.maintainer_can_modify === true,
    source_issue: stringValue(asRecord(request.provenance)?.source_issue) ?? parseBulletValue(prBody, "Source issue"),
    changed_paths: uniqueStrings(parseMarkdownListSection(prBody, "Changed paths")),
    mutable_paths: uniqueStrings(parseInlineListValue(prBody, "Mutable paths")),
  };
}

function normalizedRuntime(inputRuntime, requestRuntime) {
  const source = asRecord(inputRuntime) ?? asRecord(requestRuntime) ?? {};
  const mode = stringValue(source.mode);
  return {
    mode,
    allowed: booleanValue(source.allowed),
    mutating_lane_open: booleanValue(source.mutating_lane_open ?? source.mutatingLaneOpen),
    kill_switch_engaged: booleanValue(source.kill_switch_engaged ?? source.killSwitchEngaged),
    cooldown_until: stringValue(source.cooldown_until ?? source.cooldownUntil),
    live_transport_allowed: booleanValue(source.live_transport_allowed ?? source.liveTransportAllowed),
  };
}

function runtimeGateAllowsTransport(runtime) {
  return runtime.live_transport_allowed === true && runtime.allowed === true && runtime.mutating_lane_open === true && runtime.kill_switch_engaged !== true && runtime.mode !== null && TRANSPORT_RUNTIME_MODES.has(runtime.mode) && (runtime.cooldown_until === null || runtime.cooldown_until.length === 0);
}

function normalizedRateLimit(inputRate, requestRate) {
  const source = asRecord(inputRate) ?? asRecord(requestRate) ?? {};
  return {
    write_lane_available: booleanValue(source.write_lane_available ?? source.writeLaneAvailable),
    content_create_allowed: booleanValue(source.content_create_allowed ?? source.contentCreateAllowed),
    retry_after_seconds: numberValue(source.retry_after_seconds ?? source.retryAfterSeconds),
    min_delay_ms: numberValue(source.min_delay_ms ?? source.minDelayMs) ?? 1200,
    jitter_ms: numberValue(source.jitter_ms ?? source.jitterMs) ?? 800,
    live_transport_allowed: booleanValue(source.live_transport_allowed ?? source.liveTransportAllowed),
  };
}

function rateLimitGateAllowsTransport(rate) {
  return rate.live_transport_allowed === true && rate.write_lane_available === true && rate.content_create_allowed === true && (rate.retry_after_seconds === null || rate.retry_after_seconds === 0);
}

function approvalRequirementFor(approvalClass, risk) {
  if (approvalClass === "A" && risk === "low") return { count: 0, codeOwnerRequired: false, reason: "Class A low-risk transport can be authorized by runtime and rate gates" };
  if (approvalClass === "C") return { count: 2, codeOwnerRequired: true, reason: "Class C transport requires two human approvals including a code owner" };
  return { count: 1, codeOwnerRequired: false, reason: `${approvalClass || "B"}/${risk || "medium"} transport requires a human approval record` };
}

function normalizedHumanApprovals(single, list, request, approvalClass, risk) {
  const raw = [];
  if (single !== undefined && single !== null) raw.push(single);
  if (Array.isArray(list)) raw.push(...list);
  const valid = [];
  const invalid = [];
  for (const [index, item] of raw.entries()) {
    const record = asRecord(item);
    if (record === null) { invalid.push(issue(`/human_approvals/${index}`, "type", "human approval must be an object")); continue; }
    const approver = stringValue(record.approver) ?? stringValue(record.actor) ?? stringValue(record.user);
    const approvalRef = stringValue(record.approval_ref) ?? stringValue(record.ref) ?? stringValue(record.id) ?? `human-approval-${index + 1}`;
    const approved = record.approved === true || record.status === "approved" || record.status === "accepted" || record.decision === "approve" || record.decision === "approved";
    if (!approved) { invalid.push(issue(`/human_approvals/${index}/approved`, "approval_required", "approval record must be approved")); continue; }
    if (approver === null) { invalid.push(issue(`/human_approvals/${index}/approver`, "required", "approval record requires an approver")); continue; }
    if (isSelfApprover(approver)) { invalid.push(issue(`/human_approvals/${index}/approver`, "self_approval", "ForgeRoot runtime cannot self-approve transport")); continue; }
    const approvedAt = stringValue(record.approved_at ?? record.ts ?? record.timestamp) ?? stringValue(request.created_at) ?? "1970-01-01T00:00:00Z";
    if (!RFC3339_UTC.test(approvedAt)) { invalid.push(issue(`/human_approvals/${index}/approved_at`, "rfc3339", "approved_at must be RFC3339 UTC")); continue; }
    valid.push({
      approval_ref: approvalRef,
      approver,
      approved_at: approvedAt,
      approval_class: stringValue(record.approval_class) ?? approvalClass,
      risk: stringValue(record.risk) ?? risk,
      code_owner: record.code_owner === true || record.codeOwner === true,
      source: stringValue(record.source) ?? "human_review",
    });
  }
  return { valid, invalid };
}

function validateRepository(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/repository", "required", "repository is required")); return; }
  const owner = expectString(root, "owner", issues, "/authorization/repository");
  const repo = expectString(root, "repo", issues, "/authorization/repository");
  const fullName = expectString(root, "full_name", issues, "/authorization/repository");
  expectPositiveInteger(root, "installation_id", issues, "/authorization/repository");
  if (owner !== null && repo !== null && fullName !== null && `${owner}/${repo}` !== fullName) issues.push(issue("/authorization/repository/full_name", "mismatch", "full_name must equal owner/repo"));
}

function validateReviewGate(value, issues, path) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue(path, "required", "review gate is required")); return; }
  expectOneOf(root, "approval_class", APPROVAL_CLASSES, issues, path);
  expectOneOf(root, "risk", RISKS, issues, path);
  expectBoolean(root, "human_review_required_before_merge", issues, path);
  expectString(root, "merge_gate", issues, path);
  expectNonNegativeInteger(root, "human_approval_count", issues, path);
  expectNonNegativeInteger(root, "required_human_approval_count", issues, path);
}

function validateRequestedSurface(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/requested_surface", "required", "requested surface is required")); return; }
  expectLiteral(root, "operation", "open_pull_request", issues, "/authorization/requested_surface");
  const primary = expectString(root, "primary_endpoint", issues, "/authorization/requested_surface");
  if (primary !== null && endpointLooksLikeMerge(primary)) issues.push(issue("/authorization/requested_surface/primary_endpoint", "forbidden_endpoint", "merge endpoints cannot be authorized"));
  const head = expectString(root, "head", issues, "/authorization/requested_surface");
  const base = expectString(root, "base", issues, "/authorization/requested_surface");
  if (head !== null && !isSafeRef(head)) issues.push(issue("/authorization/requested_surface/head", "safe_ref", "head must be a safe ref"));
  if (base !== null && !isSafeRef(base)) issues.push(issue("/authorization/requested_surface/base", "safe_ref", "base must be a safe ref"));
  if (head !== null && base !== null && isDefaultBranchTarget(head, base)) issues.push(issue("/authorization/requested_surface/head", "default_branch_write", "head branch must not equal base/default branch"));
  expectBoolean(root, "draft", issues, "/authorization/requested_surface");
  expectBoolean(root, "maintainer_can_modify", issues, "/authorization/requested_surface");
  validateStringArray(root.post_create_endpoints, "/authorization/requested_surface/post_create_endpoints", issues, true);
  validateStringArray(root.changed_paths, "/authorization/requested_surface/changed_paths", issues, true);
  validateStringArray(root.mutable_paths, "/authorization/requested_surface/mutable_paths", issues, true);
  for (const [index, endpoint] of stringArray(root.post_create_endpoints).entries()) if (endpointLooksLikeMerge(endpoint)) issues.push(issue(`/authorization/requested_surface/post_create_endpoints/${index}`, "forbidden_endpoint", "merge endpoints cannot be authorized"));
}

function validateAuthorizationTransport(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/transport", "required", "transport section is required")); return; }
  expectLiteral(root, "authorized_operation", "create_pull_request", issues, "/authorization/transport");
  expectString(root, "idempotency_key", issues, "/authorization/transport");
  expectLiteral(root, "token_source", "github_app_installation", issues, "/authorization/transport");
  expectLiteral(root, "token_material_included", false, issues, "/authorization/transport");
  expectLiteral(root, "execute_after", "rate_governor_queue", issues, "/authorization/transport");
}

function validateRuntimeGateSummary(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/runtime_gate", "required", "runtime gate summary is required")); return; }
  expectLiteral(root, "operation", "open_pull_request", issues, "/authorization/runtime_gate");
  expectOneOf(root, "mode", TRANSPORT_RUNTIME_MODES, issues, "/authorization/runtime_gate");
  expectLiteral(root, "allowed", true, issues, "/authorization/runtime_gate");
  expectLiteral(root, "mutating_lane_open", true, issues, "/authorization/runtime_gate");
  expectLiteral(root, "kill_switch_engaged", false, issues, "/authorization/runtime_gate");
  expectLiteral(root, "live_transport_allowed", true, issues, "/authorization/runtime_gate");
}

function validateRateLimitGateSummary(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/rate_limit_gate", "required", "rate-limit gate summary is required")); return; }
  expectLiteral(root, "write_lane_available", true, issues, "/authorization/rate_limit_gate");
  expectLiteral(root, "content_create_allowed", true, issues, "/authorization/rate_limit_gate");
  if (!(root.retry_after_seconds === null || root.retry_after_seconds === 0)) issues.push(issue("/authorization/rate_limit_gate/retry_after_seconds", "literal", "retry_after_seconds must be null or 0"));
  expectNonNegativeInteger(root, "min_delay_ms", issues, "/authorization/rate_limit_gate");
  expectNonNegativeInteger(root, "jitter_ms", issues, "/authorization/rate_limit_gate");
  expectLiteral(root, "live_transport_allowed", true, issues, "/authorization/rate_limit_gate");
}

function validateAuthorizationGates(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/gates", "required", "gates are required")); return; }
  expectLiteral(root, "trusted_transport", "authorized", issues, "/authorization/gates");
  expectLiteral(root, "github_api_transport", "deferred_to_transport_worker", issues, "/authorization/gates");
  expectLiteral(root, "pull_request_creation", "authorized_after_rate_governor", issues, "/authorization/gates");
  expectLiteral(root, "merge", "not_authorized", issues, "/authorization/gates");
  expectLiteral(root, "approval", "not_authorized", issues, "/authorization/gates");
  expectLiteral(root, "memory", "not_authorized", issues, "/authorization/gates");
  expectLiteral(root, "federation", "not_authorized", issues, "/authorization/gates");
}

function validateAuthorizationGuards(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/authorization/guards", "required", "guards are required")); return; }
  for (const key of [
    "github_app_installation_token_only",
    "no_pat_or_user_token",
    "no_token_persistence",
    "no_secret_material_in_authorization",
    "no_live_github_transport_in_checkpoint",
    "no_pull_request_creation_in_checkpoint",
    "no_merge_operation",
    "no_auto_merge",
    "no_auto_approval",
    "no_default_branch_write",
    "head_branch_not_default",
    "human_review_before_merge_preserved",
    "one_task_one_pr",
    "no_workflow_or_policy_mutation",
    "no_memory_or_evaluation_update",
    "no_network_or_federation_behavior",
    "no_self_approval",
  ]) if (root[key] !== true) issues.push(issue(`/authorization/guards/${key}`, "literal", `${key} must be true`));
}

function parseMarkdownListSection(body, heading) {
  const lines = body.split(/\r?\n/);
  const result = [];
  let active = false;
  for (const line of lines) {
    if (/^#{1,6}\s+/.test(line)) {
      active = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, "i").test(line.trim());
      continue;
    }
    if (!active) continue;
    const match = line.match(/^\s*-\s+(.+)\s*$/);
    if (match) result.push(cleanMarkdownValue(match[1]));
  }
  return result.filter((value) => value.length > 0);
}

function parseInlineListValue(body, label) {
  const line = body.split(/\r?\n/).find((candidate) => candidate.toLowerCase().includes(label.toLowerCase()));
  if (line === undefined) return [];
  let value = line.slice(line.toLowerCase().indexOf(label.toLowerCase()) + label.length).trim();
  value = value.replace(/^:\s*/, "");
  if (value.length === 0 || value === "none" || value === "not declared") return [];
  return value.split(",").map(cleanMarkdownValue).filter((item) => item.length > 0 && item !== "none" && item !== "not declared");
}

function parseBulletValue(body, label) {
  const line = body.split(/\r?\n/).find((candidate) => candidate.toLowerCase().includes(label.toLowerCase()));
  if (line === undefined) return null;
  const marker = `${label}:`;
  const index = line.toLowerCase().indexOf(marker.toLowerCase());
  if (index < 0) return null;
  const value = cleanMarkdownValue(line.slice(index + marker.length));
  return value.length > 0 && value !== "not declared" ? value : null;
}

function cleanMarkdownValue(value) {
  return String(value).trim().replace(/^`+|`+$/g, "").replace(/^\[|\]$/g, "").trim();
}

function validateNoSecretMaterial(value, path, issues) {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issues.push(issue(path, "secret_leak", "authorization must not contain token or private-key material"));
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => validateNoSecretMaterial(item, `${path}/${index}`, issues)); return; }
  const root = asRecord(value);
  if (root !== null) for (const [key, child] of Object.entries(root)) validateNoSecretMaterial(child, `${path}/${key}`, issues);
}

function validateStringArray(value, path, issues, allowEmpty) {
  if (!Array.isArray(value)) { issues.push(issue(path, "array", "value must be an array of strings")); return; }
  if (!allowEmpty && value.length === 0) issues.push(issue(path, "non_empty", "array must not be empty"));
  for (const [index, item] of value.entries()) if (typeof item !== "string" || item.length === 0) issues.push(issue(`${path}/${index}`, "string", "array item must be a non-empty string"));
}

function endpointLooksLikeMerge(path) { return typeof path === "string" && /\/pulls\/[^/{}]+\/merge(?:$|[/?#])|\/merge(?:$|[/?#])/.test(path); }
function isGovernanceMutationPath(path) { return GOVERNANCE_MUTATION_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix)); }
function isSelfApprover(approver) { const lower = approver.toLowerCase(); return SELF_APPROVER_MARKERS.some((marker) => lower.includes(marker.toLowerCase())); }
function isDefaultBranchTarget(branch, defaultBranch) { const b = branch.toLowerCase().replace(/^refs\/heads\//, ""); const d = defaultBranch.toLowerCase().replace(/^refs\/heads\//, ""); return b === d || b === "main" || b === "master" || b === "trunk"; }
function isSafeRef(value) { return SAFE_REF.test(value) && !value.includes("..") && !value.endsWith(".lock") && !value.startsWith("/") && !value.endsWith("/"); }
function expectLiteral(record, key, expected, issues, path) { if (record[key] !== expected) issues.push(issue(`${path}/${key}`, "literal", `${key} must be ${JSON.stringify(expected)}`)); }
function expectString(record, key, issues, path, prefix) { const value = record[key]; if (typeof value !== "string" || value.trim().length === 0) { issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`)); return null; } if (prefix !== undefined && !value.startsWith(prefix)) issues.push(issue(`${path}/${key}`, "literal", `${key} must start with '${prefix}'`)); return value; }
function expectBoolean(record, key, issues, path) { const value = record[key]; if (typeof value !== "boolean") { issues.push(issue(`${path}/${key}`, "type", `${key} must be boolean`)); return null; } return value; }
function expectOneOf(record, key, allowed, issues, path) { const value = record[key]; if (typeof value !== "string" || !allowed.has(value)) { issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`)); return null; } return value; }
function expectRfc3339(record, key, issues, path) { const value = expectString(record, key, issues, path); if (value !== null && !RFC3339_UTC.test(value)) issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be an RFC3339 UTC timestamp`)); }
function expectPositiveInteger(record, key, issues, path) { const value = record[key]; if (!Number.isSafeInteger(value) || value <= 0) { issues.push(issue(`${path}/${key}`, "positive_integer", `${key} must be a positive integer`)); return null; } return value; }
function expectNonNegativeInteger(record, key, issues, path) { const value = record[key]; if (!Number.isSafeInteger(value) || value < 0) { issues.push(issue(`${path}/${key}`, "integer", `${key} must be a non-negative integer`)); return null; } return value; }
function invalidResult(reasons, auditTrail, issues) { return { status: "invalid", decision: "invalid", reasons: uniqueStrings(reasons), auditTrail: [...auditTrail, "transport_authorization:none"], ...(issues === undefined ? {} : { issues }) }; }
function issue(path, code, message) { return { path, code, message }; }
function formatIssue(item) { return `${item.path}:${item.code}:${item.message}`; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function arrayValue(value) { return Array.isArray(value) ? value : []; }
function stringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : []; }
function stringValue(value) { return typeof value === "string" && value.length > 0 ? value : null; }
function booleanValue(value) { return typeof value === "boolean" ? value : null; }
function numberValue(value) { return Number.isSafeInteger(value) ? value : null; }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function uniqueIssues(issues) { const seen = new Set(); const result = []; for (const item of issues) { const key = `${item.path}|${item.code}|${item.message}`; if (!seen.has(key)) { seen.add(key); result.push(item); } } return result; }
function resolveTimestamp(candidate, fallback) { if (candidate !== undefined) return RFC3339_UTC.test(candidate) ? candidate : null; if (fallback !== null && RFC3339_UTC.test(fallback)) return fallback; return null; }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function stableSlug(value) { const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96); return slug || "request"; }
function stableHash(value) { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, "0"); }
