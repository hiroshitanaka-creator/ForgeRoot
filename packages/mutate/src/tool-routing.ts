export const TOOL_ROUTING_VERSION = 1 as const;
export const TOOL_ROUTING_SCHEMA_REF = "urn:forgeroot:mutate-tool-routing:v1" as const;

export type ToolRoutePatchOpType = "add" | "replace" | "remove";
export type ToolRouteStatus = "dry_run_valid" | "rejected";
export type ToolRouteDecision = "tool_routing_dry_run_ready" | "blocked_by_forbidden_target" | "invalid_tool_routing_input";
export type ToolRouteMode = "read" | "write_manifest";
export type ToolRouteApproval = "none" | "human" | "code_owner";

export interface ToolRouteIdentity {
  readonly namespace: string;
  readonly name: string;
}

export interface ToolRouteValue extends ToolRouteIdentity {
  readonly mode: ToolRouteMode;
  readonly max_calls: number;
  readonly timeout_ms: number;
  readonly approval: ToolRouteApproval;
  readonly fallback?: string | null;
}

export interface ToolRoutingPatchOperation {
  readonly op: ToolRoutePatchOpType;
  readonly route: ToolRouteIdentity;
  readonly value?: ToolRouteValue;
}

export interface ToolRoutingTarget {
  readonly path: string;
  readonly species: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface ToolRoutingInput {
  readonly now?: string;
  readonly target: ToolRoutingTarget;
  readonly operations: readonly ToolRoutingPatchOperation[];
}

export interface ToolRoutingValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface ToolRoutingDiffEntry {
  readonly op: ToolRoutePatchOpType;
  readonly route: ToolRouteIdentity;
  readonly before: ToolRouteValue | null;
  readonly after: ToolRouteValue | null;
  readonly permission_expansion: boolean;
  readonly summary: string;
}

export interface ToolRoutingReviewGate {
  readonly risk: "high";
  readonly approval_class: "C";
  readonly escalation_required: true;
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
  readonly reasons: readonly string[];
}

export interface ToolRoutingMutationRecord {
  readonly mutation_id: string;
  readonly class: "tool_routing";
  readonly target_paths: readonly [string];
  readonly patch_format: "forgeroot-tool-routing-patch-v1";
  readonly patch_ref: null;
  readonly decision: "proposed" | "rejected";
  readonly approval_class: "C";
}

export interface ToolRoutingDryRunResult {
  readonly manifest_version: typeof TOOL_ROUTING_VERSION;
  readonly schema_ref: typeof TOOL_ROUTING_SCHEMA_REF;
  readonly patch_id: string;
  readonly created_at: string;
  readonly status: ToolRouteStatus;
  readonly decision: ToolRouteDecision;
  readonly reasons: readonly string[];
  readonly target: { readonly path: string; readonly species: string };
  readonly operations: readonly ToolRoutingPatchOperation[];
  readonly diff: readonly ToolRoutingDiffEntry[];
  readonly before_digest: string;
  readonly after_digest: string;
  readonly review_gate: ToolRoutingReviewGate;
  readonly mutation_record: ToolRoutingMutationRecord;
  readonly dry_run: {
    readonly file_written: false;
    readonly github_api_called: false;
    readonly auto_merged: false;
    readonly policy_or_workflow_targeted: false;
    readonly external_network_permission_expanded: false;
  };
  readonly issues?: readonly ToolRoutingValidationIssue[];
}

export interface ToolRoutingValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ToolRoutingValidationIssue[];
}

