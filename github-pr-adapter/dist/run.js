export const GITHUB_PR_ADAPTER_VERSION = 1;
export const GITHUB_PR_CREATE_REQUEST_SCHEMA_REF = "urn:forgeroot:github-pr-create-request:v1";

const PR_COMPOSITION_SCHEMA_REF = "urn:forgeroot:pr-composition:v1";
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_ACCEPT = "application/vnd.github+json";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const REPO_FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_REF = /^[A-Za-z0-9._\/-]+$/;
const REVIEWER = /^[A-Za-z0-9_.-]+$/;
const MAX_TITLE_LENGTH = 256;
const MAX_BODY_LENGTH = 65_536;
const MAX_LABEL_LENGTH = 64;
const MAX_LABELS = 100;
const MAX_REVIEWERS = 100;
const MAX_TEAM_REVIEWERS = 100;
const ALLOWED_LIVE_MODES = new Set(["evolve", "federate"]);

export const GITHUB_PR_ADAPTER_CONTRACT = {
  consumes: ["pull_request_composition"],
  produces: ["github_pull_request_creation_request"],
  validates: [
    "ready_pr_composition_manifest",
    "repository_and_installation_match",
    "head_branch_safety",
    "github_app_installation_permissions",
    "runtime_mode_precondition_for_live_transport",
    "rate_limit_precondition_for_live_transport",
    "label_and_reviewer_metadata_safety",
    "no_secret_material_in_prepared_request",
  ],
  forbids: [
    "merge_operation",
    "auto_approval",
    "approval_checkpoint_mutation",
    "workflow_mutation",
    "policy_mutation",
    "memory_or_evaluation_updates",
    "network_or_federation_behavior",
    "pat_or_user_token_use",
    "token_persistence",
    "default_branch_write",
    "direct_git_operation",
  ],
  githubAppOnly: true,
  dryRunSupported: true,
  oneTaskOnePr: true,
  adapterOnly: true,
};

export function prepareGitHubPullRequest(input = {}) {
  const auditTrail = [
    "github_pr_adapter:T025",
    "contract:github_app_installation_token_only",
    "contract:pull_request_create_request_only",
    "contract:no_merge_no_auto_approval",
    "contract:no_memory_evaluation_or_federation_update",
  ];

  const structuralIssues = [
    ...validateCompositionForAdapter(input.composition).issues,
    ...validateInstallationContext(input.installation, input.composition).issues,
    ...validateMetadataSafety(input.composition).issues,
  ];
  if (structuralIssues.length > 0) {
    return invalidResult(["invalid_github_pr_adapter_input", ...structuralIssues.map(formatIssue)], [...auditTrail, "input:invalid"], structuralIssues);
  }

  const composition = input.composition;
  const installation = input.installation;
  const resolved = resolveRepository(installation, composition);
  if (resolved === null) {
    const repoIssue = issue("/installation/repositoryFullName", "repository", "repository full name must be owner/repo");
    return invalidResult(["invalid_repository", formatIssue(repoIssue)], [...auditTrail, "repository:invalid"], [repoIssue]);
  }

  const dryRun = input.dryRun !== false;
  const liveGateIssues = dryRun ? [] : validateLiveTransportGates(input.runtime, input.rateLimit, input.installation).issues;
  if (liveGateIssues.length > 0) {
    return {
      status: "blocked",
      reasons: uniqueStrings(["github_pr_live_transport_blocked", ...liveGateIssues.map(formatIssue)]),
      auditTrail: [...auditTrail, "live_gate:blocked", "github_request:none"],
      issues: liveGateIssues,
    };
  }

  const createdAt = resolveTimestamp(input.now, stringValue(composition.created_at));
  if (createdAt === null) {
    const tsIssue = issue("/adapter/created_at", "rfc3339", "created_at must be an RFC3339 UTC timestamp");
    return invalidResult([formatIssue(tsIssue)], [...auditTrail, "timestamp:invalid"], [tsIssue]);
  }

  const request = buildGitHubPullRequestCreationRequest(composition, installation, resolved, input, dryRun, createdAt);
  const requestValidation = validateGitHubPullRequestCreationRequest(request);
  if (!requestValidation.ok) {
    return invalidResult(["generated_github_pr_request_failed_validation", ...requestValidation.issues.map(formatIssue)], [...auditTrail, "github_request:invalid"], requestValidation.issues);
  }

  return {
    status: "ready",
    request,
    reasons: uniqueStrings([
      "github_pull_request_creation_request_ready",
      `request:${request.request_id}`,
      `repository:${request.repository.full_name}`,
      `head:${request.primary_request.body.head}`,
      `base:${request.primary_request.body.base}`,
      dryRun ? "dry_run:true" : "dry_run:false",
    ]),
    auditTrail: [...auditTrail, dryRun ? "live_gate:dry_run_bypass" : "live_gate:passed", "github_request:ready_for_transport", "github_mutation:not_performed_by_prepare"],
  };
}

export const prepareGithubPullRequest = prepareGitHubPullRequest;
export const prepareGitHubPR = prepareGitHubPullRequest;
export const prepareGithubPR = prepareGitHubPullRequest;

