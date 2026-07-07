import {
  ARCHIVE_PACK_SCHEMA_REF,
  composeCrossRepoPr,
  enforceNetworkBoundary,
  exportLineagePack,
  validateCrossRepoPr,
  validateLineagePack,
  validateNetworkBoundary,
} from "../../network/dist/index.js";
import {
  compareArenaCandidates,
  evaluatePeerReputation,
  validateArenaComparison,
  validatePeerReputation,
} from "../../eval/dist/index.js";
import {
  renderFederationReport,
  validateFederationReport,
} from "../../reporting/dist/index.js";

export const DISTRIBUTED_EVOLUTION_DEMO_VERSION = 1 as const;
export const DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF = "urn:forgeroot:distributed-evolution-demo:v1" as const;

export type DistributedEvolutionDemoStatus = "ready" | "blocked" | "invalid";
export type DistributedEvolutionDemoDecision = "distributed_evolution_demo_ready" | "distributed_evolution_demo_blocked" | "invalid_distributed_evolution_demo_input";

export interface DistributedEvolutionDemoIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface DistributedEvolutionDemoInput {
  readonly now?: string;
  readonly topology?: unknown;
  readonly route_id?: string;
  readonly open_federation_requested?: boolean;
  readonly network_transport_requested?: boolean;
  readonly lineage_adoption_requested?: boolean;
}

export interface DistributedEvolutionDemoStep {
  readonly name: string;
  readonly status: string;
  readonly produced: string;
  readonly id: string | null;
}

export interface DistributedEvolutionDemoResult {
  readonly manifest_version: typeof DISTRIBUTED_EVOLUTION_DEMO_VERSION;
  readonly schema_ref: typeof DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF;
  readonly demo_id: string;
  readonly created_at: string;
  readonly status: DistributedEvolutionDemoStatus;
  readonly decision: DistributedEvolutionDemoDecision;
  readonly reasons: readonly string[];
  readonly topology_ref: {
    readonly topology_id: string;
    readonly topology_path: "labs/forge-net/topology.yml";
    readonly scope: "lab_only";
    readonly source_of_truth: false;
  };
  readonly steps: readonly DistributedEvolutionDemoStep[];
  readonly summary: {
    readonly route_id: string | null;
    readonly source_peer_id: string | null;
    readonly target_peer_id: string | null;
    readonly lineage_pack_id: string | null;
    readonly boundary_decision_id: string | null;
    readonly cross_repo_composition_id: string | null;
    readonly arena_result_id: string | null;
    readonly federation_report_id: string | null;
    readonly arena_winner_candidate_id: string | null;
  };
  readonly invariants: {
    readonly lab_only: true;
    readonly source_of_truth_replacement: false;
    readonly open_federation_enabled: false;
    readonly live_network_transport_performed: false;
    readonly github_api_called: false;
    readonly github_pr_created: false;
    readonly git_push_performed: false;
    readonly lineage_adoption_performed: false;
    readonly policy_mutation_performed: false;
    readonly authoritative_reputation_written: false;
    readonly automatic_merge_performed: false;
    readonly all_read_back_validations_passed: boolean;
  };
  readonly validation_summary: {
    readonly lineage_pack: boolean;
    readonly peer_reputation: boolean;
    readonly network_boundary: boolean;
    readonly cross_repo_pr: boolean;
    readonly arena: boolean;
    readonly federation_report: boolean;
  };
  readonly chain: {
    readonly lineagePack?: unknown;
    readonly peerReputation?: unknown;
    readonly networkBoundary?: unknown;
    readonly crossRepoPr?: unknown;
    readonly arenaComparison?: unknown;
    readonly federationReport?: unknown;
  };
  readonly demo_digest: string;
  readonly issues?: readonly DistributedEvolutionDemoIssue[];
}

export interface DistributedEvolutionDemoValidation {
  readonly ok: boolean;
  readonly issues: readonly DistributedEvolutionDemoIssue[];
}