export const TOOL_ROUTING_CONTRACT = {
  consumes: ["tool_routing_patch_request", "canonical_agent_forge_document"],
  produces: ["tool_routing_dry_run_manifest"],
  validates: [
    "canonical_agent_document_path",
    "canonical_agent_content_identity",
    "allowed_tool_namespace",
    "bounded_max_calls",
    "bounded_timeout_ms",
    "approval_escalation_rule",
  ],
  forbids: [
    "policy_document_target",
    "workflow_document_target",
    "external_network_permission_expansion",
    "policy_weakening",
    "approval_requirement_weakening",
    "live_file_write",
    "github_api_call",
    "automatic_merge",
  ],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-04T00:00:00Z";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const AGENT_DOCUMENT_PATH = /^\.forge\/agents\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\.forge$/;
const TOOL_NAMESPACE = /^[a-z][a-z0-9_]*$/;
const TOOL_NAME = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/;
const MAX_CALLS_UPPER_BOUND = 8;
const TIMEOUT_MS_UPPER_BOUND = 8000;

const ALLOWED_TOOL_NAMESPACES: ReadonlySet<string> = new Set([
  "approval_checkpoint",
  "audit",
  "eval",
  "gh",
  "github_pr_adapter",
  "mutate",
  "pr",
  "rate_governor",
  "repo",
  "sandbox",
]);

const MODE_ORDER: Readonly<Record<ToolRouteMode, number>> = { read: 0, write_manifest: 1 };
const APPROVAL_ORDER: Readonly<Record<ToolRouteApproval, number>> = { none: 0, human: 1, code_owner: 2 };

export function applyToolRoutingDryRun(input: unknown): ToolRoutingDryRunResult {
  const envelope = normalizeInputEnvelope(input);
  const createdAt = resolveTimestamp(envelope.now, DEFAULT_NOW);
  if (createdAt === null) return invalidResult(DEFAULT_NOW, envelope.target, envelope.operations, [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }]);

  const issues = envelope.input === null ? envelope.issues : [...envelope.issues, ...validateInput(envelope.input)];
  if (issues.length > 0) {
    const decision: ToolRouteDecision = issues.some((entry) => ["forbidden_document_path", "forbidden_tool_namespace", "external_network_mode_forbidden"].includes(entry.code)) ? "blocked_by_forbidden_target" : "invalid_tool_routing_input";
    return { ...invalidResult(createdAt, envelope.target, envelope.operations, issues), decision };
  }
  if (envelope.input === null) return invalidResult(createdAt, envelope.target, envelope.operations, [{ path: "input", code: "input_must_be_object", message: "tool routing input must be an object" }]);

  const validInput = envelope.input;
  const operations = validInput.operations.map(cloneOperation);
  const before = deepClone(validInput.target.content);
  const after = deepClone(validInput.target.content);
  const diff: ToolRoutingDiffEntry[] = [];
  for (const operation of operations) {
    const beforeRoute = findRoute(readTools(before), operation.route);
    applyOp(after, operation);
    const afterRoute = operation.op === "remove" ? null : findRoute(readTools(after), operation.value ?? operation.route);
    const permissionExpansion = isPermissionExpansion(operation, beforeRoute, afterRoute);
    diff.push({
      op: operation.op,
      route: cloneRoute(operation.route),
      before: cloneRouteValue(beforeRoute),
      after: cloneRouteValue(afterRoute),
      permission_expansion: permissionExpansion,
      summary: summarizeDiff(operation, beforeRoute, afterRoute, permissionExpansion),
    });
  }

  const operationFingerprints = operations.map(canonicalOperationFingerprint);
  const expansionPresent = diff.some((entry) => entry.permission_expansion);
  return {
    manifest_version: TOOL_ROUTING_VERSION,
    schema_ref: TOOL_ROUTING_SCHEMA_REF,
    patch_id: stableId("tool-routing-patch", [validInput.target.path, ...operationFingerprints]),
    created_at: createdAt,
    status: "dry_run_valid",
    decision: "tool_routing_dry_run_ready",
    reasons: ["tool_routing_dry_run_valid", "class_c_human_review_required", ...(expansionPresent ? ["tool_permission_expansion"] : [])],
    target: envelope.target,
    operations,
    diff,
    before_digest: canonicalDigest(before),
    after_digest: canonicalDigest(after),
    review_gate: reviewGate(expansionPresent),
    mutation_record: mutationRecord(validInput.target.path, operationFingerprints, "proposed"),
    dry_run: { file_written: false, github_api_called: false, auto_merged: false, policy_or_workflow_targeted: false, external_network_permission_expanded: false },
  };
}

