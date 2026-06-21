export const EVAL_SHADOW_RUN_VERSION = 1 as const;
export const EVAL_SHADOW_RUN_SCHEMA_REF = "urn:forgeroot:eval-shadow-run:v1" as const;

export type EvalShadowRunStatus = "ready" | "blocked" | "invalid";
export type EvalShadowRunDecision = "shadow_run_ready" | "blocked_by_manifest_boundary" | "invalid_shadow_run_input";

export interface EvalManifestRef {
  readonly path: string;
  readonly name: string;
  readonly kind: "eval_suite" | "eval_result" | "forge_document";
  readonly hash?: string;
}

export interface EvalShadowRunInput {
  readonly now?: string;
  readonly suite: EvalManifestRef;
  readonly baselineResult: EvalManifestRef;
  readonly candidate: EvalManifestRef;
  readonly allowAuthoritativeScores?: boolean;
  readonly allowRuntimeWrites?: boolean;
  readonly allowLiveEvolution?: boolean;
}

export interface EvalShadowRunValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface EvalShadowRunValidationResult {
  readonly ok: boolean;
  readonly issues: readonly EvalShadowRunValidationIssue[];
}

export interface EvalShadowRunResult {
  readonly manifest_version: typeof EVAL_SHADOW_RUN_VERSION;
  readonly schema_ref: typeof EVAL_SHADOW_RUN_SCHEMA_REF;
  readonly shadow_run_id: string;
  readonly created_at: string;
  readonly status: EvalShadowRunStatus;
  readonly decision: EvalShadowRunDecision;
  readonly reasons: readonly string[];
  readonly auditTrail: readonly string[];
  readonly inputs: {
    readonly suite: EvalManifestRef;
    readonly baselineResult: EvalManifestRef;
    readonly candidate: EvalManifestRef;
  };
  readonly dry_run: {
    readonly grader_execution_performed: false;
    readonly authoritative_scores_written: false;
    readonly runtime_memory_written: false;
    readonly github_api_called: false;
    readonly live_evolution_enabled: false;
  };
  readonly observations: {
    readonly suite_path: string;
    readonly baseline_result_path: string;
    readonly candidate_path: string;
    readonly baseline_references_suite: boolean;
    readonly candidate_is_forge_document: boolean;
  };
  readonly issues?: readonly EvalShadowRunValidationIssue[];
}

export const EVAL_SHADOW_RUN_CONTRACT = {
  consumes: ["eval_suite_manifest", "eval_result_manifest", "candidate_forge_document_ref"],
  produces: ["eval_shadow_run_manifest"],
  validates: ["canonical_eval_suite_path", "canonical_eval_result_path", "candidate_forge_document_ref"],
  forbids: [
    "grader_execution",
    "authoritative_score_write",
    "runtime_memory_write",
    "github_api_call",
    "workflow_or_policy_mutation",
    "network_or_federation_behavior",
    "live_self_evolution",
  ],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-06-21T00:00:00Z";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function runEvalShadowRun(input: EvalShadowRunInput): EvalShadowRunResult {
  const createdAt = resolveTimestamp(input.now, DEFAULT_NOW);
  const auditTrail = ["eval_shadow_run:T045", "contract:dry_run_only", "contract:no_authoritative_scores", "contract:no_runtime_writes"];
  const baseInputs = { suite: input.suite, baselineResult: input.baselineResult, candidate: input.candidate };
  if (createdAt === null) return invalidResult("now", "now_must_be_rfc3339_utc", "now must be an RFC3339 UTC timestamp", DEFAULT_NOW, baseInputs, auditTrail);

  const issues = validateInput(input);
  if (issues.length > 0) {
    return { ...baseResult(createdAt, baseInputs, auditTrail), status: "invalid", decision: "invalid_shadow_run_input", reasons: unique(issues.map((issue) => issue.code)), issues };
  }

  const blocked = [];
  if (input.allowAuthoritativeScores === true) blocked.push("authoritative_scores_forbidden");
  if (input.allowRuntimeWrites === true) blocked.push("runtime_writes_forbidden");
  if (input.allowLiveEvolution === true) blocked.push("live_evolution_forbidden");
  if (blocked.length > 0) {
    return { ...baseResult(createdAt, baseInputs, auditTrail), status: "blocked", decision: "blocked_by_manifest_boundary", reasons: blocked };
  }

  return { ...baseResult(createdAt, baseInputs, auditTrail), status: "ready", decision: "shadow_run_ready", reasons: ["shadow_run_manifest_ready", "dry_run_boundaries_preserved"] };
}