export function validateGitHubPullRequestCreationRequest(value) {
  const issues = [];
  const root = asRecord(value);
  if (root === null) return { ok: false, issues: [issue("/request", "type", "GitHub PR creation request must be an object")] };
  expectLiteral(root, "manifest_version", GITHUB_PR_ADAPTER_VERSION, issues, "/request");
  expectLiteral(root, "schema_ref", GITHUB_PR_CREATE_REQUEST_SCHEMA_REF, issues, "/request");
  expectString(root, "request_id", issues, "/request", "forge-github-pr://");
  expectRfc3339(root, "created_at", issues, "/request");
  expectLiteral(root, "status", "ready_for_github_transport", issues, "/request");
  expectBoolean(root, "dry_run", issues, "/request");
  expectString(root, "idempotency_key", issues, "/request");
  expectString(root, "composition_id", issues, "/request", "forge-pr://");
  expectString(root, "plan_id", issues, "/request", "forge-plan://");
  expectString(root, "audit_id", issues, "/request", "forge-audit://");
  const repository = validateRepository(root.repository, issues);
  validateAuthentication(root.authentication, issues);
  validatePrimaryRequest(root.primary_request, repository, issues);
  validatePostCreateRequests(root.post_create_requests, repository, issues);
  validateRuntimeGate(root.runtime_gate, booleanValue(root.dry_run), issues);
  validateRateLimitGate(root.rate_limit_gate, booleanValue(root.dry_run), issues);
  validateReviewGate(root.review_gate, issues);
  validateRequestGuards(root.guards, issues);
  validateNoSecretMaterial(root, "/request", issues);
  return { ok: issues.length === 0, issues };
}

export const validateGithubPullRequestCreationRequest = validateGitHubPullRequestCreationRequest;
export const validateGitHubPRCreationRequest = validateGitHubPullRequestCreationRequest;
export const validateGithubPRCreationRequest = validateGitHubPullRequestCreationRequest;

function validateCompositionForAdapter(value) {
  const issues = [];
  const root = asRecord(value);
  if (root === null) return { ok: false, issues: [issue("/composition", "type", "PR composition must be an object")] };
  expectLiteral(root, "manifest_version", 1, issues, "/composition");
  expectLiteral(root, "schema_ref", PR_COMPOSITION_SCHEMA_REF, issues, "/composition");
  expectString(root, "composition_id", issues, "/composition", "forge-pr://");
  expectRfc3339(root, "created_at", issues, "/composition");
  expectLiteral(root, "status", "ready_for_github_adapter", issues, "/composition");
  expectString(root, "plan_id", issues, "/composition", "forge-plan://");
  expectString(root, "audit_id", issues, "/composition", "forge-audit://");
  const pullRequest = asRecord(root.pull_request);
  if (pullRequest === null) issues.push(issue("/composition/pull_request", "required", "pull_request is required"));
  else validateCompositionPullRequest(pullRequest, issues);
  const gates = asRecord(root.gates);
  if (gates === null) issues.push(issue("/composition/gates", "required", "gates are required"));
  else {
    expectLiteral(gates, "pr_creation", "requires_github_adapter", issues, "/composition/gates");
    expectLiteral(gates, "audit", "passed", issues, "/composition/gates");
  }
  const guards = asRecord(root.guards);
  if (guards === null) issues.push(issue("/composition/guards", "required", "guards are required"));
  else for (const key of ["no_pull_request_creation_in_composer", "no_merge_operation", "no_auto_approval", "no_default_branch_write", "head_branch_not_default", "one_task_one_pr", "audit_passed_required", "approval_gate_preserved", "no_memory_or_evaluation_update", "no_network_or_federation_behavior"]) {
    if (guards[key] !== true) issues.push(issue(`/composition/guards/${key}`, "literal", `${key} must be true`));
  }
  const review = asRecord(root.review);
  if (review === null) issues.push(issue("/composition/review", "required", "review is required"));
  else {
    expectString(review, "approval_class", issues, "/composition/review");
    expectString(review, "risk", issues, "/composition/review");
    expectBoolean(review, "human_review_required_before_merge", issues, "/composition/review");
    expectString(review, "merge_gate", issues, "/composition/review");
  }
  return { ok: issues.length === 0, issues };
}

