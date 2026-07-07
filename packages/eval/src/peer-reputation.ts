export const PEER_REPUTATION_VERSION = 1 as const;
export const PEER_REPUTATION_SCHEMA_REF = "urn:forgeroot:peer-reputation:v1" as const;

export type PeerReputationPeerStatus = "active" | "quarantined" | "revoked";
export type PeerReputationTreatyStatus = "active" | "suspended" | "revoked";
export type PeerReputationOutcome = "accepted" | "rejected" | "blocked" | "invalid";
export type PeerReputationSourceKind = "cross_repo_pr" | "lineage_pack" | "arena_candidate" | "manual_review";
export type PeerReputationRisk = "low" | "medium" | "high" | "critical";
export type PeerReputationPolicyAction = "none" | "downrank" | "quarantine" | "revocation_review";
export type PeerReputationPolicyTrigger = "policy_breach" | "abuse_signal" | "manual_review" | "treaty_violation";
export type PeerReputationStatus = "reputation_ready" | "blocked" | "invalid";
export type PeerReputationDecision = "peer_reputation_ready" | "peer_reputation_blocked" | "invalid_peer_reputation_input";
export type PeerReputationBand = "trusted" | "neutral" | "downranked" | "quarantined" | "revocation_review";
export type PeerReputationRecommendedAction = "observe" | "downrank" | "quarantine" | "revocation_review";

export interface PeerReputationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface PeerReputationPeerInput {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: PeerReputationPeerStatus;
}

export interface PeerReputationTreatyInput {
  readonly treaty_id: string;
  readonly status: PeerReputationTreatyStatus;
  readonly source_peer_id: string;
  readonly target_peer_id: string;
  readonly expires_at?: string | null;
}

export interface PeerProposalOutcomeInput {
  readonly outcome_id: string;
  readonly proposal_ref: string;
  readonly source_kind: PeerReputationSourceKind;
  readonly adoption_outcome: PeerReputationOutcome;
  readonly policy_compliant: boolean;
  readonly risk: PeerReputationRisk;
  readonly evidence_digest: string;
}

export interface PeerPolicyEventInput {
  readonly event_id: string;
  readonly trigger: PeerReputationPolicyTrigger;
  readonly severity: PeerReputationRisk;
  readonly action: PeerReputationPolicyAction;
  readonly summary: string;
  readonly evidence_digest: string;
}

export interface PeerReputationWeights {
  readonly accepted: number;
  readonly rejected: number;
  readonly blocked: number;
  readonly invalid: number;
  readonly policy_breach_low: number;
  readonly policy_breach_medium: number;
  readonly policy_breach_high: number;
  readonly policy_breach_critical: number;
  readonly policy_event_low: number;
  readonly policy_event_medium: number;
  readonly policy_event_high: number;
  readonly policy_event_critical: number;
}

export interface PeerReputationInput {
  readonly now?: string;
  readonly peer: PeerReputationPeerInput;
  readonly treaty: PeerReputationTreatyInput;
  readonly outcomes: readonly PeerProposalOutcomeInput[];
  readonly policy_events?: readonly PeerPolicyEventInput[];
  readonly weights?: Partial<PeerReputationWeights>;
}

export interface PeerReputationDelta {
  readonly source: "outcome" | "policy_event";
  readonly ref: string;
  readonly reason: string;
  readonly value: number;
}

export interface PeerReputationSummary {
  readonly total_outcomes: number;
  readonly accepted_count: number;
  readonly rejected_count: number;
  readonly blocked_count: number;
  readonly invalid_count: number;
  readonly policy_breach_count: number;
  readonly policy_event_count: number;
  readonly highest_risk: PeerReputationRisk | "none";
  readonly repeated_rejections: boolean;
  readonly quarantine_threshold_met: boolean;
  readonly revocation_triggered: boolean;
}

export interface PeerReputationResult {
  readonly manifest_version: typeof PEER_REPUTATION_VERSION;
  readonly schema_ref: typeof PEER_REPUTATION_SCHEMA_REF;
  readonly reputation_id: string;
  readonly created_at: string;
  readonly status: PeerReputationStatus;
  readonly decision: PeerReputationDecision;
  readonly reasons: readonly string[];
  readonly peer_ref: PeerReputationPeerInput;
  readonly treaty_ref: {
    readonly treaty_id: string;
    readonly treaty_status: PeerReputationTreatyStatus;
    readonly source_peer_id: string;
    readonly target_peer_id: string;
    readonly expires_at: string | null;
  };
  readonly scoring_inputs: {
    readonly outcomes: readonly PeerProposalOutcomeInput[];
    readonly policy_events: readonly PeerPolicyEventInput[];
    readonly weights: PeerReputationWeights;
  };
  readonly scoring_summary: PeerReputationSummary;
  readonly score: {
    readonly baseline: 50;
    readonly value: number;
    readonly band: PeerReputationBand;
    readonly deltas: readonly PeerReputationDelta[];
    readonly thresholds: {
      readonly trusted_min: 75;
      readonly downrank_below: 50;
      readonly quarantine_below: 30;
      readonly revocation_below: 15;
    };
  };
  readonly recommended_action: PeerReputationRecommendedAction;
  readonly adoption_authority: {
    readonly source_of_truth_for_adoption: false;
    readonly automatic_adoption_allowed: false;
    readonly advisory_only: true;
    readonly adoption_decision_required: "human_review_and_policy_gate";
  };
  readonly guards: {
    readonly no_global_reputation_network: true;
    readonly no_public_ranking: true;
    readonly no_automatic_adoption: true;
    readonly no_network_transport: true;
    readonly no_file_write: true;
    readonly no_github_api_call: true;
    readonly no_policy_mutation: true;
  };
  readonly dry_run: {
    readonly global_reputation_published: false;
    readonly public_ranking_written: false;
    readonly adoption_performed: false;
    readonly network_transport_performed: false;
    readonly file_written: false;
    readonly github_api_called: false;
    readonly policy_mutation_performed: false;
  };
  readonly reputation_digest: string;
  readonly issues?: readonly PeerReputationIssue[];
}

