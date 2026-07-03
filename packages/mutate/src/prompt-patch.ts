export const PROMPT_PATCH_VERSION = 1 as const;
export const PROMPT_PATCH_SCHEMA_REF = "urn:forgeroot:mutate-prompt-patch:v1" as const;

export type PromptPatchOpType = "add" | "replace" | "remove";
export type PromptPatchStatus = "dry_run_valid" | "rejected";
export type PromptPatchDecision = "prompt_patch_dry_run_ready" | "blocked_by_forbidden_target" | "invalid_prompt_patch_input";

export interface PromptPatchOperation {
  readonly op: PromptPatchOpType;
  readonly path: string;
  readonly value?: unknown;
}

export interface PromptPatchTarget {
  readonly path: string;
  readonly species: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface PromptPatchInput {
  readonly now?: string;
  readonly target: PromptPatchTarget;
  readonly operations: readonly PromptPatchOperation[];
}

export interface PromptPatchValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface PromptPatchDiffEntry {
  readonly op: PromptPatchOpType;
  readonly path: string;
  readonly before: unknown;
  readonly after: unknown;
}

export interface PromptPatchMutationRecord {
  readonly mutation_id: string;
  readonly class: "prompt_patch";
  readonly target_paths: readonly [string];
  readonly patch_format: "forgeroot-prompt-patch-v1";
  readonly patch_ref: null;
  readonly decision: "proposed";
}

export interface PromptPatchDryRunResult {
  readonly manifest_version: typeof PROMPT_PATCH_VERSION;
  readonly schema_ref: typeof PROMPT_PATCH_SCHEMA_REF;
  readonly patch_id: string;
  readonly created_at: string;
  readonly status: PromptPatchStatus;
  readonly decision: PromptPatchDecision;
  readonly reasons: readonly string[];
  readonly target: { readonly path: string; readonly species: string };
  readonly operations: readonly PromptPatchOperation[];
  readonly diff: readonly PromptPatchDiffEntry[];
  readonly before_digest: string;
  readonly after_digest: string;
  readonly mutation_record: PromptPatchMutationRecord;
  readonly dry_run: {
    readonly file_written: false;
    readonly github_api_called: false;
    readonly auto_merged: false;
    readonly policy_or_workflow_targeted: false;
  };
  readonly issues?: readonly PromptPatchValidationIssue[];
}

export interface PromptPatchValidationResult {
  readonly ok: boolean;
  readonly issues: readonly PromptPatchValidationIssue[];
}

// Allowlist of prompt / context-recipe fields a prompt patch may target.
// Identity, species, constitution, tools, evolution, scores, and provenance
// are deliberately excluded: those are the surface of later, more tightly
// gated mutators (T047 tool-routing, T048 speciation) or are never
// mutation targets at all (constitution, provenance).
const ALLOWED_PROMPT_FIELDS: ReadonlySet<string> = new Set([
  "title",
  "summary",
  "identity.persona",
  "role.mission",
  "context_recipe.static_slots",
  "context_recipe.dynamic_slots",
  "context_recipe.token_budget",
  "context_recipe.compaction_policy",
  "memory.working_memory.facts",
  "memory.semantic_digests",
  "memory.forget_rules",
]);

const AGENT_DOCUMENT_PATH = /^\.forge\/agents\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\.forge$/;
const PATCH_PATH_SEGMENT = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

export const PROMPT_PATCH_CONTRACT = {
  consumes: ["prompt_patch_request", "canonical_agent_forge_document"],
  produces: ["prompt_patch_dry_run_manifest"],
  validates: ["canonical_agent_document_path", "allowed_prompt_field_target", "patch_operation_shape"],
  forbids: [
    "policy_document_target",
    "workflow_document_target",
    "permission_or_tool_route_target",
    "identity_or_species_target",
    "constitution_or_mutable_path_target",
    "live_file_write",
    "github_api_call",
    "automatic_merge",
    "prompt_generation",
  ],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-06-22T00:00:00Z";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export function applyPromptPatchDryRun(input: PromptPatchInput): PromptPatchDryRunResult {
  const createdAt = resolveTimestamp(input.now, DEFAULT_NOW);
  const target = { path: input.target.path, species: input.target.species };
  if (createdAt === null) return invalidResult(DEFAULT_NOW, target, input.operations, [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }]);

