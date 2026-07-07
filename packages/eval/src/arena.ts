export const ARENA_COMPARISON_VERSION = 1 as const;
export const ARENA_COMPARISON_SCHEMA_REF = "urn:forgeroot:conflict-arena:v1" as const;

export type ArenaConflictReason = "policy_conflict" | "lineage_conflict" | "behavior_conflict" | "scope_conflict";
export type ArenaCandidateSourceKind = "peer" | "species" | "local";
export type ArenaRisk = "low" | "medium" | "high" | "critical";
export type ArenaStatus = "arena_ready" | "arena_inconclusive" | "blocked" | "invalid";
export type ArenaDecision = "arena_winner_selected" | "arena_inconclusive" | "arena_blocked" | "invalid_arena_input";
export type ArenaCandidateDecision = "winner" | "loser" | "rejected" | "inconclusive";

export interface ArenaIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ArenaConflictInput {
  readonly conflict_id: string;
  readonly reason: ArenaConflictReason;
  readonly summary: string;
}

export interface ArenaEvalBindingInput {
  readonly shadow_run_ref: string;
  readonly eval_suite_ref: string;
  readonly lineage_threshold_ref: string;
  readonly live_benchmark_execution_allowed?: boolean;
  readonly authoritative_score_write_allowed?: boolean;
}

export interface ArenaThresholds {
  readonly min_candidate_count: 2;
  readonly min_winner_margin: number;
}

export interface ArenaCandidateInput {
  readonly candidate_id: string;
  readonly source_kind: ArenaCandidateSourceKind;
  readonly source_ref: string;
  readonly proposal_ref: string;
  readonly policy_compliant: boolean;
  readonly local_policy_breach: boolean;
  readonly eval_score: number;
  readonly lineage_score: number;
  readonly reputation_score: number;
  readonly risk: ArenaRisk;
  readonly evidence_digest: string;
}

export interface ArenaComparisonInput {
  readonly now?: string;
  readonly arena_id: string;
  readonly conflict: ArenaConflictInput;
  readonly eval_binding: ArenaEvalBindingInput;
  readonly thresholds?: Partial<ArenaThresholds>;
  readonly candidates: readonly ArenaCandidateInput[];
}

export interface ArenaCandidateResult {
  readonly candidate_id: string;
  readonly source_kind: ArenaCandidateSourceKind;
  readonly source_ref: string;
  readonly proposal_ref: string;
  readonly decision: ArenaCandidateDecision;
  readonly rank: number | null;
  readonly rejection_reasons: readonly string[];
  readonly conflict_reason: ArenaConflictReason;
  readonly score_total: number;
  readonly score_breakdown: {
    readonly eval_points: number;
    readonly lineage_points: number;
    readonly reputation_points: number;
    readonly risk_penalty: number;
  };
  readonly evidence_digest: string;
}

export interface ArenaComparisonResult {
  readonly manifest_version: typeof ARENA_COMPARISON_VERSION;
  readonly schema_ref: typeof ARENA_COMPARISON_SCHEMA_REF;
  readonly arena_result_id: string;
  readonly arena_id: string;
  readonly created_at: string;
  readonly status: ArenaStatus;
  readonly decision: ArenaDecision;
  readonly reasons: readonly string[];
  readonly conflict: ArenaConflictInput;
  readonly eval_binding: Required<ArenaEvalBindingInput>;
  readonly thresholds: ArenaThresholds;
  readonly score_policy: {
    readonly eval_weight_percent: 60;
    readonly lineage_weight_percent: 30;
    readonly reputation_weight_percent: 10;
    readonly reputation_is_sole_basis: false;
    readonly risk_penalties: {
      readonly low: 0;
      readonly medium: 5;
      readonly high: 12;
      readonly critical: 25;
    };
  };
  readonly candidate_inputs: readonly ArenaCandidateInput[];
  readonly candidate_results: readonly ArenaCandidateResult[];
  readonly summary: {
    readonly candidate_count: number;
    readonly eligible_candidate_count: number;
    readonly rejected_candidate_count: number;
    readonly winner_candidate_id: string | null;
    readonly top_margin: number;
    readonly primary_conflict_reason: ArenaConflictReason;
    readonly reputation_is_sole_basis: false;
  };
  readonly authority_boundary: {
    readonly automatic_merge_allowed: false;
    readonly peer_negotiation_allowed: false;
    readonly live_benchmark_execution_allowed: false;
    readonly global_consensus_claim: false;
    readonly reputation_is_sole_basis: false;
    readonly final_adoption_requires: "human_review_policy_gate_and_explicit_pr";
  };
  readonly guards: {
    readonly no_automatic_merge: true;
    readonly no_peer_negotiation: true;
    readonly no_live_benchmark_execution: true;
    readonly no_global_consensus_protocol: true;
    readonly no_network_transport: true;
    readonly no_file_write: true;
    readonly no_github_api_call: true;
    readonly no_policy_mutation: true;
  };
  readonly dry_run: {
    readonly automatic_merge_performed: false;
    readonly peer_negotiation_performed: false;
    readonly live_benchmark_execution_performed: false;
    readonly global_consensus_protocol_performed: false;
    readonly network_transport_performed: false;
    readonly file_written: false;
    readonly github_api_called: false;
    readonly policy_mutation_performed: false;
  };
  readonly arena_digest: string;
  readonly issues?: readonly ArenaIssue[];
}

export interface ArenaValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ArenaIssue[];
}

