import { runPlanner, validatePlanSpec } from "../../planner/dist/index.js";
import {
  createBranchWorktreePlan,
  createSandboxExecutionRequest,
  validateBranchWorktreePlan,
  validateSandboxExecutionRequest,
  validateSandboxObservedOutput,
} from "../../executor/dist/index.js";
import { runAuditor, validateAuditResult } from "../../auditor/dist/index.js";
import { composePullRequest, validatePullRequestComposition } from "../../pr-composer/dist/index.js";
import { prepareGitHubPullRequest, validateGitHubPullRequestCreationRequest } from "../../github-pr-adapter/dist/index.js";
import { runApprovalCheckpoint, validateTransportAuthorization } from "../../approval-checkpoint/dist/index.js";
import { runRateGovernor, validateRateGovernorDispatch } from "../../rate-governor/dist/index.js";

export const FORGE_DEMO_VERSION = 1 as const;
export const E2E_FORGED_PR_DEMO_SCHEMA_REF = "urn:forgeroot:e2e-forged-pr-demo:v1" as const;

export type ForgeDemoStatus = "ready" | "blocked" | "delayed" | "quarantined" | "invalid";
export type ForgeDemoDecision = "demo_chain_ready" | "blocked_before_pr_transport" | "delayed_before_transport" | "quarantine_before_transport" | "invalid_demo_input_or_chain";

export interface ForgeDemoIssueInput {
  readonly sourceKind?: string;
  readonly action?: string;
  readonly repositoryFullName?: string;
  readonly number?: number;
  readonly url?: string;
  readonly title?: string;
  readonly body?: string;
  readonly labels?: readonly string[];
}

export interface ForgeDemoInput {
  readonly now?: string;
  readonly issue?: ForgeDemoIssueInput;
  readonly intake?: unknown;
  readonly plannerInput?: unknown;
  readonly defaultBranch?: string;
  readonly worktreeRoot?: string;
  readonly changedPaths?: readonly string[];
  readonly sandboxOutput?: unknown;
  readonly evidence?: unknown;
  readonly installation?: unknown;
  readonly runtime?: unknown;
  readonly rateLimit?: unknown;
  readonly rateState?: unknown;
  readonly humanApproval?: unknown;
  readonly humanApprovals?: readonly unknown[];
  readonly labels?: readonly string[];
  readonly reviewers?: readonly string[];
  readonly teamReviewers?: readonly string[];
  readonly draft?: boolean;
  readonly dryRun?: boolean;
  readonly idempotencyKey?: string;
}

export interface ForgeDemoStep {
  readonly name: string;
  readonly status: string;
  readonly produced: string | null;
  readonly id: string | null;
}

export interface ForgeDemoValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ForgeDemoValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ForgeDemoValidationIssue[];
}

export interface ForgeDemoResult {
  readonly manifest_version: typeof FORGE_DEMO_VERSION;
  readonly schema_ref: typeof E2E_FORGED_PR_DEMO_SCHEMA_REF;
  readonly demo_id: string;
  readonly created_at: string;
  readonly status: ForgeDemoStatus;
  readonly decision: ForgeDemoDecision;
  readonly reasons: readonly string[];
  readonly auditTrail: readonly string[];
  readonly steps: readonly ForgeDemoStep[];
  readonly summary: {
    readonly source_issue: string | null;
    readonly repository: string | null;
    readonly plan_id: string | null;
    readonly worktree_manifest_id: string | null;
    readonly sandbox_request_id: string | null;
    readonly audit_id: string | null;
    readonly composition_id: string | null;
    readonly github_request_id: string | null;
    readonly authorization_id: string | null;
    readonly dispatch_id: string | null;
    readonly pr_title: string | null;
    readonly head: string | null;
    readonly base: string | null;
    readonly approval_class: string | null;
    readonly risk: string | null;
    readonly rate_governor_status: string | null;
  };
  readonly invariants: {
    readonly one_task_one_pr: boolean;
    readonly source_issue_count: number | null;
    readonly no_default_branch_write: boolean;
    readonly pr_body_contains_risk_summary: boolean;
    readonly pr_body_contains_acceptance_criteria: boolean;
    readonly approval_gate_preserved: boolean;
    readonly live_github_transport_performed: false;
    readonly real_pull_request_created: false;
    readonly merge_or_approval_executed: false;
    readonly memory_or_evaluation_updated: false;
    readonly federation_performed: false;
  };
  readonly chain: {
    readonly planner?: unknown;
    readonly plan?: unknown;
    readonly worktreeResult?: unknown;
    readonly worktreePlan?: unknown;
    readonly sandboxResult?: unknown;
    readonly sandboxRequest?: unknown;
    readonly sandboxObservedOutput?: unknown;
    readonly sandboxObservedValidation?: unknown;
    readonly auditResult?: unknown;
    readonly auditReport?: unknown;
    readonly prComposerResult?: unknown;
    readonly prComposition?: unknown;
    readonly githubAdapterResult?: unknown;
    readonly githubRequest?: unknown;
    readonly approvalCheckpointResult?: unknown;
    readonly transportAuthorization?: unknown;
    readonly rateGovernorResult?: unknown;
    readonly rateGovernorDispatch?: unknown;
  };
  readonly issues?: readonly ForgeDemoValidationIssue[];
}

