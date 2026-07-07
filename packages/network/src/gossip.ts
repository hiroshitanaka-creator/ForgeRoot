export const GOSSIP_SYNC_VERSION = 1 as const;
export const GOSSIP_SYNC_SCHEMA_REF = "urn:forgeroot:gossip-sync:v1" as const;

export type GossipPeerStatus = "active" | "suspended" | "quarantined" | "deprecated";
export type GossipTreatyStatus = "active" | "suspended" | "revoked";
export type GossipRuntimeMode = "federate" | "observe" | "quarantine" | "halted";
export type GossipReputationAction = "observe" | "downrank" | "quarantine" | "revocation_review";
export type GossipSyncStatus = "gossip_sync_ready" | "delayed" | "blocked" | "invalid";
export type GossipSyncDecision = "gossip_sync_ready" | "gossip_sync_delayed" | "gossip_sync_blocked" | "invalid_gossip_sync_input";
export type GossipPeerDecisionKind = "schedule" | "delay" | "skip";

export interface GossipIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface GossipRuntimeInput {
  readonly mode: GossipRuntimeMode;
  readonly allowed: boolean;
  readonly kill_switch_engaged?: boolean;
}

export interface GossipPeerInput {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: GossipPeerStatus;
  readonly treaty_id: string;
  readonly treaty_status: GossipTreatyStatus;
  readonly reputation_score: number;
  readonly reputation_action: GossipReputationAction;
  readonly last_sync_at?: string | null;
  readonly cooldown_until?: string | null;
}

export interface GossipPeerRegistryInput {
  readonly registry_id: string;
  readonly peers: readonly GossipPeerInput[];
}

export interface GossipRateBoundaryInput {
  readonly base_interval_seconds?: number;
  readonly jitter_max_seconds?: number;
  readonly max_peers_per_sync?: number;
  readonly max_syncs_per_window?: number;
  readonly current_window_sync_count?: number;
  readonly window_reset_at?: string;
  readonly global_cooldown_until?: string | null;
}

export interface GossipSyncInput {
  readonly now?: string;
  readonly runtime: GossipRuntimeInput;
  readonly peer_registry: GossipPeerRegistryInput;
  readonly rate_boundary?: GossipRateBoundaryInput;
}

export interface GossipRateBoundaryResolved {
  readonly base_interval_seconds: number;
  readonly jitter_max_seconds: number;
  readonly max_peers_per_sync: number;
  readonly max_syncs_per_window: number;
  readonly current_window_sync_count: number;
  readonly window_reset_at: string;
  readonly global_cooldown_until: string | null;
}

export interface GossipPeerDecision {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: GossipPeerStatus;
  readonly decision: GossipPeerDecisionKind;
  readonly reason: string;
  readonly scheduled_at: string | null;
  readonly jitter_seconds: number;
  readonly cooldown_until: string | null;
}

export interface GossipSyncResult {
  readonly manifest_version: typeof GOSSIP_SYNC_VERSION;
  readonly schema_ref: typeof GOSSIP_SYNC_SCHEMA_REF;
  readonly gossip_sync_id: string;
  readonly created_at: string;
  readonly status: GossipSyncStatus;
  readonly decision: GossipSyncDecision;
  readonly reasons: readonly string[];
  readonly inputs: {
    readonly runtime: Required<GossipRuntimeInput>;
    readonly peer_registry: GossipPeerRegistryInput;
    readonly rate_boundary: GossipRateBoundaryResolved;
  };
  readonly peer_registry_ref: {
    readonly registry_id: string;
    readonly registry_digest: string;
    readonly peer_count: number;
  };
  readonly sync_plan: {
    readonly next_sync_at: string | null;
    readonly scheduled_count: number;
    readonly delayed_count: number;
    readonly skipped_count: number;
    readonly rate_slots_remaining: number;
    readonly peer_decisions: readonly GossipPeerDecision[];
  };
  readonly guards: {
    readonly runtime_federate_required: true;
    readonly quarantined_peer_excluded: true;
    readonly deterministic_jitter: true;
    readonly cooldown_enforced: true;
    readonly rate_boundary_enforced: true;
    readonly no_workflow_mutation: true;
    readonly no_network_transport: true;
    readonly no_peer_discovery: true;
    readonly no_cross_repo_pr_creation: true;
    readonly no_github_api_call: true;
  };
  readonly dry_run: {
    readonly workflow_mutated: false;
    readonly network_transport_performed: false;
    readonly peer_discovery_performed: false;
    readonly cross_repo_pr_created: false;
    readonly github_api_called: false;
    readonly queue_slot_persisted: false;
  };
  readonly gossip_sync_digest: string;
  readonly issues?: readonly GossipIssue[];
}

export interface GossipSyncValidation {
  readonly ok: boolean;
  readonly issues: readonly GossipIssue[];
}

