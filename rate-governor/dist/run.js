import { createHash } from "node:crypto";
import { validateTransportAuthorization as validateT026TransportAuthorization } from "../../approval-checkpoint/dist/index.js";

export const RATE_GOVERNOR_VERSION = 1;
export const RATE_GOVERNOR_DISPATCH_SCHEMA_REF = "urn:forgeroot:rate-governor-dispatch:v1";
export const RATE_GOVERNOR_COOLDOWN_SCHEMA_REF = "urn:forgeroot:rate-governor-cooldown:v1";

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const MUTATING_MODES = new Set(["evolve", "federate"]);
const DISPATCH_STATUSES = new Set(["queued", "delayed", "blocked"]);

export const FORGEROOT_RATE_GOVERNOR_LIMITS = Object.freeze({
  maxRepoMutatingLanes: 1,
  writeBaseDelayMs: 1200,
  writeJitterMaxMs: 800,
  contentCreateSoftCapPerMinute: 20,
  newPullRequestsHardCapPerHourPerRepo: 5,
  githubGeneralContentCreateLimitPerMinute: 80,
  githubGeneralContentCreateLimitPerHour: 500,
  restMutationPointCost: 5,
  restSecondaryPointsPerMinuteLimit: 900,
  secondaryCooldownBackoffSeconds: [60, 300, 1800, 7200],
  repoLaneLockTtlSeconds: 900,
});

export const RATE_GOVERNOR_QUEUE_CONTRACT = {
  consumes: ["trusted_transport_authorization", "transport_authorization"],
  produces: ["rate_governor_dispatch_decision", "rate_governor_queue_entry"],
  validates: ["transport_authorization_manifest", "one_repo_mutating_lane", "content_create_budget", "pr_create_budget", "write_spacing", "retry_after_and_cooldown", "latest_runtime_gate", "github_app_transport_only", "no_secret_material_in_dispatch"],
  decisions: ["queue", "delay", "block", "invalid"],
  forbids: ["live_github_api_transport", "pull_request_creation_in_rate_governor", "merge_operation", "auto_merge", "auto_approval", "default_branch_write", "token_persistence", "pat_or_user_token_use", "workflow_mutation", "policy_mutation", "memory_or_evaluation_updates", "network_or_federation_behavior", "parallel_repo_mutating_lanes", "retry_after_ignore", "rate_limit_bypass"],
  githubAppOnly: true,
  queueOnly: true,
  maxRepoMutatingLanes: 1,
  contentCreateSoftCapPerMinute: 20,
  newPullRequestsHardCapPerHourPerRepo: 5,
  writeBaseDelayMs: 1200,
  writeJitterMaxMs: 800,
};