function validateCompositionPullRequest(pullRequest, issues) {
  const title = expectString(pullRequest, "title", issues, "/composition/pull_request");
  const body = expectString(pullRequest, "body", issues, "/composition/pull_request");
  const head = expectString(pullRequest, "head", issues, "/composition/pull_request", "forge/");
  const base = expectString(pullRequest, "base", issues, "/composition/pull_request");
  if (title !== null && title.length > MAX_TITLE_LENGTH) issues.push(issue("/composition/pull_request/title", "max", `title must be <= ${MAX_TITLE_LENGTH} characters`));
  if (body !== null && body.length > MAX_BODY_LENGTH) issues.push(issue("/composition/pull_request/body", "max", `body must be <= ${MAX_BODY_LENGTH} characters`));
  if (head !== null && !isSafeRef(head)) issues.push(issue("/composition/pull_request/head", "safe_ref", "head branch contains unsafe syntax"));
  if (base !== null && !isSafeRef(base)) issues.push(issue("/composition/pull_request/base", "safe_ref", "base branch contains unsafe syntax"));
  if (head !== null && base !== null && isDefaultBranchTarget(head, base)) issues.push(issue("/composition/pull_request/head", "default_branch_write", "head branch must not equal the PR base branch"));
  if (pullRequest.maintainer_can_modify !== false) issues.push(issue("/composition/pull_request/maintainer_can_modify", "literal", "maintainer_can_modify must remain false at adapter boundary"));
  expectBoolean(pullRequest, "draft", issues, "/composition/pull_request");
  validateStringArray(pullRequest.labels, "/composition/pull_request/labels", issues, true, MAX_LABELS);
  validateStringArray(pullRequest.reviewers, "/composition/pull_request/reviewers", issues, true, MAX_REVIEWERS);
  validateStringArray(pullRequest.team_reviewers, "/composition/pull_request/team_reviewers", issues, true, MAX_TEAM_REVIEWERS);
}

function validateInstallationContext(value, compositionValue) {
  const issues = [];
  const root = asRecord(value);
  if (root === null) return { ok: false, issues: [issue("/installation", "required", "GitHub App installation context is required")] };
  const installationId = installationIdFrom(root);
  if (installationId === null) issues.push(issue("/installation/installationId", "positive_integer", "installationId must be a positive integer"));
  const installRepo = normalizeOptionalString(root.repositoryFullName);
  if (installRepo !== null && !REPO_FULL_NAME.test(installRepo)) issues.push(issue("/installation/repositoryFullName", "repository", "repositoryFullName must be owner/repo"));
  const composition = asRecord(compositionValue);
  const compositionRepo = composition === null ? null : normalizeOptionalString(composition.repository);
  const compositionSourceRepo = composition === null ? null : normalizeOptionalString(asRecord(composition.source)?.repository);
  const resolvedRepo = installRepo ?? compositionRepo ?? compositionSourceRepo;
  if (resolvedRepo === null) issues.push(issue("/installation/repositoryFullName", "required", "repositoryFullName is required when composition does not declare repository"));
  if (installRepo !== null && compositionRepo !== null && installRepo.toLowerCase() !== compositionRepo.toLowerCase()) issues.push(issue("/installation/repositoryFullName", "mismatch", "installation repository must match composition.repository"));
  if (installRepo !== null && compositionSourceRepo !== null && installRepo.toLowerCase() !== compositionSourceRepo.toLowerCase()) issues.push(issue("/installation/repositoryFullName", "mismatch", "installation repository must match composition.source.repository"));
  const permissions = asRecord(root.permissions);
  const pullRequest = composition === null ? null : asRecord(composition.pull_request);
  const needsIssueLikeMetadataWrite = stringArray(pullRequest?.labels).length > 0;
  if (permissions !== null) {
    if (permissions.pull_requests !== "write") issues.push(issue("/installation/permissions/pull_requests", "permission", "pull_requests:write permission is required for PR creation"));
    if (needsIssueLikeMetadataWrite && permissions.issues !== "write" && permissions.pull_requests !== "write") issues.push(issue("/installation/permissions/issues", "permission", "labels require issues:write or pull_requests:write permission because pull requests are issue-like resources"));
    if (permissions.administration === "read" || permissions.administration === "write") issues.push(issue("/installation/permissions/administration", "permission", "administration permission is outside T025 scope"));
    if (permissions.workflows === "write") issues.push(issue("/installation/permissions/workflows", "permission", "workflows:write is outside T025 scope"));
    if (permissions.secrets === "read" || permissions.secrets === "write") issues.push(issue("/installation/permissions/secrets", "permission", "secrets permission is outside T025 scope"));
  }
  return { ok: issues.length === 0, issues };
}

function validateMetadataSafety(value) {
  const issues = [];
  const root = asRecord(value);
  const pullRequest = root === null ? null : asRecord(root.pull_request);
  if (pullRequest === null) return { ok: true, issues };
  for (const [index, label] of stringArray(pullRequest.labels).entries()) {
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH || /[\r\n\t]/.test(label)) issues.push(issue(`/composition/pull_request/labels/${index}`, "unsafe_metadata", `label '${label}' is not safe adapter metadata`));
  }
  for (const [index, reviewer] of stringArray(pullRequest.reviewers).entries()) {
    if (!REVIEWER.test(reviewer)) issues.push(issue(`/composition/pull_request/reviewers/${index}`, "unsafe_metadata", `reviewer '${reviewer}' is not a safe GitHub login`));
  }
  for (const [index, team] of stringArray(pullRequest.team_reviewers).entries()) {
    if (!REVIEWER.test(team)) issues.push(issue(`/composition/pull_request/team_reviewers/${index}`, "unsafe_metadata", `team reviewer '${team}' is not a safe team slug`));
  }
  return { ok: issues.length === 0, issues };
}

