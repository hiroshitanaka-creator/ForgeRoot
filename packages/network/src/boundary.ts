export const NETWORK_BOUNDARY_VERSION = 1 as const;
export const NETWORK_BOUNDARY_SCHEMA_REF = "urn:forgeroot:network-boundary:v1" as const;

export type NetworkBoundaryAction = "cross_repo_pr" | "gossip_sync" | "lineage_export" | "lineage_import_candidate" | "reputation_update";
export type NetworkBoundaryPeerStatus = "active" | "suspended" | "quarantined" | "deprecated" | "unknown";
export type NetworkBoundaryTreatyStatus = "active" | "suspended" | "revoked" | "missing";
export type NetworkBoundaryRuntimeMode = "federate" | "observe" | "quarantine" | "halted";
export type NetworkBoundaryReputationAction = "observe" | "downrank" | "quarantine" | "revocation_review";
export type NetworkBoundaryStatus = "allowed" | "rejected" | "quarantined" | "invalid";
export type NetworkBoundaryDecision = "boundary_allowed" | "boundary_rejected" | "boundary_quarantined" | "invalid_network_boundary_input";

export interface NetworkBoundaryIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface NetworkBoundaryRuntimeInput {
  readonly mode: NetworkBoundaryRuntimeMode;
  readonly allowed: boolean;
  readonly kill_switch_engaged?: boolean;
  readonly open_federation_requested?: boolean;
}

export interface NetworkBoundaryPeerInput {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: NetworkBoundaryPeerStatus;
  readonly registry_known: boolean;
}

export interface NetworkBoundaryTreatyInput {
  readonly treaty_id: string;
  readonly status: NetworkBoundaryTreatyStatus;
  readonly source_peer_id: string;
  readonly target_peer_id: string;
  readonly allowed_actions: readonly NetworkBoundaryAction[];
  readonly expires_at?: string | null;
}

export interface NetworkBoundaryRequestInput {
  readonly action: NetworkBoundaryAction;
  readonly source_peer_id: string;
  readonly target_peer_id: string;
  readonly lineage_ref?: string | null;
  readonly proposal_ref?: string | null;
  readonly evidence_digest?: string | null;
  readonly imported_lineage_adoption_requested?: boolean;
  readonly network_transport_requested?: boolean;
}

export interface NetworkBoundaryReputationInput {
  readonly score: number;
  readonly recommended_action: NetworkBoundaryReputationAction;
}

export interface NetworkBoundaryInput {
  readonly now?: string;
  readonly boundary_id: string;
  readonly runtime: NetworkBoundaryRuntimeInput;
  readonly peer: NetworkBoundaryPeerInput;
  readonly treaty: NetworkBoundaryTreatyInput;
  readonly request: NetworkBoundaryRequestInput;
  readonly reputation: NetworkBoundaryReputationInput;
}

export interface NetworkBoundaryResult {
  readonly manifest_version: typeof NETWORK_BOUNDARY_VERSION;
  readonly schema_ref: typeof NETWORK_BOUNDARY_SCHEMA_REF;
  readonly boundary_decision_id: string;
  readonly boundary_id: string;
  readonly created_at: string;
  readonly status: NetworkBoundaryStatus;
  readonly decision: NetworkBoundaryDecision;
  readonly reasons: readonly string[];
  readonly inputs: {
    readonly runtime: Required<NetworkBoundaryRuntimeInput>;
    readonly peer: NetworkBoundaryPeerInput;
    readonly treaty: Required<NetworkBoundaryTreatyInput>;
    readonly request: Required<NetworkBoundaryRequestInput>;
    readonly reputation: NetworkBoundaryReputationInput;
  };
  readonly policy_ref: {
    readonly path: ".forge/policies/network-boundary.forge";
    readonly policy_id: "forge://hiroshitanaka-creator/ForgeRoot/policy/network-boundary";
    readonly approval_class: "C";
  };
  readonly allowed_actions: readonly NetworkBoundaryAction[];
  readonly denied_actions: readonly NetworkBoundaryAction[];
  readonly boundary_summary: {
    readonly action: NetworkBoundaryAction;
    readonly source_peer_id: string;
    readonly target_peer_id: string;
    readonly peer_known: boolean;
    readonly treaty_active: boolean;
    readonly action_allowed_by_treaty: boolean;
    readonly quarantine_required: boolean;
    readonly adoption_allowed: false;
    readonly import_candidate_only: true;
    readonly open_federation_default: false;
    readonly breach_handling: "allow" | "reject" | "quarantine";
  };
  readonly guards: {
    readonly treaty_required: true;
    readonly treaty_allowlist_enforced: true;
    readonly peer_registry_required: true;
    readonly peer_reputation_checked: true;
    readonly import_is_candidate_only: true;
    readonly open_federation_forbidden: true;
    readonly no_network_transport: true;
    readonly no_file_write: true;
    readonly no_github_api_call: true;
    readonly no_git_push: true;
    readonly no_policy_weakening: true;
  };
  readonly dry_run: {
    readonly network_transport_performed: false;
    readonly lineage_adoption_performed: false;
    readonly file_written: false;
    readonly github_api_called: false;
    readonly git_push_performed: false;
    readonly policy_mutation_performed: false;
    readonly open_federation_enabled: false;
  };
  readonly network_boundary_digest: string;
  readonly issues?: readonly NetworkBoundaryIssue[];
}