export function runRateGovernor(input = {}) {
  const auditTrail = ["rate_governor:T027", "contract:queue_only_no_live_github_transport", "contract:one_repo_mutating_lane", "contract:retry_after_and_cooldown_preserved"];
  const authorization = input.authorization ?? input.transportAuthorization ?? input.transport_authorization ?? input.trustedTransportAuthorization ?? input.trusted_transport_authorization;
  const authValidation = validateTransportAuthorizationForRateGovernor(authorization);
  if (!authValidation.ok) return invalidResult(["invalid_rate_governor_input", ...authValidation.issues.map(formatIssue)], [...auditTrail, "authorization:invalid"], authValidation.issues);

  const now = resolveTimestamp(input.now, authorization.created_at);
  if (now === null) return invalidResult(["rfc3339:/now"], [...auditTrail, "timestamp:invalid"], [issue("/now", "rfc3339", "now must be RFC3339 UTC")]);

  const state = normalizeState(input.rateState ?? input.queueState ?? input.state ?? {}, authorization, now);
  const runtime = normalizeRuntime(input.runtime ?? input.runtimeGate ?? input.runtime_gate ?? authorization.runtime_gate);
  const runtimeIssues = runtimeBlockIssues(runtime);
  if (runtimeIssues.length > 0) {
    const dispatch = buildDispatch({ authorization, status: "blocked", now, state, runtime, cooldown: inactiveCooldown(now), executeAfter: now, issues: runtimeIssues });
    return { status: "blocked", decision: "block", dispatch, reasons: ["rate_governor_blocked", ...runtimeIssues.map(formatIssue)], issues: runtimeIssues, auditTrail: [...auditTrail, "runtime:blocked", "github_transport:not_performed"] };
  }

  const cooldown = activeCooldown(input, state, now);
  const delayIssues = delayIssuesFor(authorization, state, cooldown, now);
  if (delayIssues.length > 0) {
    const executeAfter = maxTs([cooldown.cooldown_until, ...delayIssues.map((x) => x.until).filter(Boolean), now]);
    const dispatch = buildDispatch({ authorization, status: "delayed", now, state, runtime, cooldown, executeAfter, issues: delayIssues });
    const check = validateRateGovernorDispatch(dispatch);
    if (!check.ok) return invalidResult(["generated_delayed_dispatch_failed_validation", ...check.issues.map(formatIssue)], [...auditTrail, "dispatch:invalid"], check.issues);
    return { status: "delayed", decision: "delay", dispatch, reasons: ["rate_governor_delayed", ...delayIssues.map(formatIssue)], issues: delayIssues, auditTrail: [...auditTrail, "queue:delayed", "github_transport:not_performed"] };
  }

  const spacing = writeSpacing(authorization, state, now);
  const dispatch = buildDispatch({ authorization, status: "queued", now, state, runtime, cooldown: inactiveCooldown(now), executeAfter: spacing.execute_after, issues: [], spacing });
  const check = validateRateGovernorDispatch(dispatch);
  if (!check.ok) return invalidResult(["generated_queue_dispatch_failed_validation", ...check.issues.map(formatIssue)], [...auditTrail, "dispatch:invalid"], check.issues);
  return { status: "queued", decision: "queue", dispatch, reasons: ["rate_governor_queued", `queue_entry:${dispatch.queue_entry_id}`, `execute_after:${dispatch.transport.execute_after}`, "github_transport:not_performed"], auditTrail: [...auditTrail, "queue:accepted", "repo_lane:reserved_in_manifest", "github_transport:not_performed"] };
}

export const governRateLimit = runRateGovernor;
export const runRateGovernorQueue = runRateGovernor;
export const enqueueTrustedTransport = runRateGovernor;
export const enqueueTransportAuthorization = runRateGovernor;
export const queuePullRequestTransport = runRateGovernor;
export const governTrustedTransport = runRateGovernor;
export const governGitHubPullRequestTransport = runRateGovernor;
export const governGithubPullRequestTransport = runRateGovernor;

export function validateTransportAuthorizationForRateGovernor(value) {
  const upstream = validateT026TransportAuthorization(value);
  const issues = Array.isArray(upstream.issues) ? [...upstream.issues] : [];
  const root = rec(value);
  if (root === null) return { ok: false, issues: issues.length ? uniqueIssues(issues) : [issue("/authorization", "type", "transport authorization must be an object")] };
  const transport = rec(root.transport);
  if (transport === null) issues.push(issue("/authorization/transport", "required", "transport section is required"));
  else {
    if (transport.authorized_operation !== "create_pull_request") issues.push(issue("/authorization/transport/authorized_operation", "operation", "only create_pull_request may be queued"));
    if (transport.token_source !== "github_app_installation") issues.push(issue("/authorization/transport/token_source", "github_app_only", "GitHub App installation token source is required"));
    if (transport.token_material_included !== false) issues.push(issue("/authorization/transport/token_material_included", "token_material", "token material must not be present"));
    if (transport.execute_after !== "rate_governor_queue") issues.push(issue("/authorization/transport/execute_after", "handoff", "authorization must hand off to rate_governor_queue"));
    const primary = rec(transport.primary_request);
    if (looksLikeMerge(str(primary?.path) ?? "")) issues.push(issue("/authorization/transport/primary_request/path", "forbidden_endpoint", "merge endpoint cannot be queued"));
  }
  const gates = rec(root.gates);
  if (gates !== null && gates.github_api_transport !== "deferred_to_transport_worker") issues.push(issue("/authorization/gates/github_api_transport", "deferred", "GitHub transport must remain deferred"));
  noSecrets(root, "/authorization", issues);
  return { ok: issues.length === 0, issues: uniqueIssues(issues) };
}
export const validateRateGovernorAuthorization = validateTransportAuthorizationForRateGovernor;
export const validateTrustedTransportAuthorizationForRateGovernor = validateTransportAuthorizationForRateGovernor;

