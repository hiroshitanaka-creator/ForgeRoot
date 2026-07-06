export const EVAL_SUITE_SCHEMA_REF = "urn:forgeroot:forge:eval_suite:v1" as const;
export const EVAL_SUITE_CONTRACT = {
  consumes: ["eval_suite_manifest"],
  produces: ["eval_suite_validation_result"],
  validates: ["eval_suite_schema", "task_fixture_schema", "grader_definitions", "risk_class", "shadow_only_boundary"],
  forbids: ["benchmark_execution", "grader_execution", "fitness_calculation", "mutation_selection", "live_ci_integration"],
  deterministic: true,
  manifestOnly: true,
} as const;

export type EvalRiskClass = "A" | "B" | "C" | "D";
export type EvalExpectedOutcome = "pass" | "fail" | "blocked" | "quarantined" | "unknown";
export type EvalInputKind = "docs" | "tests" | "security" | "memory" | "scope" | "review";

export interface EvalSuiteTask {
  readonly task_id: string;
  readonly fixture_ref: string;
  readonly input_kind: EvalInputKind;
  readonly expected_outcome: EvalExpectedOutcome;
  readonly risk_class: EvalRiskClass;
  readonly grader_refs: readonly string[];
}

export interface EvalSuiteGrader {
  readonly grader_id: string;
  readonly description: string;
  readonly input_schema_ref: string;
  readonly output_schema_ref: string;
  readonly decision_values: readonly EvalExpectedOutcome[];
  readonly score_output: "unknown_until_t037" | "boolean" | "numeric" | "categorical";
}

export interface EvalSuiteManifest {
  readonly forge_version: 1;
  readonly schema_ref: typeof EVAL_SUITE_SCHEMA_REF;
  readonly kind: "eval_suite";
  readonly id: string;
  readonly revision: string;
  readonly mind_ref: string;
  readonly status: "seeded" | "active" | "quarantined" | "deprecated" | "fossilized";
  readonly title: string;
  readonly summary: string;
  readonly owners: readonly string[];
  readonly created_at: string;
  readonly updated_at: string;
  readonly suite_name: string;
  readonly tasks: readonly EvalSuiteTask[];
  readonly graders: readonly EvalSuiteGrader[];
  readonly risk_class: EvalRiskClass;
  readonly success_metrics: Readonly<Record<string, string>>;
  readonly shadow_only: true;
  readonly provenance: Readonly<Record<string, unknown>>;
  readonly extensions: Readonly<Record<string, unknown>>;
}

export interface EvalSuiteValidationInput {
  readonly suite: unknown;
  readonly canonicalPath?: string;
  readonly requireDefinitions?: boolean;
}

export interface EvalSuiteValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface EvalSuiteValidationSummary {
  readonly suite_name: string | null;
  readonly task_count: number;
  readonly grader_count: number;
  readonly risk_class: EvalRiskClass | null;
  readonly shadow_only: boolean | null;
  readonly benchmark_execution_performed: false;
  readonly grader_execution_performed: false;
  readonly score_calculation_performed: false;
  readonly mutation_selection_performed: false;
  readonly live_ci_integration_performed: false;
}

export interface EvalSuiteValidationResult {
  readonly ok: boolean;
  readonly issues: readonly EvalSuiteValidationIssue[];
  readonly summary: EvalSuiteValidationSummary;
}