export interface NetworkBoundaryValidation {
  readonly ok: boolean;
  readonly issues: readonly NetworkBoundaryIssue[];
}

export const NETWORK_BOUNDARY_CONTRACT = {
  consumes: ["runtime_gate", "peer_registry_snapshot", "treaty_scope", "peer_reputation_summary", "peer_action_request"],
  produces: ["network_boundary_decision_manifest"],
  validates: ["runtime_mode", "peer_registry_known", "treaty_action_allowlist", "import_quarantine", "reputation_action", "open_federation_default"],
  forbids: ["open_federation_default", "live_network_transport", "automatic_lineage_adoption", "policy_weakening", "github_api_call", "git_push"],
  deterministic: true,
  manifestOnly: true,
  boundaryOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-07T00:00:00Z";
const MIN_REPUTATION_SCORE = 30;
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const BOUNDARY_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const PEER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH = /^(sha256:[0-9a-f]{64}|sha-[a-z0-9-]+-[0-9a-f]{8,})$/;
const SAFE_REF = /^[A-Za-z0-9:/.?=_-]+$/;
const ACTIONS = new Set(["cross_repo_pr", "gossip_sync", "lineage_export", "lineage_import_candidate", "reputation_update"]);
const ACTION_ORDER: readonly NetworkBoundaryAction[] = ["cross_repo_pr", "gossip_sync", "lineage_export", "lineage_import_candidate", "reputation_update"];
const PEER_STATUSES = new Set(["active", "suspended", "quarantined", "deprecated", "unknown"]);
const TREATY_STATUSES = new Set(["active", "suspended", "revoked", "missing"]);
const RUNTIME_MODES = new Set(["federate", "observe", "quarantine", "halted"]);
const REPUTATION_ACTIONS = new Set(["observe", "downrank", "quarantine", "revocation_review"]);
const STATUSES = new Set(["allowed", "rejected", "quarantined", "invalid"]);
const DECISIONS = new Set(["boundary_allowed", "boundary_rejected", "boundary_quarantined", "invalid_network_boundary_input"]);
const RESULT_KEYS = new Set(["manifest_version", "schema_ref", "boundary_decision_id", "boundary_id", "created_at", "status", "decision", "reasons", "inputs", "policy_ref", "allowed_actions", "denied_actions", "boundary_summary", "guards", "dry_run", "network_boundary_digest", "issues"]);
const INPUT_KEYS = new Set(["runtime", "peer", "treaty", "request", "reputation"]);
const RUNTIME_KEYS = new Set(["mode", "allowed", "kill_switch_engaged", "open_federation_requested"]);
const PEER_KEYS = new Set(["peer_id", "repository_full_name", "status", "registry_known"]);
const TREATY_KEYS = new Set(["treaty_id", "status", "source_peer_id", "target_peer_id", "allowed_actions", "expires_at"]);
const REQUEST_KEYS = new Set(["action", "source_peer_id", "target_peer_id", "lineage_ref", "proposal_ref", "evidence_digest", "imported_lineage_adoption_requested", "network_transport_requested"]);
const REPUTATION_KEYS = new Set(["score", "recommended_action"]);
const POLICY_REF_KEYS = new Set(["path", "policy_id", "approval_class"]);
const SUMMARY_KEYS = new Set(["action", "source_peer_id", "target_peer_id", "peer_known", "treaty_active", "action_allowed_by_treaty", "quarantine_required", "adoption_allowed", "import_candidate_only", "open_federation_default", "breach_handling"]);
const ISSUE_KEYS = new Set(["path", "code", "message"]);

interface NormalizedInput {
  readonly input: NetworkBoundaryInput | null;
  readonly now?: string;
  readonly issues: readonly NetworkBoundaryIssue[];
}

interface ComputedDecision {
  readonly status: Exclude<NetworkBoundaryStatus, "invalid">;
  readonly decision: Exclude<NetworkBoundaryDecision, "invalid_network_boundary_input">;
  readonly reasons: readonly string[];
  readonly allowedActions: readonly NetworkBoundaryAction[];
  readonly deniedActions: readonly NetworkBoundaryAction[];
  readonly boundarySummary: NetworkBoundaryResult["boundary_summary"];
}

export function enforceNetworkBoundary(input: unknown): NetworkBoundaryResult {
  const normalized = normalizeInput(input);
  const createdAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [makeIssue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "network boundary input must be an object")]);

  const result = resultFor(createdAt ?? DEFAULT_NOW, normalized.input);
  const validation = validateNetworkBoundary(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, validation.issues);
  return result;
}