export function validateRateGovernorDispatch(value) {
  const issues = [];
  const root = rec(value);
  if (root === null) return { ok: false, issues: [issue("/dispatch", "type", "dispatch must be an object")] };
  literal(root, "manifest_version", RATE_GOVERNOR_VERSION, issues, "/dispatch");
  literal(root, "schema_ref", RATE_GOVERNOR_DISPATCH_SCHEMA_REF, issues, "/dispatch");
  prefix(root, "dispatch_id", "forge-rate-governor://", issues, "/dispatch");
  prefix(root, "queue_entry_id", "forge-rate-queue://", issues, "/dispatch");
  rfc(root, "created_at", issues, "/dispatch");
  if (!DISPATCH_STATUSES.has(root.status)) issues.push(issue("/dispatch/status", "enum", "status must be queued, delayed, or blocked"));
  if (root.status === "queued" && root.decision !== "queue_for_transport") issues.push(issue("/dispatch/decision", "decision", "queued dispatch must queue_for_transport"));
  if (root.status === "delayed" && root.decision !== "delay_transport") issues.push(issue("/dispatch/decision", "decision", "delayed dispatch must delay_transport"));
  if (root.status === "blocked" && root.decision !== "block_transport") issues.push(issue("/dispatch/decision", "decision", "blocked dispatch must block_transport"));
  for (const [key, pre] of [["authorization_id", "forge-approval://"], ["request_id", "forge-github-pr://"], ["composition_id", "forge-pr://"], ["plan_id", "forge-plan://"], ["audit_id", "forge-audit://"]]) prefix(root, key, pre, issues, "/dispatch");
  const repo = rec(root.repository); if (repo === null || typeof repo.full_name !== "string") issues.push(issue("/dispatch/repository/full_name", "required", "repository.full_name is required"));
  literal(root, "operation", "create_pull_request", issues, "/dispatch");
  const lane = rec(root.lane);
  if (lane === null) issues.push(issue("/dispatch/lane", "required", "lane is required"));
  else {
    literal(lane, "scope", "repository", issues, "/dispatch/lane");
    literal(lane, "max_concurrency", 1, issues, "/dispatch/lane");
    if (root.status === "queued" && lane.acquired !== true) issues.push(issue("/dispatch/lane/acquired", "lane", "queued dispatch must acquire lane"));
    if (root.status !== "queued" && lane.acquired !== false) issues.push(issue("/dispatch/lane/acquired", "lane", "non-queued dispatch must not acquire lane"));
  }
  const budgets = rec(root.budgets);
  if (budgets === null) issues.push(issue("/dispatch/budgets", "required", "budgets are required"));
  else {
    const content = rec(budgets.content_create); const pr = rec(budgets.pull_request_create); const spacing = rec(budgets.write_spacing);
    if (content === null || content.limit_per_minute !== 20) issues.push(issue("/dispatch/budgets/content_create/limit_per_minute", "limit", "content limit must be 20/minute"));
    if (pr === null || pr.limit_per_hour !== 5) issues.push(issue("/dispatch/budgets/pull_request_create/limit_per_hour", "limit", "PR create limit must be 5/hour"));
    if (spacing === null || !RFC3339.test(spacing.execute_after)) issues.push(issue("/dispatch/budgets/write_spacing/execute_after", "rfc3339", "write execute_after is required"));
  }
  const cooldown = rec(root.cooldown);
  if (cooldown === null) issues.push(issue("/dispatch/cooldown", "required", "cooldown is required"));
  else { literal(cooldown, "schema_ref", RATE_GOVERNOR_COOLDOWN_SCHEMA_REF, issues, "/dispatch/cooldown"); rfc(cooldown, "cooldown_until", issues, "/dispatch/cooldown"); }
  const transport = rec(root.transport);
  if (transport === null) issues.push(issue("/dispatch/transport", "required", "transport is required"));
  else {
    literal(transport, "authorized_operation", "create_pull_request", issues, "/dispatch/transport");
    literal(transport, "token_source", "github_app_installation", issues, "/dispatch/transport");
    literal(transport, "token_material_included", false, issues, "/dispatch/transport");
    literal(transport, "github_api_transport", "deferred_to_transport_worker", issues, "/dispatch/transport");
    literal(transport, "live_github_transport_performed", false, issues, "/dispatch/transport");
    rfc(transport, "execute_after", issues, "/dispatch/transport");
  }
  const guards = rec(root.guards);
  for (const key of ["github_app_installation_token_only", "no_pat_or_user_token", "no_token_persistence", "no_secret_material_in_dispatch", "no_live_github_transport_in_rate_governor", "no_pull_request_creation_in_rate_governor", "no_merge_operation", "no_auto_approval", "no_parallel_repo_mutating_lanes", "retry_after_preserved", "content_create_budget_preserved", "pr_create_budget_preserved", "no_memory_or_evaluation_update", "no_network_or_federation_behavior"]) if (guards?.[key] !== true) issues.push(issue(`/dispatch/guards/${key}`, "literal", `${key} must be true`));
  noSecrets(root, "/dispatch", issues);
  return { ok: issues.length === 0, issues: uniqueIssues(issues) };
}
export const validateRateGovernorQueueEntry = validateRateGovernorDispatch;
export const validateRateGovernorDecision = validateRateGovernorDispatch;
export const validateGitHubTransportDispatch = validateRateGovernorDispatch;
export const validateGithubTransportDispatch = validateRateGovernorDispatch;