function validateLiveTransportGates(runtime, rateLimit, installation) {
  const issues = [];
  if (runtime === undefined) issues.push(issue("/runtime", "runtime_gate", "live PR transport requires an explicit runtime gate"));
  else {
    if (runtime.operation !== undefined && runtime.operation !== "open_pull_request") issues.push(issue("/runtime/operation", "literal", "runtime operation must be open_pull_request"));
    if (runtime.mode === undefined || !ALLOWED_LIVE_MODES.has(runtime.mode)) issues.push(issue("/runtime/mode", "runtime_gate", "live PR transport requires runtime mode evolve or federate"));
    if (runtime.allowed !== true) issues.push(issue("/runtime/allowed", "runtime_gate", "runtime must authorize open_pull_request"));
    if (runtime.mutatingLaneOpen !== true) issues.push(issue("/runtime/mutatingLaneOpen", "runtime_gate", "mutating lane must be open"));
    if (runtime.killSwitchEngaged === true) issues.push(issue("/runtime/killSwitchEngaged", "runtime_gate", "kill switch must not be engaged"));
    if (runtime.cooldownUntil !== undefined && runtime.cooldownUntil !== null && runtime.cooldownUntil.length > 0) issues.push(issue("/runtime/cooldownUntil", "runtime_gate", "live PR transport is blocked during cooldown"));
  }
  if (rateLimit === undefined) issues.push(issue("/rateLimit", "rate_gate", "live PR transport requires an explicit rate-limit gate"));
  else {
    if (rateLimit.writeLaneAvailable !== true) issues.push(issue("/rateLimit/writeLaneAvailable", "rate_gate", "repo write lane must be available"));
    if (rateLimit.contentCreateAllowed !== true) issues.push(issue("/rateLimit/contentCreateAllowed", "rate_gate", "content creation budget must be available"));
    if (typeof rateLimit.retryAfterSeconds === "number" && rateLimit.retryAfterSeconds > 0) issues.push(issue("/rateLimit/retryAfterSeconds", "rate_gate", "retry-after must be clear before live PR transport"));
  }
  const permissions = asRecord(installation?.permissions);
  if (permissions !== null && permissions.pull_requests !== "write") issues.push(issue("/installation/permissions/pull_requests", "permission", "live PR transport requires pull_requests:write"));
  return { ok: issues.length === 0, issues };
}