export interface PeerReputationValidation {
  readonly ok: boolean;
  readonly issues: readonly PeerReputationIssue[];
}

export const PEER_REPUTATION_CONTRACT = {
  consumes: ["peer_outcomes", "policy_compliance_events", "adoption_outcome_refs"],
  produces: ["peer_reputation_score_manifest"],
  validates: ["peer_ref", "treaty_ref", "scoring_inputs", "thresholds", "adoption_authority_boundary"],
  forbids: ["global_reputation_network", "public_ranking", "automatic_adoption", "network_transport", "file_write", "github_api_call", "policy_mutation"],
  deterministic: true,
  manifestOnly: true,
  advisoryOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-06T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const PEER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const HASH = /^(sha256:[0-9a-f]{64}|sha-[a-z0-9-]+-[0-9a-f]{8,})$/;
const PROPOSAL_REF = /^(cross-repo-pr|lineage-pack|arena-candidate|manual-review):[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const SAFE_SUMMARY = /^[A-Za-z0-9 .,:;_/-]{1,160}$/;
const PEER_STATUSES = new Set(["active", "quarantined", "revoked"]);
const TREATY_STATUSES = new Set(["active", "suspended", "revoked"]);
const OUTCOMES = new Set(["accepted", "rejected", "blocked", "invalid"]);
const SOURCE_KINDS = new Set(["cross_repo_pr", "lineage_pack", "arena_candidate", "manual_review"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const POLICY_ACTIONS = new Set(["none", "downrank", "quarantine", "revocation_review"]);
const POLICY_TRIGGERS = new Set(["policy_breach", "abuse_signal", "manual_review", "treaty_violation"]);
const STATUSES = new Set(["reputation_ready", "blocked", "invalid"]);
const DECISIONS = new Set(["peer_reputation_ready", "peer_reputation_blocked", "invalid_peer_reputation_input"]);
const BANDS = new Set(["trusted", "neutral", "downranked", "quarantined", "revocation_review"]);
const ACTIONS = new Set(["observe", "downrank", "quarantine", "revocation_review"]);
const RESULT_KEYS = new Set([
  "manifest_version",
  "schema_ref",
  "reputation_id",
  "created_at",
  "status",
  "decision",
  "reasons",
  "peer_ref",
  "treaty_ref",
  "scoring_inputs",
  "scoring_summary",
  "score",
  "recommended_action",
  "adoption_authority",
  "guards",
  "dry_run",
  "reputation_digest",
  "issues",
]);
const PEER_KEYS = new Set(["peer_id", "repository_full_name", "status"]);
const TREATY_INPUT_KEYS = new Set(["treaty_id", "status", "source_peer_id", "target_peer_id", "expires_at"]);
const TREATY_REF_KEYS = new Set(["treaty_id", "treaty_status", "source_peer_id", "target_peer_id", "expires_at"]);
const SCORING_INPUT_KEYS = new Set(["outcomes", "policy_events", "weights"]);
const OUTCOME_KEYS = new Set(["outcome_id", "proposal_ref", "source_kind", "adoption_outcome", "policy_compliant", "risk", "evidence_digest"]);
const POLICY_EVENT_KEYS = new Set(["event_id", "trigger", "severity", "action", "summary", "evidence_digest"]);
const SUMMARY_KEYS = new Set(["total_outcomes", "accepted_count", "rejected_count", "blocked_count", "invalid_count", "policy_breach_count", "policy_event_count", "highest_risk", "repeated_rejections", "quarantine_threshold_met", "revocation_triggered"]);
const SCORE_KEYS = new Set(["baseline", "value", "band", "deltas", "thresholds"]);
const DELTA_KEYS = new Set(["source", "ref", "reason", "value"]);
const THRESHOLD_KEYS = new Set(["trusted_min", "downrank_below", "quarantine_below", "revocation_below"]);
const ADOPTION_AUTHORITY_KEYS = new Set(["source_of_truth_for_adoption", "automatic_adoption_allowed", "advisory_only", "adoption_decision_required"]);
const ISSUE_KEYS = new Set(["path", "code", "message"]);
const WEIGHT_KEYS = new Set([
  "accepted",
  "rejected",
  "blocked",
  "invalid",
  "policy_breach_low",
  "policy_breach_medium",
  "policy_breach_high",
  "policy_breach_critical",
  "policy_event_low",
  "policy_event_medium",
  "policy_event_high",
  "policy_event_critical",
]);

const DEFAULT_WEIGHTS: PeerReputationWeights = {
  accepted: 8,
  rejected: -10,
  blocked: -6,
  invalid: -12,
  policy_breach_low: -4,
  policy_breach_medium: -10,
  policy_breach_high: -22,
  policy_breach_critical: -35,
  policy_event_low: -4,
  policy_event_medium: -10,
  policy_event_high: -25,
  policy_event_critical: -40,
};

interface NormalizedInput {
  readonly input: PeerReputationInput | null;
  readonly now?: string;
  readonly issues: readonly PeerReputationIssue[];
}

interface ComputedScore {
  readonly summary: PeerReputationSummary;
  readonly score: PeerReputationResult["score"];
  readonly recommendedAction: PeerReputationRecommendedAction;
}

export function evaluatePeerReputation(input: unknown): PeerReputationResult {
  const normalized = normalizeInput(input);
  const createdAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [makeIssue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "input must be an object")]);

  const boundaryIssues = validateBoundary(normalized.input, createdAt ?? DEFAULT_NOW);
  if (boundaryIssues.length > 0) return blockedResult(createdAt ?? DEFAULT_NOW, normalized.input, boundaryIssues);

  const result = resultFor(createdAt ?? DEFAULT_NOW, normalized.input, "reputation_ready", ["peer_reputation_score_ready", "advisory_only_boundary_preserved"]);
  const validation = validatePeerReputation(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, validation.issues);
  return result;
}

export function validatePeerReputation(value: unknown): PeerReputationValidation {
  const issues: PeerReputationIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [makeIssue("result", "result_must_be_object", "peer reputation result must be an object")] };
  validateKnownKeys(value, RESULT_KEYS, "result", issues);
  validateTopLevel(value, issues);
  validatePeer(value.peer_ref, "peer_ref", issues);
  validateTreatyRef(value.treaty_ref, "treaty_ref", issues);
  const scoringInputs = validateScoringInputs(value.scoring_inputs, "scoring_inputs", issues, value.status === "invalid");
  validateSummary(value.scoring_summary, "scoring_summary", issues);
  validateScore(value.score, "score", issues);
  if (typeof value.recommended_action !== "string" || !ACTIONS.has(value.recommended_action)) issue(issues, "recommended_action", "invalid_recommended_action", "recommended action must be known");
  validateAdoptionAuthority(value.adoption_authority, "adoption_authority", issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value, issues);
  validateNoSecretMaterial(value, "result", issues);

  if (value.status !== "invalid" && scoringInputs !== null && isRecord(value.peer_ref) && isRecord(value.scoring_summary) && isRecord(value.score)) {
    validateCrossFields(value, scoringInputs, issues);
  }

  const expectedDigest = canonicalDigest(reputationDigestPayload(value as unknown as PeerReputationResult));
  if (typeof value.reputation_digest !== "string" || value.reputation_digest !== expectedDigest) issue(issues, "reputation_digest", "digest_mismatch", "reputation_digest must cover the reputation payload");
  if (typeof value.reputation_id !== "string" || value.reputation_id !== stableId("peer-reputation", [expectedDigest])) issue(issues, "reputation_id", "id_mismatch", "reputation_id must match reputation_digest");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(input: unknown): NormalizedInput {
  const issues: PeerReputationIssue[] = [];
  if (!isRecord(input)) return { input: null, issues: [makeIssue("input", "input_must_be_object", "input must be an object")] };
  validateNoSecretMaterial(input, "input", issues);
  const peer = normalizePeer(input.peer, "peer", issues);
  const treaty = normalizeTreaty(input.treaty, "treaty", issues);
  const outcomes = normalizeOutcomes(input.outcomes, "outcomes", issues, false);
  const policyEvents = input.policy_events === undefined ? [] : normalizePolicyEvents(input.policy_events, "policy_events", issues);
  const weights = normalizeWeights(input.weights, "weights", issues, false);
  const now = optionalString(input.now, "now", issues);
  return { input: { peer, treaty, outcomes, policy_events: policyEvents, weights, ...(now === undefined ? {} : { now }) }, now, issues };
}

function validateBoundary(input: PeerReputationInput, createdAt: string): readonly PeerReputationIssue[] {
  const issues: PeerReputationIssue[] = [];
  if (input.peer.status === "revoked") issue(issues, "peer.status", "peer_revoked", "revoked peers cannot receive a ready reputation manifest");
  if (input.treaty.status !== "active") issue(issues, "treaty.status", "treaty_not_active", "reputation scoring requires an active treaty");
  if (input.treaty.expires_at !== null && input.treaty.expires_at !== undefined && Date.parse(input.treaty.expires_at) <= Date.parse(createdAt)) issue(issues, "treaty.expires_at", "treaty_expired", "reputation scoring requires an unexpired treaty");
  if (input.treaty.target_peer_id !== input.peer.peer_id) issue(issues, "treaty.target_peer_id", "target_peer_mismatch", "treaty target peer must match peer");
  return issues;
}

function resultFor(createdAt: string, input: PeerReputationInput, status: "reputation_ready" | "blocked", reasons: readonly string[]): PeerReputationResult {
  const scoringInput = scoringInputFor(input);
  const computed = computeScore(input.peer, scoringInput.outcomes, scoringInput.policy_events, scoringInput.weights);
  const draft: Omit<PeerReputationResult, "reputation_id" | "reputation_digest"> = {
    manifest_version: PEER_REPUTATION_VERSION,
    schema_ref: PEER_REPUTATION_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "reputation_ready" ? "peer_reputation_ready" : "peer_reputation_blocked",
    reasons,
    peer_ref: input.peer,
    treaty_ref: treatyRef(input.treaty),
    scoring_inputs: scoringInput,
    scoring_summary: computed.summary,
    score: computed.score,
    recommended_action: computed.recommendedAction,
    adoption_authority: adoptionAuthority(),
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(reputationDigestPayload(draft));
  return { ...draft, reputation_id: stableId("peer-reputation", [digest]), reputation_digest: digest };
}

function blockedResult(createdAt: string, input: PeerReputationInput, issues: readonly PeerReputationIssue[]): PeerReputationResult {
  const draft = resultFor(createdAt, input, "blocked", uniqueStrings(["peer_reputation_blocked", ...issues.map((entry) => entry.code)]));
  const digest = canonicalDigest(reputationDigestPayload(draft));
  return { ...draft, reputation_id: stableId("peer-reputation", [digest]), reputation_digest: digest };
}

function invalidResult(createdAt: string, issues: readonly PeerReputationIssue[]): PeerReputationResult {
  const safe = emptyInput();
  const scoringInput = scoringInputFor(safe);
  const computed = computeScore(safe.peer, scoringInput.outcomes, scoringInput.policy_events, scoringInput.weights);
  const draft: Omit<PeerReputationResult, "reputation_id" | "reputation_digest"> = {
    manifest_version: PEER_REPUTATION_VERSION,
    schema_ref: PEER_REPUTATION_SCHEMA_REF,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_peer_reputation_input",
    reasons: uniqueStrings(["invalid_peer_reputation_input", ...issues.map((entry) => entry.code)]),
    peer_ref: safe.peer,
    treaty_ref: treatyRef(safe.treaty),
    scoring_inputs: scoringInput,
    scoring_summary: computed.summary,
    score: computed.score,
    recommended_action: "revocation_review",
    adoption_authority: adoptionAuthority(),
    guards: guards(),
    dry_run: dryRun(),
    issues,
  };
  const digest = canonicalDigest(reputationDigestPayload(draft));
  return { ...draft, reputation_id: stableId("peer-reputation", [digest]), reputation_digest: digest };
}

function computeScore(peer: PeerReputationPeerInput, outcomes: readonly PeerProposalOutcomeInput[], policyEvents: readonly PeerPolicyEventInput[], weights: PeerReputationWeights): ComputedScore {
  const deltas: PeerReputationDelta[] = [];
  for (const outcome of outcomes) {
    deltas.push({ source: "outcome", ref: outcome.outcome_id, reason: `adoption_${outcome.adoption_outcome}`, value: weights[outcome.adoption_outcome] });
    if (!outcome.policy_compliant) deltas.push({ source: "outcome", ref: outcome.outcome_id, reason: `policy_breach_${outcome.risk}`, value: weights[`policy_breach_${outcome.risk}`] });
  }
  for (const event of policyEvents) {
    deltas.push({ source: "policy_event", ref: event.event_id, reason: `${event.trigger}_${event.action}_${event.severity}`, value: weights[`policy_event_${event.severity}`] });
  }
  const rawScore = 50 + deltas.reduce((total, entry) => total + entry.value, 0);
  const scoreValue = clamp(rawScore, 0, 100);
  const acceptedCount = outcomes.filter((entry) => entry.adoption_outcome === "accepted").length;
  const rejectedCount = outcomes.filter((entry) => entry.adoption_outcome === "rejected").length;
  const blockedCount = outcomes.filter((entry) => entry.adoption_outcome === "blocked").length;
  const invalidCount = outcomes.filter((entry) => entry.adoption_outcome === "invalid").length;
  const breachCount = outcomes.filter((entry) => entry.policy_compliant === false).length;
  const highestRisk = highestRiskFor(outcomes, policyEvents);
  const revocationTriggered = scoreValue < 15 || policyEvents.some((entry) => entry.action === "revocation_review" || entry.severity === "critical");
  const quarantineThresholdMet = scoreValue < 30 || peer.status === "quarantined" || outcomes.some((entry) => !entry.policy_compliant && (entry.risk === "high" || entry.risk === "critical")) || policyEvents.some((entry) => entry.action === "quarantine" || entry.severity === "high" || entry.severity === "critical");
  const summary: PeerReputationSummary = {
    total_outcomes: outcomes.length,
    accepted_count: acceptedCount,
    rejected_count: rejectedCount,
    blocked_count: blockedCount,
    invalid_count: invalidCount,
    policy_breach_count: breachCount,
    policy_event_count: policyEvents.length,
    highest_risk: highestRisk,
    repeated_rejections: rejectedCount >= 2,
    quarantine_threshold_met: quarantineThresholdMet,
    revocation_triggered: revocationTriggered,
  };
  const recommendedAction = recommendedActionFor(scoreValue, summary);
  return {
    summary,
    recommendedAction,
    score: {
      baseline: 50,
      value: scoreValue,
      band: bandFor(scoreValue, recommendedAction),
      deltas,
      thresholds: {
        trusted_min: 75,
        downrank_below: 50,
        quarantine_below: 30,
        revocation_below: 15,
      },
    },
  };
}

function validateCrossFields(value: Record<string, unknown>, scoringInputs: PeerReputationResult["scoring_inputs"], issues: PeerReputationIssue[]): void {
  if (!isRecord(value.peer_ref)) return;
  const computed = computeScore(value.peer_ref as unknown as PeerReputationPeerInput, scoringInputs.outcomes, scoringInputs.policy_events, scoringInputs.weights);
  if (canonicalStringify(value.scoring_summary) !== canonicalStringify(computed.summary)) issue(issues, "scoring_summary", "summary_mismatch", "scoring_summary must be recalculated from scoring_inputs");
  if (canonicalStringify(value.score) !== canonicalStringify(computed.score)) issue(issues, "score", "score_mismatch", "score must be recalculated from scoring_inputs");
  if (value.recommended_action !== computed.recommendedAction) issue(issues, "recommended_action", "recommended_action_mismatch", "recommended action must match score and policy triggers");
  if (value.status === "reputation_ready") {
    if (value.decision !== "peer_reputation_ready") issue(issues, "decision", "ready_decision_mismatch", "ready results must use peer_reputation_ready");
    if (value.peer_ref.status === "revoked") issue(issues, "peer_ref.status", "ready_peer_revoked", "ready reputation requires a non-revoked peer");
    if (isRecord(value.treaty_ref) && value.treaty_ref.treaty_status !== "active") issue(issues, "treaty_ref.treaty_status", "ready_treaty_must_be_active", "ready reputation requires an active treaty");
    if (isRecord(value.treaty_ref) && typeof value.treaty_ref.expires_at === "string" && typeof value.created_at === "string" && Date.parse(value.treaty_ref.expires_at) <= Date.parse(value.created_at)) issue(issues, "treaty_ref.expires_at", "ready_treaty_expired", "ready reputation requires an unexpired treaty");
  }
  if (isRecord(value.treaty_ref) && value.treaty_ref.target_peer_id !== value.peer_ref.peer_id) issue(issues, "treaty_ref.target_peer_id", "target_peer_mismatch", "treaty target peer must match peer_ref");
}

function validateTopLevel(value: Record<string, unknown>, issues: PeerReputationIssue[]): void {
  if (value.manifest_version !== PEER_REPUTATION_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== PEER_REPUTATION_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T063 peer reputation v1");
  if (typeof value.reputation_id !== "string" || !ID.test(value.reputation_id)) issue(issues, "reputation_id", "invalid_reputation_id", "reputation_id must be deterministic");
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (typeof value.status !== "string" || !STATUSES.has(value.status)) issue(issues, "status", "invalid_status", "status must be reputation_ready, blocked, or invalid");
  if (typeof value.decision !== "string" || !DECISIONS.has(value.decision)) issue(issues, "decision", "invalid_decision", "decision must be a T063 decision");
  if (!Array.isArray(value.reasons) || value.reasons.length === 0 || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
}

function validateScoringInputs(value: unknown, path: string, issues: PeerReputationIssue[], allowEmptyOutcomes: boolean): PeerReputationResult["scoring_inputs"] | null {
  if (!isRecord(value)) {
    issue(issues, path, "scoring_inputs_required", "scoring inputs must be present");
    return null;
  }
  validateKnownKeys(value, SCORING_INPUT_KEYS, path, issues);
  const startCount = issues.length;
  const outcomes = normalizeOutcomes(value.outcomes, `${path}.outcomes`, issues, allowEmptyOutcomes, true);
  const policyEvents = normalizePolicyEvents(value.policy_events, `${path}.policy_events`, issues, true);
  const weights = normalizeWeights(value.weights, `${path}.weights`, issues, true);
  return issues.length === startCount ? { outcomes, policy_events: policyEvents, weights } : null;
}

function validatePeer(value: unknown, path: string, issues: PeerReputationIssue[]): PeerReputationPeerInput | null {
  if (!isRecord(value)) {
    issue(issues, path, "peer_required", "peer ref must be present");
    return null;
  }
  const startCount = issues.length;
  const peer = normalizePeer(value, path, issues);
  return issues.length === startCount ? peer : null;
}

function validateTreatyRef(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "treaty_ref_required", "treaty ref must be present");
    return;
  }
  validateKnownKeys(value, TREATY_REF_KEYS, path, issues);
  const treatyId = value.treaty_id;
  if (typeof treatyId !== "string" || !PEER_ID.test(treatyId)) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  if (typeof value.treaty_status !== "string" || !TREATY_STATUSES.has(value.treaty_status)) issue(issues, `${path}.treaty_status`, "invalid_treaty_status", "treaty status must be known");
  if (typeof value.source_peer_id !== "string" || !PEER_ID.test(value.source_peer_id)) issue(issues, `${path}.source_peer_id`, "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (typeof value.target_peer_id !== "string" || !PEER_ID.test(value.target_peer_id)) issue(issues, `${path}.target_peer_id`, "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
  if (value.expires_at !== null && (typeof value.expires_at !== "string" || !isRfc3339Utc(value.expires_at))) issue(issues, `${path}.expires_at`, "invalid_expires_at", "expires_at must be null or RFC3339 UTC");
}

function validateSummary(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "summary_required", "scoring summary must be present");
    return;
  }
  validateKnownKeys(value, SUMMARY_KEYS, path, issues);
  for (const key of ["total_outcomes", "accepted_count", "rejected_count", "blocked_count", "invalid_count", "policy_breach_count", "policy_event_count"]) {
    if (!isNonNegativeInteger(value[key])) issue(issues, `${path}.${key}`, "invalid_count", `${key} must be a non-negative integer`);
  }
  if (typeof value.highest_risk !== "string" || (value.highest_risk !== "none" && !RISKS.has(value.highest_risk))) issue(issues, `${path}.highest_risk`, "invalid_highest_risk", "highest_risk must be none or a known risk");
  for (const key of ["repeated_rejections", "quarantine_threshold_met", "revocation_triggered"]) if (typeof value[key] !== "boolean") issue(issues, `${path}.${key}`, "invalid_boolean", `${key} must be boolean`);
}

function validateScore(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "score_required", "score must be present");
    return;
  }
  validateKnownKeys(value, SCORE_KEYS, path, issues);
  if (value.baseline !== 50) issue(issues, `${path}.baseline`, "invalid_baseline", "baseline must be 50");
  if (!isNonNegativeInteger(value.value) || typeof value.value !== "number" || value.value > 100) issue(issues, `${path}.value`, "invalid_score_value", "score value must be an integer from 0 to 100");
  if (typeof value.band !== "string" || !BANDS.has(value.band)) issue(issues, `${path}.band`, "invalid_band", "score band must be known");
  validateDeltas(value.deltas, `${path}.deltas`, issues);
  validateThresholds(value.thresholds, `${path}.thresholds`, issues);
}