export function validateToolRoutingDryRun(result: ToolRoutingDryRunResult): ToolRoutingValidationResult {
  const issues: ToolRoutingValidationIssue[] = [];
  if (result.manifest_version !== TOOL_ROUTING_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== TOOL_ROUTING_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify tool-routing v1");
  if (!RFC3339_UTC.test(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.review_gate.approval_class !== "C" || result.review_gate.escalation_required !== true) issue(issues, "review_gate", "class_c_required", "tool-routing mutations must remain Class C review-gated");
  if (result.review_gate.human_review_required_before_execution !== true) issue(issues, "review_gate.human_review_required_before_execution", "human_review_before_execution_required", "tool-routing dry-run manifests must require human review before execution");
  if (result.review_gate.human_review_required_before_merge !== true) issue(issues, "review_gate.human_review_required_before_merge", "human_review_before_merge_required", "tool-routing dry-run manifests must require human review before merge");
  if (result.dry_run.file_written !== false) issue(issues, "dry_run.file_written", "file_write_forbidden", "tool routing dry-run must not write files");
  if (result.dry_run.github_api_called !== false) issue(issues, "dry_run.github_api_called", "github_api_forbidden", "tool routing dry-run must not call GitHub APIs");
  if (result.dry_run.auto_merged !== false) issue(issues, "dry_run.auto_merged", "auto_merge_forbidden", "tool routing dry-run must not auto-merge");
  if (result.dry_run.policy_or_workflow_targeted !== false) issue(issues, "dry_run.policy_or_workflow_targeted", "policy_or_workflow_target_forbidden", "tool routing must not target policy or workflow paths");
  if (result.dry_run.external_network_permission_expanded !== false) issue(issues, "dry_run.external_network_permission_expanded", "external_network_permission_forbidden", "external network permission expansion is out of scope");
  return { ok: issues.length === 0, issues };
}

function validateInput(input: ToolRoutingInput): ToolRoutingValidationIssue[] {
  const issues: ToolRoutingValidationIssue[] = [];
  const match = AGENT_DOCUMENT_PATH.exec(input.target.path);
  if (match === null) {
    issue(issues, "target.path", "forbidden_document_path", "tool routing target must be a canonical .forge/agents/<species>.forge document");
  } else if (match[1] !== input.target.species) {
    issue(issues, "target.species", "species_path_mismatch", "target.species must match the document path species segment");
  }
  validateCanonicalAgentContent(input, issues);
  const existingTools = validateExistingTools(input.target.content, issues);

  if (input.operations.length === 0) issue(issues, "operations", "empty_operations", "a tool routing patch must contain at least one operation");

  const seenRoutes = new Set<string>();
  for (const [index, operation] of input.operations.entries()) {
    const prefix = `operations[${index}]`;
    validateOperationShape(operation, prefix, issues);
    const routeKey = keyFor(operation.route);
    if (seenRoutes.has(routeKey)) issue(issues, `${prefix}.route`, "duplicate_tool_route_target", `${routeKey} is targeted by more than one operation`);
    seenRoutes.add(routeKey);
    if (operation.op !== "add" && operation.op !== "replace" && operation.op !== "remove") continue;
    if (!isUsableRouteIdentity(operation.route)) continue;

    const existingIndex = existingTools.findIndex((tool) => sameRoute(tool, operation.route));
    const existing = existingIndex === -1 ? null : existingTools[existingIndex];
    if (operation.op === "add" && existing !== null) issue(issues, `${prefix}.route`, "tool_route_already_exists", `${routeKey} already exists on target content`);
    if ((operation.op === "replace" || operation.op === "remove") && existing === null) issue(issues, `${prefix}.route`, "missing_tool_route", `${operation.op} requires ${routeKey} to already exist on target content`);
    if (operation.op === "remove" && operation.value !== undefined) issue(issues, `${prefix}.value`, "remove_must_not_include_value", "remove operations must not include a value");
    if ((operation.op === "add" || operation.op === "replace") && operation.value === undefined) {
      issue(issues, `${prefix}.value`, "missing_tool_route_value", "add and replace operations require a full tool route value");
      continue;
    }
    if (operation.value !== undefined) {
      validateToolRouteValue(operation.value, `${prefix}.value`, issues);
      if (operation.op === "add" && !sameRoute(operation.route, operation.value)) issue(issues, `${prefix}.value`, "value_route_mismatch", "add value namespace/name must match the operation route selector");
      const duplicate = existingTools.find((tool, toolIndex) => sameRoute(tool, operation.value as ToolRouteValue) && toolIndex !== existingIndex);
      if (duplicate !== undefined) issue(issues, `${prefix}.value`, "duplicate_resulting_tool_route", `${keyFor(operation.value)} would duplicate an existing route`);
      if (existing !== null && weakensApproval(existing.approval, operation.value.approval)) issue(issues, `${prefix}.value.approval`, "approval_requirement_weakening", "tool routing mutations must not weaken approval requirements");
    }
  }
  validateResultingRouteSet(existingTools, input.operations, issues);
  return issues;
}

function validateResultingRouteSet(existingTools: readonly ToolRouteValue[], operations: readonly ToolRoutingPatchOperation[], issues: ToolRoutingValidationIssue[]): void {
  const resultingTools = existingTools.map((tool) => cloneRouteValue(tool) as ToolRouteValue);
  const originalDuplicateKeys = duplicateRouteKeys(resultingTools);
  for (const [index, operation] of operations.entries()) {
    if (operation.op !== "add" && operation.op !== "replace" && operation.op !== "remove") continue;
    if (!isUsableRouteIdentity(operation.route)) continue;

    const currentIndex = resultingTools.findIndex((tool) => sameRoute(tool, operation.route));
    if (operation.op === "remove") {
      if (currentIndex !== -1) resultingTools.splice(currentIndex, 1);
    } else if (operation.op === "add" && isUsableToolRouteValue(operation.value)) {
      resultingTools.push(cloneRouteValue(operation.value) as ToolRouteValue);
    } else if (operation.op === "replace" && currentIndex !== -1 && isUsableToolRouteValue(operation.value)) {
      resultingTools[currentIndex] = cloneRouteValue(operation.value) as ToolRouteValue;
    }

    const duplicate = firstDuplicateRouteKey(resultingTools, originalDuplicateKeys);
    if (duplicate !== null) {
      issue(issues, `operations[${index}].${operation.op === "remove" ? "route" : "value"}`, "duplicate_resulting_tool_route", `${duplicate} would duplicate another resulting route`);
      return;
    }
  }
}

function validateCanonicalAgentContent(input: ToolRoutingInput, issues: ToolRoutingValidationIssue[]): void {
  const content = input.target.content;
  const expectedId = `forge://hiroshitanaka-creator/ForgeRoot/agent/${input.target.species}`;
  const expectedRoleName = input.target.species.split(".")[0];
  if (content.kind !== "agent") issue(issues, "target.content.kind", "target_content_kind_must_be_agent", "target.content.kind must be agent");
  if (content.id !== expectedId) issue(issues, "target.content.id", "target_content_id_mismatch", "target.content.id must match the canonical agent id for target.species");
  if (!isRecord(content.identity)) {
    issue(issues, "target.content.identity", "target_content_identity_must_be_object", "target.content.identity must be an object");
    return;
  }
  if (content.identity.species !== input.target.species) issue(issues, "target.content.identity.species", "target_content_species_mismatch", "target.content.identity.species must match target.species");
  if (content.identity.role_name !== expectedRoleName) issue(issues, "target.content.identity.role_name", "target_content_role_name_mismatch", "target.content.identity.role_name must match the role segment of target.species");
}

function validateExistingTools(content: Readonly<Record<string, unknown>>, issues: ToolRoutingValidationIssue[]): ToolRouteValue[] {
  if (!Array.isArray(content.tools)) {
    issue(issues, "target.content.tools", "target_content_tools_must_be_array", "target.content.tools must be an array");
    return [];
  }
  const tools: ToolRouteValue[] = [];
  const seen = new Set<string>();
  for (const [index, tool] of content.tools.entries()) {
    const value = normalizeToolRouteValue(tool, `target.content.tools[${index}]`, issues);
    if (value === null) continue;
    const key = keyFor(value);
    if (seen.has(key)) issue(issues, `target.content.tools[${index}]`, "duplicate_existing_tool_route", `${key} is duplicated in target.content.tools`);
    seen.add(key);
    tools.push(value);
  }
  return tools;
}

function validateOperationShape(operation: ToolRoutingPatchOperation, prefix: string, issues: ToolRoutingValidationIssue[]): void {
  if (operation.op !== "add" && operation.op !== "replace" && operation.op !== "remove") issue(issues, `${prefix}.op`, "invalid_op_type", "op must be add, replace, or remove");
  validateRouteIdentity(operation.route, `${prefix}.route`, issues);
}

function validateRouteIdentity(route: ToolRouteIdentity, path: string, issues: ToolRoutingValidationIssue[]): void {
  if (!isRecord(route)) {
    issue(issues, path, "tool_route_must_be_object", "route must be an object");
    return;
  }
  if (typeof route.namespace !== "string" || !TOOL_NAMESPACE.test(route.namespace)) issue(issues, `${path}.namespace`, "invalid_tool_namespace", "namespace must be lowercase snake_case");
  else if (!ALLOWED_TOOL_NAMESPACES.has(route.namespace)) issue(issues, `${path}.namespace`, "forbidden_tool_namespace", `${route.namespace} is not in the tool routing namespace allowlist`);
  if (typeof route.name !== "string" || !TOOL_NAME.test(route.name)) issue(issues, `${path}.name`, "invalid_tool_name", "name must be a dot-separated lowercase tool name");
  else if (typeof route.namespace === "string" && !route.name.startsWith(`${route.namespace}.`)) issue(issues, `${path}.name`, "tool_name_namespace_mismatch", "tool name must start with '<namespace>.'");
}

function validateToolRouteValue(value: ToolRouteValue, path: string, issues: ToolRoutingValidationIssue[]): void {
  const normalized = normalizeToolRouteValue(value, path, issues);
  if (normalized === null) return;
}

function normalizeToolRouteValue(value: unknown, path: string, issues: ToolRoutingValidationIssue[]): ToolRouteValue | null {
  if (!isRecord(value)) {
    issue(issues, path, "tool_route_value_must_be_object", "tool route value must be an object");
    return null;
  }
  validateRouteIdentity({ namespace: stringValue(value.namespace) ?? "", name: stringValue(value.name) ?? "" }, path, issues);
  const mode = stringValue(value.mode);
  if (mode !== "read" && mode !== "write_manifest") {
    issue(issues, `${path}.mode`, mode === "network" ? "external_network_mode_forbidden" : "invalid_tool_mode", "mode must be read or write_manifest; external network expansion is out of scope");
  }
  const maxCalls = numberValue(value.max_calls);
  if (!Number.isSafeInteger(maxCalls) || maxCalls <= 0) issue(issues, `${path}.max_calls`, "invalid_max_calls", "max_calls must be a positive safe integer");
  else if (maxCalls > MAX_CALLS_UPPER_BOUND) issue(issues, `${path}.max_calls`, "max_calls_budget_exceeded", `max_calls must be <= ${MAX_CALLS_UPPER_BOUND}`);
  const timeoutMs = numberValue(value.timeout_ms);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) issue(issues, `${path}.timeout_ms`, "invalid_timeout_ms", "timeout_ms must be a positive safe integer");
  else if (timeoutMs > TIMEOUT_MS_UPPER_BOUND) issue(issues, `${path}.timeout_ms`, "timeout_budget_exceeded", `timeout_ms must be <= ${TIMEOUT_MS_UPPER_BOUND}`);
  const approval = stringValue(value.approval);
  if (approval !== "none" && approval !== "human" && approval !== "code_owner") issue(issues, `${path}.approval`, "invalid_approval_requirement", "approval must be none, human, or code_owner");
  validateFallbackRouteName(value.fallback, `${path}.fallback`, issues);
  if (issues.some((entry) => entry.path.startsWith(path))) return null;
  return {
    namespace: value.namespace as string,
    name: value.name as string,
    mode: mode as ToolRouteMode,
    max_calls: maxCalls,
    timeout_ms: timeoutMs,
    approval: approval as ToolRouteApproval,
    fallback: value.fallback === undefined ? null : value.fallback as string | null,
  };
}

function validateFallbackRouteName(value: unknown, path: string, issues: ToolRoutingValidationIssue[]): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") {
    issue(issues, path, "invalid_fallback", "fallback must be a string or null when provided");
    return;
  }
  if (!TOOL_NAME.test(value)) {
    issue(issues, path, "invalid_fallback_route", "fallback must be a dot-separated lowercase tool name");
    return;
  }
  const namespace = value.split(".")[0] ?? "";
  if (!ALLOWED_TOOL_NAMESPACES.has(namespace)) issue(issues, path, "forbidden_fallback_namespace", `${namespace} is not in the tool routing namespace allowlist`);
}