export function deriveRateGovernorCooldown(observation = {}, options = {}) {
  const now = resolveTimestamp(options.now ?? observation.now, "1970-01-01T00:00:00Z") ?? "1970-01-01T00:00:00Z";
  const headers = lowerHeaders(observation.headers ?? observation.responseHeaders ?? {});
  const status = num(observation.statusCode ?? observation.status_code ?? observation.status);
  const retryAfter = num(observation.retryAfterSeconds ?? observation.retry_after_seconds ?? headers["retry-after"]);
  const remaining = num(observation.xRateLimitRemaining ?? observation.x_ratelimit_remaining ?? headers["x-ratelimit-remaining"]);
  const reset = num(observation.xRateLimitReset ?? observation.x_ratelimit_reset ?? headers["x-ratelimit-reset"]);
  const secondary = observation.secondaryLimitDetected === true || observation.secondary_limit_detected === true || /secondary rate limit/i.test(str(observation.message) ?? "");
  const failures = Math.max(1, num(options.consecutiveFailures ?? options.failureCount ?? observation.consecutiveFailures ?? observation.failure_count) ?? 1);
  if (![403, 429].includes(status ?? 0) && retryAfter === null && remaining !== 0 && secondary !== true) return inactiveCooldown(now);
  let seconds = 60, reason = "secondary_rate_limit_default_cooldown";
  if (retryAfter !== null) { seconds = Math.max(0, Math.ceil(retryAfter)); reason = "retry_after_header"; }
  else if (remaining === 0 && reset !== null) { seconds = Math.max(0, Math.ceil((reset * 1000 - Date.parse(now)) / 1000)); reason = "primary_rate_limit_reset_header"; }
  else { seconds = FORGEROOT_RATE_GOVERNOR_LIMITS.secondaryCooldownBackoffSeconds[Math.min(failures - 1, 3)]; reason = failures >= 4 ? "secondary_rate_limit_exponential_backoff_human_ack" : "secondary_rate_limit_exponential_backoff"; }
  return { manifest_version: 1, schema_ref: RATE_GOVERNOR_COOLDOWN_SCHEMA_REF, active: seconds > 0, status_code: status, reason, retry_after_seconds: retryAfter, cooldown_seconds: seconds, cooldown_until: addMs(now, seconds * 1000), x_ratelimit_remaining: remaining, x_ratelimit_reset: reset, secondary_limit_detected: secondary, consecutive_failures: failures, requires_human_ack: failures >= 4, action: "delay_queue_and_request_runtime_downgrade" };
}
export const deriveCooldownFromRateLimitResponse = deriveRateGovernorCooldown;
export const deriveRetryAfterCooldown = deriveRateGovernorCooldown;