function validateDeltas(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, path, "deltas_required", "deltas must be an array");
    return;
  }
  value.forEach((entry, index) => {
    const itemPath = `${path}.${index}`;
    if (!isRecord(entry)) {
      issue(issues, itemPath, "delta_must_be_object", "delta must be an object");
      return;
    }
    validateKnownKeys(entry, DELTA_KEYS, itemPath, issues);
    if (entry.source !== "outcome" && entry.source !== "policy_event") issue(issues, `${itemPath}.source`, "invalid_delta_source", "delta source must be outcome or policy_event");
    if (typeof entry.ref !== "string" || !ID.test(entry.ref)) issue(issues, `${itemPath}.ref`, "invalid_delta_ref", "delta ref must be deterministic");
    if (typeof entry.reason !== "string" || entry.reason.length === 0 || entry.reason.length > 96) issue(issues, `${itemPath}.reason`, "invalid_delta_reason", "delta reason must be non-empty");
    if (typeof entry.value !== "number" || !Number.isInteger(entry.value) || entry.value < -100 || entry.value > 100) issue(issues, `${itemPath}.value`, "invalid_delta_value", "delta value must be an integer from -100 to 100");
  });
}

function validateThresholds(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "thresholds_required", "thresholds must be present");
    return;
  }
  validateKnownKeys(value, THRESHOLD_KEYS, path, issues);
  if (value.trusted_min !== 75) issue(issues, `${path}.trusted_min`, "trusted_threshold_mismatch", "trusted_min must be 75");
  if (value.downrank_below !== 50) issue(issues, `${path}.downrank_below`, "downrank_threshold_mismatch", "downrank_below must be 50");
  if (value.quarantine_below !== 30) issue(issues, `${path}.quarantine_below`, "quarantine_threshold_mismatch", "quarantine_below must be 30");
  if (value.revocation_below !== 15) issue(issues, `${path}.revocation_below`, "revocation_threshold_mismatch", "revocation_below must be 15");
}