export const E2E_FORGED_PR_DEMO_CONTRACT = {
  consumes: [
    "forge_auto_issue_like_input",
    "planner_runtime",
    "branch_worktree_manager",
    "sandbox_execution_request",
    "sandbox_observed_output",
    "audit_result",
    "pull_request_composition",
    "github_pull_request_creation_request",
    "trusted_transport_authorization",
  ],
  produces: ["e2e_forged_pr_demo_manifest", "full_phase1_manifest_chain", "rate_governed_dispatch_manifest"],
  validates: [
    "one_issue_to_one_plan",
    "one_plan_to_one_worktree_manifest",
    "one_worktree_to_one_sandbox_request",
    "sandbox_output_with_declared_artifacts",
    "passed_independent_audit",
    "reviewable_pr_composition_body",
    "github_app_pr_request_manifest",
    "approval_checkpoint_authorization",
    "rate_governor_dispatch",
  ],
  forbids: [
    "live_github_api_transport",
    "real_pull_request_creation",
    "merge_operation",
    "approval_execution",
    "default_branch_write",
    "file_editing_in_demo_harness",
    "command_execution_in_demo_harness",
    "token_material_or_token_persistence",
    "workflow_mutation",
    "policy_mutation",
    "memory_or_evaluation_updates",
    "network_or_federation_behavior",
    "self_evolution",
  ],
  oneTaskOnePr: true,
  demoOnly: true,
} as const;