function buildGitHubPullRequestCreationRequest(composition, installation, resolved, input, dryRun, createdAt) {
  const pullRequest = composition.pull_request;
  const review = composition.review;
  const source = asRecord(composition.source);
  const labels = uniqueStrings(stringArray(pullRequest.labels));
  const reviewers = uniqueStrings(stringArray(pullRequest.reviewers));
  const teamReviewers = uniqueStrings(stringArray(pullRequest.team_reviewers));
  const permissions = { pull_requests: "write" };
  const compositionId = stringValue(composition.composition_id) ?? "forge-pr://unknown";
  const planId = stringValue(composition.plan_id) ?? "forge-plan://unknown";
  const auditId = stringValue(composition.audit_id) ?? "forge-audit://unknown";
  const head = stringValue(pullRequest.head) ?? "forge/unknown";
  const base = stringValue(pullRequest.base) ?? "main";
  const idempotencyKey = normalizeOptionalString(input.idempotencyKey) ?? `forgeroot:${stableHash(`${compositionId}:${head}:${base}`)}`;
  const requestId = `forge-github-pr://${stableSlug(compositionId)}-${stableHash(`${resolved.fullName}:${head}:${base}:${idempotencyKey}`).slice(0, 8)}`;
  const runtimeMode = input.runtime?.mode ?? null;
  const runtimeAllowed = input.runtime?.allowed ?? null;
  const mutatingLaneOpen = input.runtime?.mutatingLaneOpen ?? null;
  const killSwitchEngaged = input.runtime?.killSwitchEngaged ?? null;
  const liveRuntimeAllowed = runtimeAllowed === true && mutatingLaneOpen === true && killSwitchEngaged !== true && runtimeMode !== null && ALLOWED_LIVE_MODES.has(runtimeMode) && (input.runtime?.cooldownUntil === undefined || input.runtime.cooldownUntil === null || input.runtime.cooldownUntil.length === 0);
  const liveRateAllowed = input.rateLimit?.writeLaneAvailable === true && input.rateLimit?.contentCreateAllowed === true && !(typeof input.rateLimit?.retryAfterSeconds === "number" && input.rateLimit.retryAfterSeconds > 0);
  return {
    manifest_version: GITHUB_PR_ADAPTER_VERSION,
    schema_ref: GITHUB_PR_CREATE_REQUEST_SCHEMA_REF,
    request_id: requestId,
    created_at: createdAt,
    status: "ready_for_github_transport",
    dry_run: dryRun,
    idempotency_key: idempotencyKey,
    composition_id: compositionId,
    plan_id: planId,
    audit_id: auditId,
    repository: { owner: resolved.owner, repo: resolved.repo, full_name: resolved.fullName, installation_id: resolved.installationId },
    authentication: {
      token_source: "github_app_installation",
      token_request: { method: "POST", path: `/app/installations/${resolved.installationId}/access_tokens`, accept: GITHUB_ACCEPT, api_version: GITHUB_API_VERSION, repositories: [resolved.repo], permissions },
      token_handling: { include_authorization_header_at_transport_only: true, do_not_persist_token: true, redact_from_logs: true },
    },
    primary_request: {
      name: "create_pull_request",
      method: "POST",
      path: `/repos/${resolved.owner}/${resolved.repo}/pulls`,
      accept: GITHUB_ACCEPT,
      api_version: GITHUB_API_VERSION,
      body: { title: stringValue(pullRequest.title) ?? "ForgeRoot change", head, base, body: stringValue(pullRequest.body) ?? "", draft: booleanValue(pullRequest.draft) ?? true, maintainer_can_modify: false },
    },
    post_create_requests: postCreateRequests(resolved, labels, reviewers, teamReviewers),
    runtime_gate: { operation: "open_pull_request", mode: runtimeMode, allowed: runtimeAllowed, mutating_lane_open: mutatingLaneOpen, kill_switch_engaged: killSwitchEngaged, cooldown_until: input.runtime?.cooldownUntil ?? null, live_transport_allowed: dryRun ? false : liveRuntimeAllowed, dry_run_bypass_only: dryRun },
    rate_limit_gate: { write_lane_available: input.rateLimit?.writeLaneAvailable ?? null, content_create_allowed: input.rateLimit?.contentCreateAllowed ?? null, retry_after_seconds: input.rateLimit?.retryAfterSeconds ?? null, min_delay_ms: input.rateLimit?.minDelayMs ?? 1200, jitter_ms: input.rateLimit?.jitterMs ?? 800, live_transport_allowed: dryRun ? false : liveRateAllowed },
    review_gate: { approval_class: stringValue(review.approval_class) ?? "B", risk: stringValue(review.risk) ?? "medium", human_review_required_before_merge: booleanValue(review.human_review_required_before_merge) ?? true, merge_gate: stringValue(review.merge_gate) ?? "human_review_required" },
    provenance: { generated_by: "forgeroot-github-pr-adapter.alpha", adapter_version: "0.0.0-t025", composition_id: compositionId, plan_id: planId, audit_id: auditId, source_issue: sourceIssueRef(source), head_branch: head, base_branch: base },
    guards: {
      github_app_installation_token_only: true,
      no_pat_or_user_token: true,
      no_token_persistence: true,
      no_secret_material_in_request: true,
      no_default_branch_write: true,
      head_branch_not_default: true,
      one_task_one_pr: true,
      passed_audit_required: true,
      composer_manifest_required: true,
      no_merge_operation: true,
      no_auto_approval: true,
      no_approval_checkpoint_mutation: true,
      no_workflow_or_policy_mutation: true,
      no_memory_or_evaluation_update: true,
      no_network_or_federation_behavior: true,
    },
  };
}

function resolveRepository(installation, composition) {
  const installationId = installationIdFrom(installation);
  if (installationId === null) return null;
  const source = asRecord(composition.source);
  const fullName = normalizeOptionalString(installation.repositoryFullName) ?? normalizeOptionalString(composition.repository) ?? normalizeOptionalString(source?.repository);
  if (fullName === null || !REPO_FULL_NAME.test(fullName)) return null;
  const [owner, repo] = fullName.split("/");
  if (!owner || !repo) return null;
  return { owner, repo, fullName: `${owner}/${repo}`, installationId };
}

function postCreateRequests(resolved, labels, reviewers, teamReviewers) {
  const requests = [];
  if (labels.length > 0) requests.push({ name: "add_labels_to_pull_request_issue", method: "POST", path_template: `/repos/${resolved.owner}/${resolved.repo}/issues/{pull_number}/labels`, accept: GITHUB_ACCEPT, api_version: GITHUB_API_VERSION, after: "create_pull_request", requires_pull_number: true, body: { labels } });
  if (reviewers.length > 0 || teamReviewers.length > 0) requests.push({ name: "request_pull_request_reviewers", method: "POST", path_template: `/repos/${resolved.owner}/${resolved.repo}/pulls/{pull_number}/requested_reviewers`, accept: GITHUB_ACCEPT, api_version: GITHUB_API_VERSION, after: "create_pull_request", requires_pull_number: true, body: { reviewers, team_reviewers: teamReviewers } });
  return requests;
}

function validateRepository(value, issues) {
  const repository = asRecord(value);
  if (repository === null) { issues.push(issue("/request/repository", "required", "repository is required")); return null; }
  const owner = expectString(repository, "owner", issues, "/request/repository");
  const repo = expectString(repository, "repo", issues, "/request/repository");
  const fullName = expectString(repository, "full_name", issues, "/request/repository");
  expectPositiveInteger(repository, "installation_id", issues, "/request/repository");
  if (owner !== null && repo !== null && fullName !== null && fullName !== `${owner}/${repo}`) issues.push(issue("/request/repository/full_name", "mismatch", "full_name must equal owner/repo"));
  return repository;
}