function buildDispatch({ authorization, status, now, state, runtime, cooldown, executeAfter, issues, spacing }) {
  const computed = spacing ?? writeSpacing(authorization, state, now);
  const idBase = `${authorization.authorization_id}:${status}:${executeAfter}:${issues.map((x) => x.code).join(",")}`;
  const dispatchId = `forge-rate-governor://${slug(authorization.request_id)}-${hash(idBase).slice(0, 12)}`;
  const queueId = `forge-rate-queue://${slug(authorization.repository.full_name)}-${hash(dispatchId).slice(0, 12)}`;
  const transport = rec(authorization.transport) ?? {};
  return {
    manifest_version: 1,
    schema_ref: RATE_GOVERNOR_DISPATCH_SCHEMA_REF,
    dispatch_id: dispatchId,
    queue_entry_id: queueId,
    created_at: now,
    status,
    decision: status === "queued" ? "queue_for_transport" : status === "delayed" ? "delay_transport" : "block_transport",
    authorization_id: authorization.authorization_id,
    request_id: authorization.request_id,
    composition_id: authorization.composition_id,
    plan_id: authorization.plan_id,
    audit_id: authorization.audit_id,
    repository: authorization.repository,
    operation: "create_pull_request",
    lane: { scope: "repository", key: `repo:${authorization.repository.full_name}:mutating`, max_concurrency: 1, acquired: status === "queued", lock_token: status === "queued" ? `forge-lane-lock://${slug(authorization.repository.full_name)}-${hash(queueId).slice(0,12)}` : null, lock_ttl_seconds: 900, locked_until: status === "queued" ? addMs(executeAfter, 900000) : state.repo.locked_until, current_owner: state.repo.owner, reason: status === "queued" ? "repo_mutating_lane_reserved_in_dispatch_manifest" : "repo_mutating_lane_not_acquired" },
    budgets: {
      content_create: { cap_source: "ForgeRoot stricter-than-GitHub soft cap", limit_per_minute: 20, limit_per_hour: 500, current_minute_count: state.content.minute, current_hour_count: state.content.hour, remaining_minute_after_reservation: Math.max(0, 20 - state.content.minute - (status === "queued" ? 1 : 0)), remaining_hour_after_reservation: Math.max(0, 500 - state.content.hour - (status === "queued" ? 1 : 0)), minute_reset_at: state.content.minute_reset_at, hour_reset_at: state.content.hour_reset_at, github_general_limit_per_minute: 80, github_general_limit_per_hour: 500, reserved_requests: status === "queued" ? 1 : 0 },
      pull_request_create: { cap_source: "ForgeRoot per-repo hard cap", limit_per_hour: 5, current_hour_count: state.pr.hour, remaining_hour_after_reservation: Math.max(0, 5 - state.pr.hour - (status === "queued" ? 1 : 0)), hour_reset_at: state.pr.hour_reset_at, reserved_requests: status === "queued" ? 1 : 0 },
      rest_secondary_points: { point_cost_reserved: status === "queued" ? 5 : 0, max_points_per_minute: 900, source: "GitHub REST secondary point model for mutative requests" },
      write_spacing: { base_delay_ms: state.write.base, jitter_max_ms: state.write.jitterMax, deterministic_jitter_ms: computed.jitter, last_mutating_request_at: state.write.last, execute_after: executeAfter },
    },
    cooldown,
    runtime_gate: { mode: runtime.mode, allowed: runtime.allowed, mutating_lane_open: runtime.mutating_lane_open, kill_switch_engaged: runtime.kill_switch_engaged, live_transport_allowed: runtime.live_transport_allowed, checked_at: now },
    transport: { authorized_operation: "create_pull_request", primary_request: transport.primary_request, post_create_requests: arr(transport.post_create_requests), idempotency_key: str(transport.idempotency_key) ?? `${authorization.authorization_id}:create_pull_request`, token_source: "github_app_installation", token_material_included: false, github_api_transport: "deferred_to_transport_worker", live_github_transport_performed: false, execute_after: executeAfter },
    guards: { github_app_installation_token_only: true, no_pat_or_user_token: true, no_token_persistence: true, no_secret_material_in_dispatch: true, no_live_github_transport_in_rate_governor: true, no_pull_request_creation_in_rate_governor: true, no_merge_operation: true, no_auto_merge: true, no_auto_approval: true, no_default_branch_write: true, no_parallel_repo_mutating_lanes: true, retry_after_preserved: true, content_create_budget_preserved: true, pr_create_budget_preserved: true, no_workflow_or_policy_mutation: true, no_memory_or_evaluation_update: true, no_network_or_federation_behavior: true },
    reasons: issues.map(formatIssue),
    provenance: { generated_by: "forgeroot-rate-governor.alpha", rate_governor_version: "0.0.0-t027", source_authorization_id: authorization.authorization_id, source_request_id: authorization.request_id, source_issue: str(rec(authorization.provenance)?.source_issue) ?? str(rec(authorization.requested_surface)?.source_issue) },
  };
}

