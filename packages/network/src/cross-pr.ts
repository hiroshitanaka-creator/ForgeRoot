import { LINEAGE_PACK_SCHEMA_REF, validateLineagePack } from "./lineage-pack.js";
import type { LineagePackResult } from "./lineage-pack.js";

export const CROSS_REPO_PR_VERSION = 1 as const;
export const CROSS_REPO_PR_SCHEMA_REF = "urn:forgeroot:cross-repo-pr-composition:v1" as const;

export interface CrossRepoPrIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface PeerPolicyInput {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: "active" | "quarantined" | "revoked";
  readonly allowed_actions: readonly string[];
  readonly allowed_paths: readonly string[];
}

export interface CrossRepoProposalInput {
  readonly title: string;
  readonly summary: string;
  readonly head_branch: string;
  readonly base_branch: string;
  readonly changed_paths: readonly string[];
  readonly risk: "low" | "medium" | "high" | "critical";
  readonly rollback: string;
  readonly labels?: readonly string[];
}

export interface CrossRepoPrInput {
  readonly now?: string;
  readonly lineage_pack: LineagePackResult;
  readonly peer: PeerPolicyInput;
  readonly proposal: CrossRepoProposalInput;
}

export interface CrossRepoPrResult {
  readonly manifest_version: typeof CROSS_REPO_PR_VERSION;
  readonly schema_ref: typeof CROSS_REPO_PR_SCHEMA_REF;
  readonly composition_id: string;
  readonly created_at: string;
  readonly status: "cross_repo_pr_ready" | "blocked" | "invalid";
  readonly decision: "cross_repo_pr_ready" | "cross_repo_pr_blocked" | "invalid_cross_repo_pr_input";
  readonly reasons: readonly string[];
  readonly peer_ref: {
    readonly peer_id: string;
    readonly repository_full_name: string;
    readonly status: string;
  };
  readonly lineage_pack_ref: {
    readonly lineage_pack_id: string;
    readonly lineage_pack_digest: string;
    readonly lineage_pack_status: string;
    readonly treaty_id: string;
    readonly source_peer_id: string;
    readonly target_peer_id: string;
  };
  readonly allowed_path_summary: {
    readonly allowed_paths: readonly string[];
    readonly changed_paths: readonly string[];
    readonly all_paths_allowed: boolean;
  };
  readonly pull_request: {
    readonly target_repository: string;
    readonly title: string;
    readonly head: string;
    readonly base: string;
    readonly draft: true;
    readonly maintainer_can_modify: false;
    readonly body: string;
    readonly labels: readonly string[];
  };
  readonly review_gate: {
    readonly approval_class: "C";
    readonly risk: "low" | "medium" | "high" | "critical";
    readonly human_review_required_before_merge: true;
    readonly merge_gate: "human_review_required";
  };
  readonly evidence: {
    readonly treaty: string;
    readonly lineage: string;
    readonly risk: string;
    readonly rollback: string;
  };
  readonly guards: {
    readonly t061_ready_lineage_pack_required: true;
    readonly treaty_evidence_required: true;
    readonly lineage_evidence_required: true;
    readonly rollback_required: true;
    readonly no_github_api_call: true;
    readonly no_pull_request_creation: true;
    readonly no_fork_creation: true;
    readonly no_merge_operation: true;
    readonly no_auto_approval: true;
    readonly no_treaty_creation: true;
    readonly no_open_federation: true;
  };
  readonly dry_run: {
    readonly github_api_called: false;
    readonly pull_request_created: false;
    readonly fork_created: false;
    readonly merge_performed: false;
    readonly approval_submitted: false;
    readonly treaty_created: false;
    readonly network_transport_performed: false;
  };
  readonly composition_digest: string;
  readonly issues?: readonly CrossRepoPrIssue[];
}

export interface CrossRepoPrValidation {
  readonly ok: boolean;
  readonly issues: readonly CrossRepoPrIssue[];
}