export const DISTRIBUTED_EVOLUTION_DEMO_CONTRACT = {
  consumes: [
    "t069_forge_net_topology",
    "t061_lineage_pack_export",
    "t063_peer_reputation",
    "t067_network_boundary",
    "t062_cross_repo_pr_composition",
    "t065_conflict_arena",
    "t068_federation_report",
  ],
  produces: ["t070_distributed_evolution_demo_manifest", "lab_only_distributed_evolution_chain"],
  validates: [
    "topology_lab_only",
    "treaty_scoped_route",
    "lineage_pack_read_back",
    "boundary_read_back",
    "cross_repo_pr_read_back",
    "arena_read_back",
    "federation_report_read_back",
    "no_side_effects",
  ],
  forbids: [
    "open_federation",
    "live_network_transport",
    "github_api_call",
    "github_pr_creation",
    "git_push",
    "automatic_lineage_adoption",
    "authoritative_reputation_write",
    "policy_mutation",
    "automatic_merge",
  ],
  deterministic: true,
  labOnly: true,
  manifestOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-07T00:00:00Z";
const TOPOLOGY_PATH = "labs/forge-net/topology.yml" as const;
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const HASH_1 = `sha256:${"1".repeat(64)}`;
const HASH_2 = `sha256:${"2".repeat(64)}`;
const HASH_3 = `sha256:${"3".repeat(64)}`;
const LINEAGE_ROOT = "forge-lineage://forge-lab-lib/api-stability";
const VALIDATION_SUMMARY_KEYS = ["lineage_pack", "peer_reputation", "network_boundary", "cross_repo_pr", "arena", "federation_report"] as const;
const CHAIN_VALIDATORS = [
  { summaryKey: "lineage_pack", field: "lineagePack", code: "invalid_lineage_pack", message: "lineage pack must validate", validate: validateLineagePack },
  { summaryKey: "peer_reputation", field: "peerReputation", code: "invalid_peer_reputation", message: "peer reputation must validate", validate: validatePeerReputation },
  { summaryKey: "network_boundary", field: "networkBoundary", code: "invalid_network_boundary", message: "network boundary must validate", validate: validateNetworkBoundary },
  { summaryKey: "cross_repo_pr", field: "crossRepoPr", code: "invalid_cross_repo_pr", message: "cross-repo PR must validate", validate: validateCrossRepoPr },
  { summaryKey: "arena", field: "arenaComparison", code: "invalid_arena", message: "arena comparison must validate", validate: validateArenaComparison },
  { summaryKey: "federation_report", field: "federationReport", code: "invalid_federation_report", message: "federation report must validate", validate: validateFederationReport },
] as const;

export function runDistributedEvolutionDemo(input: DistributedEvolutionDemoInput = {}): DistributedEvolutionDemoResult {
  const createdAt = resolveTimestamp(input.now, DEFAULT_NOW);
  const topology = normalizeTopology(input.topology ?? defaultTopology());
  const route = selectRoute(topology, input.route_id ?? "lib-api-stability-to-app");
  const sourcePeer = route === null ? null : findPeer(topology, route.source_peer_id);
  const targetPeer = route === null ? null : findPeer(topology, route.target_peer_id);
  const treaty = route === null ? null : findTreaty(topology, route.treaty_id);
  const inputIssues = [
    ...(createdAt === null ? [issue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...validateTopology(topology),
    ...(route === null ? [issue("route_id", "route_not_found", "route_id must identify a topology lineage route")] : []),
    ...(sourcePeer === null ? [issue("route.source_peer_id", "source_peer_not_found", "route source peer must exist in topology")] : []),
    ...(targetPeer === null ? [issue("route.target_peer_id", "target_peer_not_found", "route target peer must exist in topology")] : []),
    ...(treaty === null ? [issue("route.treaty_id", "treaty_not_found", "route treaty must exist in topology")] : []),
  ];
  if (inputIssues.length > 0 || createdAt === null || route === null || sourcePeer === null || targetPeer === null || treaty === null) {
    return invalidResult(createdAt ?? DEFAULT_NOW, topology, inputIssues.length > 0 ? inputIssues : [issue("input", "invalid_input", "input could not be normalized")]);
  }

  const lineagePack = exportLineagePack(lineageInput(createdAt, sourcePeer, targetPeer, treaty));
  const peerReputation = evaluatePeerReputation(reputationInput(createdAt, targetPeer, treaty));
  const networkBoundary = enforceNetworkBoundary(boundaryInput(createdAt, sourcePeer, targetPeer, treaty, lineagePack, peerReputation, input));
  const crossRepoPr = composeCrossRepoPr(crossRepoInput(createdAt, targetPeer, lineagePack));
  const arenaComparison = compareArenaCandidates(arenaInput(createdAt, crossRepoPr, peerReputation));
  const federationReport = renderFederationReport(reportInput(createdAt, topology, sourcePeer, targetPeer, treaty, lineagePack, peerReputation, networkBoundary));
  const validationSummary = {
    lineage_pack: validateLineagePack(lineagePack).ok,
    peer_reputation: validatePeerReputation(peerReputation).ok,
    network_boundary: validateNetworkBoundary(networkBoundary).ok,
    cross_repo_pr: validateCrossRepoPr(crossRepoPr).ok,
    arena: validateArenaComparison(arenaComparison).ok,
    federation_report: validateFederationReport(federationReport).ok,
  };
  const validationIssues = validationSummary.lineage_pack
    && validationSummary.peer_reputation
    && validationSummary.network_boundary
    && validationSummary.cross_repo_pr
    && validationSummary.arena
    && validationSummary.federation_report
    ? []
    : [issue("chain", "read_back_validation_failed", "one or more generated manifests failed read-back validation")];
  const sideEffectIssues = sideEffectGuardIssues(lineagePack, networkBoundary, crossRepoPr, arenaComparison, federationReport);
  const statusIssues = chainStatusIssues(lineagePack, networkBoundary, crossRepoPr, arenaComparison, federationReport);
  const issues = [...validationIssues, ...sideEffectIssues, ...statusIssues];
  const status: DistributedEvolutionDemoStatus = issues.length > 0 ? "blocked" : "ready";
  const decision: DistributedEvolutionDemoDecision = status === "ready" ? "distributed_evolution_demo_ready" : "distributed_evolution_demo_blocked";
  const draft = resultDraft({
    createdAt,
    topology,
    route,
    sourcePeer,
    targetPeer,
    lineagePack,
    peerReputation,
    networkBoundary,
    crossRepoPr,
    arenaComparison,
    federationReport,
    validationSummary,
    status,
    decision,
    reasons: status === "ready" ? ["distributed_evolution_demo_ready", "lab_only_manifest_chain_complete"] : uniqueStrings(["distributed_evolution_demo_blocked", ...issues.map((entry) => entry.code)]),
    issues,
  });
  const digest = canonicalDigest(demoDigestPayload(draft));
  const result = { ...draft, demo_id: stableId("distributed-evolution-demo", [digest]), demo_digest: digest };
  const selfValidation = validateDistributedEvolutionDemo(result);
  if (!selfValidation.ok) return invalidResult(createdAt, topology, selfValidation.issues);
  return result;
}

export function validateDistributedEvolutionDemo(value: unknown): DistributedEvolutionDemoValidation {
  const issues: DistributedEvolutionDemoIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [issue("result", "result_must_be_object", "demo result must be an object")] };
  if (value.manifest_version !== DISTRIBUTED_EVOLUTION_DEMO_VERSION) issues.push(issue("manifest_version", "invalid_manifest_version", "manifest_version must be 1"));
  if (value.schema_ref !== DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF) issues.push(issue("schema_ref", "invalid_schema_ref", "schema_ref must identify T070 distributed evolution demo"));
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issues.push(issue("created_at", "invalid_created_at", "created_at must be RFC3339 UTC"));
  if (value.status !== "ready" && value.status !== "blocked" && value.status !== "invalid") issues.push(issue("status", "invalid_status", "status must be ready, blocked, or invalid"));
  if (value.decision !== "distributed_evolution_demo_ready" && value.decision !== "distributed_evolution_demo_blocked" && value.decision !== "invalid_distributed_evolution_demo_input") issues.push(issue("decision", "invalid_decision", "decision must be a T070 decision"));
  if (!Array.isArray(value.reasons) || value.reasons.length === 0 || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issues.push(issue("reasons", "invalid_reasons", "reasons must be non-empty strings"));
  validateTopologyRef(value.topology_ref, issues);
  validateSteps(value.steps, issues);
  validateSummary(value.summary, issues);
  validateInvariants(value.invariants, issues);
  validateValidationSummary(value.validation_summary, issues);
  validateChain(value.chain, value.validation_summary, value.status, issues);
  validateReadBackConsistency(value.validation_summary, value.invariants, value.status, issues);
  validateNoSecretMaterial(value, "result", issues);
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issues.push(issue("issues", "invalid_issues_required", "invalid results must carry issues"));
  } else if (value.issues !== undefined && !Array.isArray(value.issues)) {
    issues.push(issue("issues", "invalid_issues", "issues must be an array when present"));
  }
  validateStatusConsistency(value, issues);
  const expectedDigest = canonicalDigest(demoDigestPayload(value as unknown as DistributedEvolutionDemoResult));
  if (typeof value.demo_digest !== "string" || value.demo_digest !== expectedDigest) issues.push(issue("demo_digest", "digest_mismatch", "demo_digest must cover the demo payload"));
  if (typeof value.demo_id !== "string" || value.demo_id !== stableId("distributed-evolution-demo", [expectedDigest])) issues.push(issue("demo_id", "id_mismatch", "demo_id must match demo_digest"));
  return { ok: issues.length === 0, issues };
}

export const runT070DistributedEvolutionDemo = runDistributedEvolutionDemo;
export const validateT070DistributedEvolutionDemo = validateDistributedEvolutionDemo;

function resultDraft(context: {
  readonly createdAt: string;
  readonly topology: Topology;
  readonly route: TopologyRoute;
  readonly sourcePeer: TopologyPeer;
  readonly targetPeer: TopologyPeer;
  readonly lineagePack: any;
  readonly peerReputation: any;
  readonly networkBoundary: any;
  readonly crossRepoPr: any;
  readonly arenaComparison: any;
  readonly federationReport: any;
  readonly validationSummary: DistributedEvolutionDemoResult["validation_summary"];
  readonly status: DistributedEvolutionDemoStatus;
  readonly decision: DistributedEvolutionDemoDecision;
  readonly reasons: readonly string[];
  readonly issues: readonly DistributedEvolutionDemoIssue[];
}): Omit<DistributedEvolutionDemoResult, "demo_id" | "demo_digest"> {
  return {
    manifest_version: DISTRIBUTED_EVOLUTION_DEMO_VERSION,
    schema_ref: DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF,
    created_at: context.createdAt,
    status: context.status,
    decision: context.decision,
    reasons: context.reasons,
    topology_ref: { topology_id: context.topology.topology_id, topology_path: TOPOLOGY_PATH, scope: "lab_only", source_of_truth: false },
    steps: [
      step("lineage_pack", context.lineagePack.status, "t061_lineage_pack", context.lineagePack.lineage_pack_id),
      step("peer_reputation", context.peerReputation.status, "t063_peer_reputation", context.peerReputation.reputation_id),
      step("network_boundary", context.networkBoundary.status, "t067_network_boundary", context.networkBoundary.boundary_decision_id),
      step("cross_repo_pr", context.crossRepoPr.status, "t062_cross_repo_pr", context.crossRepoPr.composition_id),
      step("arena", context.arenaComparison.status, "t065_conflict_arena", context.arenaComparison.arena_result_id),
      step("federation_report", context.federationReport.status, "t068_federation_report", context.federationReport.federation_report_id),
    ],
    summary: {
      route_id: context.route.route_id,
      source_peer_id: context.sourcePeer.peer_id,
      target_peer_id: context.targetPeer.peer_id,
      lineage_pack_id: context.lineagePack.lineage_pack_id ?? null,
      boundary_decision_id: context.networkBoundary.boundary_decision_id ?? null,
      cross_repo_composition_id: context.crossRepoPr.composition_id ?? null,
      arena_result_id: context.arenaComparison.arena_result_id ?? null,
      federation_report_id: context.federationReport.federation_report_id ?? null,
      arena_winner_candidate_id: context.arenaComparison.summary?.winner_candidate_id ?? null,
    },
    invariants: {
      lab_only: true,
      source_of_truth_replacement: false,
      open_federation_enabled: false,
      live_network_transport_performed: false,
      github_api_called: false,
      github_pr_created: false,
      git_push_performed: false,
      lineage_adoption_performed: false,
      policy_mutation_performed: false,
      authoritative_reputation_written: false,
      automatic_merge_performed: false,
      all_read_back_validations_passed: Object.values(context.validationSummary).every((entry) => entry === true),
    },
    validation_summary: context.validationSummary,
    chain: {
      lineagePack: context.lineagePack,
      peerReputation: context.peerReputation,
      networkBoundary: context.networkBoundary,
      crossRepoPr: context.crossRepoPr,
      arenaComparison: context.arenaComparison,
      federationReport: context.federationReport,
    },
    ...(context.issues.length === 0 ? {} : { issues: context.issues }),
  };
}

function invalidResult(createdAt: string, topology: Topology, issues: readonly DistributedEvolutionDemoIssue[]): DistributedEvolutionDemoResult {
  const validationSummary = { lineage_pack: false, peer_reputation: false, network_boundary: false, cross_repo_pr: false, arena: false, federation_report: false };
  const draft: Omit<DistributedEvolutionDemoResult, "demo_id" | "demo_digest"> = {
    manifest_version: DISTRIBUTED_EVOLUTION_DEMO_VERSION,
    schema_ref: DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_distributed_evolution_demo_input",
    reasons: uniqueStrings(["invalid_distributed_evolution_demo_input", ...issues.map((entry) => entry.code)]),
    topology_ref: { topology_id: topology.topology_id || "invalid-topology", topology_path: TOPOLOGY_PATH, scope: "lab_only", source_of_truth: false },
    steps: [],
    summary: { route_id: null, source_peer_id: null, target_peer_id: null, lineage_pack_id: null, boundary_decision_id: null, cross_repo_composition_id: null, arena_result_id: null, federation_report_id: null, arena_winner_candidate_id: null },
    invariants: {
      lab_only: true,
      source_of_truth_replacement: false,
      open_federation_enabled: false,
      live_network_transport_performed: false,
      github_api_called: false,
      github_pr_created: false,
      git_push_performed: false,
      lineage_adoption_performed: false,
      policy_mutation_performed: false,
      authoritative_reputation_written: false,
      automatic_merge_performed: false,
      all_read_back_validations_passed: false,
    },
    validation_summary: validationSummary,
    chain: {},
    issues,
  };
  const digest = canonicalDigest(demoDigestPayload(draft));
  return { ...draft, demo_id: stableId("distributed-evolution-demo", [digest]), demo_digest: digest };
}

function lineageInput(now: string, sourcePeer: TopologyPeer, targetPeer: TopologyPeer, treaty: TopologyTreaty): unknown {
  return {
    now,
    treaty: {
      treaty_id: treaty.treaty_id,
      status: treaty.status,
      source_peer_id: sourcePeer.peer_id,
      target_peer_id: targetPeer.peer_id,
      allowed_actions: ["lineage_export", "lineage_import_candidate"],
      allowed_lineage_roots: [LINEAGE_ROOT],
      allowed_record_kinds: ["evaluation", "lineage_handoff", "mutation"],
      expires_at: treaty.expires_at,
    },
    source_peer: { peer_id: sourcePeer.peer_id, repository_full_name: sourcePeer.repository_full_name, status: sourcePeer.status },
    target_peer: { peer_id: targetPeer.peer_id, repository_full_name: targetPeer.repository_full_name, status: targetPeer.status },
    archive_pack_ref: {
      schema_ref: ARCHIVE_PACK_SCHEMA_REF,
      pack_id: "forge-archive-pack://t070/lib-app-api-stability",
      raw_sha256: HASH_1,
      compressed_sha256: HASH_2,
      record_count: 2,
    },
    lineage_records: [
      record("eval-handoff-a", "evaluation", "urn:forgeroot:conflict-arena:v1", HASH_1),
      record("mutation-handoff-b", "mutation", "urn:forgeroot:mutate-evolution-guard:v1", HASH_2),
    ],
  };
}

function reputationInput(now: string, targetPeer: TopologyPeer, treaty: TopologyTreaty): unknown {
  return {
    now,
    peer: { peer_id: targetPeer.peer_id, repository_full_name: targetPeer.repository_full_name, status: targetPeer.status },
    treaty: {
      treaty_id: treaty.treaty_id,
      status: treaty.status,
      source_peer_id: treaty.source_peer_id,
      target_peer_id: treaty.target_peer_id,
      expires_at: treaty.expires_at,
    },
    outcomes: [
      outcome("outcome-11111111", "cross-repo-pr:t070-lib-app-11111111", "accepted", true, "medium"),
      outcome("outcome-22222222", "cross-repo-pr:t070-lib-app-22222222", "accepted", true, "low"),
      outcome("outcome-33333333", "cross-repo-pr:t070-lib-app-33333333", "rejected", true, "medium"),
    ],
  };
}

function boundaryInput(now: string, sourcePeer: TopologyPeer, targetPeer: TopologyPeer, treaty: TopologyTreaty, lineagePack: any, reputation: any, input: DistributedEvolutionDemoInput): unknown {
  return {
    now,
    boundary_id: "t070-distributed-evolution-boundary",
    runtime: {
      mode: "federate",
      allowed: true,
      kill_switch_engaged: false,
      open_federation_requested: input.open_federation_requested ?? false,
    },
    peer: { peer_id: targetPeer.peer_id, repository_full_name: targetPeer.repository_full_name, status: targetPeer.status, registry_known: targetPeer.registry_known },
    treaty: {
      treaty_id: treaty.treaty_id,
      status: treaty.status,
      source_peer_id: sourcePeer.peer_id,
      target_peer_id: targetPeer.peer_id,
      allowed_actions: treaty.allowed_actions,
      expires_at: treaty.expires_at,
    },
    request: {
      action: "lineage_import_candidate",
      source_peer_id: sourcePeer.peer_id,
      target_peer_id: targetPeer.peer_id,
      lineage_ref: LINEAGE_ROOT,
      proposal_ref: String(lineagePack.lineage_pack_id ?? "lineage-pack-missing-00000000"),
      evidence_digest: String(lineagePack.lineage_pack_digest ?? HASH_3),
      imported_lineage_adoption_requested: input.lineage_adoption_requested ?? false,
      network_transport_requested: input.network_transport_requested ?? false,
    },
    reputation: { score: Number(reputation.score?.value ?? 0), recommended_action: String(reputation.recommended_action ?? "revocation_review") },
  };
}

function crossRepoInput(now: string, targetPeer: TopologyPeer, lineagePack: any): unknown {
  return {
    now,
    lineage_pack: lineagePack,
    peer: {
      peer_id: targetPeer.peer_id,
      repository_full_name: targetPeer.repository_full_name,
      status: targetPeer.status,
      allowed_actions: ["cross_repo_pr"],
      allowed_paths: ["docs/", "packages/"],
    },
    proposal: {
      title: "distributed evolution candidate handoff",
      summary: "Share a bounded evolution candidate from the lab library forge to the lab application forge.",
      head_branch: "forge/t070-distributed-evolution-demo",
      base_branch: "main",
      changed_paths: ["docs/forge-net/t070-distributed-evolution.md"],
      risk: "high",
      rollback: "Close the draft cross-repo proposal manifest and keep the lineage candidate unadopted.",
      labels: ["t070", "distributed-evolution"],
    },
  };
}

function arenaInput(now: string, crossRepoPr: any, reputation: any): unknown {
  return {
    now,
    arena_id: "arena-t070-distributed-11111111",
    conflict: { conflict_id: "conflict-t070-demo-11111111", reason: "behavior_conflict", summary: "distributed evolution candidate compared against local hold" },
    eval_binding: {
      shadow_run_ref: "eval-shadow-run:t070-demo",
      eval_suite_ref: ".forge/evals/root.forge",
      lineage_threshold_ref: "lineage-threshold:t070-demo",
    },
    candidates: [
      candidate("candidate-peer-evolution-11111111", "peer", `cross-repo-pr:${crossRepoPr.composition_id}`, 88, 84, Number(reputation.score?.value ?? 50), "medium", String(crossRepoPr.composition_digest ?? HASH_3)),
      candidate("candidate-local-hold-22222222", "local", "local:hold-current-behavior", 60, 58, 40, "low", "sha-fnv1a-22222222"),
    ],
  };
}

function reportInput(now: string, topology: Topology, sourcePeer: TopologyPeer, targetPeer: TopologyPeer, treaty: TopologyTreaty, lineagePack: any, reputation: any, boundary: any): unknown {
  return {
    now,
    report_id: "t070-distributed-evolution-report",
    source_refs: {
      peer_registry_ref: "forge://hiroshitanaka-creator/ForgeRoot/labs/forge-net/repositories",
      reputation_ref: "forge://hiroshitanaka-creator/ForgeRoot/reputation/t063",
      boundary_policy_ref: "forge://hiroshitanaka-creator/ForgeRoot/policy/network-boundary",
      treaty_refs: topology.treaty_links.map((entry) => `forge://hiroshitanaka-creator/ForgeRoot/labs/forge-net/treaty/${entry.treaty_id}`),
      lineage_refs: [LINEAGE_ROOT],
    },
    peers: topology.repositories.map((peer) => ({
      peer_id: peer.peer_id,
      repository_full_name: peer.repository_full_name,
      status: peer.status,
      treaty: peer.peer_id === targetPeer.peer_id
        ? { treaty_id: treaty.treaty_id, status: treaty.status, allowed_actions: [...treaty.allowed_actions].sort(), expires_at: treaty.expires_at }
        : { treaty_id: `observed-${peer.peer_id}`, status: "active", allowed_actions: ["lineage_import_candidate"], expires_at: null },
      reputation: peer.peer_id === targetPeer.peer_id
        ? { score: Number(reputation.score?.value ?? 0), recommended_action: String(reputation.recommended_action ?? "revocation_review") }
        : { score: 50, recommended_action: "observe" },
      last_interaction_at: null,
    })),
    lineage_exchanges: [{
      exchange_id: "t070-lib-app-lineage-import",
      peer_id: targetPeer.peer_id,
      direction: "import",
      lineage_ref: LINEAGE_ROOT,
      pack_id: String(lineagePack.archive_pack_ref?.pack_id ?? "forge-archive-pack://t070/missing"),
      status: "candidate_registered",
      boundary_decision_id: String(boundary.boundary_decision_id ?? "network-boundary-missing-00000000"),
      adoption_performed: false,
      occurred_at: now,
    }],
    boundary_decisions: [{
      boundary_decision_id: String(boundary.boundary_decision_id ?? "network-boundary-missing-00000000"),
      peer_id: targetPeer.peer_id,
      status: String(boundary.status ?? "invalid"),
      decision: String(boundary.decision ?? "invalid_network_boundary_input"),
      action: "lineage_import_candidate",
      reasons: Array.isArray(boundary.reasons) ? boundary.reasons : ["invalid_network_boundary_input"],
    }],
  };
}

function sideEffectGuardIssues(lineagePack: any, boundary: any, crossRepoPr: any, arena: any, report: any): readonly DistributedEvolutionDemoIssue[] {
  const issues: DistributedEvolutionDemoIssue[] = [];
  if (lineagePack.dry_run?.network_transport_performed !== false) issues.push(issue("lineagePack.dry_run.network_transport_performed", "network_transport_forbidden", "lineage pack must not perform network transport"));
  if (lineagePack.import_candidate?.adoption_performed !== false) issues.push(issue("lineagePack.import_candidate.adoption_performed", "adoption_forbidden", "lineage pack must not adopt imported lineage"));
  if (boundary.dry_run?.network_transport_performed !== false) issues.push(issue("networkBoundary.dry_run.network_transport_performed", "network_transport_forbidden", "boundary must not perform network transport"));
  if (boundary.dry_run?.lineage_adoption_performed !== false) issues.push(issue("networkBoundary.dry_run.lineage_adoption_performed", "adoption_forbidden", "boundary must not adopt imported lineage"));
  if (boundary.dry_run?.open_federation_enabled !== false) issues.push(issue("networkBoundary.dry_run.open_federation_enabled", "open_federation_forbidden", "open federation must stay disabled"));
  if (crossRepoPr.dry_run?.github_api_called !== false || crossRepoPr.dry_run?.pull_request_created !== false) issues.push(issue("crossRepoPr.dry_run", "github_transport_forbidden", "cross-repo PR composition must not call GitHub or create a PR"));
  if (arena.dry_run?.automatic_merge_performed !== false || arena.dry_run?.network_transport_performed !== false) issues.push(issue("arena.dry_run", "arena_side_effect_forbidden", "arena must not merge or transport"));
  if (report.report_context?.source_of_truth !== false || report.report_context?.treaty_replacement !== false) issues.push(issue("federationReport.report_context", "report_authority_forbidden", "federation report must remain derived only"));
  return issues;
}

function chainStatusIssues(lineagePack: any, boundary: any, crossRepoPr: any, arena: any, report: any): readonly DistributedEvolutionDemoIssue[] {
  const issues: DistributedEvolutionDemoIssue[] = [];
  if (lineagePack.status !== "lineage_pack_ready") issues.push(issue("lineagePack.status", "lineage_pack_not_ready", "lineage pack must be ready"));
  if (boundary.status !== "allowed") issues.push(issue("networkBoundary.status", "network_boundary_not_allowed", "network boundary must allow the treaty-scoped dry-run request"));
  if (crossRepoPr.status !== "cross_repo_pr_ready") issues.push(issue("crossRepoPr.status", "cross_repo_pr_not_ready", "cross-repo PR composition must be ready"));
  if (arena.status !== "arena_ready") issues.push(issue("arena.status", "arena_not_ready", "arena must select a ready winner"));
  if (report.status !== "federation_report_ready") issues.push(issue("federationReport.status", "federation_report_not_ready", "federation report must render"));
  return issues;
}

function validateChain(chain: unknown, summary: unknown, status: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  const value = asRecord(chain);
  const validation = asRecord(summary);
  if (value === null) {
    issues.push(issue("chain", "chain_required", "chain is required"));
    return;
  }
  const requiresCompleteChain = status === "ready" || status === "blocked";
  for (const spec of CHAIN_VALIDATORS) {
    const manifest = value[spec.field];
    if (manifest === undefined) {
      if (requiresCompleteChain) issues.push(issue(`chain.${spec.field}`, "chain_manifest_required", `${spec.field} is required for non-invalid results`));
      if (validation?.[spec.summaryKey] === true) issues.push(issue(`validation_summary.${spec.summaryKey}`, "validation_summary_mismatch", `${spec.summaryKey} cannot be true when the chain manifest is missing`));
      continue;
    }
    const ok = spec.validate(manifest).ok;
    if (!ok) issues.push(issue(`chain.${spec.field}`, spec.code, spec.message));
    if (validation !== null && typeof validation[spec.summaryKey] === "boolean" && validation[spec.summaryKey] !== ok) {
      issues.push(issue(`validation_summary.${spec.summaryKey}`, "validation_summary_mismatch", `${spec.summaryKey} must match chain manifest validation`));
    }
  }
}

function validateReadBackConsistency(summary: unknown, invariants: unknown, status: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  const validation = asRecord(summary);
  const invariantRecord = asRecord(invariants);
  if (validation === null || invariantRecord === null) return;
  if (!VALIDATION_SUMMARY_KEYS.every((key) => typeof validation[key] === "boolean")) return;
  const allReadBackValidationsPassed = VALIDATION_SUMMARY_KEYS.every((key) => validation[key] === true);
  if (typeof invariantRecord.all_read_back_validations_passed === "boolean" && invariantRecord.all_read_back_validations_passed !== allReadBackValidationsPassed) {
    issues.push(issue("invariants.all_read_back_validations_passed", "validation_summary_mismatch", "all_read_back_validations_passed must match validation_summary"));
  }
  if (status === "ready" && !allReadBackValidationsPassed) {
    issues.push(issue("status", "ready_validation_required", "ready results require every read-back validation to pass"));
  }
}

function validateStatusConsistency(value: JsonRecord, issues: DistributedEvolutionDemoIssue[]): void {
  if (value.status === "ready" && value.decision !== "distributed_evolution_demo_ready") issues.push(issue("decision", "status_decision_mismatch", "ready status requires distributed_evolution_demo_ready"));
  if (value.status === "blocked" && value.decision !== "distributed_evolution_demo_blocked") issues.push(issue("decision", "status_decision_mismatch", "blocked status requires distributed_evolution_demo_blocked"));
  if (value.status === "invalid" && value.decision !== "invalid_distributed_evolution_demo_input") issues.push(issue("decision", "status_decision_mismatch", "invalid status requires invalid_distributed_evolution_demo_input"));
  if (value.status === "ready" && Array.isArray(value.issues) && value.issues.length > 0) issues.push(issue("issues", "ready_issues_forbidden", "ready results must not carry issues"));
}

function validateTopologyRef(value: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  const ref = asRecord(value);
  if (ref === null) {
    issues.push(issue("topology_ref", "topology_ref_required", "topology_ref is required"));
    return;
  }
  if (typeof ref.topology_id !== "string" || ref.topology_id.length === 0) issues.push(issue("topology_ref.topology_id", "invalid_topology_id", "topology_id is required"));
  if (ref.topology_path !== TOPOLOGY_PATH) issues.push(issue("topology_ref.topology_path", "topology_path_mismatch", "topology path must point to the T069 lab topology"));
  if (ref.scope !== "lab_only") issues.push(issue("topology_ref.scope", "lab_scope_required", "scope must be lab_only"));
  if (ref.source_of_truth !== false) issues.push(issue("topology_ref.source_of_truth", "source_of_truth_forbidden", "demo topology must not replace source of truth"));
}

function validateSteps(value: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  if (!Array.isArray(value)) {
    issues.push(issue("steps", "steps_required", "steps must be an array"));
    return;
  }
  for (const [index, item] of value.entries()) {
    const step = asRecord(item);
    if (step === null) {
      issues.push(issue(`steps.${index}`, "step_must_be_object", "step must be an object"));
      continue;
    }
    const name = stringValue(step.name);
    if (name === null) issues.push(issue(`steps.${index}.name`, "name_required", "step name is required"));
    for (const key of ["status", "produced"]) if (typeof step[key] !== "string" || step[key].length === 0) issues.push(issue(`steps.${index}.${key}`, "string_required", `${key} is required`));
    if (!(step.id === null || typeof step.id === "string")) issues.push(issue(`steps.${index}.id`, "invalid_id", "step id must be null or string"));
  }
}

function validateSummary(value: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  const summary = asRecord(value);
  if (summary === null) {
    issues.push(issue("summary", "summary_required", "summary is required"));
    return;
  }
  for (const key of ["route_id", "source_peer_id", "target_peer_id"]) {
    if (!(typeof summary[key] === "string" && (summary[key] as string).length > 0) && summary[key] !== null) issues.push(issue(`summary.${key}`, "invalid_summary_ref", `${key} must be string or null`));
  }
  for (const key of ["lineage_pack_id", "boundary_decision_id", "cross_repo_composition_id", "arena_result_id", "federation_report_id", "arena_winner_candidate_id"]) {
    if (!(summary[key] === null || typeof summary[key] === "string")) issues.push(issue(`summary.${key}`, "invalid_summary_id", `${key} must be string or null`));
  }
}

function validateInvariants(value: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  const invariants = asRecord(value);
  if (invariants === null) {
    issues.push(issue("invariants", "invariants_required", "invariants are required"));
    return;
  }
  const trueKeys = ["lab_only"];
  const falseKeys = ["source_of_truth_replacement", "open_federation_enabled", "live_network_transport_performed", "github_api_called", "github_pr_created", "git_push_performed", "lineage_adoption_performed", "policy_mutation_performed", "authoritative_reputation_written", "automatic_merge_performed"];
  for (const key of trueKeys) if (invariants[key] !== true) issues.push(issue(`invariants.${key}`, "invariant_required", `${key} must be true`));
  for (const key of falseKeys) if (invariants[key] !== false) issues.push(issue(`invariants.${key}`, "side_effect_forbidden", `${key} must be false`));
  if (typeof invariants.all_read_back_validations_passed !== "boolean") issues.push(issue("invariants.all_read_back_validations_passed", "boolean_required", "all_read_back_validations_passed must be boolean"));
}

function validateValidationSummary(value: unknown, issues: DistributedEvolutionDemoIssue[]): void {
  const summary = asRecord(value);
  if (summary === null) {
    issues.push(issue("validation_summary", "validation_summary_required", "validation summary is required"));
    return;
  }
  for (const key of VALIDATION_SUMMARY_KEYS) {
    if (typeof summary[key] !== "boolean") issues.push(issue(`validation_summary.${key}`, "boolean_required", `${key} must be boolean`));
  }
}

function validateTopology(topology: Topology): readonly DistributedEvolutionDemoIssue[] {
  const issues: DistributedEvolutionDemoIssue[] = [];
  if (topology.schema_ref !== "urn:forgeroot:forge-net-topology:v1") issues.push(issue("topology.schema_ref", "invalid_topology_schema", "topology must be T069 forge-net topology v1"));
  if (topology.manifest_version !== 1) issues.push(issue("topology.manifest_version", "invalid_topology_version", "topology manifest_version must be 1"));
  if (topology.scope !== "lab_only") issues.push(issue("topology.scope", "lab_only_required", "T070 demo only accepts lab-only topology"));
  if (topology.source_of_truth !== false) issues.push(issue("topology.source_of_truth", "source_of_truth_forbidden", "topology must not replace source of truth"));
  if (topology.safety_boundaries.open_federation_enabled !== false) issues.push(issue("topology.safety_boundaries.open_federation_enabled", "open_federation_forbidden", "open federation must stay disabled"));
  if (topology.safety_boundaries.network_transport_performed !== false) issues.push(issue("topology.safety_boundaries.network_transport_performed", "network_transport_forbidden", "topology must not perform network transport"));
  if (topology.safety_boundaries.lineage_adoption_performed !== false) issues.push(issue("topology.safety_boundaries.lineage_adoption_performed", "adoption_forbidden", "topology must not adopt lineage"));
  return issues;
}

function normalizeTopology(value: unknown): Topology {
  if (!isRecord(value)) return defaultTopology();
  const repositories = arrayValue(value.repositories).map(asRecord).filter((entry): entry is JsonRecord => entry !== null).map((entry) => ({
    peer_id: stringValue(entry.peer_id) ?? "",
    repository_full_name: stringValue(entry.repository_full_name) ?? "",
    status: peerStatus(entry.status),
    registry_known: booleanValue(entry.registry_known) ?? false,
  }));
  const treatyLinks = arrayValue(value.treaty_links).map(asRecord).filter((entry): entry is JsonRecord => entry !== null).map((entry) => ({
    treaty_id: stringValue(entry.treaty_id) ?? "",
    status: treatyStatus(entry.status),
    source_peer_id: stringValue(entry.source_peer_id) ?? "",
    target_peer_id: stringValue(entry.target_peer_id) ?? "",
    allowed_actions: stringArray(entry.allowed_actions),
    expires_at: stringValue(entry.expires_at),
  }));
  const lineageRoutes = arrayValue(value.lineage_routes).map(asRecord).filter((entry): entry is JsonRecord => entry !== null).map((entry) => ({
    route_id: stringValue(entry.route_id) ?? "",
    source_peer_id: stringValue(entry.source_peer_id) ?? "",
    target_peer_id: stringValue(entry.target_peer_id) ?? "",
    treaty_id: stringValue(entry.treaty_id) ?? "",
  }));
  const safety = asRecord(value.safety_boundaries);
  return {
    schema_ref: stringValue(value.schema_ref) ?? "",
    manifest_version: numberValue(value.manifest_version) ?? 0,
    topology_id: stringValue(value.topology_id) ?? "",
    scope: value.scope === "lab_only" ? "lab_only" : "invalid",
    source_of_truth: value.source_of_truth === false ? false : true,
    repositories,
    treaty_links: treatyLinks,
    lineage_routes: lineageRoutes,
    safety_boundaries: {
      lab_only: safety?.lab_only === true,
      open_federation_enabled: safety?.open_federation_enabled === false ? false : true,
      network_transport_performed: safety?.network_transport_performed === false ? false : true,
      github_api_called: safety?.github_api_called === false ? false : true,
      github_pr_created: safety?.github_pr_created === false ? false : true,
      git_push_performed: safety?.git_push_performed === false ? false : true,
      policy_mutation_performed: safety?.policy_mutation_performed === false ? false : true,
      lineage_adoption_performed: safety?.lineage_adoption_performed === false ? false : true,
    },
  };
}

function defaultTopology(): Topology {
  return {
    schema_ref: "urn:forgeroot:forge-net-topology:v1",
    manifest_version: 1,
    topology_id: "t069-three-repo-forge-net-testnet",
    scope: "lab_only",
    source_of_truth: false,
    repositories: [
      { peer_id: "forge-root", repository_full_name: "hiroshitanaka-creator/ForgeRoot", status: "active", registry_known: true },
      { peer_id: "forge-lab-lib", repository_full_name: "forgeroot-labs/forge-lab-lib", status: "active", registry_known: true },
      { peer_id: "forge-lab-app", repository_full_name: "forgeroot-labs/forge-lab-app", status: "active", registry_known: true },
    ],
    treaty_links: [
      { treaty_id: "t069-root-lib-aaaaaaaa", status: "active", source_peer_id: "forge-root", target_peer_id: "forge-lab-lib", allowed_actions: ["gossip_sync", "lineage_import_candidate", "reputation_update"], expires_at: "2026-08-07T00:00:00Z" },
      { treaty_id: "t069-root-app-bbbbbbbb", status: "active", source_peer_id: "forge-root", target_peer_id: "forge-lab-app", allowed_actions: ["gossip_sync", "lineage_import_candidate", "reputation_update"], expires_at: "2026-08-07T00:00:00Z" },
      { treaty_id: "t069-lib-app-cccccccc", status: "active", source_peer_id: "forge-lab-lib", target_peer_id: "forge-lab-app", allowed_actions: ["lineage_export", "lineage_import_candidate", "cross_repo_pr"], expires_at: "2026-08-07T00:00:00Z" },
    ],
    lineage_routes: [
      { route_id: "lib-api-stability-to-app", source_peer_id: "forge-lab-lib", target_peer_id: "forge-lab-app", treaty_id: "t069-lib-app-cccccccc" },
    ],
    safety_boundaries: {
      lab_only: true,
      open_federation_enabled: false,
      network_transport_performed: false,
      github_api_called: false,
      github_pr_created: false,
      git_push_performed: false,
      policy_mutation_performed: false,
      lineage_adoption_performed: false,
    },
  };
}

function selectRoute(topology: Topology, routeId: string): TopologyRoute | null {
  return topology.lineage_routes.find((entry) => entry.route_id === routeId) ?? null;
}

function findPeer(topology: Topology, peerId: string): TopologyPeer | null {
  return topology.repositories.find((entry) => entry.peer_id === peerId) ?? null;
}

function findTreaty(topology: Topology, treatyId: string): TopologyTreaty | null {
  return topology.treaty_links.find((entry) => entry.treaty_id === treatyId) ?? null;
}

function record(record_id: string, kind: string, schema_ref: string, hash: string): unknown {
  return {
    record_id,
    lineage_root: LINEAGE_ROOT,
    kind,
    schema_ref,
    source_ref: `forge://t070/${record_id}`,
    artifact_sha256: hash,
    payload_sha256: HASH_3,
  };
}

function outcome(outcome_id: string, proposal_ref: string, adoption_outcome: string, policy_compliant: boolean, risk: string): unknown {
  return { outcome_id, proposal_ref, source_kind: "cross_repo_pr", adoption_outcome, policy_compliant, risk, evidence_digest: `sha-fnv1a-${outcome_id.slice(-8)}` };
}

function candidate(candidate_id: string, source_kind: string, proposal_ref: string, eval_score: number, lineage_score: number, reputation_score: number, risk: string, evidence_digest: string): unknown {
  return {
    candidate_id,
    source_kind,
    source_ref: `${source_kind}:${candidate_id}`,
    proposal_ref,
    policy_compliant: true,
    local_policy_breach: false,
    eval_score,
    lineage_score,
    reputation_score,
    risk,
    evidence_digest,
  };
}

function step(name: string, status: string, produced: string, id: string | null): DistributedEvolutionDemoStep {
  return { name, status, produced, id };
}

function demoDigestPayload(value: Omit<DistributedEvolutionDemoResult, "demo_id" | "demo_digest"> | DistributedEvolutionDemoResult): unknown {
  return {
    manifest_version: value.manifest_version,
    schema_ref: value.schema_ref,
    created_at: value.created_at,
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    topology_ref: value.topology_ref,
    steps: value.steps,
    summary: value.summary,
    invariants: value.invariants,
    validation_summary: value.validation_summary,
    chain: value.chain,
    issues: value.issues ?? [],
  };
}

function validateNoSecretMaterial(value: unknown, path: string, issues: DistributedEvolutionDemoIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issues.push(issue(path, "secret_material_forbidden", "demo manifests must not contain token or private-key material"));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}.${index}`, issues));
    return;
  }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function resolveTimestamp(value: string | undefined, fallback: string): string | null {
  return value === undefined ? fallback : isRfc3339Utc(value) ? value : null;
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

function peerStatus(value: unknown): "active" | "quarantined" | "revoked" {
  return value === "active" || value === "quarantined" || value === "revoked" ? value : "revoked";
}

function treatyStatus(value: unknown): "active" | "suspended" | "revoked" {
  return value === "active" || value === "suspended" || value === "revoked" ? value : "revoked";
}

function issue(path: string, code: string, message: string): DistributedEvolutionDemoIssue {
  return { path, code, message };
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): JsonRecord | null {
  return isRecord(value) ? value as JsonRecord : null;
}

function arrayValue(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function stringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0) : [];
}

function numberValue(value: unknown): number | null {
  return Number.isFinite(value) ? value as number : null;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

interface Topology {
  readonly schema_ref: string;
  readonly manifest_version: number;
  readonly topology_id: string;
  readonly scope: "lab_only" | "invalid";
  readonly source_of_truth: false | true;
  readonly repositories: readonly TopologyPeer[];
  readonly treaty_links: readonly TopologyTreaty[];
  readonly lineage_routes: readonly TopologyRoute[];
  readonly safety_boundaries: {
    readonly lab_only: boolean;
    readonly open_federation_enabled: boolean;
    readonly network_transport_performed: boolean;
    readonly github_api_called: boolean;
    readonly github_pr_created: boolean;
    readonly git_push_performed: boolean;
    readonly policy_mutation_performed: boolean;
    readonly lineage_adoption_performed: boolean;
  };
}

interface TopologyPeer {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: "active" | "quarantined" | "revoked";
  readonly registry_known: boolean;
}

interface TopologyTreaty {
  readonly treaty_id: string;
  readonly status: "active" | "suspended" | "revoked";
  readonly source_peer_id: string;
  readonly target_peer_id: string;
  readonly allowed_actions: readonly string[];
  readonly expires_at: string | null;
}

interface TopologyRoute {
  readonly route_id: string;
  readonly source_peer_id: string;
  readonly target_peer_id: string;
  readonly treaty_id: string;
}

type JsonRecord = Record<string, unknown>;
