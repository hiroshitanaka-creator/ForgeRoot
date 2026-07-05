import { validateLineageHandoffPackResult } from "./completion-gates.js";
import type { LineageHandoffPackResult } from "./completion-gates.js";

export const COMPLETION_BUNDLE_VERSION = 1 as const;
export const COMPLETION_BUNDLE_SCHEMA_REF = "urn:forgeroot:completion-bundle:v1" as const;

export type CompletionBundleStatus = "completion_bundle_ready" | "blocked" | "invalid";
export type CompletionBundleDecision = "completion_bundle_ready" | "completion_bundle_blocked" | "invalid_completion_bundle_input";

export interface CompletionBundleInput {
  readonly now?: string;
  readonly handoff_pack: LineageHandoffPackResult;
  readonly bundle_label?: string;
}

export interface CompletionBundleIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface CompletionBundleResult {
  readonly manifest_version: typeof COMPLETION_BUNDLE_VERSION;
  readonly schema_ref: typeof COMPLETION_BUNDLE_SCHEMA_REF;
  readonly bundle_id: string;
  readonly created_at: string;
  readonly status: CompletionBundleStatus;
  readonly decision: CompletionBundleDecision;
  readonly reasons: readonly string[];
  readonly handoff_ref: {
    readonly handoff_pack_id: string;
    readonly handoff_digest: string;
    readonly handoff_status: string;
    readonly audit_plan_id: string;
  };
  readonly bundle: {
    readonly label: string;
    readonly kind: "dry_run_lineage_completion_bundle";
    readonly entry_count: number;
    readonly entry_kinds: readonly LineageHandoffPackResult["handoff_entries"][number]["kind"][];
    readonly handoff_digest: string;
    readonly persisted: false;
    readonly write_target: null;
  };
  readonly guards: CompletionBundleGuards;
  readonly dry_run: CompletionBundleDryRun;
  readonly bundle_digest: string;
  readonly issues?: readonly CompletionBundleIssue[];
}

export interface CompletionBundleValidationResult {
  readonly ok: boolean;
  readonly issues: readonly CompletionBundleIssue[];
}

interface CompletionBundleGuards {
  readonly t059_ready_handoff_required: true;
  readonly no_file_write: true;
  readonly no_artifact_persistence: true;
  readonly no_token_request: true;
  readonly no_github_api_call: true;
  readonly no_git_push: true;
  readonly no_branch_creation: true;
  readonly no_merge_operation: true;
  readonly no_mutation_execution: true;
}

interface CompletionBundleDryRun {
  readonly file_written: false;
  readonly artifact_persisted: false;
  readonly token_requested: false;
  readonly github_api_called: false;
  readonly branch_created: false;
  readonly git_push_performed: false;
  readonly mutation_executed: false;
  readonly auto_merged: false;
}

export const COMPLETION_BUNDLE_CONTRACT = {
  consumes: ["lineage_handoff_pack_manifest"],
  produces: ["completion_bundle_manifest"],
  validates: ["t059_handoff_pack_ready", "completion_bundle_not_persisted", "no_side_effects"],
  forbids: ["file_write", "artifact_persistence", "token_request", "github_api_call", "git_push", "branch_creation", "merge_operation", "mutation_execution"],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-05T00:00:00Z";
const DEFAULT_LABEL = "t060-completion-bundle";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const DIGEST = /^sha-[a-z0-9-]+-[0-9a-f]{8,}$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const LABEL = /^[A-Za-z0-9_.:-]{1,80}$/;
const SECRET_PATTERNS = [/ghp_[A-Za-z0-9_]+/, /github_pat_[A-Za-z0-9_]+/, /bearer\s+[A-Za-z0-9._-]+/i, /-----begin/i, /private_key/i];

export function runCompletionBundle(input: unknown): CompletionBundleResult {
  const envelope = normalizeInput(input);
  const createdAt = resolveTimestamp(envelope.now, envelope.handoff_pack.created_at || DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }] : []),
    ...envelope.issues,
  ];
  if (issues.length > 0 || envelope.input === null) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.handoff_pack, envelope.label, issues.length > 0 ? issues : [{ path: "input", code: "input_must_be_object", message: "completion bundle input must be an object" }]);
  }

  const handoffValidation = validateLineageHandoffPackResult(envelope.input.handoff_pack);
  if (!handoffValidation.ok) {
    return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.handoff_pack, envelope.label, [
      { path: "handoff_pack", code: "invalid_t059_handoff_pack", message: "handoff_pack must pass T059 read-back validation" },
      ...handoffValidation.issues.map((entry) => ({ path: `handoff_pack.${entry.path}`, code: entry.code, message: entry.message })),
    ]);
  }
  if (envelope.input.handoff_pack.status !== "handoff_pack_ready") return blockedResult(createdAt ?? DEFAULT_NOW, envelope.input.handoff_pack, envelope.label);

  const result = readyResult(createdAt ?? DEFAULT_NOW, envelope.input.handoff_pack, envelope.label);
  const validation = validateCompletionBundleResult(result);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, envelope.input.handoff_pack, envelope.label, validation.issues);
  return result;
}