export const CROSS_REPO_PR_CONTRACT = {
  consumes: ["t061_lineage_pack", "peer_policy", "proposal_summary"],
  produces: ["cross_repo_pr_composition_manifest"],
  validates: ["t061_read_back", "peer_allowed_action", "allowed_paths", "required_body_sections", "no_live_transport"],
  forbids: ["github_api_call", "pull_request_creation", "fork_creation", "merge_operation", "auto_approval", "treaty_creation", "open_federation"],
  deterministic: true,
  composerOnly: true,
  manifestOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-06T00:00:00Z";
const ACTION_CROSS_REPO_PR = "cross_repo_pr";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const PEER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const BRANCH = /^[A-Za-z0-9._/-]+$/;
const RISKS = new Set(["low", "medium", "high", "critical"]);
const BODY_SECTIONS = ["## Treaty evidence", "## Lineage evidence", "## Risk", "## Rollback"];

export function composeCrossRepoPr(input: unknown): CrossRepoPrResult {
  const normalized = normalizeInput(input);
  const createdAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [makeIssue("now", "invalid_timestamp", "now must be RFC3339 UTC")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, normalized.fallback, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "input must be an object")]);

  const lineageValidation = validateLineagePack(normalized.input.lineage_pack);
  if (!lineageValidation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, normalized.input, [
    makeIssue("lineage_pack", "invalid_t061_lineage_pack", "lineage_pack must pass T061 read-back validation"),
    ...lineageValidation.issues.map((entry) => makeIssue(`lineage_pack.${entry.path}`, entry.code, entry.message)),
  ]);

  const boundaryIssues = validateBoundary(normalized.input);
  if (boundaryIssues.length > 0) return blockedResult(createdAt ?? DEFAULT_NOW, normalized.input, boundaryIssues);

  const result = resultFor(createdAt ?? DEFAULT_NOW, normalized.input, "cross_repo_pr_ready", ["t061_lineage_pack_ready", "peer_cross_repo_pr_allowed", "required_body_sections_present"]);
  const validation = validateCrossRepoPr(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, normalized.input, validation.issues);
  return result;
}

export function validateCrossRepoPr(value: unknown): CrossRepoPrValidation {
  const issues: CrossRepoPrIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [makeIssue("result", "result_must_be_object", "cross-repo PR result must be an object")] };
  validateTopLevel(value, issues);
  validatePeerRef(value.peer_ref, "peer_ref", issues);
  validateLineageRef(value.lineage_pack_ref, "lineage_pack_ref", issues);
  validatePathSummary(value.allowed_path_summary, "allowed_path_summary", issues);
  validatePullRequest(value.pull_request, "pull_request", issues);
  validateReviewGate(value.review_gate, "review_gate", issues);
  validateEvidence(value.evidence, "evidence", issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value, issues);
  validateNoSecretMaterial(value, "result", issues);

  if (value.status === "cross_repo_pr_ready") validateReadyCrossFields(value, issues);

  const expectedDigest = canonicalDigest(compositionDigestPayload(value as unknown as CrossRepoPrResult));
  if (typeof value.composition_digest !== "string" || value.composition_digest !== expectedDigest) issue(issues, "composition_digest", "digest_mismatch", "composition_digest must cover payload");
  if (typeof value.composition_id !== "string" || value.composition_id !== stableId("cross-repo-pr", [expectedDigest])) issue(issues, "composition_id", "id_mismatch", "composition_id must match payload");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(input: unknown): { input: CrossRepoPrInput | null; now?: string; fallback: CrossRepoPrInput; issues: readonly CrossRepoPrIssue[] } {
  const fallback = emptyInput();
  const issues: CrossRepoPrIssue[] = [];
  if (!isRecord(input)) return { input: null, fallback, issues: [makeIssue("input", "input_must_be_object", "input must be an object")] };
  const lineagePack = isRecord(input.lineage_pack) ? input.lineage_pack as unknown as LineagePackResult : fallback.lineage_pack;
  if (!isRecord(input.lineage_pack)) issue(issues, "lineage_pack", "lineage_pack_must_be_object", "lineage_pack must be a T061 result object");
  const peer = normalizePeerPolicy(input.peer, "peer", issues);
  const proposal = normalizeProposal(input.proposal, "proposal", issues);
  const now = optionalString(input.now, "now", issues);
  return { input: { lineage_pack: lineagePack, peer, proposal, ...(now === undefined ? {} : { now }) }, now, fallback: { lineage_pack: lineagePack, peer, proposal }, issues };
}