function normalizeInputEnvelope(input: unknown): {
  readonly input: ToolRoutingInput | null;
  readonly now?: string;
  readonly target: { readonly path: string; readonly species: string };
  readonly operations: readonly ToolRoutingPatchOperation[];
  readonly issues: readonly ToolRoutingValidationIssue[];
} {
  const issues: ToolRoutingValidationIssue[] = [];
  if (!isRecord(input)) {
    issue(issues, "input", "input_must_be_object", "tool routing input must be an object");
    return { input: null, target: { path: "", species: "" }, operations: [], issues };
  }
  let now: string | undefined;
  if (input.now !== undefined) {
    if (typeof input.now === "string") now = input.now;
    else issue(issues, "now", "now_must_be_string", "now must be a string when provided");
  }

  const targetValue = input.target;
  let targetPath = "";
  let targetSpecies = "";
  let targetContent: Readonly<Record<string, unknown>> | null = null;
  if (!isRecord(targetValue)) {
    issue(issues, "target", "target_must_be_object", "target must be an object");
  } else {
    if (typeof targetValue.path === "string") targetPath = targetValue.path;
    else issue(issues, "target.path", "target_path_must_be_string", "target.path must be a string");
    if (typeof targetValue.species === "string") targetSpecies = targetValue.species;
    else issue(issues, "target.species", "target_species_must_be_string", "target.species must be a string");
    if (isRecord(targetValue.content)) targetContent = targetValue.content;
    else issue(issues, "target.content", "target_content_must_be_object", "target.content must be an object");
  }
  const operations = normalizeOperations(input.operations, issues);
  const target = { path: targetPath, species: targetSpecies };
  if (targetContent === null) return { input: null, now, target, operations, issues };
  return { input: { now, target: { ...target, content: targetContent }, operations }, now, target, operations, issues };
}