export function validateNetworkBoundary(value: unknown): NetworkBoundaryValidation {
  const issues: NetworkBoundaryIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [makeIssue("result", "result_must_be_object", "network boundary result must be an object")] };
  validateKnownKeys(value, RESULT_KEYS, "result", issues);
  validateTopLevel(value, issues);
  const inputs = validateInputs(value.inputs, "inputs", issues);
  validatePolicyRef(value.policy_ref, "policy_ref", issues);
  validateActionSet(value.allowed_actions, "allowed_actions", issues);
  validateActionSet(value.denied_actions, "denied_actions", issues);
  validateBoundarySummary(value.boundary_summary, "boundary_summary", issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value, issues);
  validateNoSecretMaterial(value, "result", issues);

  if (issues.length === 0 && value.status !== "invalid" && inputs !== null) {
    const computed = computeDecision(value.created_at as string, inputs);
    if (value.status !== computed.status) issue(issues, "status", "status_mismatch", "status must match the recomputed network boundary decision");
    if (value.decision !== computed.decision) issue(issues, "decision", "decision_mismatch", "decision must match the recomputed network boundary decision");
    if (canonicalStringify(value.reasons) !== canonicalStringify(computed.reasons)) issue(issues, "reasons", "reasons_mismatch", "reasons must match the recomputed network boundary decision");
    if (canonicalStringify(value.allowed_actions) !== canonicalStringify(computed.allowedActions)) issue(issues, "allowed_actions", "allowed_actions_mismatch", "allowed actions must match treaty scope");
    if (canonicalStringify(value.denied_actions) !== canonicalStringify(computed.deniedActions)) issue(issues, "denied_actions", "denied_actions_mismatch", "denied actions must match treaty scope");
    if (canonicalStringify(value.boundary_summary) !== canonicalStringify(computed.boundarySummary)) issue(issues, "boundary_summary", "boundary_summary_mismatch", "boundary summary must be recalculated from inputs");
  }

  const expectedDigest = canonicalDigest(boundaryDigestPayload(value as unknown as NetworkBoundaryResult));
  if (typeof value.network_boundary_digest !== "string" || value.network_boundary_digest !== expectedDigest) issue(issues, "network_boundary_digest", "digest_mismatch", "network_boundary_digest must cover the boundary payload");
  if (typeof value.boundary_decision_id !== "string" || value.boundary_decision_id !== stableId("network-boundary", [expectedDigest])) issue(issues, "boundary_decision_id", "id_mismatch", "boundary_decision_id must match network_boundary_digest");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(input: unknown): NormalizedInput {
  const issues: NetworkBoundaryIssue[] = [];
  if (!isRecord(input)) return { input: null, issues: [makeIssue("input", "input_must_be_object", "network boundary input must be an object")] };
  validateKnownKeys(input, new Set(["now", "boundary_id", "runtime", "peer", "treaty", "request", "reputation"]), "input", issues);
  validateNoSecretMaterial(input, "input", issues);
  const boundaryId = stringField(input.boundary_id, "boundary_id", issues);
  if (boundaryId.length > 0 && !BOUNDARY_ID.test(boundaryId)) issue(issues, "boundary_id", "invalid_boundary_id", "boundary_id must be lowercase kebab-case");
  const now = optionalString(input.now, "now", issues);
  return {
    input: {
      boundary_id: boundaryId,
      runtime: normalizeRuntime(input.runtime, "runtime", issues, false),
      peer: normalizePeer(input.peer, "peer", issues),
      treaty: normalizeTreaty(input.treaty, "treaty", issues, false),
      request: normalizeRequest(input.request, "request", issues, false),
      reputation: normalizeReputation(input.reputation, "reputation", issues),
      ...(now === undefined ? {} : { now }),
    },
    now,
    issues,
  };
}