export const GOSSIP_SYNC_CONTRACT = {
  consumes: ["peer_registry_snapshot", "runtime_gate", "rate_boundary_snapshot", "peer_reputation_summary"],
  produces: ["gossip_sync_plan_manifest"],
  validates: ["runtime_mode", "peer_status", "reputation_action", "cooldown", "rate_boundary", "deterministic_jitter"],
  forbids: ["workflow_mutation", "live_network_transport", "peer_discovery", "cross_repo_pr_creation", "github_api_call", "rate_limit_bypass"],
  deterministic: true,
  manifestOnly: true,
  scheduleOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-06T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const PEER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REGISTRY_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const PEER_STATUSES = new Set(["active", "suspended", "quarantined", "deprecated"]);
const TREATY_STATUSES = new Set(["active", "suspended", "revoked"]);
const RUNTIME_MODES = new Set(["federate", "observe", "quarantine", "halted"]);
const REPUTATION_ACTIONS = new Set(["observe", "downrank", "quarantine", "revocation_review"]);
const STATUSES = new Set(["gossip_sync_ready", "delayed", "blocked", "invalid"]);
const DECISIONS = new Set(["gossip_sync_ready", "gossip_sync_delayed", "gossip_sync_blocked", "invalid_gossip_sync_input"]);
const PEER_DECISIONS = new Set(["schedule", "delay", "skip"]);
const RESULT_KEYS = new Set(["manifest_version", "schema_ref", "gossip_sync_id", "created_at", "status", "decision", "reasons", "inputs", "peer_registry_ref", "sync_plan", "guards", "dry_run", "gossip_sync_digest", "issues"]);
const INPUTS_KEYS = new Set(["runtime", "peer_registry", "rate_boundary"]);
const RUNTIME_KEYS = new Set(["mode", "allowed", "kill_switch_engaged"]);
const REGISTRY_KEYS = new Set(["registry_id", "peers"]);
const PEER_KEYS = new Set(["peer_id", "repository_full_name", "status", "treaty_id", "treaty_status", "reputation_score", "reputation_action", "last_sync_at", "cooldown_until"]);
const RATE_KEYS = new Set(["base_interval_seconds", "jitter_max_seconds", "max_peers_per_sync", "max_syncs_per_window", "current_window_sync_count", "window_reset_at", "global_cooldown_until"]);
const REGISTRY_REF_KEYS = new Set(["registry_id", "registry_digest", "peer_count"]);
const SYNC_PLAN_KEYS = new Set(["next_sync_at", "scheduled_count", "delayed_count", "skipped_count", "rate_slots_remaining", "peer_decisions"]);
const PEER_DECISION_KEYS = new Set(["peer_id", "repository_full_name", "status", "decision", "reason", "scheduled_at", "jitter_seconds", "cooldown_until"]);
const ISSUE_KEYS = new Set(["path", "code", "message"]);

const DEFAULT_RATE_BOUNDARY: GossipRateBoundaryResolved = {
  base_interval_seconds: 900,
  jitter_max_seconds: 120,
  max_peers_per_sync: 2,
  max_syncs_per_window: 5,
  current_window_sync_count: 0,
  window_reset_at: "2026-07-06T01:00:00Z",
  global_cooldown_until: null,
};

interface NormalizedInput {
  readonly input: GossipSyncInput | null;
  readonly now?: string;
  readonly issues: readonly GossipIssue[];
}

interface ComputedPlan {
  readonly status: Exclude<GossipSyncStatus, "invalid">;
  readonly decision: Exclude<GossipSyncDecision, "invalid_gossip_sync_input">;
  readonly reasons: readonly string[];
  readonly syncPlan: GossipSyncResult["sync_plan"];
  readonly peerRegistryRef: GossipSyncResult["peer_registry_ref"];
}

export function scheduleGossipSync(input: unknown): GossipSyncResult {
  const normalized = normalizeInput(input);
  const createdAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [makeIssue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "input must be an object")]);

  const result = resultFor(createdAt ?? DEFAULT_NOW, normalized.input);
  const validation = validateGossipSync(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, validation.issues);
  return result;
}