function validateBoundary(input: CrossRepoPrInput): readonly CrossRepoPrIssue[] {
  const issues: CrossRepoPrIssue[] = [];
  const lineage = input.lineage_pack;
  if (lineage.status !== "lineage_pack_ready") issue(issues, "lineage_pack.status", "t061_lineage_pack_not_ready", "cross-repo PR composition requires a ready T061 lineage pack");
  if (input.peer.status !== "active") issue(issues, "peer.status", "peer_not_active", "peer must be active");
  if (!input.peer.allowed_actions.includes(ACTION_CROSS_REPO_PR)) issue(issues, "peer.allowed_actions", "cross_repo_pr_action_not_allowed", "peer policy must allow cross_repo_pr");
  if (lineage.target_peer.peer_id !== input.peer.peer_id) issue(issues, "peer.peer_id", "target_peer_mismatch", "peer must match the T061 target peer");
  if (lineage.target_peer.repository_full_name !== input.peer.repository_full_name) issue(issues, "peer.repository_full_name", "target_repository_mismatch", "peer repository must match the T061 target repository");
  for (const [index, path] of input.proposal.changed_paths.entries()) {
    if (!isAllowedPath(path, input.peer.allowed_paths)) issue(issues, `proposal.changed_paths[${index}]`, "path_not_allowed", "changed path must be within peer allowed_paths");
  }
  return issues;
}