  const issues = validateInput(input);
  if (issues.length > 0) {
    const decision: PromptPatchDecision = issues.some((issue) => issue.code === "forbidden_document_path" || issue.code === "path_not_in_allowed_prompt_fields") ? "blocked_by_forbidden_target" : "invalid_prompt_patch_input";
    return { ...invalidResult(createdAt, target, input.operations, issues), decision };
  }

  const before = deepClone(input.target.content);
  const after = deepClone(input.target.content);
  const diff: PromptPatchDiffEntry[] = [];
  for (const operation of input.operations) {
    diff.push({ op: operation.op, path: operation.path, before: getIn(before, operation.path), after: operation.op === "remove" ? undefined : operation.value });
    applyOp(after, operation);
  }

  return {
    manifest_version: PROMPT_PATCH_VERSION,
    schema_ref: PROMPT_PATCH_SCHEMA_REF,
    patch_id: stableId("prompt-patch", [input.target.path, ...input.operations.map((operation) => `${operation.op}:${operation.path}`)]),
    created_at: createdAt,
    status: "dry_run_valid",
    decision: "prompt_patch_dry_run_ready",
    reasons: ["prompt_patch_dry_run_valid", "allowed_prompt_fields_only"],
    target,
    operations: input.operations,
    diff,
    before_digest: canonicalDigest(before),
    after_digest: canonicalDigest(after),
    mutation_record: {
      mutation_id: stableId("mut", [input.target.path, ...input.operations.map((operation) => operation.path)]),
      class: "prompt_patch",
      target_paths: [input.target.path],
      patch_format: "forgeroot-prompt-patch-v1",
      patch_ref: null,
      decision: "proposed",
    },
    dry_run: { file_written: false, github_api_called: false, auto_merged: false, policy_or_workflow_targeted: false },
  };
}