interface NormalizedEvalSuiteValidationInput {
  readonly suite: unknown;
  readonly canonicalPath?: string;
  readonly requireDefinitions: boolean;
}

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ULID = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const SUITE_NAME = /^[a-z0-9][a-z0-9._-]*$/;
const TASK_ID = /^[a-z][a-z0-9._-]{1,80}$/;
const FORGE_EVAL_SUITE_PATH = /^\.forge\/evals\/([a-z0-9][a-z0-9._-]*)\.forge$/;
const FORGE_EVAL_SUITE_ID = /^forge:\/\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/eval_suite\/([a-z0-9][a-z0-9._-]*)$/;
const FIXTURE_REF = /^(labs\/benchmarks\/fixtures|docs\/specs\/fixtures)\/[A-Za-z0-9._/-]+\.json$/;
const SCHEMA_REF = /^urn:forgeroot:[A-Za-z0-9:._-]+:v1$/;
const RISK_CLASSES = new Set(["A", "B", "C", "D"]);
const STATUSES = new Set(["seeded", "active", "quarantined", "deprecated", "fossilized"]);
const INPUT_KINDS = new Set(["docs", "tests", "security", "memory", "scope", "review"]);
const OUTCOMES = new Set(["pass", "fail", "blocked", "quarantined", "unknown"]);
const SCORE_OUTPUTS = new Set(["unknown_until_t037", "boolean", "numeric", "categorical"]);
const TASK_KEYS = new Set(["task_id", "fixture_ref", "input_kind", "expected_outcome", "risk_class", "grader_refs"]);
const GRADER_KEYS = new Set(["grader_id", "description", "input_schema_ref", "output_schema_ref", "decision_values", "score_output"]);

export function validateEvalSuite(input: EvalSuiteValidationInput | EvalSuiteManifest): EvalSuiteValidationResult {
  const normalized = normalizeInput(input);
  const issues: EvalSuiteValidationIssue[] = [];
  const suite = asRecord(normalized.suite);

  if (!suite) {
    issue(issues, "suite", "must_be_object", "eval suite must be an object");
    return result(issues, null);
  }

  expectLiteral(issues, suite, "forge_version", 1, "suite.forge_version");
  expectLiteral(issues, suite, "schema_ref", EVAL_SUITE_SCHEMA_REF, "suite.schema_ref");
  expectLiteral(issues, suite, "kind", "eval_suite", "suite.kind");
  expectRegex(issues, suite, "revision", ULID, "suite.revision", "revision must be a ULID");
  expectEnum(issues, suite, "status", STATUSES, "suite.status");
  expectString(issues, suite, "title", "suite.title");
  expectString(issues, suite, "summary", "suite.summary");
  expectStringArray(issues, suite, "owners", "suite.owners", false);
  expectRfc3339(issues, suite, "created_at", "suite.created_at");
  expectRfc3339(issues, suite, "updated_at", "suite.updated_at");

  const suiteName = expectRegex(issues, suite, "suite_name", SUITE_NAME, "suite.suite_name", "suite_name must be a canonical slug");
  const id = expectRegex(issues, suite, "id", FORGE_EVAL_SUITE_ID, "suite.id", "id must be a forge eval_suite URI");
  if (suiteName && id && id.match(FORGE_EVAL_SUITE_ID)?.[1] !== suiteName) issue(issues, "suite.id", "suite_name_id_mismatch", "id suffix must match suite_name");
  expectString(issues, suite, "mind_ref", "suite.mind_ref");

  if (normalized.canonicalPath !== undefined) {
    const pathMatch = normalized.canonicalPath.match(FORGE_EVAL_SUITE_PATH);
    if (!pathMatch) issue(issues, "canonicalPath", "invalid_eval_suite_path", "canonicalPath must be .forge/evals/<suite>.forge");
    else if (suiteName && pathMatch[1] !== suiteName) issue(issues, "canonicalPath", "suite_name_path_mismatch", "canonicalPath file stem must match suite_name");
  }

  const graders = validateGraders(issues, suite.graders);
  validateTasks(issues, suite.tasks, graders, normalized.requireDefinitions);
  expectEnum(issues, suite, "risk_class", RISK_CLASSES, "suite.risk_class");
  if (suite.shadow_only !== true) issue(issues, "suite.shadow_only", "shadow_only_required", "eval suite must remain shadow_only for T034");
  validateSuccessMetrics(issues, suite.success_metrics);
  if (!asRecord(suite.provenance)) issue(issues, "suite.provenance", "must_be_object", "provenance must be an object");
  validateExtensions(issues, suite.extensions);

  return result(issues, suite);
}