function resultFor(createdAt: string, input: CrossRepoPrInput, status: "cross_repo_pr_ready" | "blocked", reasons: readonly string[]): CrossRepoPrResult {
  const body = bodyFor(input);
  const draft: Omit<CrossRepoPrResult, "composition_id" | "composition_digest"> = {
    manifest_version: CROSS_REPO_PR_VERSION,
    schema_ref: CROSS_REPO_PR_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "cross_repo_pr_ready" ? "cross_repo_pr_ready" : "cross_repo_pr_blocked",
    reasons,
    peer_ref: peerRef(input.peer),
    lineage_pack_ref: lineageRef(input.lineage_pack),
    allowed_path_summary: {
      allowed_paths: input.peer.allowed_paths,
      changed_paths: input.proposal.changed_paths,
      all_paths_allowed: input.proposal.changed_paths.every((path) => isAllowedPath(path, input.peer.allowed_paths)),
    },
    pull_request: {
      target_repository: input.peer.repository_full_name,
      title: titleFor(input.proposal.title),
      head: input.proposal.head_branch,
      base: input.proposal.base_branch,
      draft: true,
      maintainer_can_modify: false,
      body,
      labels: labelsFor(input),
    },
    review_gate: {
      approval_class: "C",
      risk: input.proposal.risk,
      human_review_required_before_merge: true,
      merge_gate: "human_review_required",
    },
    evidence: {
      treaty: `treaty:${input.lineage_pack.treaty_ref.treaty_id}`,
      lineage: `lineage_pack:${input.lineage_pack.lineage_pack_id}`,
      risk: input.proposal.risk,
      rollback: input.proposal.rollback,
    },
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(compositionDigestPayload(draft));
  return { ...draft, composition_id: stableId("cross-repo-pr", [digest]), composition_digest: digest };
}

function blockedResult(createdAt: string, input: CrossRepoPrInput, issues: readonly CrossRepoPrIssue[]): CrossRepoPrResult {
  const draft = resultFor(createdAt, input, "blocked", uniqueStrings(["cross_repo_pr_blocked", ...issues.map((entry) => entry.code)]));
  const digest = canonicalDigest(compositionDigestPayload(draft));
  return { ...draft, composition_id: stableId("cross-repo-pr", [digest]), composition_digest: digest };
}

function invalidResult(createdAt: string, input: CrossRepoPrInput, issues: readonly CrossRepoPrIssue[]): CrossRepoPrResult {
  const safe = emptyInput();
  const draft = {
    ...resultFor(createdAt, safe, "blocked", ["invalid_cross_repo_pr_input"]),
    status: "invalid" as const,
    decision: "invalid_cross_repo_pr_input" as const,
    reasons: uniqueStrings(["invalid_cross_repo_pr_input", ...issues.map((entry) => entry.code)]),
    issues,
  };
  const digest = canonicalDigest(compositionDigestPayload(draft));
  return { ...draft, composition_id: stableId("cross-repo-pr", [digest]), composition_digest: digest };
}

function validateTopLevel(value: Record<string, unknown>, issues: CrossRepoPrIssue[]): void {
  if (value.manifest_version !== CROSS_REPO_PR_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== CROSS_REPO_PR_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T062 cross-repo PR composition v1");
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (value.status !== "cross_repo_pr_ready" && value.status !== "blocked" && value.status !== "invalid") issue(issues, "status", "invalid_status", "status must be cross_repo_pr_ready, blocked, or invalid");
  if (value.decision !== "cross_repo_pr_ready" && value.decision !== "cross_repo_pr_blocked" && value.decision !== "invalid_cross_repo_pr_input") issue(issues, "decision", "invalid_decision", "decision must be a T062 decision");
  if (!Array.isArray(value.reasons) || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
}

function validatePeerRef(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "peer_ref_required", "peer_ref must be present"); return; }
  if (typeof value.peer_id !== "string" || !PEER_ID.test(value.peer_id)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (typeof value.repository_full_name !== "string" || !REPOSITORY.test(value.repository_full_name)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  if (value.status !== "active" && value.status !== "quarantined" && value.status !== "revoked") issue(issues, `${path}.status`, "invalid_peer_status", "peer status must be active, quarantined, or revoked");
}

function validateLineageRef(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "lineage_ref_required", "lineage pack ref must be present"); return; }
  if (typeof value.lineage_pack_id !== "string" || !ID.test(value.lineage_pack_id)) issue(issues, `${path}.lineage_pack_id`, "invalid_lineage_pack_id", "lineage_pack_id must be deterministic");
  if (typeof value.lineage_pack_digest !== "string" || !HASH.test(value.lineage_pack_digest)) issue(issues, `${path}.lineage_pack_digest`, "invalid_lineage_pack_digest", "lineage pack digest must be stable");
  if (typeof value.lineage_pack_status !== "string" || value.lineage_pack_status.length === 0) issue(issues, `${path}.lineage_pack_status`, "invalid_lineage_pack_status", "lineage pack status is required");
  if (typeof value.treaty_id !== "string" || value.treaty_id.length === 0) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id is required");
  if (typeof value.source_peer_id !== "string" || !PEER_ID.test(value.source_peer_id)) issue(issues, `${path}.source_peer_id`, "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (typeof value.target_peer_id !== "string" || !PEER_ID.test(value.target_peer_id)) issue(issues, `${path}.target_peer_id`, "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
}

function validatePathSummary(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "path_summary_required", "allowed path summary must be present"); return; }
  const allowed = validatePathArray(value.allowed_paths, `${path}.allowed_paths`, issues);
  const changed = validatePathArray(value.changed_paths, `${path}.changed_paths`, issues);
  if (typeof value.all_paths_allowed !== "boolean") issue(issues, `${path}.all_paths_allowed`, "invalid_all_paths_allowed", "all_paths_allowed must be boolean");
  if (value.all_paths_allowed !== changed.every((entry) => isAllowedPath(entry, allowed))) issue(issues, `${path}.all_paths_allowed`, "all_paths_allowed_mismatch", "all_paths_allowed must match changed paths and allowed paths");
}

function validatePullRequest(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "pull_request_required", "pull_request must be present"); return; }
  if (typeof value.target_repository !== "string" || !REPOSITORY.test(value.target_repository)) issue(issues, `${path}.target_repository`, "invalid_target_repository", "target repository must be owner/repo");
  if (typeof value.title !== "string" || value.title.trim().length === 0 || value.title.length > 120) issue(issues, `${path}.title`, "invalid_title", "title must be non-empty and <= 120 chars");
  if (typeof value.head !== "string" || !isSafeBranch(value.head) || isDefaultBranch(value.head)) issue(issues, `${path}.head`, "invalid_head_branch", "head must be a safe non-default branch");
  if (typeof value.base !== "string" || !isSafeBranch(value.base)) issue(issues, `${path}.base`, "invalid_base_branch", "base must be a safe branch");
  if (value.draft !== true) issue(issues, `${path}.draft`, "draft_required", "cross-repo compositions must be draft");
  if (value.maintainer_can_modify !== false) issue(issues, `${path}.maintainer_can_modify`, "maintainer_modify_forbidden", "maintainer_can_modify must be false");
  if (typeof value.body !== "string" || value.body.trim().length === 0) issue(issues, `${path}.body`, "body_required", "body is required");
  else for (const section of BODY_SECTIONS) if (!value.body.includes(section)) issue(issues, `${path}.body`, "required_body_section_missing", `body must include ${section}`);
  validateStringArray(value.labels, `${path}.labels`, issues, true);
}