export const ARENA_COMPARISON_CONTRACT = {
  consumes: ["arena_candidate_set", "eval_shadow_run_ref", "lineage_threshold_ref", "peer_reputation_score"],
  produces: ["conflict_arena_decision_manifest"],
  validates: ["candidate_registration", "local_eval_binding", "conflict_reason_classification", "winner_loser_inconclusive_decision", "reputation_auxiliary_boundary"],
  forbids: ["automatic_merge", "peer_negotiation", "live_benchmark_execution", "global_consensus_protocol", "network_transport", "file_write", "github_api_call", "policy_mutation"],
  deterministic: true,
  manifestOnly: true,
  reputationAuxiliaryOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-06T00:00:00Z";
const DEFAULT_THRESHOLDS: ArenaThresholds = { min_candidate_count: 2, min_winner_margin: 5 };
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const SAFE_REF = /^[A-Za-z0-9._:/-]{3,180}$/;
const SAFE_SUMMARY = /^[A-Za-z0-9 .,:;_/-]{1,180}$/;
const HASH = /^(sha256:[0-9a-f]{64}|sha-[a-z0-9-]+-[0-9a-f]{8,})$/;
const CONFLICT_REASONS = new Set(["policy_conflict", "lineage_conflict", "behavior_conflict", "scope_conflict"]);
const SOURCE_KINDS = new Set(["peer", "species", "local"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const STATUSES = new Set(["arena_ready", "arena_inconclusive", "blocked", "invalid"]);
const DECISIONS = new Set(["arena_winner_selected", "arena_inconclusive", "arena_blocked", "invalid_arena_input"]);
const CANDIDATE_DECISIONS = new Set(["winner", "loser", "rejected", "inconclusive"]);
const RESULT_KEYS = new Set([
  "manifest_version",
  "schema_ref",
  "arena_result_id",
  "arena_id",
  "created_at",
  "status",
  "decision",
  "reasons",
  "conflict",
  "eval_binding",
  "thresholds",
  "score_policy",
  "candidate_inputs",
  "candidate_results",
  "summary",
  "authority_boundary",
  "guards",
  "dry_run",
  "arena_digest",
  "issues",
]);
const INPUT_KEYS = new Set(["now", "arena_id", "conflict", "eval_binding", "thresholds", "candidates"]);
const CONFLICT_KEYS = new Set(["conflict_id", "reason", "summary"]);
const EVAL_BINDING_KEYS = new Set(["shadow_run_ref", "eval_suite_ref", "lineage_threshold_ref", "live_benchmark_execution_allowed", "authoritative_score_write_allowed"]);
const THRESHOLD_KEYS = new Set(["min_candidate_count", "min_winner_margin"]);
const CANDIDATE_KEYS = new Set(["candidate_id", "source_kind", "source_ref", "proposal_ref", "policy_compliant", "local_policy_breach", "eval_score", "lineage_score", "reputation_score", "risk", "evidence_digest"]);
const CANDIDATE_RESULT_KEYS = new Set(["candidate_id", "source_kind", "source_ref", "proposal_ref", "decision", "rank", "rejection_reasons", "conflict_reason", "score_total", "score_breakdown", "evidence_digest"]);
const SCORE_BREAKDOWN_KEYS = new Set(["eval_points", "lineage_points", "reputation_points", "risk_penalty"]);
const SCORE_POLICY_KEYS = new Set(["eval_weight_percent", "lineage_weight_percent", "reputation_weight_percent", "reputation_is_sole_basis", "risk_penalties"]);
const RISK_PENALTY_KEYS = new Set(["low", "medium", "high", "critical"]);
const SUMMARY_KEYS = new Set(["candidate_count", "eligible_candidate_count", "rejected_candidate_count", "winner_candidate_id", "top_margin", "primary_conflict_reason", "reputation_is_sole_basis"]);
const AUTHORITY_KEYS = new Set(["automatic_merge_allowed", "peer_negotiation_allowed", "live_benchmark_execution_allowed", "global_consensus_claim", "reputation_is_sole_basis", "final_adoption_requires"]);
const ISSUE_KEYS = new Set(["path", "code", "message"]);

const RISK_PENALTIES = { low: 0, medium: 5, high: 12, critical: 25 } as const;

interface NormalizedInput {
  readonly input: ArenaComparisonInput | null;
  readonly now?: string;
  readonly issues: readonly ArenaIssue[];
}

interface RankedCandidate {
  readonly candidate: ArenaCandidateInput;
  readonly rejectionReasons: readonly string[];
  readonly scoreTotal: number;
  readonly scoreBreakdown: ArenaCandidateResult["score_breakdown"];
  readonly rank: number | null;
}

interface DecisionPlan {
  readonly status: ArenaStatus;
  readonly decision: ArenaDecision;
  readonly reasons: readonly string[];
  readonly winnerCandidateId: string | null;
  readonly topMargin: number;
  readonly ranked: readonly RankedCandidate[];
}

interface ResolvedArenaInput {
  readonly arena_id: string;
  readonly conflict: ArenaConflictInput;
  readonly eval_binding: Required<ArenaEvalBindingInput>;
  readonly thresholds: ArenaThresholds;
  readonly candidates: readonly ArenaCandidateInput[];
}

export function compareArenaCandidates(input: unknown): ArenaComparisonResult {
  const normalized = normalizeInput(input);
  const createdAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [makeIssue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "input must be an object")]);
  return resultFor(createdAt ?? DEFAULT_NOW, normalized.input);
}

export function validateArenaComparison(value: unknown): ArenaValidationResult {
  const issues: ArenaIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [makeIssue("result", "result_must_be_object", "arena comparison result must be an object")] };
  validateKnownKeys(value, RESULT_KEYS, "result", issues);
  validateTopLevel(value, issues);
  validateConflict(value.conflict, "conflict", issues);
  validateEvalBinding(value.eval_binding, "eval_binding", issues);
  validateThresholds(value.thresholds, "thresholds", issues, true);
  validateScorePolicy(value.score_policy, issues);
  const candidates = validateCandidates(value.candidate_inputs, "candidate_inputs", issues, value.status === "invalid", true);
  validateCandidateResults(value.candidate_results, "candidate_results", issues, value.status === "invalid");
  validateSummary(value.summary, issues);
  validateAuthority(value.authority_boundary, issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value, issues);
  validateNoSecretMaterial(value, "result", issues);

  if (issues.length === 0 && value.status !== "invalid" && candidates !== null && isRecord(value.conflict) && isRecord(value.eval_binding) && isRecord(value.thresholds)) {
    const expected = resultFor(value.created_at as string, {
      arena_id: value.arena_id as string,
      conflict: value.conflict as unknown as ArenaConflictInput,
      eval_binding: value.eval_binding as unknown as ArenaEvalBindingInput,
      thresholds: value.thresholds as unknown as ArenaThresholds,
      candidates,
    });
    compareField(value.candidate_results, expected.candidate_results, "candidate_results", issues);
    compareField(value.summary, expected.summary, "summary", issues);
    compareField(value.status, expected.status, "status", issues);
    compareField(value.decision, expected.decision, "decision", issues);
    compareField(value.reasons, expected.reasons, "reasons", issues);
  }

  const expectedDigest = canonicalDigest(arenaDigestPayload(value as unknown as ArenaComparisonResult));
  if (typeof value.arena_digest !== "string" || value.arena_digest !== expectedDigest) issue(issues, "arena_digest", "digest_mismatch", "arena_digest must cover the arena manifest payload");
  if (typeof value.arena_result_id !== "string" || value.arena_result_id !== stableId("arena-comparison", [expectedDigest])) issue(issues, "arena_result_id", "id_mismatch", "arena_result_id must match arena_digest");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(value: unknown): NormalizedInput {
  const issues: ArenaIssue[] = [];
  if (!isRecord(value)) return { input: null, issues: [makeIssue("input", "input_must_be_object", "input must be an object")] };
  validateKnownKeys(value, INPUT_KEYS, "input", issues);
  validateNoSecretMaterial(value, "input", issues);
  const arenaId = stringField(value.arena_id, "arena_id", issues);
  if (arenaId.length > 0 && !ID.test(arenaId)) issue(issues, "arena_id", "invalid_arena_id", "arena_id must be lowercase kebab-case with deterministic suffix");
  const conflict = normalizeConflict(value.conflict, "conflict", issues);
  const evalBinding = normalizeEvalBinding(value.eval_binding, "eval_binding", issues);
  const thresholds = normalizeThresholds(value.thresholds, "thresholds", issues, false);
  const candidates = normalizeCandidates(value.candidates, "candidates", issues, false);
  const now = optionalString(value.now, "now", issues);
  return { input: { arena_id: arenaId, conflict, eval_binding: evalBinding, thresholds, candidates, ...(now === undefined ? {} : { now }) }, now, issues };
}

function resultFor(createdAt: string, input: ArenaComparisonInput): ArenaComparisonResult {
  const normalizedInput = normalizedResultInput(input);
  const plan = decisionPlanFor(normalizedInput);
  const candidateResults = candidateResultsFor(plan, normalizedInput.conflict.reason);
  const summary = {
    candidate_count: normalizedInput.candidates.length,
    eligible_candidate_count: plan.ranked.filter((entry) => entry.rejectionReasons.length === 0).length,
    rejected_candidate_count: plan.ranked.filter((entry) => entry.rejectionReasons.length > 0).length,
    winner_candidate_id: plan.winnerCandidateId,
    top_margin: plan.topMargin,
    primary_conflict_reason: normalizedInput.conflict.reason,
    reputation_is_sole_basis: false as const,
  };
  const draft: Omit<ArenaComparisonResult, "arena_result_id" | "arena_digest"> = {
    manifest_version: ARENA_COMPARISON_VERSION,
    schema_ref: ARENA_COMPARISON_SCHEMA_REF,
    arena_id: normalizedInput.arena_id,
    created_at: createdAt,
    status: plan.status,
    decision: plan.decision,
    reasons: plan.reasons,
    conflict: normalizedInput.conflict,
    eval_binding: resolvedEvalBinding(normalizedInput.eval_binding),
    thresholds: resolvedThresholds(normalizedInput.thresholds),
    score_policy: scorePolicy(),
    candidate_inputs: normalizedInput.candidates,
    candidate_results: candidateResults,
    summary,
    authority_boundary: authorityBoundary(),
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(arenaDigestPayload(draft));
  return { ...draft, arena_result_id: stableId("arena-comparison", [digest]), arena_digest: digest };
}

function invalidResult(createdAt: string, issues: readonly ArenaIssue[]): ArenaComparisonResult {
  const safe = emptyInput();
  const draft: Omit<ArenaComparisonResult, "arena_result_id" | "arena_digest"> = {
    manifest_version: ARENA_COMPARISON_VERSION,
    schema_ref: ARENA_COMPARISON_SCHEMA_REF,
    arena_id: safe.arena_id,
    created_at: createdAt,
    status: "invalid",
    decision: "invalid_arena_input",
    reasons: uniqueStrings(["invalid_arena_input", ...issues.map((entry) => entry.code)]),
    conflict: safe.conflict,
    eval_binding: resolvedEvalBinding(safe.eval_binding),
    thresholds: resolvedThresholds(safe.thresholds),
    score_policy: scorePolicy(),
    candidate_inputs: [],
    candidate_results: [],
    summary: {
      candidate_count: 0,
      eligible_candidate_count: 0,
      rejected_candidate_count: 0,
      winner_candidate_id: null,
      top_margin: 0,
      primary_conflict_reason: "policy_conflict",
      reputation_is_sole_basis: false,
    },
    authority_boundary: authorityBoundary(),
    guards: guards(),
    dry_run: dryRun(),
    issues,
  };
  const digest = canonicalDigest(arenaDigestPayload(draft));
  return { ...draft, arena_result_id: stableId("arena-comparison", [digest]), arena_digest: digest };
}

function normalizedResultInput(input: ArenaComparisonInput): ResolvedArenaInput {
  return {
    arena_id: input.arena_id,
    conflict: input.conflict,
    eval_binding: resolvedEvalBinding(input.eval_binding),
    thresholds: resolvedThresholds(input.thresholds),
    candidates: normalizeCandidates(input.candidates, "candidates", [], true),
  };
}

function decisionPlanFor(input: Pick<ResolvedArenaInput, "eval_binding" | "thresholds" | "candidates">): DecisionPlan {
  const ranked = rankedCandidates(input.candidates);
  const eligible = ranked.filter((entry) => entry.rejectionReasons.length === 0);
  const blockingReasons: string[] = [];
  if (input.eval_binding.live_benchmark_execution_allowed === true) blockingReasons.push("live_benchmark_execution_forbidden");
  if (input.eval_binding.authoritative_score_write_allowed === true) blockingReasons.push("authoritative_score_write_forbidden");
  if (eligible.length < input.thresholds.min_candidate_count) blockingReasons.push("insufficient_eligible_candidates");
  if (blockingReasons.length > 0) return { status: "blocked", decision: "arena_blocked", reasons: uniqueStrings(["arena_blocked", ...blockingReasons]), winnerCandidateId: null, topMargin: 0, ranked: withRanks(ranked) };

  const sortedEligible = [...eligible].sort(compareRankedCandidates);
  const top = sortedEligible[0];
  const second = sortedEligible[1];
  const topMargin = roundScore((top?.scoreTotal ?? 0) - (second?.scoreTotal ?? 0));
  if (top !== undefined && second !== undefined && topMargin >= input.thresholds.min_winner_margin) {
    return { status: "arena_ready", decision: "arena_winner_selected", reasons: ["arena_winner_selected", "reputation_auxiliary_only"], winnerCandidateId: top.candidate.candidate_id, topMargin, ranked: withRanks(ranked) };
  }
  return { status: "arena_inconclusive", decision: "arena_inconclusive", reasons: ["arena_inconclusive", "winner_margin_below_threshold"], winnerCandidateId: null, topMargin, ranked: withRanks(ranked) };
}

function rankedCandidates(candidates: readonly ArenaCandidateInput[]): readonly RankedCandidate[] {
  return candidates.map((candidate) => {
    const rejectionReasons = rejectionReasonsFor(candidate);
    const scoreBreakdown = scoreBreakdownFor(candidate);
    return {
      candidate,
      rejectionReasons,
      scoreTotal: rejectionReasons.length > 0 ? 0 : roundScore(scoreBreakdown.eval_points + scoreBreakdown.lineage_points + scoreBreakdown.reputation_points - scoreBreakdown.risk_penalty),
      scoreBreakdown,
      rank: null,
    };
  });
}

function withRanks(ranked: readonly RankedCandidate[]): readonly RankedCandidate[] {
  const rankByCandidate = new Map<string, number>();
  [...ranked].filter((entry) => entry.rejectionReasons.length === 0).sort(compareRankedCandidates).forEach((entry, index) => rankByCandidate.set(entry.candidate.candidate_id, index + 1));
  return ranked.map((entry) => ({ ...entry, rank: rankByCandidate.get(entry.candidate.candidate_id) ?? null }));
}

function candidateResultsFor(plan: DecisionPlan, primaryReason: ArenaConflictReason): readonly ArenaCandidateResult[] {
  return [...plan.ranked].sort((left, right) => compare(left.candidate.candidate_id, right.candidate.candidate_id)).map((entry) => {
    const decision = candidateDecisionFor(entry, plan);
    return {
      candidate_id: entry.candidate.candidate_id,
      source_kind: entry.candidate.source_kind,
      source_ref: entry.candidate.source_ref,
      proposal_ref: entry.candidate.proposal_ref,
      decision,
      rank: entry.rank,
      rejection_reasons: entry.rejectionReasons,
      conflict_reason: entry.rejectionReasons.some((reason) => reason.includes("policy")) ? "policy_conflict" : primaryReason,
      score_total: entry.scoreTotal,
      score_breakdown: entry.scoreBreakdown,
      evidence_digest: entry.candidate.evidence_digest,
    };
  });
}

function candidateDecisionFor(entry: RankedCandidate, plan: DecisionPlan): ArenaCandidateDecision {
  if (entry.rejectionReasons.length > 0) return "rejected";
  if (plan.status === "arena_ready") return entry.candidate.candidate_id === plan.winnerCandidateId ? "winner" : "loser";
  return "inconclusive";
}

function rejectionReasonsFor(candidate: ArenaCandidateInput): readonly string[] {
  const reasons = [];
  if (!candidate.policy_compliant) reasons.push("policy_breach_rejected");
  if (candidate.source_kind === "local" && candidate.local_policy_breach) reasons.push("local_policy_breach_rejected");
  return reasons;
}

function scoreBreakdownFor(candidate: ArenaCandidateInput): ArenaCandidateResult["score_breakdown"] {
  return {
    eval_points: roundScore(candidate.eval_score * 0.6),
    lineage_points: roundScore(candidate.lineage_score * 0.3),
    reputation_points: roundScore(candidate.reputation_score * 0.1),
    risk_penalty: RISK_PENALTIES[candidate.risk],
  };
}

function normalizeConflict(value: unknown, path: string, issues: ArenaIssue[]): ArenaConflictInput {
  if (!isRecord(value)) {
    issue(issues, path, "conflict_must_be_object", "conflict must be an object");
    return emptyInput().conflict;
  }
  validateKnownKeys(value, CONFLICT_KEYS, path, issues);
  const conflictId = stringField(value.conflict_id, `${path}.conflict_id`, issues);
  const reason = enumField(value.reason, CONFLICT_REASONS, `${path}.reason`, "invalid_conflict_reason", issues, "policy_conflict") as ArenaConflictReason;
  const summary = stringField(value.summary, `${path}.summary`, issues);
  if (conflictId.length > 0 && !ID.test(conflictId)) issue(issues, `${path}.conflict_id`, "invalid_conflict_id", "conflict_id must be deterministic");
  if (summary.length > 0 && !SAFE_SUMMARY.test(summary)) issue(issues, `${path}.summary`, "invalid_summary", "summary must be safe and <= 180 characters");
  return { conflict_id: conflictId, reason, summary };
}

function validateConflict(value: unknown, path: string, issues: ArenaIssue[]): ArenaConflictInput | null {
  const before = issues.length;
  const conflict = normalizeConflict(value, path, issues);
  return issues.length === before ? conflict : null;
}

function normalizeEvalBinding(value: unknown, path: string, issues: ArenaIssue[]): Required<ArenaEvalBindingInput> {
  if (!isRecord(value)) {
    issue(issues, path, "eval_binding_must_be_object", "eval_binding must be an object");
    return resolvedEvalBinding(emptyInput().eval_binding);
  }
  validateKnownKeys(value, EVAL_BINDING_KEYS, path, issues);
  const shadowRunRef = stringField(value.shadow_run_ref, `${path}.shadow_run_ref`, issues);
  const evalSuiteRef = stringField(value.eval_suite_ref, `${path}.eval_suite_ref`, issues);
  const lineageThresholdRef = stringField(value.lineage_threshold_ref, `${path}.lineage_threshold_ref`, issues);
  const liveBenchmarkExecutionAllowed = value.live_benchmark_execution_allowed === undefined ? false : booleanField(value.live_benchmark_execution_allowed, `${path}.live_benchmark_execution_allowed`, issues);
  const authoritativeScoreWriteAllowed = value.authoritative_score_write_allowed === undefined ? false : booleanField(value.authoritative_score_write_allowed, `${path}.authoritative_score_write_allowed`, issues);
  for (const [key, ref] of Object.entries({ shadow_run_ref: shadowRunRef, eval_suite_ref: evalSuiteRef, lineage_threshold_ref: lineageThresholdRef })) {
    if (ref.length > 0 && !SAFE_REF.test(ref)) issue(issues, `${path}.${key}`, "invalid_ref", `${key} must be a safe manifest reference`);
  }
  return {
    shadow_run_ref: shadowRunRef,
    eval_suite_ref: evalSuiteRef,
    lineage_threshold_ref: lineageThresholdRef,
    live_benchmark_execution_allowed: liveBenchmarkExecutionAllowed,
    authoritative_score_write_allowed: authoritativeScoreWriteAllowed,
  };
}

function validateEvalBinding(value: unknown, path: string, issues: ArenaIssue[]): Required<ArenaEvalBindingInput> | null {
  const before = issues.length;
  const binding = normalizeEvalBinding(value, path, issues);
  return issues.length === before ? binding : null;
}

function normalizeThresholds(value: unknown, path: string, issues: ArenaIssue[], requireComplete: boolean): ArenaThresholds {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, "thresholds_required", "thresholds must be present");
    return DEFAULT_THRESHOLDS;
  }
  if (!isRecord(value)) {
    issue(issues, path, "thresholds_must_be_object", "thresholds must be an object");
    return DEFAULT_THRESHOLDS;
  }
  validateKnownKeys(value, THRESHOLD_KEYS, path, issues);
  const minCandidateCount = value.min_candidate_count === undefined ? DEFAULT_THRESHOLDS.min_candidate_count : integerField(value.min_candidate_count, `${path}.min_candidate_count`, issues);
  const minWinnerMargin = value.min_winner_margin === undefined ? DEFAULT_THRESHOLDS.min_winner_margin : integerField(value.min_winner_margin, `${path}.min_winner_margin`, issues);
  if (minCandidateCount !== 2) issue(issues, `${path}.min_candidate_count`, "min_candidate_count_must_be_two", "arena comparisons require exactly two or more candidates");
  if (minWinnerMargin < 1 || minWinnerMargin > 50) issue(issues, `${path}.min_winner_margin`, "invalid_min_winner_margin", "min_winner_margin must be from 1 to 50");
  return { min_candidate_count: 2, min_winner_margin: minWinnerMargin };
}