export function validateGossipSync(value: unknown): GossipSyncValidation {
  const issues: GossipIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [makeIssue("result", "result_must_be_object", "gossip sync result must be an object")] };
  validateKnownKeys(value, RESULT_KEYS, "result", issues);
  validateTopLevel(value, issues);
  const inputs = validateInputs(value.inputs, "inputs", issues, value.status === "invalid");
  validateRegistryRef(value.peer_registry_ref, "peer_registry_ref", issues);
  validateSyncPlan(value.sync_plan, "sync_plan", issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value, issues);
  validateNoSecretMaterial(value, "result", issues);

  if (issues.length === 0 && value.status !== "invalid" && inputs !== null) {
    const computed = computePlan(value.created_at as string, inputs.runtime, inputs.peer_registry, inputs.rate_boundary);
    if (value.status !== computed.status) issue(issues, "status", "status_mismatch", "status must match the recomputed gossip plan");
    if (value.decision !== computed.decision) issue(issues, "decision", "decision_mismatch", "decision must match the recomputed gossip plan");
    if (canonicalStringify(value.reasons) !== canonicalStringify(computed.reasons)) issue(issues, "reasons", "reasons_mismatch", "reasons must match the recomputed gossip plan");
    if (canonicalStringify(value.peer_registry_ref) !== canonicalStringify(computed.peerRegistryRef)) issue(issues, "peer_registry_ref", "registry_ref_mismatch", "peer registry ref must match inputs");
    if (canonicalStringify(value.sync_plan) !== canonicalStringify(computed.syncPlan)) issue(issues, "sync_plan", "sync_plan_mismatch", "sync plan must be recalculated from inputs");
  }

  const expectedDigest = canonicalDigest(gossipDigestPayload(value as unknown as GossipSyncResult));
  if (typeof value.gossip_sync_digest !== "string" || value.gossip_sync_digest !== expectedDigest) issue(issues, "gossip_sync_digest", "digest_mismatch", "gossip_sync_digest must cover the gossip sync payload");
  if (typeof value.gossip_sync_id !== "string" || value.gossip_sync_id !== stableId("gossip-sync", [expectedDigest])) issue(issues, "gossip_sync_id", "id_mismatch", "gossip_sync_id must match gossip_sync_digest");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(input: unknown): NormalizedInput {
  const issues: GossipIssue[] = [];
  if (!isRecord(input)) return { input: null, issues: [makeIssue("input", "input_must_be_object", "input must be an object")] };
  validateNoSecretMaterial(input, "input", issues);
  const runtime = normalizeRuntime(input.runtime, "runtime", issues);
  const peerRegistry = normalizeRegistry(input.peer_registry, "peer_registry", issues, false, false, false);
  const rateBoundary = normalizeRateBoundary(input.rate_boundary, "rate_boundary", issues, false);
  const now = optionalString(input.now, "now", issues);
  return { input: { runtime, peer_registry: peerRegistry, rate_boundary: rateBoundary, ...(now === undefined ? {} : { now }) }, now, issues };
}