function normalizeInput(input: EvalSuiteValidationInput | EvalSuiteManifest): NormalizedEvalSuiteValidationInput {
  const record = asRecord(input);
  if (record && "suite" in record) {
    return {
      suite: record.suite,
      canonicalPath: typeof record.canonicalPath === "string" ? record.canonicalPath : undefined,
      requireDefinitions: record.requireDefinitions === true,
    };
  }
  return { suite: input, canonicalPath: undefined, requireDefinitions: false };
}

function validateTasks(issues: EvalSuiteValidationIssue[], value: unknown, graders: Set<string>, requireDefinitions: boolean): void {
  if (!Array.isArray(value)) {
    issue(issues, "suite.tasks", "must_be_array", "tasks must be an array");
    return;
  }
  if (requireDefinitions && value.length === 0) issue(issues, "suite.tasks", "definitions_required", "at least one benchmark task is required");
  const seen = new Set<string>();
  value.forEach((entry, index) => {
    const path = `suite.tasks.${index}`;
    const task = asRecord(entry);
    if (!task) {
      issue(issues, path, "must_be_object", "task must be an object");
      return;
    }
    for (const key of Object.keys(task)) if (!TASK_KEYS.has(key)) issue(issues, `${path}.${key}`, key === "grader" ? "inline_grader_forbidden" : "unknown_task_key", "task fixture must not inline grader definitions");
    const taskId = expectRegex(issues, task, "task_id", TASK_ID, `${path}.task_id`, "task_id must be a stable benchmark task slug");
    if (taskId && seen.has(taskId)) issue(issues, `${path}.task_id`, "duplicate_task_id", "task_id must be unique");
    if (taskId) seen.add(taskId);
    expectRegex(issues, task, "fixture_ref", FIXTURE_REF, `${path}.fixture_ref`, "fixture_ref must point to a benchmark fixture JSON path");
    expectEnum(issues, task, "input_kind", INPUT_KINDS, `${path}.input_kind`);
    expectEnum(issues, task, "expected_outcome", OUTCOMES, `${path}.expected_outcome`);
    expectEnum(issues, task, "risk_class", RISK_CLASSES, `${path}.risk_class`);
    const refs = expectStringArray(issues, task, "grader_refs", `${path}.grader_refs`, false);
    for (const ref of refs) if (!graders.has(ref)) issue(issues, `${path}.grader_refs`, "unknown_grader_ref", `grader_ref '${ref}' does not match a grader_id`);
  });
}

function validateGraders(issues: EvalSuiteValidationIssue[], value: unknown): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value)) {
    issue(issues, "suite.graders", "must_be_array", "graders must be an array");
    return ids;
  }
  value.forEach((entry, index) => {
    const path = `suite.graders.${index}`;
    const grader = asRecord(entry);
    if (!grader) {
      issue(issues, path, "must_be_object", "grader must be an object");
      return;
    }
    for (const key of Object.keys(grader)) if (!GRADER_KEYS.has(key)) issue(issues, `${path}.${key}`, "unknown_grader_key", "grader definition contains an unknown key");
    const graderId = expectRegex(issues, grader, "grader_id", TASK_ID, `${path}.grader_id`, "grader_id must be a stable slug");
    if (graderId && ids.has(graderId)) issue(issues, `${path}.grader_id`, "duplicate_grader_id", "grader_id must be unique");
    if (graderId) ids.add(graderId);
    expectString(issues, grader, "description", `${path}.description`);
    expectRegex(issues, grader, "input_schema_ref", SCHEMA_REF, `${path}.input_schema_ref`, "input_schema_ref must be a ForgeRoot schema URN");
    expectRegex(issues, grader, "output_schema_ref", SCHEMA_REF, `${path}.output_schema_ref`, "output_schema_ref must be a ForgeRoot schema URN");
    const values = expectStringArray(issues, grader, "decision_values", `${path}.decision_values`, false);
    for (const outcome of values) if (!OUTCOMES.has(outcome)) issue(issues, `${path}.decision_values`, "invalid_decision_value", `decision value '${outcome}' is not allowed`);
    expectEnum(issues, grader, "score_output", SCORE_OUTPUTS, `${path}.score_output`);
  });
  return ids;
}