function validateThresholds(value: unknown, path: string, issues: ArenaIssue[], requireComplete: boolean): ArenaThresholds | null {
  const before = issues.length;
  const thresholds = normalizeThresholds(value, path, issues, requireComplete);
  return issues.length === before ? thresholds : null;
}

function normalizeCandidates(value: unknown, path: string, issues: ArenaIssue[], requireSorted: boolean): readonly ArenaCandidateInput[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "candidates_must_be_array", "candidates must be an array");
    return [];
  }
  if (value.length < 2) issue(issues, path, "at_least_two_candidates_required", "arena comparison requires at least two candidates");
  const seen = new Set<string>();
  const candidates = value.map((entry, index) => normalizeCandidate(entry, `${path}.${index}`, issues));
  for (const [index, candidate] of candidates.entries()) {
    if (seen.has(candidate.candidate_id)) issue(issues, `${path}.${index}.candidate_id`, "duplicate_candidate_id", "candidate ids must be unique");
    if (requireSorted && index > 0 && compare(candidates[index - 1]?.candidate_id ?? "", candidate.candidate_id) > 0) issue(issues, path, "entries_not_sorted", "candidate inputs must be sorted by candidate_id");
    seen.add(candidate.candidate_id);
  }
  return [...candidates].sort((left, right) => compare(left.candidate_id, right.candidate_id));
}

