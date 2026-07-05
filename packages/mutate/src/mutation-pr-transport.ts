import { validateMutationPrGeneratorResult } from "./mutation-pr-generator.js";
import type { MutationPrGeneratorResult } from "./mutation-pr-generator.js";

export const MUTATION_PR_TRANSPORT_VERSION = 1 as const;
export const MUTATION_PR_TRANSPORT_SCHEMA_REF = "urn:forgeroot:mutate-pr-transport-request:v1" as const;

export type MutationPrTransportStatus = "transport_request_ready" | "blocked" | "invalid";
export type MutationPrTransportDecision = "dry_run_transport_request_ready" | "transport_blocked_by_pr_manifest" | "invalid_transport_input";

export interface MutationPrTransportInput {
  readonly now?: string;
  readonly plan: MutationPrGeneratorResult;
  readonly repository?: string;
  readonly installation_id?: number;
  readonly dry_run?: boolean;
}

export interface MutationPrTransportIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface MutationPrTransportResult {
  readonly manifest_version: typeof MUTATION_PR_TRANSPORT_VERSION;
  readonly schema_ref: typeof MUTATION_PR_TRANSPORT_SCHEMA_REF;
  readonly request_id: string;
  readonly created_at: string;
  readonly status: MutationPrTransportStatus;
  readonly decision: MutationPrTransportDecision;
  readonly reasons: readonly string[];
  readonly dry_run: true;
  readonly plan_ref: {
    readonly plan_id: string;
    readonly plan_digest: string;
    readonly guard_id: string;
    readonly mutation_id: string;
  };
  readonly repository: {
    readonly owner: string;
    readonly repo: string;
    readonly full_name: string;
    readonly installation_id: number | null;
  } | null;
  readonly primary_request?: {
    readonly name: "create_pull_request";
    readonly method: "POST";
    readonly path: string;
    readonly body: {
      readonly title: string;
      readonly body: string;
      readonly head: string;
      readonly base: string;
      readonly draft: true;
      readonly maintainer_can_modify: false;
    };
  };
  readonly post_create_requests?: readonly {
    readonly name: "add_labels_to_pull_request_issue" | "request_pull_request_reviewers";
    readonly method: "POST";
    readonly path_template: string;
    readonly after: "create_pull_request";
    readonly requires_pull_number: true;
    readonly body: Readonly<Record<string, readonly string[]>>;
  }[];
  readonly review_gate: {
    readonly approval_class: "C";
    readonly risk: "high";
    readonly human_review_required_before_execution: true;
    readonly human_review_required_before_merge: true;
    readonly merge_gate: "human_review_required";
  };
  readonly runtime_gate: {
    readonly operation: "open_pull_request";
    readonly live_transport_allowed: false;
    readonly dry_run_only: true;
  };
  readonly guards: {
    readonly t051_ready_manifest_required: true;
    readonly dry_run_only: true;
    readonly no_token_request: true;
    readonly no_token_persistence: true;
    readonly no_github_api_call: true;
    readonly no_git_push: true;
    readonly no_branch_creation: true;
    readonly no_merge_operation: true;
    readonly no_auto_approval: true;
    readonly no_approval_record_write: true;
    readonly no_mutation_execution: true;
    readonly no_default_branch_write: true;
  };
  readonly request_digest: string;
  readonly issues?: readonly MutationPrTransportIssue[];
}

export interface MutationPrTransportValidationResult {
  readonly ok: boolean;
  readonly issues: readonly MutationPrTransportIssue[];
}