function validateSuccessMetrics(issues: EvalSuiteValidationIssue[], value: unknown): void {
  const metrics = asRecord(value);
  if (!metrics) {
    issue(issues, "suite.success_metrics", "must_be_object", "success_metrics must be an object");
    return;
  }
  const keys = Object.keys(metrics);
  if (keys.length === 0) issue(issues, "suite.success_metrics", "must_not_be_empty", "success_metrics must name at least one metric");
  for (const key of keys) if (typeof metrics[key] !== "string" || metrics[key].length === 0) issue(issues, `suite.success_metrics.${key}`, "must_be_string", "success metric values must be non-empty strings");
}

function validateExtensions(issues: EvalSuiteValidationIssue[], value: unknown): void {
  const extensions = asRecord(value);
  if (!extensions) {
    issue(issues, "suite.extensions", "must_be_object", "extensions must be an object");
    return;
  }
  const guards = asRecord(extensions.t034_guards);
  if (!guards) return;
  for (const key of ["no_benchmark_execution", "no_grader_execution", "no_score_calculation", "no_mutation_selection", "no_live_ci_integration"]) {
    if (guards[key] !== true) issue(issues, `suite.extensions.t034_guards.${key}`, "guard_must_be_true", `${key} must be true`);
  }
}

function result(issues: readonly EvalSuiteValidationIssue[], suite: Record<string, unknown> | null): EvalSuiteValidationResult {
  const tasks = Array.isArray(suite?.tasks) ? suite.tasks : [];
  const graders = Array.isArray(suite?.graders) ? suite.graders : [];
  const riskClass = typeof suite?.risk_class === "string" && RISK_CLASSES.has(suite.risk_class) ? (suite.risk_class as EvalRiskClass) : null;
  return {
    ok: issues.length === 0,
    issues,
    summary: {
      suite_name: typeof suite?.suite_name === "string" ? suite.suite_name : null,
      task_count: tasks.length,
      grader_count: graders.length,
      risk_class: riskClass,
      shadow_only: typeof suite?.shadow_only === "boolean" ? suite.shadow_only : null,
      benchmark_execution_performed: false,
      grader_execution_performed: false,
      score_calculation_performed: false,
      mutation_selection_performed: false,
      live_ci_integration_performed: false,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function issue(issues: EvalSuiteValidationIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function expectLiteral(issues: EvalSuiteValidationIssue[], record: Record<string, unknown>, key: string, expected: unknown, path: string): void {
  if (record[key] !== expected) issue(issues, path, "literal", `${key} must equal ${JSON.stringify(expected)}`);
}

function expectString(issues: EvalSuiteValidationIssue[], record: Record<string, unknown>, key: string, path: string): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    issue(issues, path, "required_string", `${key} must be a non-empty string`);
    return null;
  }
  return value;
}

function expectRegex(issues: EvalSuiteValidationIssue[], record: Record<string, unknown>, key: string, pattern: RegExp, path: string, message: string): string | null {
  const value = expectString(issues, record, key, path);
  if (value !== null && !pattern.test(value)) issue(issues, path, "invalid_format", message);
  return value;
}

function expectRfc3339(issues: EvalSuiteValidationIssue[], record: Record<string, unknown>, key: string, path: string): void {
  expectRegex(issues, record, key, RFC3339_UTC, path, `${key} must be an RFC3339 UTC timestamp`);
}

function expectEnum(issues: EvalSuiteValidationIssue[], record: Record<string, unknown>, key: string, allowed: Set<string>, path: string): string | null {
  const value = expectString(issues, record, key, path);
  if (value !== null && !allowed.has(value)) issue(issues, path, "invalid_enum", `${key} is not allowed`);
  return value;
}

function expectStringArray(issues: EvalSuiteValidationIssue[], record: Record<string, unknown>, key: string, path: string, allowEmpty: boolean): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) {
    issue(issues, path, "string_array", `${key} must be an array of non-empty strings`);
    return [];
  }
  if (!allowEmpty && value.length === 0) issue(issues, path, "must_not_be_empty", `${key} must not be empty`);
  return value;
}

export const validateT034EvalSuite = validateEvalSuite;