function resultFor(createdAt: string, input: GossipSyncInput): GossipSyncResult {
  const runtime = normalizeRuntime(input.runtime, "runtime", []);
  const peerRegistry = normalizeRegistry(input.peer_registry, "peer_registry", [], true, false, false);
  const rateBoundary = normalizeRateBoundary(input.rate_boundary, "rate_boundary", [], false);
  const computed = computePlan(createdAt, runtime, peerRegistry, rateBoundary);
  const draft: Omit<GossipSyncResult, "gossip_sync_id" | "gossip_sync_digest"> = {
    manifest_version: GOSSIP_SYNC_VERSION,
    schema_ref: GOSSIP_SYNC_SCHEMA_REF,
    created_at: createdAt,
    status: computed.status,
    decision: computed.decision,
    reasons: computed.reasons,
    inputs: { runtime, peer_registry: peerRegistry, rate_boundary: rateBoundary },
    peer_registry_ref: computed.peerRegistryRef,
    sync_plan: computed.syncPlan,
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(gossipDigestPayload(draft));
  return { ...draft, gossip_sync_id: stableId("gossip-sync", [digest]), gossip_sync_digest: digest };
}

function invalidResult(createdAt: string, issues: readonly GossipIssue[]): GossipSyncResult {
  const safe = emptyInput();
  const runtime = normalizeRuntime(safe.runtime, "runtime", []);
  const peerRegistry = normalizeRegistry(safe.peer_registry, "peer_registry", [], true, true, true);
  const rateBoundary = normalizeRateBoundary(safe.rate_boundary, "rate_boundary", [], true);
  const computed = computePlan(createdAt, runtime, peerRegistry, rateBoundary);
  const draft: Omit<GossipSyncResult, "gossip_sync_id" | "gossip_sync_digest"> = {
    manifest_version: GOSSIP_SYNC_VERSION,
    schema_ref: GOSSIP_SYNC_SCHEMA_REF,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_gossip_sync_input",
    reasons: uniqueStrings(["invalid_gossip_sync_input", ...issues.map((entry) => entry.code)]),
    inputs: { runtime, peer_registry: peerRegistry, rate_boundary: rateBoundary },
    peer_registry_ref: computed.peerRegistryRef,
    sync_plan: computed.syncPlan,
    guards: guards(),
    dry_run: dryRun(),
    issues,
  };
  const digest = canonicalDigest(gossipDigestPayload(draft));
  return { ...draft, gossip_sync_id: stableId("gossip-sync", [digest]), gossip_sync_digest: digest };
}

function computePlan(createdAt: string, runtime: Required<GossipRuntimeInput>, registry: GossipPeerRegistryInput, rateBoundary: GossipRateBoundaryResolved): ComputedPlan {
  const registryDigest = canonicalDigest(registry);
  const peerRegistryRef = { registry_id: registry.registry_id, registry_digest: registryDigest, peer_count: registry.peers.length };
  const runtimeIssues = runtimeBlockIssues(runtime);
  const rateSlotsRemaining = Math.max(0, rateBoundary.max_syncs_per_window - rateBoundary.current_window_sync_count);
  const availableSlots = Math.min(rateBoundary.max_peers_per_sync, rateSlotsRemaining);
  const globalCooldownActive = rateBoundary.global_cooldown_until !== null && Date.parse(rateBoundary.global_cooldown_until) > Date.parse(createdAt);
  const rateCapExhausted = rateSlotsRemaining <= 0;
  const decisions: GossipPeerDecision[] = [];
  let slotsUsed = 0;

  for (const peer of registry.peers) {
    const jitter = jitterSeconds(registry.registry_id, peer.peer_id, createdAt, rateBoundary.jitter_max_seconds);
    const cadenceAt = maxTimestamp([
      addSeconds(createdAt, rateBoundary.base_interval_seconds + jitter),
      peer.last_sync_at === null || peer.last_sync_at === undefined ? createdAt : addSeconds(peer.last_sync_at, rateBoundary.base_interval_seconds + jitter),
    ]);
    const peerCooldownUntil = futureTimestamp(peer.cooldown_until ?? null, createdAt);
    const globalCooldownUntil = futureTimestamp(rateBoundary.global_cooldown_until, createdAt);
    const cooldownUntil = maxNullableTimestamp([peerCooldownUntil, globalCooldownUntil]);

    if (peer.status !== "active") {
      decisions.push(peerDecision(peer, "skip", `peer_${peer.status}`, null, jitter, peerCooldownUntil));
      continue;
    }
    if (peer.treaty_status !== "active") {
      decisions.push(peerDecision(peer, "skip", "treaty_not_active", null, jitter, peerCooldownUntil));
      continue;
    }
    if (peer.reputation_action === "quarantine" || peer.reputation_action === "revocation_review") {
      decisions.push(peerDecision(peer, "skip", `reputation_${peer.reputation_action}`, null, jitter, peerCooldownUntil));
      continue;
    }
    if (runtimeIssues.length > 0) {
      decisions.push(peerDecision(peer, "skip", "runtime_not_federate", null, jitter, peerCooldownUntil));
      continue;
    }
    if (globalCooldownActive || peerCooldownUntil !== null) {
      decisions.push(peerDecision(peer, "delay", globalCooldownActive ? "global_cooldown_active" : "peer_cooldown_active", maxTimestamp([cadenceAt, cooldownUntil ?? cadenceAt]), jitter, cooldownUntil));
      continue;
    }
    if (rateCapExhausted || slotsUsed >= availableSlots) {
      decisions.push(peerDecision(peer, "delay", "rate_slot_unavailable", rateBoundary.window_reset_at, jitter, null));
      continue;
    }
    slotsUsed += 1;
    decisions.push(peerDecision(peer, "schedule", "cadence_ready", cadenceAt, jitter, null));
  }

  const scheduled = decisions.filter((entry) => entry.decision === "schedule");
  const delayed = decisions.filter((entry) => entry.decision === "delay");
  const skipped = decisions.filter((entry) => entry.decision === "skip");
  const nextSyncAt = minNullableTimestamp([...scheduled, ...delayed].map((entry) => entry.scheduled_at));
  const syncPlan = {
    next_sync_at: nextSyncAt,
    scheduled_count: scheduled.length,
    delayed_count: delayed.length,
    skipped_count: skipped.length,
    rate_slots_remaining: Math.max(0, availableSlots - scheduled.length),
    peer_decisions: decisions,
  };
  if (runtimeIssues.length > 0) return { status: "blocked", decision: "gossip_sync_blocked", reasons: uniqueStrings(["runtime_not_federate", ...runtimeIssues.map((entry) => entry.code)]), syncPlan, peerRegistryRef };
  if (scheduled.length > 0) return { status: "gossip_sync_ready", decision: "gossip_sync_ready", reasons: ["gossip_sync_ready", "deterministic_cadence_calculated"], syncPlan, peerRegistryRef };
  if (delayed.length > 0) return { status: "delayed", decision: "gossip_sync_delayed", reasons: uniqueStrings(["gossip_sync_delayed", ...delayed.map((entry) => entry.reason)]), syncPlan, peerRegistryRef };
  return { status: "blocked", decision: "gossip_sync_blocked", reasons: ["no_eligible_peers"], syncPlan, peerRegistryRef };
}

function validateInputs(value: unknown, path: string, issues: GossipIssue[], allowEmptyPeers: boolean): GossipSyncResult["inputs"] | null {
  if (!isRecord(value)) {
    issue(issues, path, "inputs_required", "inputs must be present");
    return null;
  }
  validateKnownKeys(value, INPUTS_KEYS, path, issues);
  const start = issues.length;
  const runtime = normalizeRuntime(value.runtime, `${path}.runtime`, issues);
  const peerRegistry = normalizeRegistry(value.peer_registry, `${path}.peer_registry`, issues, true, allowEmptyPeers, true);
  const rateBoundary = normalizeRateBoundary(value.rate_boundary, `${path}.rate_boundary`, issues, true);
  return issues.length === start ? { runtime, peer_registry: peerRegistry, rate_boundary: rateBoundary } : null;
}

function normalizeRuntime(value: unknown, path: string, issues: GossipIssue[]): Required<GossipRuntimeInput> {
  if (!isRecord(value)) {
    issue(issues, path, "runtime_must_be_object", "runtime must be an object");
    return { mode: "halted", allowed: false, kill_switch_engaged: true };
  }
  validateKnownKeys(value, RUNTIME_KEYS, path, issues);
  const mode = enumField(value.mode, RUNTIME_MODES, `${path}.mode`, "invalid_runtime_mode", issues, "halted") as GossipRuntimeMode;
  const allowed = booleanField(value.allowed, `${path}.allowed`, issues);
  const killSwitch = value.kill_switch_engaged === undefined ? false : booleanField(value.kill_switch_engaged, `${path}.kill_switch_engaged`, issues);
  return { mode, allowed, kill_switch_engaged: killSwitch };
}

function normalizeRegistry(value: unknown, path: string, issues: GossipIssue[], requireSorted: boolean, allowEmptyPeers: boolean, requireCompletePeers: boolean): GossipPeerRegistryInput {
  if (!isRecord(value)) {
    issue(issues, path, "peer_registry_must_be_object", "peer registry must be an object");
    return emptyInput().peer_registry;
  }
  validateKnownKeys(value, REGISTRY_KEYS, path, issues);
  const registryId = stringField(value.registry_id, `${path}.registry_id`, issues);
  if (registryId.length > 0 && !REGISTRY_ID.test(registryId)) issue(issues, `${path}.registry_id`, "invalid_registry_id", "registry id must be lowercase kebab-case");
  if (!Array.isArray(value.peers)) {
    issue(issues, `${path}.peers`, "peers_must_be_array", "peers must be an array");
    return { registry_id: registryId, peers: [] };
  }
  if (!allowEmptyPeers && value.peers.length === 0) issue(issues, `${path}.peers`, "peers_required", "at least one peer is required");
  const seen = new Set<string>();
  const peers = value.peers.map((entry, index) => normalizePeer(entry, `${path}.peers.${index}`, issues, requireCompletePeers));
  for (const [index, peer] of peers.entries()) {
    if (seen.has(peer.peer_id)) issue(issues, `${path}.peers.${index}.peer_id`, "duplicate_peer_id", "peer ids must be unique");
    if (requireSorted && index > 0 && compare(peers[index - 1]?.peer_id ?? "", peer.peer_id) > 0) issue(issues, `${path}.peers`, "entries_not_sorted", "peers must be sorted by peer_id");
    seen.add(peer.peer_id);
  }
  return { registry_id: registryId, peers: [...peers].sort((left, right) => compare(left.peer_id, right.peer_id)) };
}

function normalizePeer(value: unknown, path: string, issues: GossipIssue[], requireComplete: boolean): GossipPeerInput {
  if (!isRecord(value)) {
    issue(issues, path, "peer_must_be_object", "peer must be an object");
    return emptyPeer();
  }
  validateKnownKeys(value, PEER_KEYS, path, issues);
  if (requireComplete) {
    if (!("last_sync_at" in value)) issue(issues, `${path}.last_sync_at`, "missing_peer_key", "resolved peer snapshots must include last_sync_at");
    if (!("cooldown_until" in value)) issue(issues, `${path}.cooldown_until`, "missing_peer_key", "resolved peer snapshots must include cooldown_until");
  }
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const repository = stringField(value.repository_full_name, `${path}.repository_full_name`, issues);
  const status = enumField(value.status, PEER_STATUSES, `${path}.status`, "invalid_peer_status", issues, "deprecated") as GossipPeerStatus;
  const treatyId = stringField(value.treaty_id, `${path}.treaty_id`, issues);
  const treatyStatus = enumField(value.treaty_status, TREATY_STATUSES, `${path}.treaty_status`, "invalid_treaty_status", issues, "revoked") as GossipTreatyStatus;
  const reputationScore = integerField(value.reputation_score, `${path}.reputation_score`, issues, 0, 100, 0);
  const reputationAction = enumField(value.reputation_action, REPUTATION_ACTIONS, `${path}.reputation_action`, "invalid_reputation_action", issues, "revocation_review") as GossipReputationAction;
  const lastSyncAt = nullableTimestamp(value.last_sync_at, `${path}.last_sync_at`, issues);
  const cooldownUntil = nullableTimestamp(value.cooldown_until, `${path}.cooldown_until`, issues);
  if (peerId.length > 0 && !PEER_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (repository.length > 0 && !REPOSITORY.test(repository)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  if (treatyId.length > 0 && !PEER_ID.test(treatyId)) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  return { peer_id: peerId, repository_full_name: repository, status, treaty_id: treatyId, treaty_status: treatyStatus, reputation_score: reputationScore, reputation_action: reputationAction, last_sync_at: lastSyncAt, cooldown_until: cooldownUntil };
}

function normalizeRateBoundary(value: unknown, path: string, issues: GossipIssue[], requireComplete: boolean): GossipRateBoundaryResolved {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, "rate_boundary_required", "resolved rate boundary must be present");
    return DEFAULT_RATE_BOUNDARY;
  }
  if (!isRecord(value)) {
    issue(issues, path, "rate_boundary_must_be_object", "rate boundary must be an object");
    return DEFAULT_RATE_BOUNDARY;
  }
  validateKnownKeys(value, RATE_KEYS, path, issues);
  const out = { ...DEFAULT_RATE_BOUNDARY };
  out.base_interval_seconds = optionalInteger(value.base_interval_seconds, `${path}.base_interval_seconds`, issues, 1, 86400, out.base_interval_seconds, requireComplete);
  out.jitter_max_seconds = optionalInteger(value.jitter_max_seconds, `${path}.jitter_max_seconds`, issues, 0, 3600, out.jitter_max_seconds, requireComplete);
  out.max_peers_per_sync = optionalInteger(value.max_peers_per_sync, `${path}.max_peers_per_sync`, issues, 1, 100, out.max_peers_per_sync, requireComplete);
  out.max_syncs_per_window = optionalInteger(value.max_syncs_per_window, `${path}.max_syncs_per_window`, issues, 1, 1000, out.max_syncs_per_window, requireComplete);
  out.current_window_sync_count = optionalInteger(value.current_window_sync_count, `${path}.current_window_sync_count`, issues, 0, 1000, out.current_window_sync_count, requireComplete);
  out.window_reset_at = optionalTimestamp(value.window_reset_at, `${path}.window_reset_at`, issues, out.window_reset_at, requireComplete);
  if (requireComplete && !("global_cooldown_until" in value)) issue(issues, `${path}.global_cooldown_until`, "missing_rate_boundary_key", "resolved rate boundary must include global_cooldown_until");
  out.global_cooldown_until = nullableTimestamp(value.global_cooldown_until, `${path}.global_cooldown_until`, issues);
  if (out.current_window_sync_count > out.max_syncs_per_window) issue(issues, `${path}.current_window_sync_count`, "current_window_exceeds_max", "current window count must not exceed max_syncs_per_window");
  return out;
}

function validateTopLevel(value: Record<string, unknown>, issues: GossipIssue[]): void {
  if (value.manifest_version !== GOSSIP_SYNC_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== GOSSIP_SYNC_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T064 gossip sync v1");
  if (typeof value.gossip_sync_id !== "string" || !ID.test(value.gossip_sync_id)) issue(issues, "gossip_sync_id", "invalid_gossip_sync_id", "gossip_sync_id must be deterministic");
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (typeof value.status !== "string" || !STATUSES.has(value.status)) issue(issues, "status", "invalid_status", "status must be known");
  if (typeof value.decision !== "string" || !DECISIONS.has(value.decision)) issue(issues, "decision", "invalid_decision", "decision must be known");
  if (!Array.isArray(value.reasons) || value.reasons.length === 0 || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
}

function validateRegistryRef(value: unknown, path: string, issues: GossipIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "registry_ref_required", "peer registry ref must be present");
    return;
  }
  validateKnownKeys(value, REGISTRY_REF_KEYS, path, issues);
  if (typeof value.registry_id !== "string" || !REGISTRY_ID.test(value.registry_id)) issue(issues, `${path}.registry_id`, "invalid_registry_id", "registry id must be lowercase kebab-case");
  if (typeof value.registry_digest !== "string" || !HASH.test(value.registry_digest)) issue(issues, `${path}.registry_digest`, "invalid_registry_digest", "registry digest must be stable");
  if (!isNonNegativeInteger(value.peer_count)) issue(issues, `${path}.peer_count`, "invalid_peer_count", "peer_count must be a non-negative integer");
}

function validateSyncPlan(value: unknown, path: string, issues: GossipIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "sync_plan_required", "sync plan must be present");
    return;
  }
  validateKnownKeys(value, SYNC_PLAN_KEYS, path, issues);
  if (value.next_sync_at !== null && (typeof value.next_sync_at !== "string" || !isRfc3339Utc(value.next_sync_at))) issue(issues, `${path}.next_sync_at`, "invalid_next_sync_at", "next_sync_at must be null or RFC3339 UTC");
  for (const key of ["scheduled_count", "delayed_count", "skipped_count", "rate_slots_remaining"]) if (!isNonNegativeInteger(value[key])) issue(issues, `${path}.${key}`, "invalid_count", `${key} must be a non-negative integer`);
  if (!Array.isArray(value.peer_decisions)) {
    issue(issues, `${path}.peer_decisions`, "peer_decisions_required", "peer decisions must be an array");
    return;
  }
  value.peer_decisions.forEach((entry, index) => validatePeerDecision(entry, `${path}.peer_decisions.${index}`, issues));
}