function resultFor(createdAt: string, input: NetworkBoundaryInput): NetworkBoundaryResult {
  const resolvedInput = {
    runtime: normalizeRuntime(input.runtime, "runtime", [], true),
    peer: normalizePeer(input.peer, "peer", []),
    treaty: normalizeTreaty(input.treaty, "treaty", [], true),
    request: normalizeRequest(input.request, "request", [], true),
    reputation: normalizeReputation(input.reputation, "reputation", []),
  };
  const computed = computeDecision(createdAt, resolvedInput);
  const draft: Omit<NetworkBoundaryResult, "boundary_decision_id" | "network_boundary_digest"> = {
    manifest_version: NETWORK_BOUNDARY_VERSION,
    schema_ref: NETWORK_BOUNDARY_SCHEMA_REF,
    boundary_id: input.boundary_id,
    created_at: createdAt,
    status: computed.status,
    decision: computed.decision,
    reasons: computed.reasons,
    inputs: resolvedInput,
    policy_ref: policyRef(),
    allowed_actions: computed.allowedActions,
    denied_actions: computed.deniedActions,
    boundary_summary: computed.boundarySummary,
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(boundaryDigestPayload(draft));
  return { ...draft, boundary_decision_id: stableId("network-boundary", [digest]), network_boundary_digest: digest };
}

function invalidResult(createdAt: string, issues: readonly NetworkBoundaryIssue[]): NetworkBoundaryResult {
  const safe = emptyInput();
  const resolvedInput = {
    runtime: normalizeRuntime(safe.runtime, "runtime", [], true),
    peer: normalizePeer(safe.peer, "peer", []),
    treaty: normalizeTreaty(safe.treaty, "treaty", [], true),
    request: normalizeRequest(safe.request, "request", [], true),
    reputation: normalizeReputation(safe.reputation, "reputation", []),
  };
  const computed = computeDecision(createdAt, resolvedInput);
  const draft: Omit<NetworkBoundaryResult, "boundary_decision_id" | "network_boundary_digest"> = {
    manifest_version: NETWORK_BOUNDARY_VERSION,
    schema_ref: NETWORK_BOUNDARY_SCHEMA_REF,
    boundary_id: safe.boundary_id,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_network_boundary_input",
    reasons: uniqueStrings(["invalid_network_boundary_input", ...issues.map((entry) => entry.code)]),
    inputs: resolvedInput,
    policy_ref: policyRef(),
    allowed_actions: computed.allowedActions,
    denied_actions: computed.deniedActions,
    boundary_summary: computed.boundarySummary,
    guards: guards(),
    dry_run: dryRun(),
    issues,
  };
  const digest = canonicalDigest(boundaryDigestPayload(draft));
  return { ...draft, boundary_decision_id: stableId("network-boundary", [digest]), network_boundary_digest: digest };
}

function computeDecision(createdAt: string, input: NetworkBoundaryResult["inputs"]): ComputedDecision {
  const allowedActions = normalizeActionOrder(input.treaty.allowed_actions);
  const deniedActions = ACTION_ORDER.filter((entry) => !allowedActions.includes(entry));
  const actionAllowedByTreaty = input.treaty.status === "active" && allowedActions.includes(input.request.action);
  const treatyActive = input.treaty.status === "active" && (input.treaty.expires_at === null || Date.parse(input.treaty.expires_at) > Date.parse(createdAt));
  const peerKnown = input.peer.registry_known === true && input.peer.status !== "unknown";
  const quarantineReasons: string[] = [];
  const rejectReasons: string[] = [];

  if (input.runtime.open_federation_requested) quarantineReasons.push("open_federation_forbidden");
  if (!peerKnown) quarantineReasons.push("unknown_peer_quarantined");
  if (input.peer.status === "quarantined") quarantineReasons.push("peer_quarantined");
  if (input.reputation.recommended_action === "quarantine" || input.reputation.recommended_action === "revocation_review") quarantineReasons.push(`reputation_${input.reputation.recommended_action}`);
  if (input.reputation.score < MIN_REPUTATION_SCORE) quarantineReasons.push("reputation_score_below_threshold");

  if (input.runtime.mode !== "federate") rejectReasons.push("runtime_mode_not_federate");
  if (input.runtime.allowed !== true) rejectReasons.push("runtime_not_allowed");
  if (input.runtime.kill_switch_engaged === true) rejectReasons.push("kill_switch_engaged");
  if (input.peer.status === "suspended" || input.peer.status === "deprecated") rejectReasons.push(`peer_${input.peer.status}`);
  if (input.treaty.status !== "active") rejectReasons.push("treaty_not_active");
  if (input.treaty.expires_at !== null && Date.parse(input.treaty.expires_at) <= Date.parse(createdAt)) rejectReasons.push("treaty_expired");
  if (input.treaty.source_peer_id !== input.request.source_peer_id || input.treaty.target_peer_id !== input.request.target_peer_id || input.peer.peer_id !== input.request.target_peer_id) rejectReasons.push("peer_treaty_request_mismatch");
  if (!actionAllowedByTreaty) rejectReasons.push("action_not_allowed_by_treaty");
  if (input.request.imported_lineage_adoption_requested === true) rejectReasons.push("imported_lineage_adoption_forbidden");
  if (input.request.network_transport_requested === true) rejectReasons.push("network_transport_forbidden");

  const status = quarantineReasons.length > 0 ? "quarantined" : rejectReasons.length > 0 ? "rejected" : "allowed";
  const decision = status === "allowed" ? "boundary_allowed" : status === "quarantined" ? "boundary_quarantined" : "boundary_rejected";
  const reasons = status === "allowed"
    ? ["network_boundary_allowed", "treaty_scope_passed", "peer_registry_verified", "import_candidate_not_adopted"]
    : status === "quarantined"
      ? uniqueStrings(["network_boundary_quarantined", ...quarantineReasons, ...rejectReasons])
      : uniqueStrings(["network_boundary_rejected", ...rejectReasons]);
  const breachHandling = status === "allowed" ? "allow" : status === "quarantined" ? "quarantine" : "reject";
  return {
    status,
    decision,
    reasons,
    allowedActions,
    deniedActions,
    boundarySummary: {
      action: input.request.action,
      source_peer_id: input.request.source_peer_id,
      target_peer_id: input.request.target_peer_id,
      peer_known: peerKnown,
      treaty_active: treatyActive,
      action_allowed_by_treaty: actionAllowedByTreaty,
      quarantine_required: status === "quarantined",
      adoption_allowed: false,
      import_candidate_only: true,
      open_federation_default: false,
      breach_handling: breachHandling,
    },
  };
}

function validateInputs(value: unknown, path: string, issues: NetworkBoundaryIssue[]): NetworkBoundaryResult["inputs"] | null {
  if (!isRecord(value)) {
    issue(issues, path, "inputs_required", "inputs must be present");
    return null;
  }
  validateKnownKeys(value, INPUT_KEYS, path, issues);
  const start = issues.length;
  const runtime = normalizeRuntime(value.runtime, `${path}.runtime`, issues, true);
  const peer = normalizePeer(value.peer, `${path}.peer`, issues);
  const treaty = normalizeTreaty(value.treaty, `${path}.treaty`, issues, true);
  const request = normalizeRequest(value.request, `${path}.request`, issues, true);
  const reputation = normalizeReputation(value.reputation, `${path}.reputation`, issues);
  return issues.length === start ? { runtime, peer, treaty, request, reputation } : null;
}

function normalizeRuntime(value: unknown, path: string, issues: NetworkBoundaryIssue[], requireComplete: boolean): Required<NetworkBoundaryRuntimeInput> {
  if (!isRecord(value)) {
    issue(issues, path, "runtime_must_be_object", "runtime must be an object");
    return { mode: "halted", allowed: false, kill_switch_engaged: true, open_federation_requested: false };
  }
  validateKnownKeys(value, RUNTIME_KEYS, path, issues);
  const mode = enumField(value.mode, RUNTIME_MODES, `${path}.mode`, "invalid_runtime_mode", issues, "halted") as NetworkBoundaryRuntimeMode;
  const allowed = booleanField(value.allowed, `${path}.allowed`, issues);
  const killSwitch = optionalBoolean(value.kill_switch_engaged, `${path}.kill_switch_engaged`, issues, false, requireComplete, "missing_runtime_key");
  const openFederation = optionalBoolean(value.open_federation_requested, `${path}.open_federation_requested`, issues, false, requireComplete, "missing_runtime_key");
  return { mode, allowed, kill_switch_engaged: killSwitch, open_federation_requested: openFederation };
}

function normalizePeer(value: unknown, path: string, issues: NetworkBoundaryIssue[]): NetworkBoundaryPeerInput {
  if (!isRecord(value)) {
    issue(issues, path, "peer_must_be_object", "peer must be an object");
    return emptyInput().peer;
  }
  validateKnownKeys(value, PEER_KEYS, path, issues);
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const repository = stringField(value.repository_full_name, `${path}.repository_full_name`, issues);
  const status = enumField(value.status, PEER_STATUSES, `${path}.status`, "invalid_peer_status", issues, "unknown") as NetworkBoundaryPeerStatus;
  const registryKnown = booleanField(value.registry_known, `${path}.registry_known`, issues);
  if (peerId.length > 0 && !PEER_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (repository.length > 0 && !REPOSITORY.test(repository)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  return { peer_id: peerId, repository_full_name: repository, status, registry_known: registryKnown };
}

function normalizeTreaty(value: unknown, path: string, issues: NetworkBoundaryIssue[], requireComplete: boolean): Required<NetworkBoundaryTreatyInput> {
  if (!isRecord(value)) {
    issue(issues, path, "treaty_must_be_object", "treaty must be an object");
    return emptyInput().treaty as Required<NetworkBoundaryTreatyInput>;
  }
  validateKnownKeys(value, TREATY_KEYS, path, issues);
  const treatyId = stringField(value.treaty_id, `${path}.treaty_id`, issues);
  const status = enumField(value.status, TREATY_STATUSES, `${path}.status`, "invalid_treaty_status", issues, "missing") as NetworkBoundaryTreatyStatus;
  const sourcePeerId = stringField(value.source_peer_id, `${path}.source_peer_id`, issues);
  const targetPeerId = stringField(value.target_peer_id, `${path}.target_peer_id`, issues);
  const allowedActions = normalizeActionArray(value.allowed_actions, `${path}.allowed_actions`, issues, requireComplete);
  if (requireComplete && !("expires_at" in value)) issue(issues, `${path}.expires_at`, "missing_treaty_key", "resolved treaty must include expires_at");
  const expiresAt = nullableTimestamp(value.expires_at, `${path}.expires_at`, issues);
  if (treatyId.length > 0 && !BOUNDARY_ID.test(treatyId)) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  if (sourcePeerId.length > 0 && !PEER_ID.test(sourcePeerId)) issue(issues, `${path}.source_peer_id`, "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (targetPeerId.length > 0 && !PEER_ID.test(targetPeerId)) issue(issues, `${path}.target_peer_id`, "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
  return { treaty_id: treatyId, status, source_peer_id: sourcePeerId, target_peer_id: targetPeerId, allowed_actions: allowedActions, expires_at: expiresAt };
}

function normalizeRequest(value: unknown, path: string, issues: NetworkBoundaryIssue[], requireComplete: boolean): Required<NetworkBoundaryRequestInput> {
  if (!isRecord(value)) {
    issue(issues, path, "request_must_be_object", "request must be an object");
    return emptyInput().request as Required<NetworkBoundaryRequestInput>;
  }
  validateKnownKeys(value, REQUEST_KEYS, path, issues);
  const action = enumField(value.action, ACTIONS, `${path}.action`, "invalid_action", issues, "lineage_export") as NetworkBoundaryAction;
  const sourcePeerId = stringField(value.source_peer_id, `${path}.source_peer_id`, issues);
  const targetPeerId = stringField(value.target_peer_id, `${path}.target_peer_id`, issues);
  const lineageRef = optionalSafeRef(value.lineage_ref, `${path}.lineage_ref`, issues, requireComplete);
  const proposalRef = optionalSafeRef(value.proposal_ref, `${path}.proposal_ref`, issues, requireComplete);
  const evidenceDigest = optionalDigest(value.evidence_digest, `${path}.evidence_digest`, issues, requireComplete);
  const importedLineageAdoption = optionalBoolean(value.imported_lineage_adoption_requested, `${path}.imported_lineage_adoption_requested`, issues, false, requireComplete, "missing_request_key");
  const networkTransport = optionalBoolean(value.network_transport_requested, `${path}.network_transport_requested`, issues, false, requireComplete, "missing_request_key");
  if (sourcePeerId.length > 0 && !PEER_ID.test(sourcePeerId)) issue(issues, `${path}.source_peer_id`, "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (targetPeerId.length > 0 && !PEER_ID.test(targetPeerId)) issue(issues, `${path}.target_peer_id`, "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
  return { action, source_peer_id: sourcePeerId, target_peer_id: targetPeerId, lineage_ref: lineageRef, proposal_ref: proposalRef, evidence_digest: evidenceDigest, imported_lineage_adoption_requested: importedLineageAdoption, network_transport_requested: networkTransport };
}

function normalizeReputation(value: unknown, path: string, issues: NetworkBoundaryIssue[]): NetworkBoundaryReputationInput {
  if (!isRecord(value)) {
    issue(issues, path, "reputation_must_be_object", "reputation must be an object");
    return emptyInput().reputation;
  }
  validateKnownKeys(value, REPUTATION_KEYS, path, issues);
  const score = numberField(value.score, `${path}.score`, issues, 0, 100, 0);
  const action = enumField(value.recommended_action, REPUTATION_ACTIONS, `${path}.recommended_action`, "invalid_reputation_action", issues, "revocation_review") as NetworkBoundaryReputationAction;
  return { score, recommended_action: action };
}

function validateTopLevel(value: Record<string, unknown>, issues: NetworkBoundaryIssue[]): void {
  if (value.manifest_version !== NETWORK_BOUNDARY_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== NETWORK_BOUNDARY_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T067 network boundary v1");
  if (typeof value.boundary_decision_id !== "string" || !ID.test(value.boundary_decision_id)) issue(issues, "boundary_decision_id", "invalid_boundary_decision_id", "boundary_decision_id must be deterministic");
  if (typeof value.boundary_id !== "string" || !BOUNDARY_ID.test(value.boundary_id)) issue(issues, "boundary_id", "invalid_boundary_id", "boundary_id must be lowercase kebab-case");
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (typeof value.status !== "string" || !STATUSES.has(value.status)) issue(issues, "status", "invalid_status", "status must be a T067 boundary status");
  if (typeof value.decision !== "string" || !DECISIONS.has(value.decision)) issue(issues, "decision", "invalid_decision", "decision must be a T067 boundary decision");
  if (!Array.isArray(value.reasons) || value.reasons.length === 0 || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
}

function validatePolicyRef(value: unknown, path: string, issues: NetworkBoundaryIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "policy_ref_required", "policy_ref must be present");
    return;
  }
  validateKnownKeys(value, POLICY_REF_KEYS, path, issues);
  const expected = policyRef();
  if (value.path !== expected.path) issue(issues, `${path}.path`, "policy_path_mismatch", "policy path must point to network-boundary.forge");
  if (value.policy_id !== expected.policy_id) issue(issues, `${path}.policy_id`, "policy_id_mismatch", "policy id must identify network boundary policy");
  if (value.approval_class !== expected.approval_class) issue(issues, `${path}.approval_class`, "approval_class_mismatch", "network boundary policy is class C");
}

function validateActionSet(value: unknown, path: string, issues: NetworkBoundaryIssue[]): void {
  normalizeActionArray(value, path, issues, true);
}

function validateBoundarySummary(value: unknown, path: string, issues: NetworkBoundaryIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "boundary_summary_required", "boundary_summary must be present");
    return;
  }
  validateKnownKeys(value, SUMMARY_KEYS, path, issues);
  enumField(value.action, ACTIONS, `${path}.action`, "invalid_action", issues, "lineage_export");
  for (const key of ["source_peer_id", "target_peer_id"]) {
    if (typeof value[key] !== "string" || !PEER_ID.test(value[key] as string)) issue(issues, `${path}.${key}`, `invalid_${key}`, `${key} must be lowercase kebab-case`);
  }
  for (const key of ["peer_known", "treaty_active", "action_allowed_by_treaty", "quarantine_required"]) if (typeof value[key] !== "boolean") issue(issues, `${path}.${key}`, "boolean_required", `${key} must be boolean`);
  if (value.adoption_allowed !== false) issue(issues, `${path}.adoption_allowed`, "automatic_adoption_forbidden", "adoption_allowed must be false");
  if (value.import_candidate_only !== true) issue(issues, `${path}.import_candidate_only`, "import_candidate_guard_required", "imports must remain candidates");
  if (value.open_federation_default !== false) issue(issues, `${path}.open_federation_default`, "open_federation_forbidden", "open federation must not be default");
  if (value.breach_handling !== "allow" && value.breach_handling !== "reject" && value.breach_handling !== "quarantine") issue(issues, `${path}.breach_handling`, "invalid_breach_handling", "breach handling must be allow, reject, or quarantine");
}

function validateGuards(value: unknown, issues: NetworkBoundaryIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(guards())), "guards", issues);
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: NetworkBoundaryIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(dryRun())), "dry_run", issues);
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(value: Record<string, unknown>, issues: NetworkBoundaryIssue[]): void {
  if (value.status === "allowed" && value.decision !== "boundary_allowed") issue(issues, "decision", "allowed_decision_mismatch", "allowed boundary must use boundary_allowed");
  if (value.status === "rejected" && value.decision !== "boundary_rejected") issue(issues, "decision", "rejected_decision_mismatch", "rejected boundary must use boundary_rejected");
  if (value.status === "quarantined" && value.decision !== "boundary_quarantined") issue(issues, "decision", "quarantined_decision_mismatch", "quarantined boundary must use boundary_quarantined");
  if (value.status === "invalid" && value.decision !== "invalid_network_boundary_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid boundary must use invalid_network_boundary_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid boundary must carry issues");
    else value.issues.forEach((entry, index) => validateIssue(entry, `issues.${index}`, issues));
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid boundary must not carry issues");
  }
}