function validateCandidates(value: unknown, path: string, issues: ArenaIssue[], allowEmpty: boolean, requireSorted: boolean): readonly ArenaCandidateInput[] | null {
  if (allowEmpty && Array.isArray(value) && value.length === 0) return [];
  const before = issues.length;
  const candidates = normalizeCandidates(value, path, issues, requireSorted);
  return issues.length === before ? candidates : null;
}

function normalizeCandidate(value: unknown, path: string, issues: ArenaIssue[]): ArenaCandidateInput {
  if (!isRecord(value)) {
    issue(issues, path, "candidate_must_be_object", "candidate must be an object");
    return emptyCandidate();
  }
  validateKnownKeys(value, CANDIDATE_KEYS, path, issues);
  const candidateId = stringField(value.candidate_id, `${path}.candidate_id`, issues);
  const sourceKind = enumField(value.source_kind, SOURCE_KINDS, `${path}.source_kind`, "invalid_source_kind", issues, "peer") as ArenaCandidateSourceKind;
  const sourceRef = stringField(value.source_ref, `${path}.source_ref`, issues);
  const proposalRef = stringField(value.proposal_ref, `${path}.proposal_ref`, issues);
  const policyCompliant = booleanField(value.policy_compliant, `${path}.policy_compliant`, issues);
  const localPolicyBreach = booleanField(value.local_policy_breach, `${path}.local_policy_breach`, issues);
  const evalScore = scoreField(value.eval_score, `${path}.eval_score`, issues);
  const lineageScore = scoreField(value.lineage_score, `${path}.lineage_score`, issues);
  const reputationScore = scoreField(value.reputation_score, `${path}.reputation_score`, issues);
  const risk = enumField(value.risk, RISKS, `${path}.risk`, "invalid_risk", issues, "critical") as ArenaRisk;
  const evidenceDigest = stringField(value.evidence_digest, `${path}.evidence_digest`, issues);
  if (candidateId.length > 0 && !ID.test(candidateId)) issue(issues, `${path}.candidate_id`, "invalid_candidate_id", "candidate_id must be deterministic");
  if (sourceRef.length > 0 && !SAFE_REF.test(sourceRef)) issue(issues, `${path}.source_ref`, "invalid_source_ref", "source_ref must be safe");
  if (proposalRef.length > 0 && !SAFE_REF.test(proposalRef)) issue(issues, `${path}.proposal_ref`, "invalid_proposal_ref", "proposal_ref must be safe");
  if (evidenceDigest.length > 0 && !HASH.test(evidenceDigest)) issue(issues, `${path}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
  if (sourceKind !== "local" && localPolicyBreach) issue(issues, `${path}.local_policy_breach`, "local_policy_breach_requires_local_source", "local policy breach can only be set for local candidates");
  return { candidate_id: candidateId, source_kind: sourceKind, source_ref: sourceRef, proposal_ref: proposalRef, policy_compliant: policyCompliant, local_policy_breach: localPolicyBreach, eval_score: evalScore, lineage_score: lineageScore, reputation_score: reputationScore, risk, evidence_digest: evidenceDigest };
}

function validateCandidateResults(value: unknown, path: string, issues: ArenaIssue[], allowEmpty: boolean): void {
  if (!Array.isArray(value)) {
    issue(issues, path, "candidate_results_must_be_array", "candidate_results must be an array");
    return;
  }
  if (!allowEmpty && value.length < 2) issue(issues, path, "candidate_results_required", "candidate_results must include each candidate");
  let previous = "";
  for (const [index, entry] of value.entries()) {
    const itemPath = `${path}.${index}`;
    if (!isRecord(entry)) {
      issue(issues, itemPath, "candidate_result_must_be_object", "candidate result must be an object");
      continue;
    }
    validateKnownKeys(entry, CANDIDATE_RESULT_KEYS, itemPath, issues);
    const candidateId = stringField(entry.candidate_id, `${itemPath}.candidate_id`, issues);
    if (candidateId.length > 0 && !ID.test(candidateId)) issue(issues, `${itemPath}.candidate_id`, "invalid_candidate_id", "candidate_id must be deterministic");
    if (index > 0 && compare(previous, candidateId) > 0) issue(issues, path, "entries_not_sorted", "candidate results must be sorted by candidate_id");
    previous = candidateId;
    enumField(entry.source_kind, SOURCE_KINDS, `${itemPath}.source_kind`, "invalid_source_kind", issues, "peer");
    enumField(entry.decision, CANDIDATE_DECISIONS, `${itemPath}.decision`, "invalid_candidate_decision", issues, "rejected");
    enumField(entry.conflict_reason, CONFLICT_REASONS, `${itemPath}.conflict_reason`, "invalid_conflict_reason", issues, "policy_conflict");
    for (const key of ["source_ref", "proposal_ref"]) {
      const ref = stringField(entry[key], `${itemPath}.${key}`, issues);
      if (ref.length > 0 && !SAFE_REF.test(ref)) issue(issues, `${itemPath}.${key}`, "invalid_ref", `${key} must be safe`);
    }
    if (!(entry.rank === null || isIntegerInRange(entry.rank, 1, 1000))) issue(issues, `${itemPath}.rank`, "invalid_rank", "rank must be null or a positive integer");
    if (!Array.isArray(entry.rejection_reasons) || !entry.rejection_reasons.every((reason) => typeof reason === "string" && reason.length > 0)) issue(issues, `${itemPath}.rejection_reasons`, "invalid_rejection_reasons", "rejection reasons must be strings");
    if (typeof entry.score_total !== "number" || !Number.isFinite(entry.score_total) || entry.score_total < 0 || entry.score_total > 100) issue(issues, `${itemPath}.score_total`, "invalid_score_total", "score_total must be 0..100");
    validateScoreBreakdown(entry.score_breakdown, `${itemPath}.score_breakdown`, issues);
    const digest = stringField(entry.evidence_digest, `${itemPath}.evidence_digest`, issues);
    if (digest.length > 0 && !HASH.test(digest)) issue(issues, `${itemPath}.evidence_digest`, "invalid_evidence_digest", "evidence_digest must be stable");
  }
}

function validateScoreBreakdown(value: unknown, path: string, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "score_breakdown_required", "score_breakdown must be present");
    return;
  }
  validateKnownKeys(value, SCORE_BREAKDOWN_KEYS, path, issues);
  for (const key of SCORE_BREAKDOWN_KEYS) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key])) issue(issues, `${path}.${key}`, "invalid_score_component", "score components must be finite numbers");
  }
}

function validateScorePolicy(value: unknown, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "score_policy", "score_policy_required", "score_policy must be present");
    return;
  }
  validateKnownKeys(value, SCORE_POLICY_KEYS, "score_policy", issues);
  if (value.eval_weight_percent !== 60) issue(issues, "score_policy.eval_weight_percent", "eval_weight_mismatch", "eval weight must be 60");
  if (value.lineage_weight_percent !== 30) issue(issues, "score_policy.lineage_weight_percent", "lineage_weight_mismatch", "lineage weight must be 30");
  if (value.reputation_weight_percent !== 10) issue(issues, "score_policy.reputation_weight_percent", "reputation_weight_mismatch", "reputation weight must be 10");
  if (value.reputation_is_sole_basis !== false) issue(issues, "score_policy.reputation_is_sole_basis", "reputation_sole_basis_forbidden", "reputation must not be the sole basis");
  if (!isRecord(value.risk_penalties)) {
    issue(issues, "score_policy.risk_penalties", "risk_penalties_required", "risk penalties must be present");
    return;
  }
  validateKnownKeys(value.risk_penalties, RISK_PENALTY_KEYS, "score_policy.risk_penalties", issues);
  for (const key of RISK_PENALTY_KEYS) if (value.risk_penalties[key] !== RISK_PENALTIES[key as ArenaRisk]) issue(issues, `score_policy.risk_penalties.${key}`, "risk_penalty_mismatch", "risk penalty must match the arena contract");
}

function validateSummary(value: unknown, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "summary", "summary_required", "summary must be present");
    return;
  }
  validateKnownKeys(value, SUMMARY_KEYS, "summary", issues);
  for (const key of ["candidate_count", "eligible_candidate_count", "rejected_candidate_count"]) {
    if (!isIntegerInRange(value[key], 0, 1000)) issue(issues, `summary.${key}`, "invalid_count", `${key} must be a non-negative integer`);
  }
  if (!(value.winner_candidate_id === null || (typeof value.winner_candidate_id === "string" && ID.test(value.winner_candidate_id)))) issue(issues, "summary.winner_candidate_id", "invalid_winner_candidate_id", "winner_candidate_id must be null or a deterministic candidate id");
  if (typeof value.top_margin !== "number" || !Number.isFinite(value.top_margin) || value.top_margin < 0) issue(issues, "summary.top_margin", "invalid_top_margin", "top_margin must be non-negative");
  enumField(value.primary_conflict_reason, CONFLICT_REASONS, "summary.primary_conflict_reason", "invalid_conflict_reason", issues, "policy_conflict");
  if (value.reputation_is_sole_basis !== false) issue(issues, "summary.reputation_is_sole_basis", "reputation_sole_basis_forbidden", "reputation must not be the sole basis");
}

function validateAuthority(value: unknown, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "authority_boundary", "authority_boundary_required", "authority boundary must be present");
    return;
  }
  validateKnownKeys(value, AUTHORITY_KEYS, "authority_boundary", issues);
  for (const key of ["automatic_merge_allowed", "peer_negotiation_allowed", "live_benchmark_execution_allowed", "global_consensus_claim", "reputation_is_sole_basis"]) if (value[key] !== false) issue(issues, `authority_boundary.${key}`, "authority_forbidden", `${key} must be false`);
  if (value.final_adoption_requires !== "human_review_policy_gate_and_explicit_pr") issue(issues, "authority_boundary.final_adoption_requires", "adoption_boundary_mismatch", "final adoption requires human review, policy gate, and explicit PR");
}

function validateGuards(value: unknown, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(guards())), "guards", issues);
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(dryRun())), "dry_run", issues);
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTopLevel(value: Record<string, unknown>, issues: ArenaIssue[]): void {
  if (value.manifest_version !== ARENA_COMPARISON_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== ARENA_COMPARISON_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify conflict arena v1");
  if (typeof value.arena_id !== "string" || !ID.test(value.arena_id)) issue(issues, "arena_id", "invalid_arena_id", "arena_id must be deterministic");
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (typeof value.status !== "string" || !STATUSES.has(value.status)) issue(issues, "status", "invalid_status", "status must be known");
  if (typeof value.decision !== "string" || !DECISIONS.has(value.decision)) issue(issues, "decision", "invalid_decision", "decision must be known");
  if (!Array.isArray(value.reasons) || !value.reasons.every((reason) => typeof reason === "string" && reason.length > 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
}

function validateTerminal(value: Record<string, unknown>, issues: ArenaIssue[]): void {
  if (value.status === "arena_ready" && value.decision !== "arena_winner_selected") issue(issues, "decision", "ready_decision_mismatch", "ready arena must select a winner");
  if (value.status === "arena_inconclusive" && value.decision !== "arena_inconclusive") issue(issues, "decision", "inconclusive_decision_mismatch", "inconclusive arena must use arena_inconclusive");
  if (value.status === "blocked" && value.decision !== "arena_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked arena must use arena_blocked");
  if (value.status === "invalid" && value.decision !== "invalid_arena_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid arena must use invalid_arena_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid arena must carry issues");
    else value.issues.forEach((entry, index) => validateIssue(entry, `issues.${index}`, issues));
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid arena must not carry issues");
  }
}

function validateIssue(value: unknown, path: string, issues: ArenaIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "issue_must_be_object", "issue must be an object");
    return;
  }
  validateKnownKeys(value, ISSUE_KEYS, path, issues);
  for (const key of ["path", "code", "message"]) if (typeof value[key] !== "string" || value[key].length === 0) issue(issues, `${path}.${key}`, "invalid_issue_field", "issue fields must be non-empty strings");
}

function scorePolicy(): ArenaComparisonResult["score_policy"] {
  return {
    eval_weight_percent: 60,
    lineage_weight_percent: 30,
    reputation_weight_percent: 10,
    reputation_is_sole_basis: false,
    risk_penalties: { ...RISK_PENALTIES },
  };
}

function authorityBoundary(): ArenaComparisonResult["authority_boundary"] {
  return {
    automatic_merge_allowed: false,
    peer_negotiation_allowed: false,
    live_benchmark_execution_allowed: false,
    global_consensus_claim: false,
    reputation_is_sole_basis: false,
    final_adoption_requires: "human_review_policy_gate_and_explicit_pr",
  };
}

function guards(): ArenaComparisonResult["guards"] {
  return {
    no_automatic_merge: true,
    no_peer_negotiation: true,
    no_live_benchmark_execution: true,
    no_global_consensus_protocol: true,
    no_network_transport: true,
    no_file_write: true,
    no_github_api_call: true,
    no_policy_mutation: true,
  };
}

function dryRun(): ArenaComparisonResult["dry_run"] {
  return {
    automatic_merge_performed: false,
    peer_negotiation_performed: false,
    live_benchmark_execution_performed: false,
    global_consensus_protocol_performed: false,
    network_transport_performed: false,
    file_written: false,
    github_api_called: false,
    policy_mutation_performed: false,
  };
}

function resolvedEvalBinding(binding: ArenaEvalBindingInput): Required<ArenaEvalBindingInput> {
  return {
    shadow_run_ref: binding.shadow_run_ref,
    eval_suite_ref: binding.eval_suite_ref,
    lineage_threshold_ref: binding.lineage_threshold_ref,
    live_benchmark_execution_allowed: binding.live_benchmark_execution_allowed ?? false,
    authoritative_score_write_allowed: binding.authoritative_score_write_allowed ?? false,
  };
}

function resolvedThresholds(thresholds: Partial<ArenaThresholds> | undefined): ArenaThresholds {
  return {
    min_candidate_count: 2,
    min_winner_margin: thresholds?.min_winner_margin ?? DEFAULT_THRESHOLDS.min_winner_margin,
  };
}

function emptyInput(): ArenaComparisonInput {
  return {
    arena_id: "arena-invalid-00000000",
    conflict: { conflict_id: "conflict-invalid-00000000", reason: "policy_conflict", summary: "invalid placeholder" },
    eval_binding: {
      shadow_run_ref: "eval-shadow-run:00000000",
      eval_suite_ref: ".forge/evals/root.forge",
      lineage_threshold_ref: "lineage-threshold:00000000",
      live_benchmark_execution_allowed: false,
      authoritative_score_write_allowed: false,
    },
    thresholds: DEFAULT_THRESHOLDS,
    candidates: [],
  };
}

function emptyCandidate(): ArenaCandidateInput {
  return {
    candidate_id: "candidate-invalid-00000000",
    source_kind: "peer",
    source_ref: "peer:invalid",
    proposal_ref: "proposal:invalid",
    policy_compliant: false,
    local_policy_breach: false,
    eval_score: 0,
    lineage_score: 0,
    reputation_score: 0,
    risk: "critical",
    evidence_digest: "sha-fnv1a-00000000",
  };
}

function arenaDigestPayload(value: Omit<ArenaComparisonResult, "arena_result_id" | "arena_digest"> | ArenaComparisonResult): unknown {
  return {
    manifest_version: value.manifest_version,
    schema_ref: value.schema_ref,
    arena_id: value.arena_id,
    created_at: value.created_at,
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    conflict: value.conflict,
    eval_binding: value.eval_binding,
    thresholds: value.thresholds,
    score_policy: value.score_policy,
    candidate_inputs: value.candidate_inputs,
    candidate_results: value.candidate_results,
    summary: value.summary,
    authority_boundary: value.authority_boundary,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function compareRankedCandidates(left: RankedCandidate, right: RankedCandidate): number {
  if (right.scoreTotal !== left.scoreTotal) return right.scoreTotal - left.scoreTotal;
  return compare(left.candidate.candidate_id, right.candidate.candidate_id);
}

function compareField(actual: unknown, expected: unknown, path: string, issues: ArenaIssue[]): void {
  if (canonicalStringify(actual) !== canonicalStringify(expected)) issue(issues, path, "derived_field_mismatch", `${path} must match deterministic arena recomputation`);
}

function stringField(value: unknown, path: string, issues: ArenaIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: ArenaIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
  return value;
}

function enumField(value: unknown, allowed: Set<string>, path: string, code: string, issues: ArenaIssue[], fallback: string): string {
  if (typeof value === "string" && allowed.has(value)) return value;
  issue(issues, path, code, `${path} contains an unknown value`);
  return fallback;
}

function booleanField(value: unknown, path: string, issues: ArenaIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issue(issues, path, "boolean_required", `${path} must be boolean`);
  return false;
}

function integerField(value: unknown, path: string, issues: ArenaIssue[]): number {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  issue(issues, path, "integer_required", `${path} must be an integer`);
  return 0;
}

function scoreField(value: unknown, path: string, issues: ArenaIssue[]): number {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 100) return value;
  issue(issues, path, "invalid_score", `${path} must be an integer from 0 to 100`);
  return 0;
}

function isIntegerInRange(value: unknown, min: number, max: number): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
}

function validateKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: ArenaIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown_key", "unknown keys are not allowed");
}

function validateNoSecretMaterial(value: unknown, path: string, issues: ArenaIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "arena manifests must not contain token or private-key material");
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

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
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

function issue(issues: ArenaIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): ArenaIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT065ConflictArena = compareArenaCandidates;
export const validateT065ConflictArena = validateArenaComparison;