export function validateCompletionBundleResult(result: unknown): CompletionBundleValidationResult {
  const issues: CompletionBundleIssue[] = [];
  if (!isRecord(result)) {
    issue(issues, "result", "result_must_be_object", "completion bundle result must be an object");
    return { ok: false, issues };
  }
  if (result.manifest_version !== COMPLETION_BUNDLE_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== COMPLETION_BUNDLE_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T060 completion bundle v1");
  if (typeof result.bundle_id !== "string" || !ID.test(result.bundle_id)) issue(issues, "bundle_id", "invalid_bundle_id", "bundle_id must be deterministic");
  if (typeof result.created_at !== "string" || !isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.status !== "completion_bundle_ready" && result.status !== "blocked" && result.status !== "invalid") issue(issues, "status", "invalid_status", "status must be completion_bundle_ready, blocked, or invalid");
  if (result.decision !== "completion_bundle_ready" && result.decision !== "completion_bundle_blocked" && result.decision !== "invalid_completion_bundle_input") issue(issues, "decision", "invalid_decision", "decision must be a T060 completion bundle decision");
  validateHandoffRef(result.handoff_ref, issues);
  validateBundle(result.bundle, result.status, result.handoff_ref, issues);
  validateGuards(result.guards, issues);
  validateDryRun(result.dry_run, issues);
  validateNoSecretMaterial(result, "result", issues);
  validateTerminal(result as unknown as CompletionBundleResult, issues);

  const expectedDigest = canonicalDigest(bundleDigestPayload(result as unknown as CompletionBundleResult));
  if (result.bundle_digest !== expectedDigest) issue(issues, "bundle_digest", "bundle_digest_mismatch", "bundle_digest must cover completion bundle payload");
  if (typeof result.bundle_id === "string" && result.bundle_id !== stableId("completion-bundle", [expectedDigest])) issue(issues, "bundle_id", "bundle_id_mismatch", "bundle_id must match deterministic payload");
  return { ok: issues.length === 0, issues };
}

function readyResult(createdAt: string, handoff: LineageHandoffPackResult, label: string): CompletionBundleResult {
  const draft = draftFor(createdAt, "completion_bundle_ready", "completion_bundle_ready", ["t059_handoff_pack_ready", "completion_bundle_not_persisted"], handoff, label);
  const digest = canonicalDigest(bundleDigestPayload(draft));
  return { ...draft, bundle_id: stableId("completion-bundle", [digest]), bundle_digest: digest };
}

function blockedResult(createdAt: string, handoff: LineageHandoffPackResult, label: string): CompletionBundleResult {
  const draft = draftFor(createdAt, "blocked", "completion_bundle_blocked", ["t059_handoff_pack_not_ready", "completion_bundle_blocked"], handoff, label);
  const digest = canonicalDigest(bundleDigestPayload(draft));
  return { ...draft, bundle_id: stableId("completion-bundle", [digest]), bundle_digest: digest };
}

function invalidResult(createdAt: string, handoff: LineageHandoffPackResult, label: string, issues: readonly CompletionBundleIssue[]): CompletionBundleResult {
  const draft = { ...draftFor(createdAt, "invalid", "invalid_completion_bundle_input", ["invalid_completion_bundle_input", ...issues.map((entry) => entry.code)], handoff, label), issues };
  const digest = canonicalDigest(bundleDigestPayload(draft));
  return { ...draft, bundle_id: stableId("completion-bundle", [digest]), bundle_digest: digest };
}

function draftFor(createdAt: string, status: CompletionBundleStatus, decision: CompletionBundleDecision, reasons: readonly string[], handoff: LineageHandoffPackResult, label: string): Omit<CompletionBundleResult, "bundle_id" | "bundle_digest"> {
  return {
    manifest_version: COMPLETION_BUNDLE_VERSION,
    schema_ref: COMPLETION_BUNDLE_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision,
    reasons: uniqueStrings(reasons),
    handoff_ref: handoffRefFor(handoff),
    bundle: bundleFor(handoff, label),
    guards: guards(),
    dry_run: dryRunFlags(),
  };
}

function bundleFor(handoff: LineageHandoffPackResult, label: string): CompletionBundleResult["bundle"] {
  const entries = Array.isArray(handoff.handoff_entries) ? handoff.handoff_entries : [];
  return {
    label,
    kind: "dry_run_lineage_completion_bundle",
    entry_count: entries.length,
    entry_kinds: entries.map((entry) => entry.kind),
    handoff_digest: handoff.handoff_digest,
    persisted: false,
    write_target: null,
  };
}

function normalizeInput(input: unknown): { input: CompletionBundleInput | null; now: string | undefined; handoff_pack: LineageHandoffPackResult; label: string; issues: CompletionBundleIssue[] } {
  const issues: CompletionBundleIssue[] = [];
  if (!isRecord(input)) return { input: null, now: undefined, handoff_pack: emptyHandoff(), label: DEFAULT_LABEL, issues: [{ path: "input", code: "input_must_be_object", message: "completion bundle input must be an object" }] };
  const handoff = isRecord(input.handoff_pack) ? input.handoff_pack as unknown as LineageHandoffPackResult : emptyHandoff();
  if (!isRecord(input.handoff_pack)) issue(issues, "handoff_pack", "handoff_pack_must_be_object", "handoff_pack must be a T059 result object");
  const label = normalizeLabel(input.bundle_label, issues);
  return { input: { handoff_pack: handoff, bundle_label: label }, now: optionalString(input.now, "now", issues), handoff_pack: handoff, label, issues };
}

function normalizeLabel(value: unknown, issues: CompletionBundleIssue[]): string {
  if (value === undefined) return DEFAULT_LABEL;
  if (typeof value !== "string") {
    issue(issues, "bundle_label", "label_must_be_string", "bundle_label must be a string when provided");
    return DEFAULT_LABEL;
  }
  const label = value.trim();
  if (!LABEL.test(label)) {
    issue(issues, "bundle_label", "invalid_bundle_label", "bundle_label must be 1-80 safe identifier characters");
    return DEFAULT_LABEL;
  }
  if (containsSecret(label)) {
    issue(issues, "bundle_label", "label_contains_secret_material", "bundle_label must not include secret material");
    return DEFAULT_LABEL;
  }
  return label;
}

function validateHandoffRef(value: unknown, issues: CompletionBundleIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "handoff_ref", "handoff_ref_required", "handoff_ref must be present");
    return;
  }
  if (typeof value.handoff_pack_id !== "string" || !ID.test(value.handoff_pack_id)) issue(issues, "handoff_ref.handoff_pack_id", "invalid_handoff_pack_id", "handoff_pack_id must be deterministic");
  if (typeof value.handoff_digest !== "string" || !DIGEST.test(value.handoff_digest)) issue(issues, "handoff_ref.handoff_digest", "invalid_handoff_digest", "handoff_digest must be stable");
  if (typeof value.handoff_status !== "string" || value.handoff_status.length === 0) issue(issues, "handoff_ref.handoff_status", "invalid_handoff_status", "handoff_status must be present");
  if (typeof value.audit_plan_id !== "string" || !ID.test(value.audit_plan_id)) issue(issues, "handoff_ref.audit_plan_id", "invalid_audit_plan_id", "audit_plan_id must be deterministic");
}