function normalizeState(value, authorization, now) {
  const root = rec(value) ?? {};
  const repo = rec(root.repoLane ?? root.repo_lane) ?? {};
  const content = rec(root.contentCreate ?? root.content_create ?? root.content) ?? {};
  const pr = rec(root.pullRequestCreate ?? root.pull_request_create ?? root.prCreate ?? root.pr_create) ?? {};
  const secondary = rec(root.secondary ?? root.restSecondary) ?? {};
  const write = rec(root.write ?? root.writeSpacing ?? root.write_spacing) ?? {};
  const lockedUntil = str(repo.lockedUntil ?? repo.locked_until);
  return {
    repo: { busy: repo.busy === true || repo.locked === true || (lockedUntil && Date.parse(lockedUntil) > Date.parse(now)), owner: str(repo.ownerAuthorizationId ?? repo.owner_authorization_id ?? repo.owner), locked_until: lockedUntil },
    content: { minute: Math.max(0, num(content.perMinuteCount ?? content.per_minute_count ?? content.minuteCount) ?? 0), hour: Math.max(0, num(content.perHourCount ?? content.per_hour_count ?? content.hourCount) ?? 0), minute_reset_at: str(content.minuteResetAt ?? content.minute_reset_at) ?? addMs(now, 60000), hour_reset_at: str(content.hourResetAt ?? content.hour_reset_at) ?? addMs(now, 3600000) },
    pr: { hour: Math.max(0, num(pr.perHourCount ?? pr.per_hour_count ?? pr.hourCount) ?? 0), hour_reset_at: str(pr.hourResetAt ?? pr.hour_reset_at) ?? addMs(now, 3600000) },
    secondary: { points: Math.max(0, num(secondary.restPointsUsed ?? secondary.rest_points_used ?? secondary.pointsUsed) ?? 0), reset_at: str(secondary.minuteResetAt ?? secondary.minute_reset_at) ?? addMs(now, 60000) },
    write: { base: num(write.baseDelayMs ?? write.base_delay_ms ?? rec(authorization.rate_limit_gate)?.min_delay_ms) ?? 1200, jitterMax: num(write.jitterMaxMs ?? write.jitter_max_ms ?? rec(authorization.rate_limit_gate)?.jitter_ms) ?? 800, last: str(write.lastMutatingRequestAt ?? write.last_mutating_request_at) },
    cooldown: normalizeCooldown(root.cooldown, now),
  };
}
function normalizeRuntime(value) { const root = rec(value) ?? {}; return { mode: str(root.mode), allowed: bool(root.allowed), mutating_lane_open: bool(root.mutatingLaneOpen ?? root.mutating_lane_open), kill_switch_engaged: bool(root.killSwitchEngaged ?? root.kill_switch_engaged), live_transport_allowed: bool(root.liveTransportAllowed ?? root.live_transport_allowed) }; }
function runtimeBlockIssues(r) { const out=[]; if (r.mode === "quarantine" || r.mode === "halted") out.push(issue("/runtime/mode", "runtime_quarantine", `runtime mode ${r.mode} blocks transport`)); if (r.mode && !MUTATING_MODES.has(r.mode)) out.push(issue("/runtime/mode", "runtime_mode_not_mutating", "latest runtime mode does not permit trusted write transport")); if (r.kill_switch_engaged === true) out.push(issue("/runtime/kill_switch_engaged", "kill_switch", "kill switch is engaged")); if (r.allowed !== true) out.push(issue("/runtime/allowed", "runtime_not_allowed", "latest runtime gate does not allow transport")); if (r.mutating_lane_open !== true) out.push(issue("/runtime/mutating_lane_open", "mutating_lane_closed", "mutating lane is closed")); if (r.live_transport_allowed !== true) out.push(issue("/runtime/live_transport_allowed", "live_transport_not_allowed", "live transport is not allowed")); return uniqueIssues(out); }
function delayIssuesFor(auth, state, cooldown, now) { const out=[]; if (cooldown.active === true) out.push(issue("/cooldown", "cooldown_active", `cooldown is active until ${cooldown.cooldown_until}`, { until: cooldown.cooldown_until })); if (state.repo.busy && state.repo.owner !== auth.authorization_id) out.push(issue("/repo_lane", "repo_mutating_lane_busy", "repository mutating lane is already occupied", { until: state.repo.locked_until ?? addMs(now, 900000) })); if (state.content.minute >= 20) out.push(issue("/content_create/minute", "content_create_minute_cap", "ForgeRoot content-create soft cap per minute is exhausted", { until: state.content.minute_reset_at })); if (state.content.hour >= 500) out.push(issue("/content_create/hour", "content_create_hour_cap", "GitHub content-create per-hour limit would be exceeded", { until: state.content.hour_reset_at })); if (state.pr.hour >= 5) out.push(issue("/pull_request_create/hour", "pr_create_hour_cap", "ForgeRoot PR-create hard cap is exhausted", { until: state.pr.hour_reset_at })); if (state.secondary.points + 5 > 900) out.push(issue("/secondary/rest_points", "rest_secondary_points_cap", "REST secondary point budget would be exceeded", { until: state.secondary.reset_at })); return uniqueIssues(out); }
function activeCooldown(input, state, now) { const candidates=[state.cooldown]; for (const k of ["rateLimitObservation","rateLimitSignal","observedResponse"]) if (input[k]) candidates.push(deriveRateGovernorCooldown(input[k], { now, consecutiveFailures: input.consecutiveFailures ?? input.failureCount })); if (Array.isArray(input.rateLimitObservations)) for (const x of input.rateLimitObservations) candidates.push(deriveRateGovernorCooldown(x, { now })); const active=candidates.filter(c => c.active === true && Date.parse(c.cooldown_until) > Date.parse(now)); return active.sort((a,b)=>Date.parse(b.cooldown_until)-Date.parse(a.cooldown_until))[0] ?? inactiveCooldown(now); }
function normalizeCooldown(value, now) { const r=rec(value); if (!r) return inactiveCooldown(now); const until=str(r.cooldownUntil ?? r.cooldown_until ?? r.until) ?? now; return { manifest_version: 1, schema_ref: RATE_GOVERNOR_COOLDOWN_SCHEMA_REF, active: r.active === true || Date.parse(until)>Date.parse(now), status_code: num(r.statusCode ?? r.status_code), reason: str(r.reason) ?? "state_cooldown", retry_after_seconds: num(r.retryAfterSeconds ?? r.retry_after_seconds), cooldown_seconds: num(r.cooldownSeconds ?? r.cooldown_seconds) ?? 0, cooldown_until: until, x_ratelimit_remaining: num(r.xRateLimitRemaining ?? r.x_ratelimit_remaining), x_ratelimit_reset: num(r.xRateLimitReset ?? r.x_ratelimit_reset), secondary_limit_detected: r.secondaryLimitDetected === true || r.secondary_limit_detected === true, consecutive_failures: num(r.consecutiveFailures ?? r.consecutive_failures) ?? 0, requires_human_ack: r.requiresHumanAck === true || r.requires_human_ack === true, action: str(r.action) ?? "delay_queue_and_request_runtime_downgrade" }; }
function inactiveCooldown(now) { return { manifest_version: 1, schema_ref: RATE_GOVERNOR_COOLDOWN_SCHEMA_REF, active: false, status_code: null, reason: "none", retry_after_seconds: null, cooldown_seconds: 0, cooldown_until: now, x_ratelimit_remaining: null, x_ratelimit_reset: null, secondary_limit_detected: false, consecutive_failures: 0, requires_human_ack: false, action: "none" }; }
function writeSpacing(auth, state, now) { const jitter = state.write.jitterMax > 0 ? parseInt(hash(`${auth.authorization_id}:${auth.request_id}`).slice(0,8),16) % (state.write.jitterMax + 1) : 0; const delay=state.write.base+jitter; return { jitter, execute_after: maxTs([addMs(now, delay), state.write.last ? addMs(state.write.last, delay) : now]) }; }
function invalidResult(reasons, auditTrail, issues) { return { status: "invalid", decision: "invalid", reasons: unique(reasons), auditTrail, issues: uniqueIssues(issues) }; }
function deriveArrayHeaders(h){ return h; }
function lowerHeaders(h){ const r=rec(h) ?? {}; const o={}; for (const [k,v] of Object.entries(r)) o[k.toLowerCase()] = Array.isArray(v) ? v[0] : v; return o; }
function literal(root,key,val,issues,path){ if(root?.[key]!==val) issues.push(issue(`${path}/${key}`,"literal",`${key} must equal ${JSON.stringify(val)}`)); }
function prefix(root,key,pre,issues,path){ if(typeof root?.[key]!=="string" || !root[key].startsWith(pre)) issues.push(issue(`${path}/${key}`,"prefix",`${key} must start with ${pre}`)); }
function rfc(root,key,issues,path){ if(typeof root?.[key]!=="string" || !RFC3339.test(root[key])) issues.push(issue(`${path}/${key}`,"rfc3339",`${key} must be RFC3339 UTC`)); }
function noSecrets(value,path,issues){ if(typeof value === "string"){ const x=value.toLowerCase(); if(x.includes("bearer ") || x.includes("ghp_") || x.includes("github_pat_") || x.includes("-----begin") || x.includes("private_key") || x.includes("x-access-token:")) issues.push(issue(path,"secret_leak","token/private-key material is forbidden")); return; } if(Array.isArray(value)){ value.forEach((v,i)=>noSecrets(v,`${path}/${i}`,issues)); return; } const r=rec(value); if(r) for(const [k,v] of Object.entries(r)) noSecrets(v,`${path}/${k}`,issues); }
function resolveTimestamp(a,b){ const v=str(a) ?? str(b) ?? new Date().toISOString().replace(".000Z","Z"); return RFC3339.test(v) ? v : null; }
function addMs(ts,ms){ return new Date(Date.parse(ts)+Math.max(0,ms)).toISOString().replace(".000Z","Z"); }
function maxTs(values){ return values.filter(v=>typeof v==="string" && RFC3339.test(v)).sort((a,b)=>Date.parse(b)-Date.parse(a))[0] ?? "1970-01-01T00:00:00Z"; }
function issue(path,code,message,extra={}){ return {path,code,message,...extra}; }
function formatIssue(x){ return `${x.code}:${x.path}`; }
function uniqueIssues(xs){ const seen=new Set(), out=[]; for(const x of xs){ const k=`${x.path}\0${x.code}\0${x.message}`; if(!seen.has(k)){ seen.add(k); out.push(x); } } return out; }
function unique(xs){ return [...new Set(xs.filter(x => typeof x === "string" && x.length > 0))]; }
function rec(v){ return v && typeof v === "object" && !Array.isArray(v) ? v : null; }
function str(v){ return typeof v === "string" && v.length > 0 ? v : null; }
function num(v){ return typeof v === "number" && Number.isFinite(v) ? v : (typeof v === "string" && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null); }
function bool(v){ return typeof v === "boolean" ? v : null; }
function arr(v){ return Array.isArray(v) ? v : []; }
function looksLikeMerge(p){ return /\/pulls\/[^/{}]+\/merge(?:$|[/?#])|\/merge(?:$|[/?#])/.test(p); }
function hash(v){ return createHash("sha256").update(String(v)).digest("hex"); }
function slug(v){ return String(v ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80) || "unknown"; }