function normalizeOperations(value: unknown, issues: ToolRoutingValidationIssue[]): readonly ToolRoutingPatchOperation[] {
  if (!Array.isArray(value)) {
    issue(issues, "operations", "operations_must_be_array", "operations must be an array");
    return [];
  }
  return value.map((operation, index) => {
    const prefix = `operations[${index}]`;
    if (!isRecord(operation)) {
      issue(issues, prefix, "operation_must_be_object", "each operation must be an object");
      return { op: "" as ToolRoutePatchOpType, route: { namespace: "", name: "" } };
    }
    return {
      op: typeof operation.op === "string" ? operation.op as ToolRoutePatchOpType : "" as ToolRoutePatchOpType,
      route: normalizeRouteIdentity(operation.route),
      ...(operation.value === undefined ? {} : { value: normalizeRawToolRouteValue(operation.value) }),
    };
  });
}

function normalizeRouteIdentity(value: unknown): ToolRouteIdentity {
  if (!isRecord(value)) return { namespace: "", name: "" };
  return { namespace: typeof value.namespace === "string" ? value.namespace : "", name: typeof value.name === "string" ? value.name : "" };
}

function normalizeRawToolRouteValue(value: unknown): ToolRouteValue {
  if (!isRecord(value)) return { namespace: "", name: "", mode: "" as ToolRouteMode, max_calls: Number.NaN, timeout_ms: Number.NaN, approval: "" as ToolRouteApproval, fallback: null };
  return {
    namespace: typeof value.namespace === "string" ? value.namespace : "",
    name: typeof value.name === "string" ? value.name : "",
    mode: typeof value.mode === "string" ? value.mode as ToolRouteMode : "" as ToolRouteMode,
    max_calls: typeof value.max_calls === "number" ? value.max_calls : Number.NaN,
    timeout_ms: typeof value.timeout_ms === "number" ? value.timeout_ms : Number.NaN,
    approval: typeof value.approval === "string" ? value.approval as ToolRouteApproval : "" as ToolRouteApproval,
    fallback: value.fallback === undefined ? null : value.fallback as string | null,
  };
}