function validateReviewGate(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "review_gate_required", "review_gate must be present"); return; }
  if (value.approval_class !== "C") issue(issues, `${path}.approval_class`, "class_c_required", "cross-repo PRs require Class C review");
  if (typeof value.risk !== "string" || !RISKS.has(value.risk)) issue(issues, `${path}.risk`, "invalid_risk", "risk must be known");
  if (value.human_review_required_before_merge !== true) issue(issues, `${path}.human_review_required_before_merge`, "human_review_required", "human review is required before merge");
  if (value.merge_gate !== "human_review_required") issue(issues, `${path}.merge_gate`, "merge_gate_required", "merge gate must require human review");
}

function validateEvidence(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "evidence_required", "evidence must be present"); return; }
  for (const key of ["treaty", "lineage", "risk", "rollback"]) {
    if (typeof value[key] !== "string" || value[key].trim().length === 0) issue(issues, `${path}.${key}`, "evidence_required", `${key} evidence is required`);
  }
}

function validateReadyCrossFields(value: Record<string, unknown>, issues: CrossRepoPrIssue[]): void {
  if (isRecord(value.peer_ref) && value.peer_ref.status !== "active") issue(issues, "peer_ref.status", "ready_peer_must_be_active", "ready composition requires active peer");
  if (isRecord(value.lineage_pack_ref) && value.lineage_pack_ref.lineage_pack_status !== "lineage_pack_ready") issue(issues, "lineage_pack_ref.lineage_pack_status", "ready_lineage_pack_required", "ready composition requires ready T061 pack");
  if (isRecord(value.allowed_path_summary) && value.allowed_path_summary.all_paths_allowed !== true) issue(issues, "allowed_path_summary.all_paths_allowed", "ready_paths_must_be_allowed", "ready composition requires all changed paths to be allowed");
  if (isRecord(value.pull_request) && isRecord(value.peer_ref) && value.pull_request.target_repository !== value.peer_ref.repository_full_name) issue(issues, "pull_request.target_repository", "target_repository_mismatch", "pull request target must match peer repository");
  if (isRecord(value.evidence) && isRecord(value.lineage_pack_ref)) {
    if (value.evidence.treaty !== `treaty:${value.lineage_pack_ref.treaty_id}`) issue(issues, "evidence.treaty", "treaty_evidence_mismatch", "treaty evidence must match lineage pack treaty");
    if (value.evidence.lineage !== `lineage_pack:${value.lineage_pack_ref.lineage_pack_id}`) issue(issues, "evidence.lineage", "lineage_evidence_mismatch", "lineage evidence must match lineage pack id");
  }
  if (isRecord(value.evidence) && isRecord(value.review_gate) && value.evidence.risk !== value.review_gate.risk) issue(issues, "evidence.risk", "risk_evidence_mismatch", "risk evidence must match review gate risk");
  if (isRecord(value.pull_request) && typeof value.pull_request.body === "string" && isRecord(value.evidence) && isRecord(value.lineage_pack_ref)) {
    if (!value.pull_request.body.includes(String(value.lineage_pack_ref.treaty_id))) issue(issues, "pull_request.body", "body_treaty_evidence_missing", "body must include treaty evidence value");
    if (!value.pull_request.body.includes(String(value.lineage_pack_ref.lineage_pack_id))) issue(issues, "pull_request.body", "body_lineage_evidence_missing", "body must include lineage pack id");
    if (!value.pull_request.body.includes(String(value.evidence.risk))) issue(issues, "pull_request.body", "body_risk_evidence_missing", "body must include risk evidence value");
    if (!value.pull_request.body.includes(String(value.evidence.rollback))) issue(issues, "pull_request.body", "body_rollback_evidence_missing", "body must include rollback evidence value");
  }
}