function validateAuthentication(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/request/authentication", "required", "authentication is required")); return; }
  expectLiteral(root, "token_source", "github_app_installation", issues, "/request/authentication");
  const tokenRequest = asRecord(root.token_request);
  if (tokenRequest === null) issues.push(issue("/request/authentication/token_request", "required", "token_request is required"));
  else {
    expectLiteral(tokenRequest, "method", "POST", issues, "/request/authentication/token_request");
    const path = expectString(tokenRequest, "path", issues, "/request/authentication/token_request", "/app/installations/");
    if (path !== null && !/^\/app\/installations\/\d+\/access_tokens$/.test(path)) issues.push(issue("/request/authentication/token_request/path", "safe_ref", "token path must target one installation access token endpoint"));
    expectLiteral(tokenRequest, "accept", GITHUB_ACCEPT, issues, "/request/authentication/token_request");
    expectLiteral(tokenRequest, "api_version", GITHUB_API_VERSION, issues, "/request/authentication/token_request");
    validateStringArray(tokenRequest.repositories, "/request/authentication/token_request/repositories", issues, false, 500);
    const permissions = asRecord(tokenRequest.permissions);
    if (permissions === null) issues.push(issue("/request/authentication/token_request/permissions", "required", "permissions are required"));
    else {
      if (permissions.pull_requests !== "write") issues.push(issue("/request/authentication/token_request/permissions/pull_requests", "permission", "pull_requests:write token permission is required"));
      for (const key of ["administration", "workflows", "secrets", "dependabot_secrets", "environments"]) if (permissions[key] !== undefined) issues.push(issue(`/request/authentication/token_request/permissions/${key}`, "permission", `${key} permission is outside T025 scope`));
    }
  }
  const handling = asRecord(root.token_handling);
  if (handling === null) issues.push(issue("/request/authentication/token_handling", "required", "token_handling is required"));
  else for (const key of ["include_authorization_header_at_transport_only", "do_not_persist_token", "redact_from_logs"]) if (handling[key] !== true) issues.push(issue(`/request/authentication/token_handling/${key}`, "literal", `${key} must be true`));
}

function validatePrimaryRequest(value, repository, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/request/primary_request", "required", "primary_request is required")); return; }
  expectLiteral(root, "name", "create_pull_request", issues, "/request/primary_request");
  expectLiteral(root, "method", "POST", issues, "/request/primary_request");
  const path = expectString(root, "path", issues, "/request/primary_request");
  const owner = stringValue(repository?.owner);
  const repo = stringValue(repository?.repo);
  if (path !== null && owner !== null && repo !== null && path !== `/repos/${owner}/${repo}/pulls`) issues.push(issue("/request/primary_request/path", "mismatch", "primary request path must target the resolved repository pulls endpoint"));
  if (path !== null && /\/merge(?:$|\/)/.test(path)) issues.push(issue("/request/primary_request/path", "forbidden_endpoint", "merge endpoint is forbidden"));
  expectLiteral(root, "accept", GITHUB_ACCEPT, issues, "/request/primary_request");
  expectLiteral(root, "api_version", GITHUB_API_VERSION, issues, "/request/primary_request");
  const body = asRecord(root.body);
  if (body === null) { issues.push(issue("/request/primary_request/body", "required", "primary request body is required")); return; }
  const title = expectString(body, "title", issues, "/request/primary_request/body");
  const prBody = expectString(body, "body", issues, "/request/primary_request/body");
  const head = expectString(body, "head", issues, "/request/primary_request/body", "forge/");
  const base = expectString(body, "base", issues, "/request/primary_request/body");
  if (title !== null && title.length > MAX_TITLE_LENGTH) issues.push(issue("/request/primary_request/body/title", "max", `title must be <= ${MAX_TITLE_LENGTH} characters`));
  if (prBody !== null && prBody.length > MAX_BODY_LENGTH) issues.push(issue("/request/primary_request/body/body", "max", `body must be <= ${MAX_BODY_LENGTH} characters`));
  if (head !== null && !isSafeRef(head)) issues.push(issue("/request/primary_request/body/head", "safe_ref", "head branch contains unsafe syntax"));
  if (base !== null && !isSafeRef(base)) issues.push(issue("/request/primary_request/body/base", "safe_ref", "base branch contains unsafe syntax"));
  if (head !== null && base !== null && isDefaultBranchTarget(head, base)) issues.push(issue("/request/primary_request/body/head", "default_branch_write", "head branch must not equal the base branch"));
  expectBoolean(body, "draft", issues, "/request/primary_request/body");
  if (body.maintainer_can_modify !== false) issues.push(issue("/request/primary_request/body/maintainer_can_modify", "literal", "maintainer_can_modify must be false"));
}