function validateAdoptionAuthority(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "adoption_authority_required", "adoption authority boundary must be present");
    return;
  }
  validateKnownKeys(value, ADOPTION_AUTHORITY_KEYS, path, issues);
  if (value.source_of_truth_for_adoption !== false) issue(issues, `${path}.source_of_truth_for_adoption`, "source_of_truth_forbidden", "reputation must not be source of truth for adoption");
  if (value.automatic_adoption_allowed !== false) issue(issues, `${path}.automatic_adoption_allowed`, "automatic_adoption_forbidden", "automatic adoption must remain false");
  if (value.advisory_only !== true) issue(issues, `${path}.advisory_only`, "advisory_only_required", "reputation must remain advisory only");
  if (value.adoption_decision_required !== "human_review_and_policy_gate") issue(issues, `${path}.adoption_decision_required`, "human_policy_gate_required", "adoption requires human review and policy gate");
}

function normalizePeer(value: unknown, path: string, issues: PeerReputationIssue[]): PeerReputationPeerInput {
  if (!isRecord(value)) {
    issue(issues, path, "peer_must_be_object", "peer must be an object");
    return emptyInput().peer;
  }
  validateKnownKeys(value, PEER_KEYS, path, issues);
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const repository = stringField(value.repository_full_name, `${path}.repository_full_name`, issues);
  const status = enumField(value.status, PEER_STATUSES, `${path}.status`, "invalid_peer_status", issues, "revoked") as PeerReputationPeerStatus;
  if (peerId.length > 0 && !PEER_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (repository.length > 0 && !REPOSITORY.test(repository)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  return { peer_id: peerId, repository_full_name: repository, status };
}

function normalizeTreaty(value: unknown, path: string, issues: PeerReputationIssue[]): PeerReputationTreatyInput {
  if (!isRecord(value)) {
    issue(issues, path, "treaty_must_be_object", "treaty must be an object");
    return emptyInput().treaty;
  }
  validateKnownKeys(value, TREATY_INPUT_KEYS, path, issues);
  const treatyId = stringField(value.treaty_id, `${path}.treaty_id`, issues);
  const status = enumField(value.status, TREATY_STATUSES, `${path}.status`, "invalid_treaty_status", issues, "revoked") as PeerReputationTreatyStatus;
  const sourcePeerId = stringField(value.source_peer_id, `${path}.source_peer_id`, issues);
  const targetPeerId = stringField(value.target_peer_id, `${path}.target_peer_id`, issues);
  const expiresAt = value.expires_at === undefined || value.expires_at === null ? null : stringField(value.expires_at, `${path}.expires_at`, issues);
  if (treatyId.length > 0 && !PEER_ID.test(treatyId)) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  if (sourcePeerId.length > 0 && !PEER_ID.test(sourcePeerId)) issue(issues, `${path}.source_peer_id`, "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (targetPeerId.length > 0 && !PEER_ID.test(targetPeerId)) issue(issues, `${path}.target_peer_id`, "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
  if (expiresAt !== null && !isRfc3339Utc(expiresAt)) issue(issues, `${path}.expires_at`, "invalid_expires_at", "expires_at must be RFC3339 UTC when present");
  return { treaty_id: treatyId, status, source_peer_id: sourcePeerId, target_peer_id: targetPeerId, expires_at: expiresAt };
}

function normalizeOutcomes(value: unknown, path: string, issues: PeerReputationIssue[], allowEmpty: boolean, requireSorted = false): readonly PeerProposalOutcomeInput[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "outcomes_must_be_array", "outcomes must be an array");
    return [];
  }
  if (!allowEmpty && value.length === 0) issue(issues, path, "outcomes_required", "at least one proposal outcome is required");
  const seen = new Set<string>();
  const outcomes = value.map((entry, index) => normalizeOutcome(entry, `${path}.${index}`, issues));
  for (const [index, outcome] of outcomes.entries()) {
    if (seen.has(outcome.outcome_id)) issue(issues, `${path}.${index}.outcome_id`, "duplicate_outcome_id", "outcome ids must be unique");
    if (requireSorted && index > 0 && compare(outcomes[index - 1]?.outcome_id ?? "", outcome.outcome_id) > 0) issue(issues, path, "entries_not_sorted", "outcomes must be sorted by outcome_id");
    seen.add(outcome.outcome_id);
  }
  return [...outcomes].sort((left, right) => compare(left.outcome_id, right.outcome_id));
}

function normalizeOutcome(value: unknown, path: string, issues: PeerReputationIssue[]): PeerProposalOutcomeInput {
  if (!isRecord(value)) {
    issue(issues, path, "outcome_must_be_object", "outcome must be an object");
    return emptyOutcome();
  }
  validateKnownKeys(value, OUTCOME_KEYS, path, issues);
  const outcomeId = stringField(value.outcome_id, `${path}.outcome_id`, issues);
  const proposalRef = stringField(value.proposal_ref, `${path}.proposal_ref`, issues);
  const sourceKind = enumField(value.source_kind, SOURCE_KINDS, `${path}.source_kind`, "invalid_source_kind", issues, "manual_review") as PeerReputationSourceKind;
  const adoptionOutcome = enumField(value.adoption_outcome, OUTCOMES, `${path}.adoption_outcome`, "invalid_adoption_outcome", issues, "invalid") as PeerReputationOutcome;
  const policyCompliant = booleanField(value.policy_compliant, `${path}.policy_compliant`, issues);
  const risk = enumField(value.risk, RISKS, `${path}.risk`, "invalid_risk", issues, "critical") as PeerReputationRisk;
  const evidenceDigest = stringField(value.evidence_digest, `${path}.evidence_digest`, issues);
  if (outcomeId.length > 0 && !ID.test(outcomeId)) issue(issues, `${path}.outcome_id`, "invalid_outcome_id", "outcome id must be deterministic");
  if (proposalRef.length > 0 && !PROPOSAL_REF.test(proposalRef)) issue(issues, `${path}.proposal_ref`, "invalid_proposal_ref", "proposal ref must be a safe typed ref");
  if (evidenceDigest.length > 0 && !HASH.test(evidenceDigest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence digest must be stable");
  return { outcome_id: outcomeId, proposal_ref: proposalRef, source_kind: sourceKind, adoption_outcome: adoptionOutcome, policy_compliant: policyCompliant, risk, evidence_digest: evidenceDigest };
}

function normalizePolicyEvents(value: unknown, path: string, issues: PeerReputationIssue[], requireSorted = false): readonly PeerPolicyEventInput[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "policy_events_must_be_array", "policy events must be an array");
    return [];
  }
  const seen = new Set<string>();
  const events = value.map((entry, index) => normalizePolicyEvent(entry, `${path}.${index}`, issues));
  for (const [index, event] of events.entries()) {
    if (seen.has(event.event_id)) issue(issues, `${path}.${index}.event_id`, "duplicate_policy_event_id", "policy event ids must be unique");
    if (requireSorted && index > 0 && compare(events[index - 1]?.event_id ?? "", event.event_id) > 0) issue(issues, path, "entries_not_sorted", "policy events must be sorted by event_id");
    seen.add(event.event_id);
  }
  return [...events].sort((left, right) => compare(left.event_id, right.event_id));
}

function normalizePolicyEvent(value: unknown, path: string, issues: PeerReputationIssue[]): PeerPolicyEventInput {
  if (!isRecord(value)) {
    issue(issues, path, "policy_event_must_be_object", "policy event must be an object");
    return emptyPolicyEvent();
  }
  validateKnownKeys(value, POLICY_EVENT_KEYS, path, issues);
  const eventId = stringField(value.event_id, `${path}.event_id`, issues);
  const trigger = enumField(value.trigger, POLICY_TRIGGERS, `${path}.trigger`, "invalid_policy_trigger", issues, "manual_review") as PeerReputationPolicyTrigger;
  const severity = enumField(value.severity, RISKS, `${path}.severity`, "invalid_policy_severity", issues, "critical") as PeerReputationRisk;
  const action = enumField(value.action, POLICY_ACTIONS, `${path}.action`, "invalid_policy_action", issues, "revocation_review") as PeerReputationPolicyAction;
  const summary = stringField(value.summary, `${path}.summary`, issues);
  const evidenceDigest = stringField(value.evidence_digest, `${path}.evidence_digest`, issues);
  if (eventId.length > 0 && !ID.test(eventId)) issue(issues, `${path}.event_id`, "invalid_policy_event_id", "policy event id must be deterministic");
  if (summary.length > 0 && !SAFE_SUMMARY.test(summary)) issue(issues, `${path}.summary`, "invalid_policy_summary", "policy summary must be safe and <= 160 characters");
  if (evidenceDigest.length > 0 && !HASH.test(evidenceDigest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence digest must be stable");
  return { event_id: eventId, trigger, severity, action, summary, evidence_digest: evidenceDigest };
}

function normalizeWeights(value: unknown, path: string, issues: PeerReputationIssue[], requireComplete: boolean): PeerReputationWeights {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, "weights_required", "resolved weights must be present");
    return DEFAULT_WEIGHTS;
  }
  if (!isRecord(value)) {
    issue(issues, path, "weights_must_be_object", "weights must be an object when provided");
    return DEFAULT_WEIGHTS;
  }
  for (const key of Object.keys(value)) if (!WEIGHT_KEYS.has(key)) issue(issues, `${path}.${key}`, "unknown_weight_key", "weight key is not allowed");
  const weights = { ...DEFAULT_WEIGHTS };
  for (const key of WEIGHT_KEYS) {
    if (value[key] === undefined) {
      if (requireComplete) issue(issues, `${path}.${key}`, "missing_weight_key", "resolved weights must include every scoring key");
      continue;
    }
    if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || value[key] < -100 || value[key] > 100) {
      issue(issues, `${path}.${key}`, "invalid_weight", "weights must be integers from -100 to 100");
      continue;
    }
    weights[key as keyof PeerReputationWeights] = value[key] as number;
  }
  validateWeightSemantics(weights, path, issues);
  return weights;
}