function validateBundle(bundle: unknown, status: unknown, handoffRef: unknown, issues: CompletionBundleIssue[]): void {
  if (!isRecord(bundle)) {
    issue(issues, "bundle", "bundle_required", "bundle must be present");
    return;
  }
  if (typeof bundle.label !== "string" || !LABEL.test(bundle.label)) issue(issues, "bundle.label", "invalid_bundle_label", "bundle label must be safe");
  if (bundle.kind !== "dry_run_lineage_completion_bundle") issue(issues, "bundle.kind", "invalid_bundle_kind", "bundle kind must be dry_run_lineage_completion_bundle");
  if (!Number.isInteger(bundle.entry_count) || Number(bundle.entry_count) < 0) issue(issues, "bundle.entry_count", "invalid_entry_count", "entry_count must be a non-negative integer");
  if (!Array.isArray(bundle.entry_kinds)) issue(issues, "bundle.entry_kinds", "entry_kinds_required", "entry_kinds must be an array");
  else {
    if (bundle.entry_count !== bundle.entry_kinds.length) issue(issues, "bundle.entry_count", "entry_count_mismatch", "entry_count must match entry_kinds length");
    bundle.entry_kinds.forEach((entry, index) => {
      if (entry !== "artifact_receipt" && entry !== "rollout_gate" && entry !== "audit_plan" && entry !== "safety_boundary") issue(issues, `bundle.entry_kinds[${index}]`, "invalid_entry_kind", "entry kind must be a T059 handoff entry kind");
    });
  }
  if (status === "completion_bundle_ready" && bundle.entry_count === 0) issue(issues, "bundle.entry_count", "ready_bundle_requires_entries", "ready bundles must include handoff entry kinds");
  if (bundle.persisted !== false) issue(issues, "bundle.persisted", "bundle_persistence_forbidden", "completion bundles must not be persisted");
  if (bundle.write_target !== null) issue(issues, "bundle.write_target", "write_target_forbidden", "completion bundle write_target must be null");
  if (typeof bundle.handoff_digest !== "string" || !DIGEST.test(bundle.handoff_digest)) issue(issues, "bundle.handoff_digest", "invalid_handoff_digest", "handoff_digest must be stable");
  if (isRecord(handoffRef) && bundle.handoff_digest !== handoffRef.handoff_digest) issue(issues, "bundle.handoff_digest", "handoff_digest_mismatch", "bundle handoff_digest must match handoff_ref");
}