function validatePeerDecision(value: unknown, path: string, issues: GossipIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "peer_decision_must_be_object", "peer decision must be an object");
    return;
  }
  validateKnownKeys(value, PEER_DECISION_KEYS, path, issues);
  if (typeof value.peer_id !== "string" || !PEER_ID.test(value.peer_id)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (typeof value.repository_full_name !== "string" || !REPOSITORY.test(value.repository_full_name)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  if (typeof value.status !== "string" || !PEER_STATUSES.has(value.status)) issue(issues, `${path}.status`, "invalid_peer_status", "peer status must be known");
  if (typeof value.decision !== "string" || !PEER_DECISIONS.has(value.decision)) issue(issues, `${path}.decision`, "invalid_peer_decision", "peer decision must be known");
  if (typeof value.reason !== "string" || value.reason.length === 0) issue(issues, `${path}.reason`, "invalid_reason", "reason must be non-empty");
  if (value.scheduled_at !== null && (typeof value.scheduled_at !== "string" || !isRfc3339Utc(value.scheduled_at))) issue(issues, `${path}.scheduled_at`, "invalid_scheduled_at", "scheduled_at must be null or RFC3339 UTC");
  if (!isNonNegativeInteger(value.jitter_seconds)) issue(issues, `${path}.jitter_seconds`, "invalid_jitter", "jitter must be a non-negative integer");
  if (value.cooldown_until !== null && (typeof value.cooldown_until !== "string" || !isRfc3339Utc(value.cooldown_until))) issue(issues, `${path}.cooldown_until`, "invalid_cooldown_until", "cooldown_until must be null or RFC3339 UTC");
}

function validateGuards(value: unknown, issues: GossipIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(guards())), "guards", issues);
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: GossipIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(dryRun())), "dry_run", issues);
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(value: Record<string, unknown>, issues: GossipIssue[]): void {
  if (value.status === "gossip_sync_ready" && value.decision !== "gossip_sync_ready") issue(issues, "decision", "ready_decision_mismatch", "ready gossip sync must use gossip_sync_ready");
  if (value.status === "delayed" && value.decision !== "gossip_sync_delayed") issue(issues, "decision", "delayed_decision_mismatch", "delayed gossip sync must use gossip_sync_delayed");
  if (value.status === "blocked" && value.decision !== "gossip_sync_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked gossip sync must use gossip_sync_blocked");
  if (value.status === "invalid" && value.decision !== "invalid_gossip_sync_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid gossip sync must use invalid_gossip_sync_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid gossip sync must carry issues");
    else value.issues.forEach((entry, index) => validateIssue(entry, `issues.${index}`, issues));
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid gossip sync must not carry issues");
  }
}