function validateWeightSemantics(weights: PeerReputationWeights, path: string, issues: PeerReputationIssue[]): void {
  if (weights.accepted <= 0) issue(issues, `${path}.accepted`, "accepted_weight_must_reward", "accepted outcomes must increase score");
  for (const key of ["rejected", "blocked", "invalid", "policy_breach_low", "policy_breach_medium", "policy_breach_high", "policy_breach_critical", "policy_event_low", "policy_event_medium", "policy_event_high", "policy_event_critical"] as const) {
    if (weights[key] >= 0) issue(issues, `${path}.${key}`, "penalty_weight_must_reduce", `${key} must reduce score`);
  }
}

function scoringInputFor(input: PeerReputationInput): PeerReputationResult["scoring_inputs"] {
  return {
    outcomes: normalizeOutcomes(input.outcomes, "outcomes", [], true),
    policy_events: normalizePolicyEvents(input.policy_events ?? [], "policy_events", []),
    weights: normalizeWeights(input.weights, "weights", [], false),
  };
}

function treatyRef(treaty: PeerReputationTreatyInput): PeerReputationResult["treaty_ref"] {
  return {
    treaty_id: treaty.treaty_id,
    treaty_status: treaty.status,
    source_peer_id: treaty.source_peer_id,
    target_peer_id: treaty.target_peer_id,
    expires_at: treaty.expires_at ?? null,
  };
}