function validateGuards(value: unknown, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: CrossRepoPrIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(value: Record<string, unknown>, issues: CrossRepoPrIssue[]): void {
  if (value.status === "cross_repo_pr_ready" && value.decision !== "cross_repo_pr_ready") issue(issues, "decision", "ready_decision_mismatch", "ready compositions must use cross_repo_pr_ready");
  if (value.status === "blocked" && value.decision !== "cross_repo_pr_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked compositions must use cross_repo_pr_blocked");
  if (value.status === "invalid" && value.decision !== "invalid_cross_repo_pr_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid compositions must use invalid_cross_repo_pr_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid compositions must carry issues");
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid compositions must not carry issues");
  }
}

function normalizePeerPolicy(value: unknown, path: string, issues: CrossRepoPrIssue[]): PeerPolicyInput {
  if (!isRecord(value)) {
    issue(issues, path, "peer_must_be_object", "peer must be an object");
    return emptyInput().peer;
  }
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const repository = stringField(value.repository_full_name, `${path}.repository_full_name`, issues);
  const status = value.status === "active" || value.status === "quarantined" || value.status === "revoked" ? value.status : "revoked";
  if (value.status !== status) issue(issues, `${path}.status`, "invalid_peer_status", "peer status must be active, quarantined, or revoked");
  if (peerId.length > 0 && !PEER_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (repository.length > 0 && !REPOSITORY.test(repository)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  const actions = normalizeStringArray(value.allowed_actions, `${path}.allowed_actions`, issues);
  actions.forEach((entry, index) => { if (entry !== ACTION_CROSS_REPO_PR) issue(issues, `${path}.allowed_actions[${index}]`, "invalid_allowed_action", "T062 only accepts cross_repo_pr as a peer action"); });
  const paths = normalizePathArray(value.allowed_paths, `${path}.allowed_paths`, issues);
  return { peer_id: peerId, repository_full_name: repository, status, allowed_actions: actions, allowed_paths: paths };
}

function normalizeProposal(value: unknown, path: string, issues: CrossRepoPrIssue[]): CrossRepoProposalInput {
  if (!isRecord(value)) {
    issue(issues, path, "proposal_must_be_object", "proposal must be an object");
    return emptyInput().proposal;
  }
  const title = stringField(value.title, `${path}.title`, issues);
  const summary = stringField(value.summary, `${path}.summary`, issues);
  const head = stringField(value.head_branch, `${path}.head_branch`, issues);
  const base = stringField(value.base_branch, `${path}.base_branch`, issues);
  if (head.length > 0 && (!isSafeBranch(head) || isDefaultBranch(head))) issue(issues, `${path}.head_branch`, "invalid_head_branch", "head branch must be safe and non-default");
  if (base.length > 0 && !isSafeBranch(base)) issue(issues, `${path}.base_branch`, "invalid_base_branch", "base branch must be safe");
  const changedPaths = normalizePathArray(value.changed_paths, `${path}.changed_paths`, issues);
  const risk = typeof value.risk === "string" && RISKS.has(value.risk) ? value.risk as CrossRepoProposalInput["risk"] : "critical";
  if (value.risk !== risk) issue(issues, `${path}.risk`, "invalid_risk", "risk must be low, medium, high, or critical");
  const rollback = stringField(value.rollback, `${path}.rollback`, issues);
  const labels = value.labels === undefined ? [] : validateStringArray(value.labels, `${path}.labels`, issues, true);
  return { title, summary, head_branch: head, base_branch: base, changed_paths: changedPaths, risk, rollback, labels };
}

function bodyFor(input: CrossRepoPrInput): string {
  const lines = [
    "## Cross-repo Forge proposal",
    "",
    "This is a deterministic cross-repo PR composition manifest. It did not call GitHub, create a pull request, create a fork, approve, merge, create a treaty, or perform network transport.",
    "",
    "## Treaty evidence",
    `- Treaty: ${input.lineage_pack.treaty_ref.treaty_id}`,
    `- Source peer: ${input.lineage_pack.treaty_ref.source_peer_id}`,
    `- Target peer: ${input.lineage_pack.treaty_ref.target_peer_id}`,
    "",
    "## Lineage evidence",
    `- Lineage pack: ${input.lineage_pack.lineage_pack_id}`,
    `- Lineage digest: ${input.lineage_pack.lineage_pack_digest}`,
    `- Records: ${input.lineage_pack.records.length}`,
    "",
    "## Risk",
    `- Risk: ${input.proposal.risk}`,
    "- Approval class: C",
    "- Human review before merge: true",
    "",
    "## Rollback",
    `- ${input.proposal.rollback}`,
    "",
    "## Allowed paths",
    ...markdownList(input.proposal.changed_paths),
  ];
  return `${lines.join("\n")}\n`;
}

function titleFor(value: string): string {
  const title = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
  const prefixed = title.startsWith("[ForgeNet]") ? title : `[ForgeNet] ${title}`;
  return prefixed.slice(0, 120);
}

function labelsFor(input: CrossRepoPrInput): readonly string[] {
  return uniqueStrings(["forge:cross-repo", "forge:plan", "phase:P4", "class:C", `risk:${input.proposal.risk}`, ...input.proposal.labels])
    .filter((entry) => entry.length <= 64);
}

function peerRef(peer: PeerPolicyInput): CrossRepoPrResult["peer_ref"] {
  return { peer_id: peer.peer_id, repository_full_name: peer.repository_full_name, status: peer.status };
}

function lineageRef(pack: LineagePackResult): CrossRepoPrResult["lineage_pack_ref"] {
  return {
    lineage_pack_id: pack.lineage_pack_id,
    lineage_pack_digest: pack.lineage_pack_digest,
    lineage_pack_status: pack.status,
    treaty_id: pack.treaty_ref.treaty_id,
    source_peer_id: pack.treaty_ref.source_peer_id,
    target_peer_id: pack.treaty_ref.target_peer_id,
  };
}

function guards(): CrossRepoPrResult["guards"] {
  return {
    t061_ready_lineage_pack_required: true,
    treaty_evidence_required: true,
    lineage_evidence_required: true,
    rollback_required: true,
    no_github_api_call: true,
    no_pull_request_creation: true,
    no_fork_creation: true,
    no_merge_operation: true,
    no_auto_approval: true,
    no_treaty_creation: true,
    no_open_federation: true,
  };
}

function dryRun(): CrossRepoPrResult["dry_run"] {
  return {
    github_api_called: false,
    pull_request_created: false,
    fork_created: false,
    merge_performed: false,
    approval_submitted: false,
    treaty_created: false,
    network_transport_performed: false,
  };
}

function emptyInput(): CrossRepoPrInput {
  const emptyLineage = {
    manifest_version: 1,
    schema_ref: LINEAGE_PACK_SCHEMA_REF,
    lineage_pack_id: "lineage-pack-00000000",
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_lineage_pack_input",
    reasons: ["empty"],
    treaty_ref: { treaty_id: "empty-treaty", treaty_status: "revoked", source_peer_id: "source-peer", target_peer_id: "target-peer" },
    treaty_scope: { allowed_actions: ["lineage_export", "lineage_import_candidate"], allowed_lineage_roots: ["forge-lineage://empty/root"], allowed_record_kinds: ["lineage_handoff"], expires_at: null },
    source_peer: { peer_id: "source-peer", repository_full_name: "owner/source", status: "revoked" },
    target_peer: { peer_id: "target-peer", repository_full_name: "owner/target", status: "revoked" },
    archive_pack_ref: { schema_ref: "urn:forgeroot:archive-pack:v1", pack_id: "forge-archive-pack://empty", raw_sha256: `sha256:${"0".repeat(64)}`, compressed_sha256: `sha256:${"0".repeat(64)}`, record_count: 1 },
    records: [],
    export_payload_digest: "sha-fnv1a-00000000",
    signature_ref: { algorithm: "sha256-ref", signer_peer_id: "source-peer", signed_payload_digest: "sha-fnv1a-00000000", signature_digest: `sig-sha256:${"0".repeat(64)}` },
    import_candidate: { candidate_id: "lineage-import-candidate-00000000", registration_status: "invalid", adoption_performed: false, quarantine_required: true, reason: "empty" },
    guards: { treaty_scope_enforced: true, deterministic_ordering: true, archive_hash_ref_required: true, signature_ref_required: true, no_network_transport: true, no_automatic_adoption: true, no_file_write: true, no_github_api_call: true, no_git_push: true },
    dry_run: { network_transport_performed: false, adoption_performed: false, file_written: false, github_api_called: false, git_push_performed: false },
    lineage_pack_digest: "sha-fnv1a-00000000",
    issues: [makeIssue("empty", "empty", "empty")],
  } as unknown as LineagePackResult;
  return {
    lineage_pack: emptyLineage,
    peer: { peer_id: "target-peer", repository_full_name: "owner/target", status: "revoked", allowed_actions: [ACTION_CROSS_REPO_PR], allowed_paths: ["docs/"] },
    proposal: { title: "empty", summary: "empty", head_branch: "forge/empty", base_branch: "main", changed_paths: ["docs/empty.md"], risk: "critical", rollback: "Close the draft and discard the manifest.", labels: [] },
  };
}

function validatePathArray(value: unknown, path: string, issues: CrossRepoPrIssue[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    issue(issues, path, "non_empty_path_array_required", `${path} must be a non-empty array`);
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || !isSafePath(entry)) {
      issue(issues, `${path}[${index}]`, "invalid_path", "path must be a safe relative path");
      return;
    }
    if (seen.has(entry)) issue(issues, `${path}[${index}]`, "duplicate_path", "paths must be unique");
    seen.add(entry);
    out.push(entry);
  });
  return out;
}