export const MUTATION_PR_TRANSPORT_CONTRACT = {
  consumes: ["mutation_pull_request_plan_manifest"],
  produces: ["dry_run_mutation_pr_transport_request_manifest"],
  validates: ["t051_ready_manifest", "safe_repository_endpoint", "safe_pr_metadata", "dry_run_only", "no_secret_material"],
  forbids: ["live_github_transport", "token_request", "token_persistence", "git_push", "branch_creation", "merge_operation", "approval_record_write", "mutation_execution"],
  deterministic: true,
  dryRunOnly: true,
  transportPlanOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const MUTATION_ID = /^mut-[0-9a-f]{8}$/;

export function runMutationPrTransport(input: unknown): MutationPrTransportResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.plan.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];
  if (issues.length > 0 || envelope.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.plan, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "transport input must be an object" }]);

  const planValidation = validateMutationPrGeneratorResult(envelope.input.plan);
  if (!planValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, [
      { path: "plan", code: "invalid_t051_pr_manifest", message: "plan must pass T051 read-back validation" },
      ...planValidation.issues.map((entry) => ({ path: `plan.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }
  if (envelope.input.plan.status !== "pr_manifest_ready" || envelope.input.plan.decision !== "mutation_pr_manifest_ready" || envelope.input.plan.pull_request === undefined) {
    return blockedResult(createdAt ?? DEFAULT_NOW, envelope.input.plan);
  }

  const repository = parseRepository(envelope.input.repository ?? envelope.input.plan.repository);
  if (repository === null) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, [{ path: "repository", code: "repository_required", message: "repository must be provided as owner/repo" }]);

  const request = readyResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, repository, envelope.input.installation_id ?? null);
  const validation = validateMutationPrTransportResult(request);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.plan, validation.issues);
  return request;
}

export function validateMutationPrTransportResult(result: unknown): MutationPrTransportValidationResult {
  const issues: MutationPrTransportIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "transport result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== MUTATION_PR_TRANSPORT_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== MUTATION_PR_TRANSPORT_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T052 transport request v1");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "transport_request_ready" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be ready, blocked, or invalid");
  if (result.decision !== "dry_run_transport_request_ready" && result.decision !== "transport_blocked_by_pr_manifest" && result.decision !== "invalid_transport_input") issue(issues, "decision", "invalid_decision", "decision must be a T052 transport decision");
  if (result.dry_run !== true) issue(issues, "dry_run", "dry_run_required", "T052 transport requests must be dry-run only");
  validatePlanRef(result.plan_ref, issues);
  validateReviewGate(result.review_gate, issues);
  validateRuntimeGate(result.runtime_gate, issues);
  validateGuards(result.guards, issues);
  validateNoSecretMaterial(result, "result", issues);

  if (result.status === "transport_request_ready") validateReadyTransport(result as unknown as MutationPrTransportResult, issues);
  if (result.status === "blocked") validateBlockedTransport(result as unknown as MutationPrTransportResult, issues);
  if (result.status === "invalid") validateInvalidTransport(result as unknown as MutationPrTransportResult, issues);
  return { ok: issues.length === 0, issues };
}

function readyResult(createdAt: string, plan: MutationPrGeneratorResult, repository: ResolvedRepository, installationId: number | null): MutationPrTransportResult {
  const pr = plan.pull_request!;
  const planRef = planRefFor(plan);
  const primaryRequest = {
    name: "create_pull_request",
    method: "POST",
    path: `/repos/${repository.owner}/${repository.repo}/pulls`,
    body: {
      title: pr.title,
      body: pr.body,
      head: pr.head,
      base: pr.base,
      draft: true,
      maintainer_can_modify: false,
    },
  } satisfies MutationPrTransportResult["primary_request"];
  const postCreate = postCreateRequests(repository, pr.labels, pr.reviewers);
  const digest = canonicalDigest({ plan_ref: planRef, repository: { ...repository, installation_id: installationId }, primary_request: primaryRequest, post_create_requests: postCreate, review_gate: reviewGate(), runtime_gate: runtimeGate(), guards: guards() });
  return {
    manifest_version: MUTATION_PR_TRANSPORT_VERSION,
    schema_ref: MUTATION_PR_TRANSPORT_SCHEMA_REF,
    request_id: stableId("mutation-pr-transport", [digest]),
    created_at: createdAt,
    status: "transport_request_ready",
    decision: "dry_run_transport_request_ready",
    reasons: ["t051_pr_manifest_ready", "dry_run_transport_request_ready", "github_api_not_called"],
    dry_run: true,
    plan_ref: planRef,
    repository: { ...repository, installation_id: installationId },
    primary_request: primaryRequest,
    post_create_requests: postCreate,
    review_gate: reviewGate(),
    runtime_gate: runtimeGate(),
    guards: guards(),
    request_digest: digest,
  };
}

function validateReadyTransport(result: MutationPrTransportResult, issues: MutationPrTransportIssue[]): void {
  if (result.decision !== "dry_run_transport_request_ready") issue(issues, "decision", "ready_decision_mismatch", "ready status must use dry_run_transport_request_ready");
  if (result.repository === null) issue(issues, "repository", "repository_required", "ready transport requires repository");
  else validateRepository(result.repository, issues);
  validatePrimaryRequest(result.primary_request, result.repository, issues);
  validatePostCreateRequests(result.post_create_requests, result.repository, issues);
  const expectedDigest = canonicalDigest({ plan_ref: result.plan_ref, repository: result.repository, primary_request: result.primary_request, post_create_requests: result.post_create_requests, review_gate: result.review_gate, runtime_gate: result.runtime_gate, guards: result.guards });
  if (result.request_digest !== expectedDigest) issue(issues, "request_digest", "request_digest_mismatch", "request digest must cover transport request payload");
  if (result.request_id !== stableId("mutation-pr-transport", [expectedDigest])) issue(issues, "request_id", "request_id_mismatch", "request_id must match deterministic transport payload");
  if (result.issues !== undefined) issue(issues, "issues", "ready_issues_forbidden", "ready transport requests must not carry issues");
}

function validateBlockedTransport(result: MutationPrTransportResult, issues: MutationPrTransportIssue[]): void {
  if (result.decision !== "transport_blocked_by_pr_manifest") issue(issues, "decision", "blocked_decision_mismatch", "blocked status must use transport_blocked_by_pr_manifest");
  validateTerminalTransport(result, issues);
}

function validateInvalidTransport(result: MutationPrTransportResult, issues: MutationPrTransportIssue[]): void {
  if (result.decision !== "invalid_transport_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid status must use invalid_transport_input");
  if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid results must carry issues");
  validateTerminalTransport(result, issues);
}

function validateTerminalTransport(result: MutationPrTransportResult, issues: MutationPrTransportIssue[]): void {
  if (result.primary_request !== undefined) issue(issues, "primary_request", "terminal_primary_request_forbidden", "blocked or invalid transport results must not carry primary requests");
  if (result.post_create_requests !== undefined) issue(issues, "post_create_requests", "terminal_post_create_requests_forbidden", "blocked or invalid transport results must not carry post-create requests");
  if (result.repository !== null) issue(issues, "repository", "terminal_repository_forbidden", "blocked or invalid transport results must not carry repository");
  if (result.request_digest !== canonicalDigest(null)) issue(issues, "request_digest", "terminal_digest_mismatch", "blocked or invalid transport results must use the terminal digest sentinel");
}

function validatePrimaryRequest(value: MutationPrTransportResult["primary_request"], repository: MutationPrTransportResult["repository"], issues: MutationPrTransportIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "primary_request", "primary_request_required", "ready transport requires a primary request");
    return;
  }
  if (value.name !== "create_pull_request" || value.method !== "POST") issue(issues, "primary_request", "invalid_primary_request", "primary request must create a pull request");
  if (repository !== null && value.path !== `/repos/${repository.owner}/${repository.repo}/pulls`) issue(issues, "primary_request.path", "path_mismatch", "primary request path must target repository pulls endpoint");
  if (typeof value.path !== "string" || value.path.includes("/merge")) issue(issues, "primary_request.path", "merge_endpoint_forbidden", "merge endpoint is forbidden");
  const body = isRecord(value.body) ? value.body : null;
  if (body === null) {
    issue(issues, "primary_request.body", "body_required", "primary request body is required");
    return;
  }
  if (typeof body.title !== "string" || body.title.trim().length === 0) issue(issues, "primary_request.body.title", "invalid_title", "title is required");
  if (typeof body.body !== "string" || !body.body.includes("No GitHub API call")) issue(issues, "primary_request.body.body", "invalid_body", "body must preserve dry-run safety context");
  if (typeof body.head !== "string" || !isSafeRef(body.head) || isDefaultBranch(body.head)) issue(issues, "primary_request.body.head", "unsafe_head_branch", "head must be a safe non-default branch");
  if (typeof body.base !== "string" || !isSafeRef(body.base)) issue(issues, "primary_request.body.base", "unsafe_base_branch", "base must be safe");
  if (typeof body.head === "string" && typeof body.base === "string" && normalizeRef(body.head) === normalizeRef(body.base)) issue(issues, "primary_request.body.head", "default_branch_write_forbidden", "head must not equal base");
  if (body.draft !== true) issue(issues, "primary_request.body.draft", "draft_required", "PR request must stay draft");
  if (body.maintainer_can_modify !== false) issue(issues, "primary_request.body.maintainer_can_modify", "maintainer_modify_forbidden", "maintainer_can_modify must be false");
}

function validatePostCreateRequests(value: MutationPrTransportResult["post_create_requests"], repository: MutationPrTransportResult["repository"], issues: MutationPrTransportIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, "post_create_requests", "array_required", "post_create_requests must be an array");
    return;
  }
  for (const [index, request] of value.entries()) {
    const path = `post_create_requests[${index}]`;
    if (!isRecord(request)) { issue(issues, path, "object_required", "post-create request must be an object"); continue; }
    if (request.method !== "POST" || request.after !== "create_pull_request" || request.requires_pull_number !== true) issue(issues, path, "invalid_post_create_request", "post-create request must be after create_pull_request");
    if (typeof request.path_template !== "string" || request.path_template.includes("/merge")) issue(issues, `${path}.path_template`, "merge_endpoint_forbidden", "merge endpoint is forbidden");
    if (repository !== null) {
      const allowed = request.path_template === `/repos/${repository.owner}/${repository.repo}/issues/{pull_number}/labels` || request.path_template === `/repos/${repository.owner}/${repository.repo}/pulls/{pull_number}/requested_reviewers`;
      if (!allowed) issue(issues, `${path}.path_template`, "path_mismatch", "post-create request path must target PR metadata endpoints");
    }
  }
}

function validateRepository(value: NonNullable<MutationPrTransportResult["repository"]>, issues: MutationPrTransportIssue[]): void {
  if (!REPOSITORY.test(value.full_name) || value.full_name !== `${value.owner}/${value.repo}`) issue(issues, "repository.full_name", "invalid_repository", "repository full_name must be owner/repo");
  if (value.installation_id !== null && (!Number.isSafeInteger(value.installation_id) || value.installation_id <= 0)) issue(issues, "repository.installation_id", "invalid_installation_id", "installation_id must be positive when present");
}

function validatePlanRef(value: unknown, issues: MutationPrTransportIssue[]): void {
  if (!isRecord(value)) { issue(issues, "plan_ref", "plan_ref_required", "plan_ref must be present"); return; }
  if (typeof value.plan_id !== "string" || !ID.test(value.plan_id)) issue(issues, "plan_ref.plan_id", "invalid_plan_id", "plan_id must be deterministic");
  if (typeof value.plan_digest !== "string" || !DIGEST.test(value.plan_digest)) issue(issues, "plan_ref.plan_digest", "invalid_plan_digest", "plan_digest must be stable");
  if (typeof value.guard_id !== "string" || !ID.test(value.guard_id)) issue(issues, "plan_ref.guard_id", "invalid_guard_id", "guard_id must be deterministic");
  if (typeof value.mutation_id !== "string" || !MUTATION_ID.test(value.mutation_id)) issue(issues, "plan_ref.mutation_id", "invalid_mutation_id", "mutation_id must be mut-<8 hex>");
}

function validateReviewGate(value: unknown, issues: MutationPrTransportIssue[]): void {
  if (!isRecord(value)) { issue(issues, "review_gate", "review_gate_required", "review_gate must be present"); return; }
  if (value.approval_class !== "C" || value.risk !== "high") issue(issues, "review_gate", "class_c_high_risk_required", "review gate must remain high-risk Class C");
  if (value.human_review_required_before_execution !== true || value.human_review_required_before_merge !== true || value.merge_gate !== "human_review_required") issue(issues, "review_gate", "human_review_required", "human review before execution and merge is required");
}

function validateRuntimeGate(value: unknown, issues: MutationPrTransportIssue[]): void {
  if (!isRecord(value)) { issue(issues, "runtime_gate", "runtime_gate_required", "runtime_gate must be present"); return; }
  if (value.operation !== "open_pull_request" || value.live_transport_allowed !== false || value.dry_run_only !== true) issue(issues, "runtime_gate", "dry_run_only_required", "T052 must remain dry-run only");
}

function validateGuards(value: unknown, issues: MutationPrTransportIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of ["t051_ready_manifest_required", "dry_run_only", "no_token_request", "no_token_persistence", "no_github_api_call", "no_git_push", "no_branch_creation", "no_merge_operation", "no_auto_approval", "no_approval_record_write", "no_mutation_execution", "no_default_branch_write"]) {
    if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
  }
}

function normalizeInput(input: unknown): {
  readonly input: MutationPrTransportInput | null;
  readonly now?: string;
  readonly plan: MutationPrGeneratorResult;
  readonly issues: readonly MutationPrTransportIssue[];
} {
  const issues: MutationPrTransportIssue[] = [];
  if (!isRecord(input)) return { input: null, plan: emptyPlan(), issues: [{ path: "input", code: "input_must_be_object", message: "transport input must be an object" }] };
  const plan = isRecord(input.plan) ? input.plan as unknown as MutationPrGeneratorResult : emptyPlan();
  if (!isRecord(input.plan)) issue(issues, "plan", "plan_must_be_object", "plan must be a T051 result object");
  const now = optionalString(input.now, "now", issues);
  const repository = optionalString(input.repository, "repository", issues);
  if (repository !== undefined && !REPOSITORY.test(repository)) issue(issues, "repository", "invalid_repository", "repository must be owner/repo");
  let installationId: number | undefined;
  if (input.installation_id !== undefined) {
    const candidate = input.installation_id;
    if (typeof candidate === "number" && Number.isSafeInteger(candidate) && candidate > 0) installationId = candidate;
    else issue(issues, "installation_id", "invalid_installation_id", "installation_id must be a positive integer");
  }
  if (input.dry_run === false) issue(issues, "dry_run", "live_transport_forbidden", "T052 only prepares dry-run transport requests");
  else if (input.dry_run !== undefined && input.dry_run !== true) issue(issues, "dry_run", "dry_run_must_be_boolean", "dry_run must be true when provided");
  return {
    input: {
      plan,
      ...(now === undefined ? {} : { now }),
      ...(repository === undefined ? {} : { repository }),
      ...(installationId === undefined ? {} : { installation_id: installationId }),
      dry_run: true,
    },
    now,
    plan,
    issues,
  };
}

function invalidResult(createdAt: string, plan: MutationPrGeneratorResult, issues: readonly MutationPrTransportIssue[]): MutationPrTransportResult {
  return terminalResult(createdAt, plan, "invalid", "invalid_transport_input", ["invalid_transport_input", ...issues.map((entry) => entry.code)], issues);
}

function blockedResult(createdAt: string, plan: MutationPrGeneratorResult): MutationPrTransportResult {
  return terminalResult(createdAt, plan, "blocked", "transport_blocked_by_pr_manifest", ["t051_manifest_not_ready", "transport_request_not_generated"]);
}

function terminalResult(createdAt: string, plan: MutationPrGeneratorResult, status: "blocked" | "invalid", decision: "transport_blocked_by_pr_manifest" | "invalid_transport_input", reasons: readonly string[], issues?: readonly MutationPrTransportIssue[]): MutationPrTransportResult {
  const planRef = planRefFor(plan);
  return {
    manifest_version: MUTATION_PR_TRANSPORT_VERSION,
    schema_ref: MUTATION_PR_TRANSPORT_SCHEMA_REF,
    request_id: stableId(`mutation-pr-transport-${status}`, [canonicalStringify({ planRef, reasons })]),
    created_at: createdAt,
    status,
    decision,
    reasons: uniqueStrings(reasons),
    dry_run: true,
    plan_ref: planRef,
    repository: null,
    review_gate: reviewGate(),
    runtime_gate: runtimeGate(),
    guards: guards(),
    request_digest: canonicalDigest(null),
    ...(issues === undefined ? {} : { issues }),
  };
}

function planRefFor(plan: MutationPrGeneratorResult): MutationPrTransportResult["plan_ref"] {
  return {
    plan_id: typeof plan.plan_id === "string" ? plan.plan_id : "",
    plan_digest: typeof plan.plan_digest === "string" ? plan.plan_digest : "",
    guard_id: isRecord(plan.guard_ref) && typeof plan.guard_ref.guard_id === "string" ? plan.guard_ref.guard_id : "",
    mutation_id: isRecord(plan.proposal) && typeof plan.proposal.mutation_id === "string" ? plan.proposal.mutation_id : "",
  };
}

function postCreateRequests(repository: ResolvedRepository, labels: readonly string[], reviewers: readonly string[]): NonNullable<MutationPrTransportResult["post_create_requests"]> {
  const requests: {
    name: "add_labels_to_pull_request_issue" | "request_pull_request_reviewers";
    method: "POST";
    path_template: string;
    after: "create_pull_request";
    requires_pull_number: true;
    body: Readonly<Record<string, readonly string[]>>;
  }[] = [];
  if (labels.length > 0) requests.push({ name: "add_labels_to_pull_request_issue", method: "POST", path_template: `/repos/${repository.owner}/${repository.repo}/issues/{pull_number}/labels`, after: "create_pull_request", requires_pull_number: true, body: { labels } });
  if (reviewers.length > 0) requests.push({ name: "request_pull_request_reviewers", method: "POST", path_template: `/repos/${repository.owner}/${repository.repo}/pulls/{pull_number}/requested_reviewers`, after: "create_pull_request", requires_pull_number: true, body: { reviewers, team_reviewers: [] } });
  return requests;
}

function parseRepository(value: string | null | undefined): ResolvedRepository | null {
  if (typeof value !== "string" || !REPOSITORY.test(value)) return null;
  const [owner, repo] = value.split("/");
  if (!owner || !repo) return null;
  return { owner, repo, full_name: `${owner}/${repo}` };
}

function reviewGate(): MutationPrTransportResult["review_gate"] {
  return { approval_class: "C", risk: "high", human_review_required_before_execution: true, human_review_required_before_merge: true, merge_gate: "human_review_required" };
}

function runtimeGate(): MutationPrTransportResult["runtime_gate"] {
  return { operation: "open_pull_request", live_transport_allowed: false, dry_run_only: true };
}

function guards(): MutationPrTransportResult["guards"] {
  return {
    t051_ready_manifest_required: true,
    dry_run_only: true,
    no_token_request: true,
    no_token_persistence: true,
    no_github_api_call: true,
    no_git_push: true,
    no_branch_creation: true,
    no_merge_operation: true,
    no_auto_approval: true,
    no_approval_record_write: true,
    no_mutation_execution: true,
    no_default_branch_write: true,
  };
}

function emptyPlan(): MutationPrGeneratorResult {
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:mutate-pr-generator:v1",
    plan_id: "",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_mutation_pr_input",
    reasons: [],
    repository: null,
    guard_ref: { guard_id: "", guard_digest: "", decision: "", proposal_id: "", mutation_id: "", routing_id: "" },
    proposal: { proposal_id: "", mutation_id: "", mutation_class: "", risk: "", approval_class: "", target_paths: [], source_digest: "" },
    review_gate: { risk: "high", approval_class: "C", human_review_required_before_execution: true, human_review_required_before_merge: true, merge_gate: "human_review_required" },
    guards: { evolution_guard_accept_required: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_file_write: true, no_approval_record_write: true, no_merge_operation: true, no_mutation_execution: true, no_default_branch_write: true, human_review_required_before_execution: true, human_review_required_before_merge: true },
    provenance: { generated_by: "forgeroot-mutation-pr-generator.alpha", generator_version: "0.0.0-t051", guard_id: "", proposal_id: "", mutation_id: "", routing_id: "" },
    plan_digest: canonicalDigest(null),
    dry_run: { file_written: false, branch_created: false, git_push_performed: false, github_api_called: false, approval_record_written: false, mutation_executed: false, auto_merged: false },
    issues: [],
  };
}

function validateNoSecretMaterial(value: unknown, path: string, issues: MutationPrTransportIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "transport request must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function optionalString(value: unknown, path: string, issues: MutationPrTransportIssue[]): string | undefined {
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

function isSafeRef(value: string): boolean { return SAFE_REF.test(value) && !value.includes("..") && !value.startsWith("/") && !value.endsWith("/") && !value.endsWith(".lock"); }
function normalizeRef(value: string): string { return value.toLowerCase().replace(/^refs\/heads\//, ""); }
function isDefaultBranch(value: string): boolean { const ref = normalizeRef(value); return ref === "main" || ref === "master" || ref === "trunk"; }
function issue(issues: MutationPrTransportIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
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

interface ResolvedRepository {
  readonly owner: string;
  readonly repo: string;
  readonly full_name: string;
}

export const createMutationPrTransportRequest = runMutationPrTransport;
export const prepareMutationPrTransportRequest = runMutationPrTransport;
export const runT052MutationPrTransport = runMutationPrTransport;
export const validateMutationPrTransportRequest = validateMutationPrTransportResult;
export const validateT052MutationPrTransport = validateMutationPrTransportResult;