export function validateEvalShadowRun(result: EvalShadowRunResult): EvalShadowRunValidationResult {
  const issues: EvalShadowRunValidationIssue[] = [];
  if (result.manifest_version !== EVAL_SHADOW_RUN_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== EVAL_SHADOW_RUN_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify eval shadow-run v1");
  if (!RFC3339_UTC.test(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.dry_run.grader_execution_performed !== false) issue(issues, "dry_run.grader_execution_performed", "grader_execution_forbidden", "shadow-run must not execute graders");
  if (result.dry_run.authoritative_scores_written !== false) issue(issues, "dry_run.authoritative_scores_written", "authoritative_scores_forbidden", "shadow-run must not write scores");
  if (result.dry_run.runtime_memory_written !== false) issue(issues, "dry_run.runtime_memory_written", "runtime_writes_forbidden", "shadow-run must not write runtime memory");
  if (result.dry_run.github_api_called !== false) issue(issues, "dry_run.github_api_called", "github_api_forbidden", "shadow-run must not call GitHub APIs");
  if (result.dry_run.live_evolution_enabled !== false) issue(issues, "dry_run.live_evolution_enabled", "live_evolution_forbidden", "shadow-run must not enable live evolution");
  return { ok: issues.length === 0, issues };
}

function baseResult(createdAt: string, inputs: EvalShadowRunResult["inputs"], auditTrail: readonly string[]): Omit<EvalShadowRunResult, "status" | "decision" | "reasons"> {
  return {
    manifest_version: EVAL_SHADOW_RUN_VERSION,
    schema_ref: EVAL_SHADOW_RUN_SCHEMA_REF,
    shadow_run_id: stableId("eval-shadow-run", [createdAt, inputs.suite.path, inputs.baselineResult.path, inputs.candidate.path]),
    created_at: createdAt,
    auditTrail,
    inputs,
    dry_run: { grader_execution_performed: false, authoritative_scores_written: false, runtime_memory_written: false, github_api_called: false, live_evolution_enabled: false },
    observations: { suite_path: inputs.suite.path, baseline_result_path: inputs.baselineResult.path, candidate_path: inputs.candidate.path, baseline_references_suite: inputs.suite.kind === "eval_suite" && inputs.baselineResult.kind === "eval_result", candidate_is_forge_document: inputs.candidate.kind === "forge_document" },
  };
}

function validateInput(input: EvalShadowRunInput): EvalShadowRunValidationIssue[] {
  const issues: EvalShadowRunValidationIssue[] = [];
  validateRef(issues, "suite", input.suite, "eval_suite", /^\.forge\/evals\/[a-z0-9][a-z0-9-]*\.forge$/);
  validateRef(issues, "baselineResult", input.baselineResult, "eval_result", /^\.forge\/evals\/results\/[a-z0-9][a-z0-9-]*\.forge$/);
  validateRef(issues, "candidate", input.candidate, "forge_document", /^\.forge\/.+\.forge$/);
  return issues;
}

function validateRef(issues: EvalShadowRunValidationIssue[], path: string, ref: EvalManifestRef, kind: EvalManifestRef["kind"], pattern: RegExp): void {
  if (ref.kind !== kind) issue(issues, `${path}.kind`, "invalid_ref_kind", `${path} kind must be ${kind}`);
  if (!pattern.test(ref.path)) issue(issues, `${path}.path`, "invalid_ref_path", `${path} path is not canonical for ${kind}`);
  const expectedName = ref.path.split("/").pop()?.replace(/\.forge$/, "");
  if (expectedName !== ref.name) issue(issues, `${path}.name`, "ref_name_path_mismatch", `${path} name must match its file stem`);
}

function invalidResult(path: string, code: string, message: string, createdAt: string, inputs: EvalShadowRunResult["inputs"], auditTrail: readonly string[]): EvalShadowRunResult {
  return { ...baseResult(createdAt, inputs, auditTrail), status: "invalid", decision: "invalid_shadow_run_input", reasons: [code], issues: [{ path, code, message }] };
}

function issue(issues: EvalShadowRunValidationIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function resolveTimestamp(value: string | undefined, fallback: string): string | null { return value === undefined ? fallback : RFC3339_UTC.test(value) ? value : null; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const runShadowRun = runEvalShadowRun;
export const runT045ShadowRun = runEvalShadowRun;
export const validateShadowRun = validateEvalShadowRun;
export const validateT045ShadowRun = validateEvalShadowRun;