function validateIssue(value: unknown, path: string, issues: NetworkBoundaryIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "issue_must_be_object", "issue must be an object");
    return;
  }
  validateKnownKeys(value, ISSUE_KEYS, path, issues);
  for (const key of ["path", "code", "message"]) if (typeof value[key] !== "string" || value[key].length === 0) issue(issues, `${path}.${key}`, "invalid_issue_field", "issue fields must be non-empty strings");
}

function normalizeActionArray(value: unknown, path: string, issues: NetworkBoundaryIssue[], requireSorted: boolean): readonly NetworkBoundaryAction[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "array_required", `${path} must be an array`);
    return [];
  }
  const entries: NetworkBoundaryAction[] = [];
  const seen = new Set<string>();
  let previous = "";
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      issue(issues, `${path}.${index}`, "non_empty_string_required", `${path} entries must be non-empty strings`);
      return;
    }
    if (!ACTIONS.has(entry)) issue(issues, `${path}.${index}`, "invalid_action", `${path} contains an unknown action`);
    if (seen.has(entry)) issue(issues, `${path}.${index}`, "duplicate_entry", `${path} entries must be unique`);
    if (requireSorted && index > 0 && previous > entry) issue(issues, path, "entries_not_sorted", `${path} must be sorted`);
    seen.add(entry);
    previous = entry;
    if (ACTIONS.has(entry)) entries.push(entry as NetworkBoundaryAction);
  });
  return normalizeActionOrder(entries);
}