function applyOp(document: Record<string, unknown>, operation: ToolRoutingPatchOperation): void {
  const tools = readTools(document);
  const index = tools.findIndex((tool) => sameRoute(tool, operation.route));
  if (operation.op === "remove") {
    if (index !== -1) tools.splice(index, 1);
  } else if (operation.op === "add" && operation.value !== undefined) {
    tools.push(cloneRouteValue(operation.value) as ToolRouteValue);
  } else if (operation.op === "replace" && operation.value !== undefined && index !== -1) {
    tools[index] = cloneRouteValue(operation.value) as ToolRouteValue;
  }
  document.tools = tools;
}

function readTools(document: Readonly<Record<string, unknown>>): ToolRouteValue[] {
  if (!Array.isArray(document.tools)) return [];
  return document.tools.filter(isRecord).map((tool) => ({
    namespace: stringValue(tool.namespace) ?? "",
    name: stringValue(tool.name) ?? "",
    mode: stringValue(tool.mode) as ToolRouteMode,
    max_calls: numberValue(tool.max_calls),
    timeout_ms: numberValue(tool.timeout_ms),
    approval: stringValue(tool.approval) as ToolRouteApproval,
    fallback: tool.fallback === undefined ? null : tool.fallback as string | null,
  }));
}

function findRoute(tools: readonly ToolRouteValue[], route: ToolRouteIdentity): ToolRouteValue | null {
  return tools.find((tool) => sameRoute(tool, route)) ?? null;
}