const NOW = "2026-04-18T00:00:00Z";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function runEndToEndForgedPrDemo(input: ForgeDemoInput = {}): ForgeDemoResult {
  const createdAt = resolveTimestamp(input.now, NOW);
  if (createdAt === null) return invalidBase("now_must_be_rfc3339_utc", input.now ?? "unknown");

  const auditTrail = [
    "e2e_forged_pr_demo:T028",
    "contract:demo_manifest_only",
    "contract:one_task_one_pr",
    "contract:no_live_github_transport",
    "contract:no_real_pull_request_creation",
  ];

  const plannerResult = runPlanner(resolvePlannerInput(input, createdAt));
  if (plannerResult.status !== "planned" || plannerResult.plan === undefined) {
    return stopResult({
      createdAt,
      status: plannerResult.status === "invalid" ? "invalid" : "blocked",
      decision: plannerResult.status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`planner_${plannerResult.status}`, ...stringArray((plannerResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((plannerResult as any).auditTrail), "chain:stopped_at_planner"],
      chain: { planner: plannerResult },
    });
  }

  const plan = plannerResult.plan;
  const worktreeResult = createBranchWorktreePlan(plan as any, {
    now: createdAt,
    defaultBranch: input.defaultBranch ?? "main",
    worktreeRoot: input.worktreeRoot,
  });
  if (worktreeResult.status !== "ready" || worktreeResult.plan === undefined) {
    return stopResult({
      createdAt,
      status: worktreeResult.status === "invalid" ? "invalid" : "blocked",
      decision: worktreeResult.status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`worktree_${worktreeResult.status}`, ...stringArray((worktreeResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((worktreeResult as any).auditTrail), "chain:stopped_at_worktree"],
      chain: { planner: plannerResult, plan, worktreeResult },
    });
  }

  const worktreePlan = worktreeResult.plan;
  const sandboxResult = createSandboxExecutionRequest(worktreePlan as any, { now: createdAt });
  if (sandboxResult.status !== "ready" || sandboxResult.request === undefined) {
    return stopResult({
      createdAt,
      status: sandboxResult.status === "invalid" ? "invalid" : "blocked",
      decision: sandboxResult.status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`sandbox_${sandboxResult.status}`, ...stringArray((sandboxResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((sandboxResult as any).auditTrail), "chain:stopped_at_sandbox_request"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult },
    });
  }

  const sandboxRequest = sandboxResult.request;
  const changedPaths = input.changedPaths ?? [selectDemoChangedPath(plan as any)];
  const sandboxObservedOutput = input.sandboxOutput ?? buildDemoSandboxOutput(sandboxRequest as any, changedPaths);
  const sandboxObservedValidation = validateSandboxObservedOutput(sandboxRequest as any, sandboxObservedOutput as any);
  if (asRecord(sandboxObservedValidation)?.ok !== true) {
    return stopResult({
      createdAt,
      status: "blocked",
      decision: "blocked_before_pr_transport",
      reasons: ["sandbox_observed_output_failed_validation", ...formatUpstreamIssues(asRecord(sandboxObservedValidation)?.issues)],
      auditTrail: [...auditTrail, "sandbox_output:invalid", "chain:stopped_before_audit"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation },
    });
  }

  const evidence = input.evidence ?? buildDemoEvidence(plan as any, sandboxObservedOutput as any, changedPaths);
  const auditResult = runAuditor({ plan, worktreePlan, sandboxRequest, sandboxOutput: sandboxObservedOutput, evidence, now: createdAt });
  if ((auditResult as any).status !== "passed" || (auditResult as any).report === undefined) {
    return stopResult({
      createdAt,
      status: (auditResult as any).status === "invalid" ? "invalid" : "blocked",
      decision: (auditResult as any).status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`audit_${String((auditResult as any).status)}`, ...stringArray((auditResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((auditResult as any).auditTrail), "chain:stopped_at_audit"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation, auditResult, auditReport: (auditResult as any).report },
    });
  }

  const auditReport = (auditResult as any).report;
  const prComposerResult = composePullRequest({
    plan,
    worktreePlan,
    sandboxRequest,
    sandboxOutput: sandboxObservedOutput,
    auditResult: auditReport,
    now: createdAt,
    labels: input.labels ?? [],
    reviewers: input.reviewers ?? [],
    teamReviewers: input.teamReviewers ?? [],
    draft: input.draft ?? true,
  });
  if (prComposerResult.status !== "ready" || prComposerResult.composition === undefined) {
    return stopResult({
      createdAt,
      status: prComposerResult.status === "invalid" ? "invalid" : "blocked",
      decision: prComposerResult.status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`pr_composer_${prComposerResult.status}`, ...stringArray((prComposerResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((prComposerResult as any).auditTrail), "chain:stopped_at_pr_composer"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation, auditResult, auditReport, prComposerResult },
    });
  }

  const prComposition = prComposerResult.composition;
  const runtime = normalizeRuntimeGate(input.runtime);
  const rateLimit = normalizeRateLimitGate(input.rateLimit);
  const githubAdapterResult = prepareGitHubPullRequest({
    composition: prComposition,
    installation: normalizeInstallation(input.installation, plan as any),
    now: createdAt,
    dryRun: input.dryRun ?? false,
    runtime,
    rateLimit,
    idempotencyKey: input.idempotencyKey,
  });
  if ((githubAdapterResult as any).status !== "ready" || (githubAdapterResult as any).request === undefined) {
    return stopResult({
      createdAt,
      status: (githubAdapterResult as any).status === "invalid" ? "invalid" : "blocked",
      decision: (githubAdapterResult as any).status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`github_pr_adapter_${String((githubAdapterResult as any).status)}`, ...stringArray((githubAdapterResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((githubAdapterResult as any).auditTrail), "chain:stopped_at_github_pr_adapter"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation, auditResult, auditReport, prComposerResult, prComposition, githubAdapterResult },
    });
  }

  const githubRequest = (githubAdapterResult as any).request;
  const approvalCheckpointResult = runApprovalCheckpoint({
    request: githubRequest,
    runtime,
    rateLimit,
    humanApproval: input.humanApproval,
    humanApprovals: input.humanApprovals,
    now: createdAt,
  });
  if ((approvalCheckpointResult as any).status !== "authorized" || (approvalCheckpointResult as any).authorization === undefined) {
    const status = (approvalCheckpointResult as any).status === "quarantined" ? "quarantined" : (approvalCheckpointResult as any).status === "invalid" ? "invalid" : "blocked";
    return stopResult({
      createdAt,
      status,
      decision: status === "quarantined" ? "quarantine_before_transport" : status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`approval_checkpoint_${String((approvalCheckpointResult as any).status)}`, ...stringArray((approvalCheckpointResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((approvalCheckpointResult as any).auditTrail), "chain:stopped_at_approval_checkpoint"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation, auditResult, auditReport, prComposerResult, prComposition, githubAdapterResult, githubRequest, approvalCheckpointResult },
    });
  }

  const transportAuthorization = (approvalCheckpointResult as any).authorization;
  const rateGovernorResult = runRateGovernor({
    authorization: transportAuthorization,
    runtime,
    rateState: input.rateState,
    now: createdAt,
  });
  if ((rateGovernorResult as any).status !== "queued") {
    const status = (rateGovernorResult as any).status === "delayed" ? "delayed" : (rateGovernorResult as any).status === "invalid" ? "invalid" : "blocked";
    return stopResult({
      createdAt,
      status,
      decision: status === "delayed" ? "delayed_before_transport" : status === "invalid" ? "invalid_demo_input_or_chain" : "blocked_before_pr_transport",
      reasons: [`rate_governor_${String((rateGovernorResult as any).status)}`, ...stringArray((rateGovernorResult as any).reasons)],
      auditTrail: [...auditTrail, ...stringArray((rateGovernorResult as any).auditTrail), "chain:stopped_at_rate_governor"],
      chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation, auditResult, auditReport, prComposerResult, prComposition, githubAdapterResult, githubRequest, approvalCheckpointResult, transportAuthorization, rateGovernorResult, rateGovernorDispatch: (rateGovernorResult as any).dispatch },
    });
  }

  const rateGovernorDispatch = (rateGovernorResult as any).dispatch;
  const result = readyResult({
    createdAt,
    auditTrail: [
      ...auditTrail,
      ...stringArray((plannerResult as any).auditTrail),
      ...stringArray((worktreeResult as any).auditTrail),
      ...stringArray((sandboxResult as any).auditTrail),
      ...stringArray((auditResult as any).auditTrail),
      ...stringArray((prComposerResult as any).auditTrail),
      ...stringArray((githubAdapterResult as any).auditTrail),
      ...stringArray((approvalCheckpointResult as any).auditTrail),
      ...stringArray((rateGovernorResult as any).auditTrail),
      "chain:complete_through_rate_governor_dispatch",
      "live_github_transport:not_performed",
    ],
    chain: { planner: plannerResult, plan, worktreeResult, worktreePlan, sandboxResult, sandboxRequest, sandboxObservedOutput, sandboxObservedValidation, auditResult, auditReport, prComposerResult, prComposition, githubAdapterResult, githubRequest, approvalCheckpointResult, transportAuthorization, rateGovernorResult, rateGovernorDispatch },
  });

  const validation = validateEndToEndForgedPrDemo(result);
  if (!validation.ok) return { ...result, status: "invalid", decision: "invalid_demo_input_or_chain", reasons: uniqueStrings([...result.reasons, "generated_demo_manifest_failed_validation", ...validation.issues.map(formatIssue)]), issues: validation.issues };
  return result;
}

export const runForgeDemo = runEndToEndForgedPrDemo;
export const runEndToEndDemo = runEndToEndForgedPrDemo;
export const runE2EForgedPrDemo = runEndToEndForgedPrDemo;
export const runT028Demo = runEndToEndForgedPrDemo;

export function validateEndToEndForgedPrDemo(value: unknown): ForgeDemoValidationResult {
  const issues: ForgeDemoValidationIssue[] = [];
  const root = asRecord(value);
  if (root === null) return { ok: false, issues: [issue("/demo", "type", "demo result must be an object")] };
  expectLiteral(root, "manifest_version", FORGE_DEMO_VERSION, issues, "/demo");
  expectLiteral(root, "schema_ref", E2E_FORGED_PR_DEMO_SCHEMA_REF, issues, "/demo");
  expectString(root, "demo_id", issues, "/demo", "forge-demo://");
  expectRfc3339(root, "created_at", issues, "/demo");
  const status = expectOneOf(root, "status", new Set(["ready", "blocked", "delayed", "quarantined", "invalid"]), issues, "/demo");
  expectOneOf(root, "decision", new Set(["demo_chain_ready", "blocked_before_pr_transport", "delayed_before_transport", "quarantine_before_transport", "invalid_demo_input_or_chain"]), issues, "/demo");
  const steps = arrayValue(root.steps).map(asRecord).filter((item): item is JsonRecord => item !== null);
  if (steps.length === 0) issues.push(issue("/demo/steps", "non_empty", "steps must describe the demo chain"));
  const invariants = asRecord(root.invariants);
  if (invariants === null) issues.push(issue("/demo/invariants", "required", "invariants are required"));
  else {
    for (const key of ["one_task_one_pr", "no_default_branch_write", "approval_gate_preserved", "pr_body_contains_risk_summary", "pr_body_contains_acceptance_criteria"] as const) {
      if (status === "ready" && invariants[key] !== true) issues.push(issue(`/demo/invariants/${key}`, "literal", `${key} must be true for ready demo output`));
    }
    for (const key of ["live_github_transport_performed", "real_pull_request_created", "merge_or_approval_executed", "memory_or_evaluation_updated", "federation_performed"] as const) {
      if (invariants[key] !== false) issues.push(issue(`/demo/invariants/${key}`, "literal", `${key} must remain false`));
    }
  }
  if (status === "ready") validateReadyChain(root, issues);
  return { ok: issues.length === 0, issues: uniqueIssues(issues) };
}

export const validateForgeDemo = validateEndToEndForgedPrDemo;
export const validateE2EForgedPrDemo = validateEndToEndForgedPrDemo;
export const validateT028Demo = validateEndToEndForgedPrDemo;

function validateReadyChain(root: JsonRecord, issues: ForgeDemoValidationIssue[]): void {
  const chain = asRecord(root.chain);
  if (chain === null) {
    issues.push(issue("/demo/chain", "required", "ready demo requires a full manifest chain"));
    return;
  }
  mergeValidation("/demo/chain/plan", validatePlanSpec(chain.plan), issues);
  mergeValidation("/demo/chain/worktreePlan", validateBranchWorktreePlan(chain.worktreePlan), issues);
  mergeValidation("/demo/chain/sandboxRequest", validateSandboxExecutionRequest(chain.sandboxRequest), issues);
  const sandboxRequest = chain.sandboxRequest;
  const sandboxOutput = chain.sandboxObservedOutput;
  mergeValidation("/demo/chain/sandboxObservedOutput", validateSandboxObservedOutput(sandboxRequest as any, sandboxOutput as any), issues);
  mergeValidation("/demo/chain/auditReport", validateAuditResult(chain.auditReport), issues);
  mergeValidation("/demo/chain/prComposition", validatePullRequestComposition(chain.prComposition), issues);
  mergeValidation("/demo/chain/githubRequest", validateGitHubPullRequestCreationRequest(chain.githubRequest), issues);
  mergeValidation("/demo/chain/transportAuthorization", validateTransportAuthorization(chain.transportAuthorization), issues);
  mergeValidation("/demo/chain/rateGovernorDispatch", validateRateGovernorDispatch(chain.rateGovernorDispatch), issues);

  const planId = stringValue(asRecord(chain.plan)?.plan_id);
  const worktreePlanId = stringValue(asRecord(chain.worktreePlan)?.plan_id);
  const sandboxPlanId = stringValue(asRecord(chain.sandboxRequest)?.plan_id);
  const auditPlanId = stringValue(asRecord(chain.auditReport)?.plan_id);
  const compositionPlanId = stringValue(asRecord(chain.prComposition)?.plan_id);
  const requestPlanId = stringValue(asRecord(chain.githubRequest)?.plan_id);
  const authorizationPlanId = stringValue(asRecord(chain.transportAuthorization)?.plan_id);
  const dispatchPlanId = stringValue(asRecord(chain.rateGovernorDispatch)?.plan_id);
  if (!allEqual([planId, worktreePlanId, sandboxPlanId, auditPlanId, compositionPlanId, requestPlanId, authorizationPlanId, dispatchPlanId])) issues.push(issue("/demo/chain/plan_id", "mismatch", "plan_id must match across the full T028 chain"));

  const worktreeId = stringValue(asRecord(chain.worktreePlan)?.manifest_id);
  const sandboxWorktreeId = stringValue(asRecord(chain.sandboxRequest)?.worktree_manifest_id);
  const auditWorktreeId = stringValue(asRecord(chain.auditReport)?.worktree_manifest_id);
  const compositionWorktreeId = stringValue(asRecord(chain.prComposition)?.worktree_manifest_id);
  if (!allEqual([worktreeId, sandboxWorktreeId, auditWorktreeId, compositionWorktreeId])) issues.push(issue("/demo/chain/worktree_manifest_id", "mismatch", "worktree manifest id must match through PR composition"));

  const sandboxId = stringValue(asRecord(chain.sandboxRequest)?.request_id);
  const auditSandboxId = stringValue(asRecord(chain.auditReport)?.sandbox_request_id);
  const compositionSandboxId = stringValue(asRecord(chain.prComposition)?.sandbox_request_id);
  if (!allEqual([sandboxId, auditSandboxId, compositionSandboxId])) issues.push(issue("/demo/chain/sandbox_request_id", "mismatch", "sandbox request id must match through PR composition"));

  const auditId = stringValue(asRecord(chain.auditReport)?.audit_id);
  const compositionAuditId = stringValue(asRecord(chain.prComposition)?.audit_id);
  const githubAuditId = stringValue(asRecord(chain.githubRequest)?.audit_id);
  const authorizationAuditId = stringValue(asRecord(chain.transportAuthorization)?.audit_id);
  const dispatchAuditId = stringValue(asRecord(chain.rateGovernorDispatch)?.audit_id);
  if (!allEqual([auditId, compositionAuditId, githubAuditId, authorizationAuditId, dispatchAuditId])) issues.push(issue("/demo/chain/audit_id", "mismatch", "audit id must match from audit through dispatch"));

  const githubRequestId = stringValue(asRecord(chain.githubRequest)?.request_id);
  const authorizationRequestId = stringValue(asRecord(chain.transportAuthorization)?.request_id);
  const dispatchRequestId = stringValue(asRecord(chain.rateGovernorDispatch)?.request_id);
  if (!allEqual([githubRequestId, authorizationRequestId, dispatchRequestId])) issues.push(issue("/demo/chain/request_id", "mismatch", "GitHub PR request id must match through approval and rate governor"));

  const pr = asRecord(asRecord(chain.prComposition)?.pull_request);
  const body = stringValue(pr?.body) ?? "";
  if (!body.includes("### Review gate") || !body.includes("Approval class") || !body.includes("Risk")) issues.push(issue("/demo/chain/prComposition/pull_request/body", "risk_summary", "PR body must include risk and approval summary"));
  if (!body.includes("### Acceptance criteria")) issues.push(issue("/demo/chain/prComposition/pull_request/body", "acceptance", "PR body must include acceptance criteria"));
}

function readyResult(context: { readonly createdAt: string; readonly auditTrail: readonly string[]; readonly chain: ForgeDemoResult["chain"] }): ForgeDemoResult {
  const chain = context.chain;
  const plan = asRecord(chain.plan);
  const worktreePlan = asRecord(chain.worktreePlan);
  const sandboxRequest = asRecord(chain.sandboxRequest);
  const auditReport = asRecord(chain.auditReport);
  const prComposition = asRecord(chain.prComposition);
  const githubRequest = asRecord(chain.githubRequest);
  const transportAuthorization = asRecord(chain.transportAuthorization);
  const rateGovernorDispatch = asRecord(chain.rateGovernorDispatch);
  const pr = asRecord(prComposition?.pull_request);
  const review = asRecord(prComposition?.review);
  const summary = summaryFor(chain);
  return {
    manifest_version: FORGE_DEMO_VERSION,
    schema_ref: E2E_FORGED_PR_DEMO_SCHEMA_REF,
    demo_id: `forge-demo://t028-${shortHash(`${stringValue(plan?.plan_id)}:${stringValue(rateGovernorDispatch?.dispatch_id)}:${context.createdAt}`)}`,
    created_at: context.createdAt,
    status: "ready",
    decision: "demo_chain_ready",
    reasons: uniqueStrings([
      "e2e_forged_pr_demo_ready",
      `plan:${summary.plan_id}`,
      `pr_composition:${summary.composition_id}`,
      `github_request:${summary.github_request_id}`,
      `transport_authorization:${summary.authorization_id}`,
      `rate_dispatch:${summary.dispatch_id}`,
      "live_github_transport:not_performed",
    ]),
    auditTrail: context.auditTrail,
    steps: stepsFor(chain),
    summary,
    invariants: {
      one_task_one_pr: asRecord(plan?.scope_contract)?.one_task_one_pr === true && asRecord(worktreePlan?.scope)?.one_task_one_pr === true && asRecord(sandboxRequest?.scope)?.one_task_one_pr === true,
      source_issue_count: numberValue(asRecord(plan?.scope_contract)?.source_issue_count),
      no_default_branch_write: asRecord(plan?.scope_contract)?.no_default_branch_write === true && asRecord(worktreePlan?.scope)?.no_default_branch_write === true && asRecord(sandboxRequest?.scope)?.no_default_branch_write === true && asRecord(prComposition?.scope)?.no_default_branch_write === true && asRecord(rateGovernorDispatch?.transport)?.live_github_transport_performed === false,
      pr_body_contains_risk_summary: bodyIncludes(stringValue(pr?.body), ["### Review gate", "Approval class", "Risk"]),
      pr_body_contains_acceptance_criteria: bodyIncludes(stringValue(pr?.body), ["### Acceptance criteria"]),
      approval_gate_preserved: asRecord(prComposition?.guards)?.approval_gate_preserved === true && asRecord(transportAuthorization?.guards)?.human_review_before_merge_preserved === true && stringValue(asRecord(auditReport?.gates)?.pr_composition) === "allowed" && stringValue(review?.approval_class) !== null,
      live_github_transport_performed: false,
      real_pull_request_created: false,
      merge_or_approval_executed: false,
      memory_or_evaluation_updated: false,
      federation_performed: false,
    },
    chain,
  };
}

function stopResult(context: { readonly createdAt: string; readonly status: ForgeDemoStatus; readonly decision: ForgeDemoDecision; readonly reasons: readonly string[]; readonly auditTrail: readonly string[]; readonly chain: ForgeDemoResult["chain"] }): ForgeDemoResult {
  return {
    manifest_version: FORGE_DEMO_VERSION,
    schema_ref: E2E_FORGED_PR_DEMO_SCHEMA_REF,
    demo_id: `forge-demo://t028-stopped-${shortHash(`${context.status}:${context.reasons.join(":")}:${context.createdAt}`)}`,
    created_at: context.createdAt,
    status: context.status,
    decision: context.decision,
    reasons: uniqueStrings(context.reasons),
    auditTrail: context.auditTrail,
    steps: stepsFor(context.chain),
    summary: summaryFor(context.chain),
    invariants: {
      one_task_one_pr: booleanValue(asRecord(asRecord(context.chain.plan)?.scope_contract)?.one_task_one_pr) ?? false,
      source_issue_count: numberValue(asRecord(asRecord(context.chain.plan)?.scope_contract)?.source_issue_count),
      no_default_branch_write: booleanValue(asRecord(asRecord(context.chain.plan)?.scope_contract)?.no_default_branch_write) ?? false,
      pr_body_contains_risk_summary: bodyIncludes(stringValue(asRecord(asRecord(context.chain.prComposition)?.pull_request)?.body), ["### Review gate", "Approval class", "Risk"]),
      pr_body_contains_acceptance_criteria: bodyIncludes(stringValue(asRecord(asRecord(context.chain.prComposition)?.pull_request)?.body), ["### Acceptance criteria"]),
      approval_gate_preserved: booleanValue(asRecord(asRecord(context.chain.prComposition)?.guards)?.approval_gate_preserved) ?? false,
      live_github_transport_performed: false,
      real_pull_request_created: false,
      merge_or_approval_executed: false,
      memory_or_evaluation_updated: false,
      federation_performed: false,
    },
    chain: context.chain,
  };
}

function invalidBase(reason: string, value: string): ForgeDemoResult {
  return stopResult({ createdAt: NOW, status: "invalid", decision: "invalid_demo_input_or_chain", reasons: [reason, value], auditTrail: ["e2e_forged_pr_demo:T028", "input:invalid"], chain: {} });
}

function resolvePlannerInput(input: ForgeDemoInput, now: string): any {
  if (asRecord(input.plannerInput) !== null) return input.plannerInput;
  if (asRecord(input.intake) !== null) return { source: "intake_input", now, intake: input.intake };
  return { source: "intake_input", now, intake: normalizeIssueInput(input.issue) };
}

function normalizeIssueInput(issueInput: ForgeDemoIssueInput | undefined): any {
  const issue = issueInput ?? {};
  const repository = issue.repositoryFullName ?? "hiroshitanaka-creator/ForgeRoot";
  const number = Number.isSafeInteger(issue.number) ? issue.number : 28;
  return {
    sourceKind: issue.sourceKind ?? "issue",
    action: issue.action ?? "opened",
    repositoryFullName: repository,
    number,
    url: issue.url ?? `https://github.com/${repository}/issues/${number}`,
    title: issue.title ?? "docs: add T028 forged PR demo note",
    body: issue.body ?? "Add one bounded documentation note to docs/ops/t028-e2e-forged-pr-demo.md.",
    labels: issue.labels ?? ["forge:auto", "docs", "phase:P1", "class:A", "risk:low"],
  };
}

function normalizeInstallation(input: unknown, plan: JsonRecord): any {
  const source = asRecord(plan.source);
  const repo = stringValue(asRecord(input)?.repositoryFullName) ?? stringValue(source?.repository) ?? "hiroshitanaka-creator/ForgeRoot";
  const root = asRecord(input) ?? {};
  return {
    installationId: numberValue(root.installationId) ?? numberValue(root.installation_id) ?? 42,
    repositoryFullName: repo,
    permissions: asRecord(root.permissions) ?? {
      metadata: "read",
      contents: "write",
      pull_requests: "write",
      issues: "write",
      checks: "write",
      actions: "read",
    },
  };
}

function normalizeRuntimeGate(input: unknown): any {
  const root = asRecord(input) ?? {};
  const mode = stringValue(root.mode) ?? "evolve";
  return {
    operation: "open_pull_request",
    mode,
    allowed: booleanValue(root.allowed) ?? true,
    mutatingLaneOpen: booleanValue(root.mutatingLaneOpen ?? root.mutating_lane_open) ?? true,
    mutating_lane_open: booleanValue(root.mutating_lane_open ?? root.mutatingLaneOpen) ?? true,
    killSwitchEngaged: booleanValue(root.killSwitchEngaged ?? root.kill_switch_engaged) ?? false,
    kill_switch_engaged: booleanValue(root.kill_switch_engaged ?? root.killSwitchEngaged) ?? false,
    cooldownUntil: root.cooldownUntil === null || root.cooldown_until === null ? null : stringValue(root.cooldownUntil ?? root.cooldown_until),
    cooldown_until: root.cooldown_until === null || root.cooldownUntil === null ? null : stringValue(root.cooldown_until ?? root.cooldownUntil),
    liveTransportAllowed: booleanValue(root.liveTransportAllowed ?? root.live_transport_allowed) ?? true,
    live_transport_allowed: booleanValue(root.live_transport_allowed ?? root.liveTransportAllowed) ?? true,
  };
}

function normalizeRateLimitGate(input: unknown): any {
  const root = asRecord(input) ?? {};
  return {
    writeLaneAvailable: booleanValue(root.writeLaneAvailable ?? root.write_lane_available) ?? true,
    write_lane_available: booleanValue(root.write_lane_available ?? root.writeLaneAvailable) ?? true,
    contentCreateAllowed: booleanValue(root.contentCreateAllowed ?? root.content_create_allowed) ?? true,
    content_create_allowed: booleanValue(root.content_create_allowed ?? root.contentCreateAllowed) ?? true,
    retryAfterSeconds: numberValue(root.retryAfterSeconds ?? root.retry_after_seconds),
    retry_after_seconds: numberValue(root.retry_after_seconds ?? root.retryAfterSeconds),
    minDelayMs: numberValue(root.minDelayMs ?? root.min_delay_ms) ?? 1200,
    min_delay_ms: numberValue(root.min_delay_ms ?? root.minDelayMs) ?? 1200,
    jitterMs: numberValue(root.jitterMs ?? root.jitter_ms) ?? 800,
    jitter_ms: numberValue(root.jitter_ms ?? root.jitterMs) ?? 800,
    liveTransportAllowed: booleanValue(root.liveTransportAllowed ?? root.live_transport_allowed) ?? true,
    live_transport_allowed: booleanValue(root.live_transport_allowed ?? root.liveTransportAllowed) ?? true,
  };
}

function selectDemoChangedPath(plan: JsonRecord): string {
  const mutable = stringArray(asRecord(plan.scope_contract)?.mutable_paths);
  if (mutable.some((path) => path === "docs/**" || path.startsWith("docs/"))) return "docs/ops/t028-e2e-forged-pr-demo.md";
  if (mutable.includes("README.md")) return "README.md";
  if (mutable.some((path) => path === "tests/**" || path.includes("test"))) return "tests/t028-demo.test.mjs";
  if (mutable.includes("package.json")) return "package.json";
  const first = mutable[0] ?? "docs/ops/t028-e2e-forged-pr-demo.md";
  if (first.endsWith("/**")) return `${first.slice(0, -3)}/t028-demo.txt`;
  if (first.includes("*")) return first.replace(/\*\*/g, "t028-demo").replace(/\*/g, "t028-demo");
  return first;
}

function buildDemoSandboxOutput(request: JsonRecord, changedPaths: readonly string[]): any {
  const artifacts = arrayValue(request.artifacts).map((value, index) => {
    const artifact = asRecord(value) ?? {};
    const path = stringValue(artifact.path) ?? `.forgeroot/artifacts/t028/artifact-${index + 1}.json`;
    return { path, bytes: Math.min(numberValue(artifact.max_bytes) ?? 1024, 256), media_type: stringValue(artifact.media_type) ?? "application/json", sha256: `sha256:${demoSha256LikeHex(path).slice(0, 64)}` };
  });
  return {
    command_ids: arrayValue(request.commands).map((value) => stringValue(asRecord(value)?.id)).filter((value): value is string => value !== null),
    changed_paths: [...changedPaths],
    diff_summary: { files_changed: changedPaths.length, lines_added: 10, lines_deleted: 1, total_lines_changed: 11 },
    artifacts,
    environment: { CI: "1", FORGE_SANDBOX: "1" },
  };
}

function buildDemoEvidence(plan: JsonRecord, sandboxOutput: JsonRecord, changedPaths: readonly string[]): any {
  const commandResults = arrayValue(plan.acceptance_criteria)
    .map(asRecord)
    .filter((criterion): criterion is JsonRecord => criterion !== null)
    .map((criterion) => asRecord(criterion.check))
    .filter((check): check is JsonRecord => check !== null && check.kind === "command" && typeof check.command === "string")
    .map((check) => ({ id: stableCommandId(String(check.command)), command: String(check.command), exit_code: numberValue(check.expected_exit_code) ?? 0, outcome: "passed" }));
  const diff = asRecord(sandboxOutput.diff_summary);
  return {
    changed_paths: [...changedPaths],
    files_changed: numberValue(diff?.files_changed) ?? changedPaths.length,
    diff_lines: numberValue(diff?.total_lines_changed) ?? 11,
    command_results: commandResults,
    text_evidence: { summary: "T028 deterministic demo evidence; no command was executed by the demo harness." },
  };
}

function stepsFor(chain: ForgeDemoResult["chain"]): readonly ForgeDemoStep[] {
  const steps: ForgeDemoStep[] = [];
  if (chain.planner !== undefined) steps.push({ name: "planner", status: stringValue(asRecord(chain.planner)?.status) ?? "unknown", produced: chain.plan ? "plan_spec" : null, id: stringValue(asRecord(chain.plan)?.plan_id) });
  if (chain.worktreeResult !== undefined) steps.push({ name: "worktree_manager", status: stringValue(asRecord(chain.worktreeResult)?.status) ?? "unknown", produced: chain.worktreePlan ? "branch_worktree_plan" : null, id: stringValue(asRecord(chain.worktreePlan)?.manifest_id) });
  if (chain.sandboxResult !== undefined) steps.push({ name: "sandbox_harness", status: stringValue(asRecord(chain.sandboxResult)?.status) ?? "unknown", produced: chain.sandboxRequest ? "sandbox_execution_request" : null, id: stringValue(asRecord(chain.sandboxRequest)?.request_id) });
  if (chain.auditResult !== undefined) steps.push({ name: "auditor", status: stringValue(asRecord(chain.auditResult)?.status) ?? "unknown", produced: chain.auditReport ? "audit_result" : null, id: stringValue(asRecord(chain.auditReport)?.audit_id) });
  if (chain.prComposerResult !== undefined) steps.push({ name: "pr_composer", status: stringValue(asRecord(chain.prComposerResult)?.status) ?? "unknown", produced: chain.prComposition ? "pull_request_composition" : null, id: stringValue(asRecord(chain.prComposition)?.composition_id) });
  if (chain.githubAdapterResult !== undefined) steps.push({ name: "github_pr_adapter", status: stringValue(asRecord(chain.githubAdapterResult)?.status) ?? "unknown", produced: chain.githubRequest ? "github_pull_request_creation_request" : null, id: stringValue(asRecord(chain.githubRequest)?.request_id) });
  if (chain.approvalCheckpointResult !== undefined) steps.push({ name: "approval_checkpoint", status: stringValue(asRecord(chain.approvalCheckpointResult)?.status) ?? "unknown", produced: chain.transportAuthorization ? "trusted_transport_authorization" : null, id: stringValue(asRecord(chain.transportAuthorization)?.authorization_id) });
  if (chain.rateGovernorResult !== undefined) steps.push({ name: "rate_governor", status: stringValue(asRecord(chain.rateGovernorResult)?.status) ?? "unknown", produced: chain.rateGovernorDispatch ? "rate_governor_dispatch" : null, id: stringValue(asRecord(chain.rateGovernorDispatch)?.dispatch_id) });
  return steps;
}

function summaryFor(chain: ForgeDemoResult["chain"]): ForgeDemoResult["summary"] {
  const plan = asRecord(chain.plan);
  const source = asRecord(plan?.source);
  const worktree = asRecord(chain.worktreePlan);
  const sandbox = asRecord(chain.sandboxRequest);
  const audit = asRecord(chain.auditReport);
  const composition = asRecord(chain.prComposition);
  const pr = asRecord(composition?.pull_request);
  const review = asRecord(composition?.review);
  const request = asRecord(chain.githubRequest);
  const authorization = asRecord(chain.transportAuthorization);
  const dispatch = asRecord(chain.rateGovernorDispatch);
  return {
    source_issue: sourceIssueRef(source),
    repository: stringValue(source?.repository) ?? stringValue(asRecord(request?.repository)?.full_name),
    plan_id: stringValue(plan?.plan_id),
    worktree_manifest_id: stringValue(worktree?.manifest_id),
    sandbox_request_id: stringValue(sandbox?.request_id),
    audit_id: stringValue(audit?.audit_id),
    composition_id: stringValue(composition?.composition_id),
    github_request_id: stringValue(request?.request_id),
    authorization_id: stringValue(authorization?.authorization_id),
    dispatch_id: stringValue(dispatch?.dispatch_id),
    pr_title: stringValue(pr?.title),
    head: stringValue(pr?.head),
    base: stringValue(pr?.base),
    approval_class: stringValue(review?.approval_class) ?? stringValue(asRecord(request?.review_gate)?.approval_class),
    risk: stringValue(review?.risk) ?? stringValue(asRecord(request?.review_gate)?.risk),
    rate_governor_status: stringValue(dispatch?.status),
  };
}

function mergeValidation(path: string, validation: unknown, issues: ForgeDemoValidationIssue[]): void {
  const root = asRecord(validation);
  if (root?.ok === true) return;
  for (const item of arrayValue(root?.issues)) {
    const record = asRecord(item);
    issues.push(issue(`${path}${stringValue(record?.path) ?? ""}`, stringValue(record?.code) ?? "invalid", stringValue(record?.message) ?? "upstream validation failed"));
  }
  if (!arrayValue(root?.issues).length) issues.push(issue(path, "invalid", "upstream validation failed"));
}

function sourceIssueRef(source: JsonRecord | null): string | null {
  if (source === null) return null;
  const url = stringValue(source.url);
  if (url !== null) return url;
  const repository = stringValue(source.repository);
  const number = numberValue(source.issue_number);
  if (repository !== null && number !== null) return `${repository}#${number}`;
  return null;
}

function formatUpstreamIssues(value: unknown): readonly string[] {
  return arrayValue(value).map((item) => {
    const record = asRecord(item);
    return `${stringValue(record?.path) ?? "/"}:${stringValue(record?.code) ?? "invalid"}`;
  });
}

function bodyIncludes(body: string | null, needles: readonly string[]): boolean {
  if (body === null) return false;
  return needles.every((needle) => body.includes(needle));
}

function expectLiteral(record: JsonRecord, key: string, expected: unknown, issues: ForgeDemoValidationIssue[], path: string): void {
  if (record[key] !== expected) issues.push(issue(`${path}/${key}`, "literal", `${key} must equal ${JSON.stringify(expected)}`));
}
function expectString(record: JsonRecord, key: string, issues: ForgeDemoValidationIssue[], path: string, prefix?: string): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) { issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`)); return null; }
  if (prefix !== undefined && !value.startsWith(prefix)) issues.push(issue(`${path}/${key}`, "prefix", `${key} must start with ${prefix}`));
  return value;
}
function expectRfc3339(record: JsonRecord, key: string, issues: ForgeDemoValidationIssue[], path: string): void {
  const value = expectString(record, key, issues, path);
  if (value !== null && !RFC3339_UTC.test(value)) issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be RFC3339 UTC`));
}
function expectOneOf(record: JsonRecord, key: string, allowed: ReadonlySet<string>, issues: ForgeDemoValidationIssue[], path: string): string | null {
  const value = expectString(record, key, issues, path);
  if (value !== null && !allowed.has(value)) issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`));
  return value;
}
function issue(path: string, code: string, message: string): ForgeDemoValidationIssue { return { path, code, message }; }
function formatIssue(item: ForgeDemoValidationIssue): string { return `${item.path}:${item.code}:${item.message}`; }
function uniqueIssues(values: readonly ForgeDemoValidationIssue[]): readonly ForgeDemoValidationIssue[] { const seen = new Set<string>(); const out: ForgeDemoValidationIssue[] = []; for (const item of values) { const key = `${item.path}\0${item.code}\0${item.message}`; if (!seen.has(key)) { seen.add(key); out.push(item); } } return out; }
function uniqueStrings(values: readonly string[]): readonly string[] { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function allEqual(values: readonly (string | null)[]): boolean { const nonNull = values.filter((value): value is string => value !== null); return nonNull.length === values.length && nonNull.every((value) => value === nonNull[0]); }
function resolveTimestamp(candidate: string | undefined, fallback: string): string | null { const value = candidate ?? fallback; return RFC3339_UTC.test(value) ? value : null; }
function demoSha256LikeHex(value: string): string {
  const chunks: string[] = [];
  for (let index = 0; index < 8; index += 1) chunks.push(fnvHex(String(index) + ":" + value));
  return chunks.join("").slice(0, 64);
}
function shortHash(value: string): string { return demoSha256LikeHex(value).slice(0, 12); }
function fnvHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
function stableCommandId(command: string): string { return command.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64); }
function asRecord(value: unknown): JsonRecord | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonRecord : null; }
function arrayValue(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : []; }
function stringValue(value: unknown): string | null { return typeof value === "string" && value.length > 0 ? value : null; }
function numberValue(value: unknown): number | null { return Number.isSafeInteger(value) ? value as number : null; }
function booleanValue(value: unknown): boolean | null { return typeof value === "boolean" ? value : null; }
function stringArray(value: unknown): readonly string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.length > 0) : []; }

type JsonRecord = Record<string, unknown>;