function validateIssue(value: unknown, path: string, issues: GossipIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "issue_must_be_object", "issue must be an object");
    return;
  }
  validateKnownKeys(value, ISSUE_KEYS, path, issues);
  for (const key of ["path", "code", "message"]) if (typeof value[key] !== "string" || value[key].length === 0) issue(issues, `${path}.${key}`, "invalid_issue_field", "issue fields must be non-empty strings");
}

function runtimeBlockIssues(runtime: Required<GossipRuntimeInput>): readonly GossipIssue[] {
  const issues: GossipIssue[] = [];
  if (runtime.mode !== "federate") issue(issues, "runtime.mode", "runtime_mode_not_federate", "runtime mode must be federate to schedule gossip sync");
  if (runtime.allowed !== true) issue(issues, "runtime.allowed", "runtime_not_allowed", "runtime gate must allow sync");
  if (runtime.kill_switch_engaged === true) issue(issues, "runtime.kill_switch_engaged", "kill_switch_engaged", "kill switch blocks gossip sync");
  return issues;
}

function peerDecision(peer: GossipPeerInput, decision: GossipPeerDecisionKind, reason: string, scheduledAt: string | null, jitterSecondsValue: number, cooldownUntil: string | null): GossipPeerDecision {
  return {
    peer_id: peer.peer_id,
    repository_full_name: peer.repository_full_name,
    status: peer.status,
    decision,
    reason,
    scheduled_at: scheduledAt,
    jitter_seconds: jitterSecondsValue,
    cooldown_until: cooldownUntil,
  };
}