function isPermissionExpansion(operation: ToolRoutingPatchOperation, before: ToolRouteValue | null, after: ToolRouteValue | null): boolean {
  if (operation.op === "add") return true;
  if (before === null || after === null) return false;
  if (!sameRoute(before, after)) return true;
  if (MODE_ORDER[after.mode] > MODE_ORDER[before.mode]) return true;
  if (after.max_calls > before.max_calls) return true;
  if (after.timeout_ms > before.timeout_ms) return true;
  return weakensApproval(before.approval, after.approval);
}

function summarizeDiff(operation: ToolRoutingPatchOperation, before: ToolRouteValue | null, after: ToolRouteValue | null, permissionExpansion: boolean): string {
  const route = keyFor(operation.route);
  if (operation.op === "remove") return `remove ${route}`;
  if (operation.op === "add") return `add ${keyFor(after ?? operation.route)} with Class C review`;
  if (before === null || after === null) return `replace ${route}`;
  const changes = [
    before.mode === after.mode ? null : `mode ${before.mode}->${after.mode}`,
    before.max_calls === after.max_calls ? null : `max_calls ${before.max_calls}->${after.max_calls}`,
    before.timeout_ms === after.timeout_ms ? null : `timeout_ms ${before.timeout_ms}->${after.timeout_ms}`,
    before.approval === after.approval ? null : `approval ${before.approval}->${after.approval}`,
  ].filter((entry): entry is string => entry !== null);
  return `replace ${route}${changes.length > 0 ? ` (${changes.join(", ")})` : ""}${permissionExpansion ? "; permission expansion escalated" : ""}`;
}

function invalidResult(createdAt: string, target: { path: string; species: string }, operations: readonly ToolRoutingPatchOperation[], issues: readonly ToolRoutingValidationIssue[]): ToolRoutingDryRunResult {
  const normalizedOperations = operations.map(cloneOperation);
  const operationFingerprints = normalizedOperations.map(canonicalOperationFingerprint);
  return {
    manifest_version: TOOL_ROUTING_VERSION,
    schema_ref: TOOL_ROUTING_SCHEMA_REF,
    patch_id: stableId("tool-routing-patch", [target.path, ...operationFingerprints]),
    created_at: createdAt,
    status: "rejected",
    decision: "invalid_tool_routing_input",
    reasons: unique(issues.map((entry) => entry.code)),
    target,
    operations: normalizedOperations,
    diff: [],
    before_digest: canonicalDigest(null),
    after_digest: canonicalDigest(null),
    review_gate: reviewGate(false),
    mutation_record: mutationRecord(target.path, operationFingerprints, "rejected"),
    dry_run: { file_written: false, github_api_called: false, auto_merged: false, policy_or_workflow_targeted: false, external_network_permission_expanded: false },
    issues,
  };
}

function reviewGate(expansionPresent: boolean): ToolRoutingReviewGate {
  return {
    risk: "high",
    approval_class: "C",
    escalation_required: true,
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
    reasons: ["tool_routing_mutation_requires_class_c_review", ...(expansionPresent ? ["tool_permission_expansion"] : [])],
  };
}