function normalizePathArray(value: unknown, path: string, issues: CrossRepoPrIssue[]): readonly string[] {
  const values = validatePathArray(value, path, issues);
  return [...new Set(values)].sort();
}

function validateStringArray(value: unknown, path: string, issues: CrossRepoPrIssue[], allowEmpty: boolean): readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "string_array_required", `${path} must be an array`);
    return [];
  }
  if (!allowEmpty && value.length === 0) issue(issues, path, "non_empty_array_required", `${path} must not be empty`);
  const strings = value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
  if (strings.length !== value.length) issue(issues, path, "string_array_required", `${path} must contain only non-empty strings`);
  return strings;
}

function normalizeStringArray(value: unknown, path: string, issues: CrossRepoPrIssue[]): readonly string[] {
  return [...new Set(validateStringArray(value, path, issues, false).map((entry) => entry.trim()).sort())];
}

function isAllowedPath(path: string, allowed: readonly string[]): boolean {
  return isSafePath(path) && allowed.some((prefix) => path === prefix || (prefix.endsWith("/") ? path.startsWith(prefix) : path.startsWith(`${prefix}/`)));
}

function isSafePath(value: string): boolean {
  return /^[A-Za-z0-9._/-]+$/.test(value) && !value.startsWith("/") && !value.includes("..") && !value.includes("//") && !value.startsWith(".git/") && value.length <= 256;
}