function adoptionAuthority(): PeerReputationResult["adoption_authority"] {
  return {
    source_of_truth_for_adoption: false,
    automatic_adoption_allowed: false,
    advisory_only: true,
    adoption_decision_required: "human_review_and_policy_gate",
  };
}

function guards(): PeerReputationResult["guards"] {
  return {
    no_global_reputation_network: true,
    no_public_ranking: true,
    no_automatic_adoption: true,
    no_network_transport: true,
    no_file_write: true,
    no_github_api_call: true,
    no_policy_mutation: true,
  };
}

function dryRun(): PeerReputationResult["dry_run"] {
  return {
    global_reputation_published: false,
    public_ranking_written: false,
    adoption_performed: false,
    network_transport_performed: false,
    file_written: false,
    github_api_called: false,
    policy_mutation_performed: false,
  };
}

function emptyInput(): PeerReputationInput {
  return {
    peer: { peer_id: "target-peer", repository_full_name: "owner/target", status: "revoked" },
    treaty: { treaty_id: "invalid-treaty", status: "revoked", source_peer_id: "source-peer", target_peer_id: "target-peer", expires_at: null },
    outcomes: [],
    policy_events: [],
    weights: DEFAULT_WEIGHTS,
  };
}

function emptyOutcome(): PeerProposalOutcomeInput {
  return {
    outcome_id: "outcome-00000000",
    proposal_ref: "manual-review:manual-review-00000000",
    source_kind: "manual_review",
    adoption_outcome: "invalid",
    policy_compliant: false,
    risk: "critical",
    evidence_digest: "sha-fnv1a-00000000",
  };
}