function normalizeActionOrder(values: readonly NetworkBoundaryAction[]): readonly NetworkBoundaryAction[] {
  const seen = new Set(values);
  return ACTION_ORDER.filter((entry) => seen.has(entry));
}

function policyRef(): NetworkBoundaryResult["policy_ref"] {
  return {
    path: ".forge/policies/network-boundary.forge",
    policy_id: "forge://hiroshitanaka-creator/ForgeRoot/policy/network-boundary",
    approval_class: "C",
  };
}

function guards(): NetworkBoundaryResult["guards"] {
  return {
    treaty_required: true,
    treaty_allowlist_enforced: true,
    peer_registry_required: true,
    peer_reputation_checked: true,
    import_is_candidate_only: true,
    open_federation_forbidden: true,
    no_network_transport: true,
    no_file_write: true,
    no_github_api_call: true,
    no_git_push: true,
    no_policy_weakening: true,
  };
}

function dryRun(): NetworkBoundaryResult["dry_run"] {
  return {
    network_transport_performed: false,
    lineage_adoption_performed: false,
    file_written: false,
    github_api_called: false,
    git_push_performed: false,
    policy_mutation_performed: false,
    open_federation_enabled: false,
  };
}

function emptyInput(): NetworkBoundaryInput {
  return {
    boundary_id: "invalid-boundary",
    runtime: { mode: "halted", allowed: false, kill_switch_engaged: true, open_federation_requested: false },
    peer: { peer_id: "target-peer", repository_full_name: "owner/target", status: "unknown", registry_known: false },
    treaty: {
      treaty_id: "missing-treaty",
      status: "missing",
      source_peer_id: "source-peer",
      target_peer_id: "target-peer",
      allowed_actions: [],
      expires_at: null,
    },
    request: {
      action: "lineage_export",
      source_peer_id: "source-peer",
      target_peer_id: "target-peer",
      lineage_ref: null,
      proposal_ref: null,
      evidence_digest: null,
      imported_lineage_adoption_requested: false,
      network_transport_requested: false,
    },
    reputation: { score: 0, recommended_action: "revocation_review" },
  };
}