function validatePostCreateRequests(value, repository, issues) {
  if (!Array.isArray(value)) { issues.push(issue("/request/post_create_requests", "type", "post_create_requests must be an array")); return; }
  const owner = stringValue(repository?.owner);
  const repo = stringValue(repository?.repo);
  for (const [index, raw] of value.entries()) {
    const item = asRecord(raw);
    const path = `/request/post_create_requests/${index}`;
    if (item === null) { issues.push(issue(path, "type", "post-create request must be an object")); continue; }
    const name = expectOneOf(item, "name", new Set(["add_labels_to_pull_request_issue", "request_pull_request_reviewers"]), issues, path);
    expectLiteral(item, "method", "POST", issues, path);
    const pathTemplate = expectString(item, "path_template", issues, path);
    if (pathTemplate !== null && /\/merge(?:$|\/)/.test(pathTemplate)) issues.push(issue(`${path}/path_template`, "forbidden_endpoint", "merge endpoint is forbidden"));
    if (pathTemplate !== null && owner !== null && repo !== null) {
      const allowed = pathTemplate === `/repos/${owner}/${repo}/issues/{pull_number}/labels` || pathTemplate === `/repos/${owner}/${repo}/pulls/{pull_number}/requested_reviewers`;
      if (!allowed) issues.push(issue(`${path}/path_template`, "mismatch", "post-create request path is not an allowed PR metadata endpoint"));
    }
    expectLiteral(item, "after", "create_pull_request", issues, path);
    expectLiteral(item, "requires_pull_number", true, issues, path);
    expectLiteral(item, "accept", GITHUB_ACCEPT, issues, path);
    expectLiteral(item, "api_version", GITHUB_API_VERSION, issues, path);
    const body = asRecord(item.body);
    if (body === null) { issues.push(issue(`${path}/body`, "required", "post-create request body is required")); continue; }
    if (name === "add_labels_to_pull_request_issue") validateStringArray(body.labels, `${path}/body/labels`, issues, false, MAX_LABELS);
    if (name === "request_pull_request_reviewers") {
      validateStringArray(body.reviewers, `${path}/body/reviewers`, issues, true, MAX_REVIEWERS);
      validateStringArray(body.team_reviewers, `${path}/body/team_reviewers`, issues, true, MAX_TEAM_REVIEWERS);
    }
  }
}

function validateRuntimeGate(value, dryRun, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/request/runtime_gate", "required", "runtime_gate is required")); return; }
  expectLiteral(root, "operation", "open_pull_request", issues, "/request/runtime_gate");
  expectStringOrNull(root, "mode", issues, "/request/runtime_gate");
  expectBooleanOrNull(root, "allowed", issues, "/request/runtime_gate");
  expectBooleanOrNull(root, "mutating_lane_open", issues, "/request/runtime_gate");
  expectBooleanOrNull(root, "kill_switch_engaged", issues, "/request/runtime_gate");
  expectStringOrNull(root, "cooldown_until", issues, "/request/runtime_gate");
  expectBoolean(root, "live_transport_allowed", issues, "/request/runtime_gate");
  expectBoolean(root, "dry_run_bypass_only", issues, "/request/runtime_gate");
  if (dryRun === false && root.live_transport_allowed !== true) issues.push(issue("/request/runtime_gate/live_transport_allowed", "runtime_gate", "non-dry-run request requires runtime gate allowance"));
}

function validateRateLimitGate(value, dryRun, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/request/rate_limit_gate", "required", "rate_limit_gate is required")); return; }
  expectBooleanOrNull(root, "write_lane_available", issues, "/request/rate_limit_gate");
  expectBooleanOrNull(root, "content_create_allowed", issues, "/request/rate_limit_gate");
  if (!(root.retry_after_seconds === null || (typeof root.retry_after_seconds === "number" && root.retry_after_seconds >= 0))) issues.push(issue("/request/rate_limit_gate/retry_after_seconds", "integer", "retry_after_seconds must be a non-negative number or null"));
  expectNonNegativeInteger(root, "min_delay_ms", issues, "/request/rate_limit_gate");
  expectNonNegativeInteger(root, "jitter_ms", issues, "/request/rate_limit_gate");
  expectBoolean(root, "live_transport_allowed", issues, "/request/rate_limit_gate");
  if (dryRun === false && root.live_transport_allowed !== true) issues.push(issue("/request/rate_limit_gate/live_transport_allowed", "rate_gate", "non-dry-run request requires rate-limit gate allowance"));
}

function validateReviewGate(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/request/review_gate", "required", "review_gate is required")); return; }
  expectString(root, "approval_class", issues, "/request/review_gate");
  expectString(root, "risk", issues, "/request/review_gate");
  expectBoolean(root, "human_review_required_before_merge", issues, "/request/review_gate");
  expectString(root, "merge_gate", issues, "/request/review_gate");
}

function validateRequestGuards(value, issues) {
  const root = asRecord(value);
  if (root === null) { issues.push(issue("/request/guards", "required", "guards are required")); return; }
  for (const key of ["github_app_installation_token_only", "no_pat_or_user_token", "no_token_persistence", "no_secret_material_in_request", "no_default_branch_write", "head_branch_not_default", "one_task_one_pr", "passed_audit_required", "composer_manifest_required", "no_merge_operation", "no_auto_approval", "no_approval_checkpoint_mutation", "no_workflow_or_policy_mutation", "no_memory_or_evaluation_update", "no_network_or_federation_behavior"]) if (root[key] !== true) issues.push(issue(`/request/guards/${key}`, "literal", `${key} must be true`));
}