function isSafeBranch(value: string): boolean {
  return BRANCH.test(value) && !value.startsWith("/") && !value.includes("..") && !value.endsWith("/") && !value.endsWith(".lock");
}

function isDefaultBranch(value: string): boolean {
  const normalized = value.toLowerCase().replace(/^refs\/heads\//, "");
  return normalized === "main" || normalized === "master" || normalized === "trunk";
}

function compositionDigestPayload(value: Omit<CrossRepoPrResult, "composition_id" | "composition_digest"> | CrossRepoPrResult): unknown {
  return {
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    peer_ref: value.peer_ref,
    lineage_pack_ref: value.lineage_pack_ref,
    allowed_path_summary: value.allowed_path_summary,
    pull_request: value.pull_request,
    review_gate: value.review_gate,
    evidence: value.evidence,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function validateNoSecretMaterial(value: unknown, path: string, issues: CrossRepoPrIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "cross-repo PR manifests must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function stringField(value: unknown, path: string, issues: CrossRepoPrIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: CrossRepoPrIssue[]): string | undefined {
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

function canonicalDigest(value: unknown): string {
  return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`;
}

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

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function markdownList(values: readonly string[]): readonly string[] {
  return values.length === 0 ? ["- none"] : values.map((entry) => `- ${entry}`);
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))];
}

function issue(issues: CrossRepoPrIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): CrossRepoPrIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT062CrossRepoPrComposer = composeCrossRepoPr;
export const validateT062CrossRepoPrComposer = validateCrossRepoPr;