function boundaryDigestPayload(value: Omit<NetworkBoundaryResult, "boundary_decision_id" | "network_boundary_digest"> | NetworkBoundaryResult): unknown {
  return {
    manifest_version: value.manifest_version,
    schema_ref: value.schema_ref,
    boundary_id: value.boundary_id,
    created_at: value.created_at,
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    inputs: value.inputs,
    policy_ref: value.policy_ref,
    allowed_actions: value.allowed_actions,
    denied_actions: value.denied_actions,
    boundary_summary: value.boundary_summary,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function nullableTimestamp(value: unknown, path: string, issues: NetworkBoundaryIssue[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !isRfc3339Utc(value)) {
    issue(issues, path, "invalid_timestamp", `${path} must be null or RFC3339 UTC`);
    return null;
  }
  return value;
}

function optionalSafeRef(value: unknown, path: string, issues: NetworkBoundaryIssue[], requireComplete: boolean): string | null {
  if (value === undefined || value === null) {
    if (requireComplete && value === undefined) issue(issues, path, "missing_request_key", `${path} must be present in resolved request`);
    return null;
  }
  if (typeof value !== "string" || value.length === 0 || !SAFE_REF.test(value)) {
    issue(issues, path, "invalid_ref", `${path} must be null or a safe reference string`);
    return null;
  }
  return value;
}

function optionalDigest(value: unknown, path: string, issues: NetworkBoundaryIssue[], requireComplete: boolean): string | null {
  if (value === undefined || value === null) {
    if (requireComplete && value === undefined) issue(issues, path, "missing_request_key", `${path} must be present in resolved request`);
    return null;
  }
  if (typeof value !== "string" || !HASH.test(value)) {
    issue(issues, path, "invalid_digest", `${path} must be null or a stable hash reference`);
    return null;
  }
  return value;
}

function optionalBoolean(value: unknown, path: string, issues: NetworkBoundaryIssue[], fallback: boolean, requireComplete: boolean, missingCode: string): boolean {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, missingCode, `${path} must be present in resolved input`);
    return fallback;
  }
  return booleanField(value, path, issues);
}