function emptyPolicyEvent(): PeerPolicyEventInput {
  return {
    event_id: "policy-event-00000000",
    trigger: "manual_review",
    severity: "critical",
    action: "revocation_review",
    summary: "invalid placeholder",
    evidence_digest: "sha-fnv1a-00000000",
  };
}

function highestRiskFor(outcomes: readonly PeerProposalOutcomeInput[], policyEvents: readonly PeerPolicyEventInput[]): PeerReputationRisk | "none" {
  const order: readonly PeerReputationRisk[] = ["low", "medium", "high", "critical"];
  const risks = [...outcomes.map((entry) => entry.risk), ...policyEvents.map((entry) => entry.severity)];
  if (risks.length === 0) return "none";
  return risks.reduce((highest, risk) => order.indexOf(risk) > order.indexOf(highest) ? risk : highest, "low" as PeerReputationRisk);
}

function recommendedActionFor(score: number, summary: PeerReputationSummary): PeerReputationRecommendedAction {
  if (summary.revocation_triggered) return "revocation_review";
  if (summary.quarantine_threshold_met) return "quarantine";
  if (score < 50 || summary.repeated_rejections) return "downrank";
  return "observe";
}

function bandFor(score: number, action: PeerReputationRecommendedAction): PeerReputationBand {
  if (action === "revocation_review") return "revocation_review";
  if (action === "quarantine") return "quarantined";
  if (action === "downrank") return "downranked";
  if (score >= 75) return "trusted";
  return "neutral";
}