function guards(): GossipSyncResult["guards"] {
  return {
    runtime_federate_required: true,
    quarantined_peer_excluded: true,
    deterministic_jitter: true,
    cooldown_enforced: true,
    rate_boundary_enforced: true,
    no_workflow_mutation: true,
    no_network_transport: true,
    no_peer_discovery: true,
    no_cross_repo_pr_creation: true,
    no_github_api_call: true,
  };
}

function dryRun(): GossipSyncResult["dry_run"] {
  return {
    workflow_mutated: false,
    network_transport_performed: false,
    peer_discovery_performed: false,
    cross_repo_pr_created: false,
    github_api_called: false,
    queue_slot_persisted: false,
  };
}

function emptyInput(): GossipSyncInput {
  return {
    runtime: { mode: "halted", allowed: false, kill_switch_engaged: true },
    peer_registry: { registry_id: "invalid-registry", peers: [] },
    rate_boundary: DEFAULT_RATE_BOUNDARY,
  };
}

function emptyPeer(): GossipPeerInput {
  return {
    peer_id: "invalid-peer",
    repository_full_name: "owner/invalid",
    status: "deprecated",
    treaty_id: "invalid-treaty",
    treaty_status: "revoked",
    reputation_score: 0,
    reputation_action: "revocation_review",
    last_sync_at: null,
    cooldown_until: null,
  };
}