function validateGuards(value: unknown, issues: CompletionBundleIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: CompletionBundleIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  for (const key of Object.keys(dryRunFlags())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(result: CompletionBundleResult, issues: CompletionBundleIssue[]): void {
  if (result.status === "completion_bundle_ready") {
    if (result.decision !== "completion_bundle_ready") issue(issues, "decision", "ready_decision_mismatch", "ready bundles must use completion_bundle_ready");
    if (!result.reasons.includes("t059_handoff_pack_ready")) issue(issues, "reasons", "ready_reason_missing", "ready bundles must reference T059 readiness");
    if (result.issues !== undefined) issue(issues, "issues", "ready_issues_forbidden", "ready bundles must not carry issues");
  }
  if (result.status === "blocked") {
    if (result.decision !== "completion_bundle_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked bundles must use completion_bundle_blocked");
    if (result.issues !== undefined) issue(issues, "issues", "blocked_issues_forbidden", "blocked bundles must not carry issues");
  }
  if (result.status === "invalid") {
    if (result.decision !== "invalid_completion_bundle_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid bundles must use invalid_completion_bundle_input");
    if (!Array.isArray(result.issues) || result.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid bundles must carry issues");
  }
}

function validateNoSecretMaterial(value: unknown, path: string, issues: CompletionBundleIssue[]): void {
  if (path === "result.issues" || path.includes(".issues[")) return;
  if (typeof value === "string") {
    if (containsSecret(value)) issue(issues, path, "secret_material_forbidden", `${path} must not contain secret material`);
    return;
  }
  if (Array.isArray(value)) value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues));
  else if (isRecord(value)) for (const [key, entry] of Object.entries(value)) validateNoSecretMaterial(entry, `${path}.${key}`, issues);
}

function containsSecret(value: string): boolean {
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

function handoffRefFor(handoff: LineageHandoffPackResult): CompletionBundleResult["handoff_ref"] {
  return {
    handoff_pack_id: handoff.handoff_pack_id,
    handoff_digest: handoff.handoff_digest,
    handoff_status: handoff.status,
    audit_plan_id: handoff.audit_ref.audit_plan_id,
  };
}

function bundleDigestPayload(value: Omit<CompletionBundleResult, "bundle_id" | "bundle_digest"> | CompletionBundleResult): unknown {
  return { status: value.status, decision: value.decision, reasons: value.reasons, handoff_ref: value.handoff_ref, bundle: value.bundle, guards: value.guards, dry_run: value.dry_run, issues: value.issues ?? [] };
}

function guards(): CompletionBundleGuards {
  return { t059_ready_handoff_required: true, no_file_write: true, no_artifact_persistence: true, no_token_request: true, no_github_api_call: true, no_git_push: true, no_branch_creation: true, no_merge_operation: true, no_mutation_execution: true };
}

function dryRunFlags(): CompletionBundleDryRun {
  return { file_written: false, artifact_persisted: false, token_requested: false, github_api_called: false, branch_created: false, git_push_performed: false, mutation_executed: false, auto_merged: false };
}

function emptyHandoff(): LineageHandoffPackResult {
  const digest = canonicalDigest({ empty: "lineage-handoff-pack" });
  return {
    manifest_version: 1,
    schema_ref: "urn:forgeroot:lineage-handoff-pack:v1",
    handoff_pack_id: stableId("lineage-handoff-pack", [digest]),
    created_at: DEFAULT_NOW,
    status: "invalid",
    decision: "invalid_lineage_handoff_input",
    reasons: ["empty_handoff_pack"],
    audit_ref: {
      audit_plan_id: stableId("post-transport-audit-plan", [digest]),
      audit_plan_digest: digest,
      audit_plan_status: "invalid",
      checklist_id: stableId("rollout-gate-checklist", [digest]),
    },
    handoff_entries: [],
    guards: guards(),
    dry_run: dryRunFlags(),
    handoff_digest: digest,
    issues: [{ path: "handoff_pack", code: "empty_handoff_pack", message: "empty handoff placeholder" }],
  } as unknown as LineageHandoffPackResult;
}

function optionalString(value: unknown, path: string, issues: CompletionBundleIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
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

function issue(issues: CompletionBundleIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
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

export const createCompletionBundle = runCompletionBundle;
export const runT060CompletionBundle = runCompletionBundle;
export const validateT060CompletionBundle = validateCompletionBundleResult;