function numberField(value: unknown, path: string, issues: NetworkBoundaryIssue[], min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    issue(issues, path, "invalid_number", `${path} must be a number from ${min} to ${max}`);
    return fallback;
  }
  return value;
}

function stringField(value: unknown, path: string, issues: NetworkBoundaryIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: NetworkBoundaryIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
  return value;
}

function enumField(value: unknown, allowed: Set<string>, path: string, code: string, issues: NetworkBoundaryIssue[], fallback: string): string {
  if (typeof value === "string" && allowed.has(value)) return value;
  issue(issues, path, code, `${path} contains an unknown value`);
  return fallback;
}

function booleanField(value: unknown, path: string, issues: NetworkBoundaryIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issue(issues, path, "boolean_required", `${path} must be boolean`);
  return false;
}

function validateKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: NetworkBoundaryIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown_key", "unknown keys are not allowed");
}

function validateNoSecretMaterial(value: unknown, path: string, issues: NetworkBoundaryIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "network boundary manifests must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}.${index}`, issues));
    return;
  }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
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

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))];
}

function issue(issues: NetworkBoundaryIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): NetworkBoundaryIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT067NetworkSandboxPolicy = enforceNetworkBoundary;
export const validateT067NetworkSandboxPolicy = validateNetworkBoundary;