function validateGuards(value: unknown, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(guards())), "guards", issues);
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(dryRun())), "dry_run", issues);
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(value: Record<string, unknown>, issues: PeerReputationIssue[]): void {
  if (value.status === "reputation_ready" && value.decision !== "peer_reputation_ready") issue(issues, "decision", "ready_decision_mismatch", "ready reputation must use peer_reputation_ready");
  if (value.status === "blocked" && value.decision !== "peer_reputation_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked reputation must use peer_reputation_blocked");
  if (value.status === "invalid" && value.decision !== "invalid_peer_reputation_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid reputation must use invalid_peer_reputation_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid reputation must carry issues");
    else value.issues.forEach((entry, index) => validateIssue(entry, `issues.${index}`, issues));
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid reputation must not carry issues");
  }
}

function validateIssue(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "issue_must_be_object", "issue must be an object");
    return;
  }
  validateKnownKeys(value, ISSUE_KEYS, path, issues);
  for (const key of ["path", "code", "message"]) if (typeof value[key] !== "string" || value[key].length === 0) issue(issues, `${path}.${key}`, "invalid_issue_field", "issue fields must be non-empty strings");
}

function reputationDigestPayload(value: Omit<PeerReputationResult, "reputation_id" | "reputation_digest"> | PeerReputationResult): unknown {
  return {
    manifest_version: value.manifest_version,
    schema_ref: value.schema_ref,
    created_at: value.created_at,
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    peer_ref: value.peer_ref,
    treaty_ref: value.treaty_ref,
    scoring_inputs: value.scoring_inputs,
    scoring_summary: value.scoring_summary,
    score: value.score,
    recommended_action: value.recommended_action,
    adoption_authority: value.adoption_authority,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function stringField(value: unknown, path: string, issues: PeerReputationIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: PeerReputationIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
  return value;
}

function enumField(value: unknown, allowed: Set<string>, path: string, code: string, issues: PeerReputationIssue[], fallback: string): string {
  if (typeof value === "string" && allowed.has(value)) return value;
  issue(issues, path, code, `${path} contains an unknown value`);
  return fallback;
}

function booleanField(value: unknown, path: string, issues: PeerReputationIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issue(issues, path, "boolean_required", `${path} must be boolean`);
  return false;
}

function validateKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: PeerReputationIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown_key", "unknown keys are not allowed");
}

function validateNoSecretMaterial(value: unknown, path: string, issues: PeerReputationIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "peer reputation manifests must not contain token or private-key material");
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

function isNonNegativeInteger(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

function issue(issues: PeerReputationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): PeerReputationIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT063PeerReputationScoring = evaluatePeerReputation;
export const validateT063PeerReputationScoring = validatePeerReputation;