function gossipDigestPayload(value: Omit<GossipSyncResult, "gossip_sync_id" | "gossip_sync_digest"> | GossipSyncResult): unknown {
  return {
    manifest_version: value.manifest_version,
    schema_ref: value.schema_ref,
    created_at: value.created_at,
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    inputs: value.inputs,
    peer_registry_ref: value.peer_registry_ref,
    sync_plan: value.sync_plan,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function jitterSeconds(registryId: string, peerId: string, createdAt: string, max: number): number {
  return max <= 0 ? 0 : fnv1a(`${registryId}\u001f${peerId}\u001f${createdAt}`) % (max + 1);
}

function nullableTimestamp(value: unknown, path: string, issues: GossipIssue[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !isRfc3339Utc(value)) {
    issue(issues, path, "invalid_timestamp", `${path} must be null or RFC3339 UTC`);
    return null;
  }
  return value;
}

function optionalTimestamp(value: unknown, path: string, issues: GossipIssue[], fallback: string, requireComplete: boolean): string {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, "missing_rate_boundary_key", `${path} is required in resolved rate boundary`);
    return fallback;
  }
  if (typeof value !== "string" || !isRfc3339Utc(value)) {
    issue(issues, path, "invalid_timestamp", `${path} must be RFC3339 UTC`);
    return fallback;
  }
  return value;
}

function optionalInteger(value: unknown, path: string, issues: GossipIssue[], min: number, max: number, fallback: number, requireComplete: boolean): number {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, "missing_rate_boundary_key", `${path} is required in resolved rate boundary`);
    return fallback;
  }
  return integerField(value, path, issues, min, max, fallback);
}

function integerField(value: unknown, path: string, issues: GossipIssue[], min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    issue(issues, path, "invalid_integer", `${path} must be an integer from ${min} to ${max}`);
    return fallback;
  }
  return value;
}

function stringField(value: unknown, path: string, issues: GossipIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: GossipIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
  return value;
}

function enumField(value: unknown, allowed: Set<string>, path: string, code: string, issues: GossipIssue[], fallback: string): string {
  if (typeof value === "string" && allowed.has(value)) return value;
  issue(issues, path, code, `${path} contains an unknown value`);
  return fallback;
}

function booleanField(value: unknown, path: string, issues: GossipIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issue(issues, path, "boolean_required", `${path} must be boolean`);
  return false;
}

function validateKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: GossipIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown_key", "unknown keys are not allowed");
}

function validateNoSecretMaterial(value: unknown, path: string, issues: GossipIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "gossip sync manifests must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}.${index}`, issues));
    return;
  }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function futureTimestamp(value: string | null, now: string): string | null {
  return value !== null && Date.parse(value) > Date.parse(now) ? value : null;
}

function maxNullableTimestamp(values: readonly (string | null)[]): string | null {
  const present = values.filter((entry): entry is string => entry !== null);
  return present.length === 0 ? null : maxTimestamp(present);
}

function minNullableTimestamp(values: readonly (string | null)[]): string | null {
  const present = values.filter((entry): entry is string => entry !== null);
  return present.length === 0 ? null : present.sort((left, right) => Date.parse(left) - Date.parse(right))[0] ?? null;
}

function maxTimestamp(values: readonly string[]): string {
  return [...values].sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? DEFAULT_NOW;
}

function addSeconds(timestamp: string, seconds: number): string {
  return new Date(Date.parse(timestamp) + Math.max(0, seconds) * 1000).toISOString().replace(".000Z", "Z");
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

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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

function issue(issues: GossipIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): GossipIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT064GossipSyncCadence = scheduleGossipSync;
export const validateT064GossipSyncCadence = validateGossipSync;