export function validatePromptPatchDryRun(result: PromptPatchDryRunResult): PromptPatchValidationResult {
  const issues: PromptPatchValidationIssue[] = [];
  if (result.manifest_version !== PROMPT_PATCH_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== PROMPT_PATCH_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify prompt-patch v1");
  if (!RFC3339_UTC.test(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.dry_run.file_written !== false) issue(issues, "dry_run.file_written", "file_write_forbidden", "prompt patch dry-run must not write files");
  if (result.dry_run.github_api_called !== false) issue(issues, "dry_run.github_api_called", "github_api_forbidden", "prompt patch dry-run must not call GitHub APIs");
  if (result.dry_run.auto_merged !== false) issue(issues, "dry_run.auto_merged", "auto_merge_forbidden", "prompt patch dry-run must not auto-merge");
  if (result.dry_run.policy_or_workflow_targeted !== false) issue(issues, "dry_run.policy_or_workflow_targeted", "policy_or_workflow_target_forbidden", "prompt patch must not target policy or workflow paths");
  return { ok: issues.length === 0, issues };
}

function validateInput(input: PromptPatchInput): PromptPatchValidationIssue[] {
  const issues: PromptPatchValidationIssue[] = [];
  const match = AGENT_DOCUMENT_PATH.exec(input.target.path);
  if (match === null) {
    issue(issues, "target.path", "forbidden_document_path", "prompt patch target must be a canonical .forge/agents/<species>.forge document");
  } else if (match[1] !== input.target.species) {
    issue(issues, "target.species", "species_path_mismatch", "target.species must match the document path species segment");
  }

  if (input.operations.length === 0) {
    issue(issues, "operations", "empty_operations", "a prompt patch must contain at least one operation");
  }

  const seenPaths = new Set<string>();
  for (const [index, operation] of input.operations.entries()) {
    const prefix = `operations[${index}]`;
    if (operation.op !== "add" && operation.op !== "replace" && operation.op !== "remove") {
      issue(issues, `${prefix}.op`, "invalid_op_type", "op must be add, replace, or remove");
      continue;
    }
    if (typeof operation.path !== "string" || !PATCH_PATH_SEGMENT.test(operation.path)) {
      issue(issues, `${prefix}.path`, "invalid_patch_path", "path must be a dot-separated lowercase field path");
      continue;
    }
    if (!ALLOWED_PROMPT_FIELDS.has(operation.path)) {
      issue(issues, `${prefix}.path`, "path_not_in_allowed_prompt_fields", `${operation.path} is not an allowed prompt/context-recipe field`);
      continue;
    }
    if (seenPaths.has(operation.path)) {
      issue(issues, `${prefix}.path`, "duplicate_patch_target_path", `${operation.path} is targeted by more than one operation in this patch`);
    }
    seenPaths.add(operation.path);
    if ((operation.op === "add" || operation.op === "replace") && operation.value === undefined) {
      issue(issues, `${prefix}.value`, "missing_patch_value", "add and replace operations require a value");
    }
  }
  return issues;
}

function applyOp(document: Record<string, unknown>, operation: PromptPatchOperation): void {
  if (operation.op === "remove") deleteIn(document, operation.path);
  else setIn(document, operation.path, operation.value);
}

function getIn(document: Record<string, unknown>, path: string): unknown {
  let cursor: unknown = document;
  for (const segment of path.split(".")) {
    if (cursor === null || typeof cursor !== "object") return undefined;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return cursor;
}

function setIn(document: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = document;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index];
    const next = cursor[segment];
    if (next === null || typeof next !== "object") cursor[segment] = {};
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

function deleteIn(document: Record<string, unknown>, path: string): void {
  const segments = path.split(".");
  let cursor: Record<string, unknown> = document;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const next = cursor[segments[index]];
    if (next === null || typeof next !== "object") return;
    cursor = next as Record<string, unknown>;
  }
  delete cursor[segments[segments.length - 1]];
}

function deepClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function canonicalDigest(value: unknown): string { return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`; }

function canonicalStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function invalidResult(createdAt: string, target: { path: string; species: string }, operations: readonly PromptPatchOperation[], issues: readonly PromptPatchValidationIssue[]): PromptPatchDryRunResult {
  return {
    manifest_version: PROMPT_PATCH_VERSION,
    schema_ref: PROMPT_PATCH_SCHEMA_REF,
    patch_id: stableId("prompt-patch", [target.path, ...operations.map((operation) => `${operation.op}:${operation.path}`)]),
    created_at: createdAt,
    status: "rejected",
    decision: "invalid_prompt_patch_input",
    reasons: unique(issues.map((entry) => entry.code)),
    target,
    operations,
    diff: [],
    before_digest: canonicalDigest(null),
    after_digest: canonicalDigest(null),
    mutation_record: {
      mutation_id: stableId("mut", [target.path, ...operations.map((operation) => operation.path)]),
      class: "prompt_patch",
      target_paths: [target.path],
      patch_format: "forgeroot-prompt-patch-v1",
      patch_ref: null,
      decision: "proposed",
    },
    dry_run: { file_written: false, github_api_called: false, auto_merged: false, policy_or_workflow_targeted: false },
    issues,
  };
}

function issue(issues: PromptPatchValidationIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function resolveTimestamp(value: string | undefined, fallback: string): string | null { return value === undefined ? fallback : RFC3339_UTC.test(value) ? value : null; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const runPromptPatchDryRun = applyPromptPatchDryRun;
export const runT046PromptPatchDryRun = applyPromptPatchDryRun;
export const validateT046PromptPatchDryRun = validatePromptPatchDryRun;