function mutationRecord(targetPath: string, operationFingerprints: readonly string[], decision: "proposed" | "rejected"): ToolRoutingMutationRecord {
  return { mutation_id: stableId("mut", [targetPath, ...operationFingerprints]), class: "tool_routing", target_paths: [targetPath], patch_format: "forgeroot-tool-routing-patch-v1", patch_ref: null, decision, approval_class: "C" };
}

function cloneOperation(operation: ToolRoutingPatchOperation): ToolRoutingPatchOperation {
  return { op: operation.op, route: cloneRoute(operation.route), ...(operation.value === undefined ? {} : { value: cloneRouteValue(operation.value) as ToolRouteValue }) };
}

function cloneRoute(route: ToolRouteIdentity): ToolRouteIdentity { return { namespace: route.namespace, name: route.name }; }
function cloneRouteValue(value: ToolRouteValue | null): ToolRouteValue | null { return value === null ? null : { namespace: value.namespace, name: value.name, mode: value.mode, max_calls: value.max_calls, timeout_ms: value.timeout_ms, approval: value.approval, fallback: value.fallback ?? null }; }
function sameRoute(left: ToolRouteIdentity, right: ToolRouteIdentity): boolean { return left.namespace === right.namespace && left.name === right.name; }
function keyFor(route: ToolRouteIdentity): string { return `${route.namespace}:${route.name}`; }
function isUsableRouteIdentity(route: ToolRouteIdentity): boolean { return TOOL_NAMESPACE.test(route.namespace) && TOOL_NAME.test(route.name) && ALLOWED_TOOL_NAMESPACES.has(route.namespace) && route.name.startsWith(`${route.namespace}.`); }
function isUsableToolRouteValue(value: ToolRouteValue | undefined): value is ToolRouteValue {
  if (value === undefined) return false;
  if (!isUsableRouteIdentity(value)) return false;
  if (value.mode !== "read" && value.mode !== "write_manifest") return false;
  if (!Number.isSafeInteger(value.max_calls) || value.max_calls <= 0 || value.max_calls > MAX_CALLS_UPPER_BOUND) return false;
  if (!Number.isSafeInteger(value.timeout_ms) || value.timeout_ms <= 0 || value.timeout_ms > TIMEOUT_MS_UPPER_BOUND) return false;
  if (value.approval !== "none" && value.approval !== "human" && value.approval !== "code_owner") return false;
  if (value.fallback === undefined || value.fallback === null) return true;
  if (!TOOL_NAME.test(value.fallback)) return false;
  return ALLOWED_TOOL_NAMESPACES.has(value.fallback.split(".")[0] ?? "");
}
function duplicateRouteKeys(tools: readonly ToolRouteValue[]): ReadonlySet<string> {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const tool of tools) {
    const key = keyFor(tool);
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  return duplicates;
}
function firstDuplicateRouteKey(tools: readonly ToolRouteValue[], ignoredKeys: ReadonlySet<string>): string | null {
  const seen = new Set<string>();
  for (const tool of tools) {
    const key = keyFor(tool);
    if (seen.has(key) && !ignoredKeys.has(key)) return key;
    seen.add(key);
  }
  return null;
}
function weakensApproval(before: ToolRouteApproval, after: ToolRouteApproval): boolean { return APPROVAL_ORDER[after] < APPROVAL_ORDER[before]; }
function deepClone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function canonicalDigest(value: unknown): string { return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`; }

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

function canonicalOperationFingerprint(operation: ToolRoutingPatchOperation): string {
  return canonicalStringify({ op: operation.op, route: operation.route, ...(operation.op === "remove" ? {} : { value: operation.value }) });
}

function issue(issues: ToolRoutingValidationIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function resolveTimestamp(value: string | undefined, fallback: string): string | null { return value === undefined ? fallback : RFC3339_UTC.test(value) ? value : null; }
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown): number { return typeof value === "number" ? value : Number.NaN; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const runToolRoutingDryRun = applyToolRoutingDryRun;
export const applyToolRoutingPatchDryRun = applyToolRoutingDryRun;
export const runT047ToolRoutingDryRun = applyToolRoutingDryRun;
export const validateT047ToolRoutingDryRun = validateToolRoutingDryRun;