function validateNoSecretMaterial(value, path, issues) {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issues.push(issue(path, "secret_leak", "request must not contain token or private-key material"));
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => validateNoSecretMaterial(item, `${path}/${index}`, issues)); return; }
  const root = asRecord(value);
  if (root !== null) for (const [key, child] of Object.entries(root)) validateNoSecretMaterial(child, `${path}/${key}`, issues);
}

function sourceIssueRef(source) {
  if (source === null) return null;
  const url = stringValue(source.url);
  if (url !== null) return url;
  const repo = stringValue(source.repository);
  const number = numberValue(source.issue_number);
  return repo !== null && number !== null ? `${repo}#${number}` : null;
}

function validateStringArray(value, path, issues, allowEmpty, max) {
  if (!Array.isArray(value)) { issues.push(issue(path, "type", "value must be an array of strings")); return []; }
  const result = [];
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.length === 0) issues.push(issue(`${path}/${index}`, "string", "array item must be a non-empty string"));
    else result.push(item);
  }
  if (!allowEmpty && result.length === 0) issues.push(issue(path, "required", "array must not be empty"));
  if (result.length > max) issues.push(issue(path, "max", `array length must be <= ${max}`));
  return result;
}

function expectLiteral(record, key, expected, issues, path) { if (record[key] !== expected) issues.push(issue(`${path}/${key}`, "literal", `${key} must be ${JSON.stringify(expected)}`)); }
function expectString(record, key, issues, path, prefix) { const value = record[key]; if (typeof value !== "string" || value.trim().length === 0) { issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`)); return null; } if (prefix !== undefined && !value.startsWith(prefix)) issues.push(issue(`${path}/${key}`, "literal", `${key} must start with '${prefix}'`)); return value; }
function expectStringOrNull(record, key, issues, path) { const value = record[key]; if (!(typeof value === "string" || value === null)) issues.push(issue(`${path}/${key}`, "string_or_null", `${key} must be a string or null`)); }
function expectBoolean(record, key, issues, path) { const value = record[key]; if (typeof value !== "boolean") { issues.push(issue(`${path}/${key}`, "type", `${key} must be boolean`)); return null; } return value; }
function expectBooleanOrNull(record, key, issues, path) { const value = record[key]; if (!(typeof value === "boolean" || value === null)) issues.push(issue(`${path}/${key}`, "type", `${key} must be boolean or null`)); }
function expectOneOf(record, key, allowed, issues, path) { const value = record[key]; if (typeof value !== "string" || !allowed.has(value)) { issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`)); return null; } return value; }
function expectRfc3339(record, key, issues, path) { const value = expectString(record, key, issues, path); if (value !== null && !RFC3339_UTC.test(value)) issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be an RFC3339 UTC timestamp`)); }
function expectPositiveInteger(record, key, issues, path) { const value = record[key]; if (!Number.isSafeInteger(value) || value <= 0) { issues.push(issue(`${path}/${key}`, "positive_integer", `${key} must be a positive integer`)); return null; } return value; }
function expectNonNegativeInteger(record, key, issues, path) { const value = record[key]; if (!Number.isSafeInteger(value) || value < 0) { issues.push(issue(`${path}/${key}`, "integer", `${key} must be a non-negative integer`)); return null; } return value; }
function installationIdFrom(value) { if (value === undefined || value === null) return null; const candidate = typeof value.installationId === "number" ? value.installationId : typeof value.id === "number" ? value.id : null; return Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null; }
function issue(path, code, message) { return { path, code, message }; }
function formatIssue(item) { return `${item.path}:${item.code}:${item.message}`; }
function invalidResult(reasons, auditTrail, issues) { return { status: "invalid", reasons: uniqueStrings(reasons), auditTrail: [...auditTrail, "github_request:none"], ...(issues === undefined ? {} : { issues }) }; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function stringValue(value) { return typeof value === "string" && value.length > 0 ? value : null; }
function normalizeOptionalString(value) { return typeof value === "string" && value.trim().length > 0 ? value.trim() : null; }
function booleanValue(value) { return typeof value === "boolean" ? value : null; }
function numberValue(value) { return Number.isSafeInteger(value) ? value : null; }
function stringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : []; }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function resolveTimestamp(candidate, fallback) { if (candidate !== undefined) return RFC3339_UTC.test(candidate) ? candidate : null; if (fallback !== null && RFC3339_UTC.test(fallback)) return fallback; return null; }
function isSafeRef(value) { return SAFE_REF.test(value) && !value.includes("..") && !value.endsWith(".lock") && !value.startsWith("/") && !value.endsWith("/"); }
function isDefaultBranchTarget(branch, defaultBranch) { const b = branch.toLowerCase().replace(/^refs\/heads\//, ""); const d = defaultBranch.toLowerCase().replace(/^refs\/heads\//, ""); return b === d || b === "main" || b === "master" || b === "trunk"; }
function stableSlug(value) { const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96); return slug || "task"; }
function stableHash(value) { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i++) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, "0"); }
