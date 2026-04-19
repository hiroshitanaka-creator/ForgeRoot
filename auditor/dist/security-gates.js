import crypto from "node:crypto";
import { validateSarifLikeArtifact } from "./sarif.js";

export const SECURITY_GATES_SCHEMA_REF = "urn:forgeroot:security-gate-decision:v1";
export const SECURITY_GATES_POLICY_SCHEMA_REF = "urn:forgeroot:security-gates-policy:v1";

export const SECURITY_GATES_CONTRACT = {
  consumes: ["sarif_like_artifact", "runtime_gate_summary", "rate_governor_boundary", "approval_checkpoint_boundary"],
  produces: ["security_gate_decision", "approval_checkpoint_gate_summary"],
  validates: [
    "sarif_like_artifact_validation",
    "severity_thresholds",
    "allowed_denied_rule_ids",
    "immutable_path_violation",
    "runtime_boundary_summary",
    "rate_boundary_summary",
    "deterministic_gate_decision",
  ],
  decisions: ["pass", "hold", "block", "quarantine", "invalid"],
  forbids: [
    "github_api_call",
    "github_code_scanning_upload",
    "branch_protection_mutation",
    "ruleset_mutation",
    "workflow_mutation",
    "policy_mutation_in_runtime",
    "dependency_review_live_api_integration",
    "pull_request_creation",
    "merge_operation",
    "auto_merge",
    "self_evolution",
    "federation",
    "memory_or_evaluation_updates",
  ],
  manifestOnly: true,
  deterministic: true,
};

export const DEFAULT_SECURITY_GATES_POLICY = Object.freeze({
  schema_ref: SECURITY_GATES_POLICY_SCHEMA_REF,
  policy_id: "forge://hiroshitanaka-creator/ForgeRoot/policy/security-gates",
  revision: "01KPF0T0417G5Y6B8C9D0E1F2B",
  default_approval_class: "B",
  severity_actions: {
    high: "block",
    medium: "hold",
    low: "pass",
    note: "pass",
  },
  critical_source_severities: ["critical", "fatal", "security_critical"],
  denied_rule_ids: [
    "forge.secret_scanning",
    "forge.secret-scanning",
    "forge.permission_drift",
    "forge.permission-drift",
    "forge.workflow_class_mismatch",
    "forge.workflow-class-mismatch",
    "forge.default_branch_write",
    "forge.default-branch-write",
    "security.secret",
    "security.secret-scanning",
    "security.credential-leak",
  ],
  allowed_rule_ids: [],
  immutable_path_patterns: [
    ".github/workflows/**",
    ".github/actions/**",
    ".forge/mind.forge",
    ".forge/policies/**",
    ".forge/network/**",
    "apps/github-app/app-manifest.json",
  ],
  low_risk_path_patterns: [
    "docs/**",
    "**/*.md",
    "**/*.mdx",
    "tests/**",
    "**/tests/**",
    "**/*.test.mjs",
    "**/*.test.js",
    "**/*.test.ts",
  ],
  path_actions: {
    immutable: "quarantine",
  },
  rule_actions: {
    denied: "quarantine",
    not_allowed: "block",
  },
  boundary_actions: {
    runtime_halted_or_quarantined: "quarantine",
    runtime_not_mutating_when_enforced: "hold",
    rate_blocked: "block",
    rate_delayed_or_cooldown: "hold",
  },
  approval_classes: {
    pass: "B",
    hold: "B",
    block: "C",
    quarantine: "C",
  },
});


export const SECURITY_GATE_DECISION_SCHEMA_REF = SECURITY_GATES_SCHEMA_REF;
export const SECURITY_GATE_CONTRACT = SECURITY_GATES_CONTRACT;
export const DEFAULT_SECURITY_GATE_POLICY = DEFAULT_SECURITY_GATES_POLICY;
export function defaultSecurityGatePolicy() { return clonePlain(DEFAULT_SECURITY_GATES_POLICY); }

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const DECISIONS = new Set(["pass", "hold", "block", "quarantine"]);
const STATUSES = new Set(["passed", "held", "blocked", "quarantined", "invalid"]);
const SEVERITIES = new Set(["high", "medium", "low", "note"]);
const LEVELS = new Set(["error", "warning", "note", "none"]);
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const RUNTIME_MODES = new Set(["observe", "propose", "evolve", "federate", "quarantine", "halted", "unknown"]);
const DECISION_RANK = { pass: 0, hold: 1, block: 2, quarantine: 3 };
const SEVERITY_RANK = { note: 0, low: 1, medium: 2, high: 3 };
const DEFAULT_GENERATED_AT = "1970-01-01T00:00:00Z";

export function evaluateSecurityGate(input = {}, options = {}) {
  const normalized = normalizeSecurityGateInput(input, options);
  if (!normalized.ok) {
    return {
      status: "invalid",
      decision: "invalid",
      manifest: null,
      issues: normalized.issues,
      reasons: uniqueStrings(["invalid_security_gate_input", ...normalized.issues.map(formatIssue)]),
      guards: boundaryGuards(),
    };
  }

  const findingDecisions = normalized.results
    .map((result, index) => evaluateSarifResult(result, index, normalized.policy))
    .sort(compareFindingDecisions);
  const boundaryFindings = evaluateBoundaryInputs(normalized);
  const aggregate = aggregateDecision([...findingDecisions, ...boundaryFindings], normalized.policy);
  const manifest = buildDecisionManifest(normalized, findingDecisions, boundaryFindings, aggregate);
  const validation = validateSecurityGateDecision(manifest);
  if (!validation.ok) {
    return {
      status: "invalid",
      decision: "invalid",
      manifest: null,
      issues: validation.issues,
      reasons: uniqueStrings(["generated_security_gate_decision_failed_validation", ...validation.issues.map(formatIssue)]),
      guards: boundaryGuards(),
    };
  }

  return {
    status: manifest.status,
    decision: manifest.decision,
    manifest,
    gateDecision: manifest,
    gate: manifest,
    issues: [],
    reasons: manifest.reasons,
    guards: boundaryGuards(),
  };
}

export const runSecurityGate = evaluateSecurityGate;
export const evaluateSecurityGates = evaluateSecurityGate;
export const createSecurityGateDecision = evaluateSecurityGate;
export const createSecurityGateManifest = evaluateSecurityGate;
export const evaluateSarifSecurityGate = evaluateSecurityGate;

export function validateSecurityGateInput(input = {}, options = {}) {
  const normalized = normalizeSecurityGateInput(input, options);
  return normalized.ok ? { ok: true, issues: [] } : { ok: false, issues: normalized.issues };
}

export function validateSecurityGatePolicy(policy = DEFAULT_SECURITY_GATES_POLICY) {
  const issues = [];
  const root = asRecord(policy);
  if (!root) return invalid("/policy", "type", "security gate policy must be an object");
  expectLiteral(root, "schema_ref", SECURITY_GATES_POLICY_SCHEMA_REF, issues, "/policy");
  expectString(root, "policy_id", issues, "/policy", "forge://");
  expectString(root, "revision", issues, "/policy");
  expectOneOf(root, "default_approval_class", APPROVAL_CLASSES, issues, "/policy");

  const severityActions = asRecord(root.severity_actions);
  if (!severityActions) issues.push(issue("/policy/severity_actions", "required", "severity_actions is required"));
  else for (const severity of SEVERITIES) expectOneOf(severityActions, severity, DECISIONS, issues, "/policy/severity_actions");

  expectStringArray(root, "critical_source_severities", issues, "/policy", true);
  expectStringArray(root, "denied_rule_ids", issues, "/policy", true);
  expectStringArray(root, "allowed_rule_ids", issues, "/policy", true);
  expectStringArray(root, "immutable_path_patterns", issues, "/policy", false);
  expectStringArray(root, "low_risk_path_patterns", issues, "/policy", true);

  const pathActions = asRecord(root.path_actions);
  if (!pathActions) issues.push(issue("/policy/path_actions", "required", "path_actions is required"));
  else expectOneOf(pathActions, "immutable", DECISIONS, issues, "/policy/path_actions");

  const ruleActions = asRecord(root.rule_actions);
  if (!ruleActions) issues.push(issue("/policy/rule_actions", "required", "rule_actions is required"));
  else {
    expectOneOf(ruleActions, "denied", DECISIONS, issues, "/policy/rule_actions");
    expectOneOf(ruleActions, "not_allowed", DECISIONS, issues, "/policy/rule_actions");
  }

  const boundaryActions = asRecord(root.boundary_actions);
  if (!boundaryActions) issues.push(issue("/policy/boundary_actions", "required", "boundary_actions is required"));
  else for (const key of ["runtime_halted_or_quarantined", "runtime_not_mutating_when_enforced", "rate_blocked", "rate_delayed_or_cooldown"]) expectOneOf(boundaryActions, key, DECISIONS, issues, "/policy/boundary_actions");

  const approvalClasses = asRecord(root.approval_classes);
  if (!approvalClasses) issues.push(issue("/policy/approval_classes", "required", "approval_classes is required"));
  else for (const decision of DECISIONS) expectOneOf(approvalClasses, decision, APPROVAL_CLASSES, issues, "/policy/approval_classes");

  return { ok: issues.length === 0, issues };
}

export function validateSecurityGateDecision(value) {
  const issues = [];
  const root = asRecord(value);
  if (!root) return invalid("/manifest", "type", "security gate decision manifest must be an object");
  expectLiteral(root, "schema_ref", SECURITY_GATES_SCHEMA_REF, issues, "/manifest");
  expectString(root, "decision_id", issues, "/manifest", "forge-security-gate://");
  expectRfc3339(root, "generated_at", issues, "/manifest");
  expectOneOf(root, "status", STATUSES, issues, "/manifest");
  expectOneOf(root, "decision", DECISIONS, issues, "/manifest");
  if (root.status !== statusForDecision(root.decision)) issues.push(issue("/manifest/status", "decision_status_mismatch", "status must match decision"));
  validateDecisionSource(root.source, issues);
  validatePolicySummary(root.policy, issues);
  validateRuntimeSummary(root.runtime_gate, issues);
  validateRateSummary(root.rate_gate, issues);
  validateSummary(root.summary, issues);
  validateApprovalCheckpointSummary(root.approval_checkpoint, issues);
  validateFindings(root.finding_decisions, "/manifest/finding_decisions", issues);
  validateFindings(root.boundary_decisions, "/manifest/boundary_decisions", issues);
  if (!Array.isArray(root.reasons) || root.reasons.length === 0 || !root.reasons.every((item) => typeof item === "string" && item.length > 0)) issues.push(issue("/manifest/reasons", "string_array", "reasons must be a non-empty string array"));
  const guards = asRecord(root.guards);
  if (!guards) issues.push(issue("/manifest/guards", "required", "guards are required"));
  else for (const key of Object.keys(boundaryGuards())) if (guards[key] !== true) issues.push(issue(`/manifest/guards/${key}`, "literal", `${key} must be true`));
  const properties = asRecord(root.properties);
  if (!properties) issues.push(issue("/manifest/properties", "required", "properties are required"));
  else {
    expectLiteral(properties, "forge_task", "T041", issues, "/manifest/properties");
    expectLiteral(properties, "manifest_only", true, issues, "/manifest/properties");
    expectLiteral(properties, "live_code_scanning_upload", false, issues, "/manifest/properties");
    expectLiteral(properties, "ruleset_mutation", false, issues, "/manifest/properties");
    expectLiteral(properties, "branch_protection_mutation", false, issues, "/manifest/properties");
  }
  return { ok: issues.length === 0, issues };
}

export const validateSecurityGateManifest = validateSecurityGateDecision;
export const validateSecurityGateDecisionManifest = validateSecurityGateDecision;

function normalizeSecurityGateInput(input, options = {}) {
  const root = asRecord(input);
  if (!root) return { ok: false, issues: [issue("/input", "type", "security gate input must be an object")] };
  const issues = [];
  const secretIssues = collectSecretLikeInputIssues(root, "/input");
  if (secretIssues.length > 0) issues.push(...secretIssues);

  const sarifArtifact = root.sarif ?? root.sarif_artifact ?? root.sarifArtifact ?? root.artifact ?? root.findings_artifact ?? root.findingsArtifact ?? asRecord(root.sarif_result)?.artifact ?? null;
  if (!sarifArtifact) issues.push(issue("/input/sarif_artifact", "required", "sarif_artifact is required"));
  else {
    const sarifValidation = validateSarifLikeArtifact(sarifArtifact);
    if (!sarifValidation.ok) issues.push(...sarifValidation.issues.map((item) => ({ ...item, path: `/input/sarif_artifact${item.path?.replace(/^\/artifact/, "") ?? ""}` })));
  }

  const generatedAt = root.generated_at ?? root.generatedAt ?? root.now ?? options.generatedAt ?? options.now ?? DEFAULT_GENERATED_AT;
  if (typeof generatedAt !== "string" || !RFC3339_UTC.test(generatedAt)) issues.push(issue("/input/generated_at", "rfc3339", "generated_at must be RFC3339 UTC when supplied"));

  const policy = normalizePolicy(root.policy ?? options.policy ?? DEFAULT_SECURITY_GATES_POLICY);
  if (!policy.validation.ok) issues.push(...policy.validation.issues);

  if (issues.length > 0) return { ok: false, issues };
  const artifact = sarifArtifact;
  return {
    ok: true,
    generatedAt,
    artifact,
    artifactHash: stableSha256(artifact),
    results: arrayValue(artifact.runs?.[0]?.results),
    source: normalizeSource(artifact, root, options),
    policy: policy.policy,
    runtime: normalizeRuntime(root.runtime_gate ?? root.runtimeGate ?? root.runtime ?? options.runtime),
    rate: normalizeRate(root.rate_gate ?? root.rateGate ?? root.rate ?? root.rate_governor ?? root.rateGovernor ?? options.rate),
    approval: normalizeApproval(root.approval_checkpoint ?? root.approvalCheckpoint ?? root.approval ?? root.review_gate ?? root.reviewGate ?? options.approval),
    context: {
      enforceRuntimeTransport: booleanValue(root.enforce_runtime_transport ?? root.enforceRuntimeTransport ?? options.enforceRuntimeTransport) === true,
      liveTransportRequested: booleanValue(root.live_transport_requested ?? root.liveTransportRequested ?? options.liveTransportRequested) === true,
    },
  };
}

function normalizePolicy(value) {
  const root = clonePlain(value ?? DEFAULT_SECURITY_GATES_POLICY);
  const validation = validateSecurityGatePolicy(root);
  if (!validation.ok) return { policy: root, validation: { ok: false, issues: validation.issues.map((item) => ({ ...item, path: item.path.replace(/^\/policy/, "/input/policy") })) } };
  const normalizeIds = (items) => [...new Set(arrayValue(items).map((item) => normalizeRuleId(item)).filter(Boolean))].sort();
  return {
    policy: {
      ...root,
      critical_source_severities: arrayValue(root.critical_source_severities).map((item) => String(item).toLowerCase()).sort(),
      denied_rule_ids: normalizeIds(root.denied_rule_ids),
      allowed_rule_ids: normalizeIds(root.allowed_rule_ids),
      immutable_path_patterns: [...arrayValue(root.immutable_path_patterns)].sort(),
      low_risk_path_patterns: [...arrayValue(root.low_risk_path_patterns)].sort(),
    },
    validation,
  };
}

function normalizeSource(artifact, root, options) {
  const artifactSource = asRecord(artifact.source) ?? {};
  const inputSource = asRecord(root.source) ?? {};
  return {
    repository: stringOrNull(inputSource.repository ?? artifactSource.repository ?? options.repository),
    task_id: stringOrNull(inputSource.task_id ?? inputSource.taskId ?? artifactSource.task_id ?? artifactSource.taskId ?? options.taskId),
    audit_id: stringOrNull(inputSource.audit_id ?? inputSource.auditId ?? artifactSource.audit_id ?? artifactSource.auditId),
    plan_id: stringOrNull(inputSource.plan_id ?? inputSource.planId ?? artifactSource.plan_id ?? artifactSource.planId),
    source_artifact_sha256: stringOrNull(inputSource.source_artifact_sha256 ?? inputSource.sourceArtifactSha256 ?? artifactSource.source_artifact_sha256 ?? artifactSource.sourceArtifactSha256),
    sarif_artifact_sha256: stableSha256(artifact),
    policy_id: stringOrNull(inputSource.policy_id ?? inputSource.policyId) ?? DEFAULT_SECURITY_GATES_POLICY.policy_id,
  };
}

function normalizeRuntime(value) {
  const root = asRecord(value) ?? {};
  const mode = stringOrNull(root.mode ?? root.runtime_mode ?? root.runtimeMode) ?? "unknown";
  return {
    mode: RUNTIME_MODES.has(mode) ? mode : "unknown",
    allowed: booleanOrNull(root.allowed),
    mutating_lane_open: booleanOrNull(root.mutating_lane_open ?? root.mutatingLaneOpen),
    kill_switch_engaged: booleanValue(root.kill_switch_engaged ?? root.killSwitchEngaged) === true,
    live_transport_allowed: booleanOrNull(root.live_transport_allowed ?? root.liveTransportAllowed),
    checked_at: stringOrNull(root.checked_at ?? root.checkedAt),
  };
}

function normalizeRate(value) {
  const root = asRecord(value) ?? {};
  const status = stringOrNull(root.status ?? root.decision ?? root.state) ?? "unknown";
  return {
    status,
    dispatch_status: stringOrNull(root.dispatch_status ?? root.dispatchStatus),
    cooldown_active: booleanValue(root.cooldown_active ?? root.cooldownActive ?? asRecord(root.cooldown)?.active) === true,
    cooldown_until: stringOrNull(root.cooldown_until ?? root.cooldownUntil ?? asRecord(root.cooldown)?.cooldown_until ?? asRecord(root.cooldown)?.cooldownUntil),
    retry_after_seconds: numberOrNull(root.retry_after_seconds ?? root.retryAfterSeconds ?? asRecord(root.cooldown)?.retry_after_seconds ?? asRecord(root.cooldown)?.retryAfterSeconds),
  };
}

function normalizeApproval(value) {
  const root = asRecord(value) ?? {};
  const approvalClass = stringOrNull(root.approval_class ?? root.approvalClass ?? root.class) ?? DEFAULT_SECURITY_GATES_POLICY.default_approval_class;
  return {
    approval_class: APPROVAL_CLASSES.has(approvalClass) ? approvalClass : DEFAULT_SECURITY_GATES_POLICY.default_approval_class,
    risk: stringOrNull(root.risk) ?? "unknown",
    human_review_required_before_merge: booleanOrNull(root.human_review_required_before_merge ?? root.humanReviewRequiredBeforeMerge),
    min_human_approvals: numberOrNull(root.min_human_approvals ?? root.minHumanApprovals),
  };
}

function evaluateSarifResult(result, index, policy) {
  const ruleId = normalizeRuleId(result.ruleId) ?? String(result.ruleId ?? "unknown");
  const location = asRecord(arrayValue(result.locations)[0]?.physicalLocation) ?? {};
  const artifactLocation = asRecord(location.artifactLocation) ?? {};
  const region = asRecord(location.region) ?? {};
  const properties = asRecord(result.properties) ?? {};
  const severity = normalizeSeverity(properties.forge_severity, result.level);
  const sourceSeverity = stringOrNull(properties.source_severity) ?? severity;
  const path = String(artifactLocation.uri ?? properties.normalized_path ?? "unknown");
  const message = stringOrNull(asRecord(result.message)?.text) ?? "SARIF finding";
  const fingerprint = stringOrNull(asRecord(result.partialFingerprints)?.forgeRootFingerprint) ?? `sha256:${"0".repeat(64)}`;
  const candidates = [];

  const critical = policy.critical_source_severities.includes(sourceSeverity.toLowerCase());
  if (critical) candidates.push(candidate(policy.path_actions.immutable === "quarantine" ? "quarantine" : "block", "critical_source_severity", `source severity '${sourceSeverity}' is critical-equivalent`));

  const denied = policy.denied_rule_ids.includes(ruleId);
  if (denied) candidates.push(candidate(policy.rule_actions.denied, "denied_rule_id", `ruleId '${ruleId}' is denied by security gate policy`));

  if (policy.allowed_rule_ids.length > 0 && !policy.allowed_rule_ids.includes(ruleId)) candidates.push(candidate(policy.rule_actions.not_allowed, "rule_id_not_allowed", `ruleId '${ruleId}' is not in the allowed rule set`));

  const immutable = matchesAny(path, policy.immutable_path_patterns);
  if (immutable) candidates.push(candidate(policy.path_actions.immutable, "immutable_path_violation", `path '${path}' matches an immutable governance surface`));

  const severityAction = policy.severity_actions[severity] ?? "hold";
  candidates.push(candidate(severityAction, `severity_${severity}`, `forge severity '${severity}' maps to '${severityAction}'`));

  const selected = selectMaxDecision(candidates);
  const pathClass = matchesAny(path, policy.low_risk_path_patterns) ? "low_risk_docs_or_tests" : immutable ? "immutable_governance" : "code_or_config";
  return {
    kind: "sarif_finding",
    index,
    ruleId,
    level: stringOrNull(result.level) ?? levelFromSeverity(severity),
    forge_severity: severity,
    source_severity: sourceSeverity,
    path,
    path_class: pathClass,
    startLine: positiveIntegerOrNull(region.startLine) ?? 1,
    startColumn: positiveIntegerOrNull(region.startColumn) ?? 1,
    fingerprint,
    message,
    decision: selected.decision,
    policy_effect: policyEffectForDecision(selected.decision),
    reasons: uniqueStrings(candidates.filter((item) => item.decision === selected.decision || DECISION_RANK[item.decision] > 0).map((item) => `${item.code}: ${item.message}`)),
  };
}

function evaluateBoundaryInputs(normalized) {
  const out = [];
  const policy = normalized.policy;
  const runtime = normalized.runtime;
  if (runtime.kill_switch_engaged === true) out.push(boundaryDecision("runtime", policy.boundary_actions.runtime_halted_or_quarantined, "kill_switch_engaged", "runtime kill switch is engaged"));
  if (["halted", "quarantine"].includes(runtime.mode)) out.push(boundaryDecision("runtime", policy.boundary_actions.runtime_halted_or_quarantined, "runtime_quarantine_or_halted", `runtime mode '${runtime.mode}' blocks transport`));
  if ((normalized.context.enforceRuntimeTransport || normalized.context.liveTransportRequested) && !["evolve", "federate"].includes(runtime.mode)) out.push(boundaryDecision("runtime", policy.boundary_actions.runtime_not_mutating_when_enforced, "runtime_not_mutating", `runtime mode '${runtime.mode}' is not a mutating transport mode`));

  const rateStatus = normalized.rate.status;
  const dispatchStatus = normalized.rate.dispatch_status;
  if (["blocked", "block", "denied", "invalid"].includes(rateStatus) || ["blocked", "block", "denied", "invalid"].includes(dispatchStatus)) out.push(boundaryDecision("rate", policy.boundary_actions.rate_blocked, "rate_governor_blocked", "rate governor boundary is blocked"));
  if (normalized.rate.cooldown_active === true || ["delayed", "delay", "cooldown", "held", "queued_after_cooldown"].includes(rateStatus) || ["delayed", "delay", "cooldown", "held"].includes(dispatchStatus)) out.push(boundaryDecision("rate", policy.boundary_actions.rate_delayed_or_cooldown, "rate_governor_delay_or_cooldown", "rate governor boundary requires delay or cooldown"));
  return out.sort(compareFindingDecisions);
}

function aggregateDecision(decisions, policy) {
  const selected = selectMaxDecision(decisions.length > 0 ? decisions.map((item) => ({ decision: item.decision, code: item.kind ?? "decision", message: item.reasons?.[0] ?? item.reason ?? item.decision })) : [candidate("pass", "no_findings", "no security findings")]);
  const summaryReason = selected.decision === "pass" ? "security_gate_passed" : selected.decision === "hold" ? "security_gate_held" : selected.decision === "block" ? "security_gate_blocked" : "security_gate_quarantined";
  return {
    decision: selected.decision,
    status: statusForDecision(selected.decision),
    transportAuthorization: transportAuthorizationForDecision(selected.decision),
    approvalClass: policy.approval_classes[selected.decision] ?? policy.default_approval_class,
    reasons: [summaryReason],
  };
}

function buildDecisionManifest(normalized, findingDecisions, boundaryDecisions, aggregate) {
  const summary = summarizeGate(findingDecisions, boundaryDecisions);
  const canonicalInput = {
    sarif_artifact_sha256: normalized.artifactHash,
    generated_at: normalized.generatedAt,
    policy_id: normalized.policy.policy_id,
    policy_revision: normalized.policy.revision,
    findings: findingDecisions.map((item) => ({ ruleId: item.ruleId, path: item.path, fingerprint: item.fingerprint, decision: item.decision })),
    boundaries: boundaryDecisions.map((item) => ({ kind: item.kind, code: item.code, decision: item.decision })),
  };
  const decisionId = `forge-security-gate://${sha256(canonicalJson(canonicalInput)).slice(0, 32)}`;
  const reasons = uniqueStrings([
    ...aggregate.reasons,
    ...findingDecisions.flatMap((item) => item.decision === "pass" ? [] : item.reasons),
    ...boundaryDecisions.flatMap((item) => item.reasons),
  ]);
  return {
    schema_ref: SECURITY_GATES_SCHEMA_REF,
    decision_id: decisionId,
    generated_at: normalized.generatedAt,
    status: aggregate.status,
    decision: aggregate.decision,
    transport_authorization: aggregate.transportAuthorization,
    source: {
      ...normalized.source,
      policy_id: normalized.policy.policy_id,
      policy_revision: normalized.policy.revision,
      sarif_artifact_sha256: normalized.artifactHash,
    },
    policy: {
      policy_id: normalized.policy.policy_id,
      revision: normalized.policy.revision,
      severity_actions: normalized.policy.severity_actions,
      denied_rule_ids: normalized.policy.denied_rule_ids,
      allowed_rule_ids: normalized.policy.allowed_rule_ids,
      immutable_path_patterns: normalized.policy.immutable_path_patterns,
    },
    runtime_gate: normalized.runtime,
    rate_gate: normalized.rate,
    approval_checkpoint: {
      handoff_kind: "security_gate_summary_for_approval_checkpoint",
      recommended_checkpoint_status: approvalCheckpointStatusForDecision(aggregate.decision),
      approval_class: aggregate.approvalClass,
      inherited_approval_class: normalized.approval.approval_class,
      min_human_approvals: minApprovalsFor(aggregate.approvalClass),
      codeowner_required: ["C", "D"].includes(aggregate.approvalClass),
      self_approval_forbidden: ["C", "D"].includes(aggregate.approvalClass),
      summary: `Security gate decision is ${aggregate.decision}.`,
    },
    summary,
    finding_decisions: findingDecisions,
    boundary_decisions: boundaryDecisions,
    reasons: reasons.length > 0 ? reasons : ["security_gate_passed"],
    guards: boundaryGuards(),
    properties: {
      forge_task: "T041",
      manifest_only: true,
      live_code_scanning_upload: false,
      github_api_call: false,
      ruleset_mutation: false,
      branch_protection_mutation: false,
      workflow_mutation: false,
      dependency_review_live_api_integration: false,
      memory_or_evaluation_update: false,
      federation_or_self_evolution: false,
    },
  };
}

function summarizeGate(findingDecisions, boundaryDecisions) {
  const severityCounts = { high: 0, medium: 0, low: 0, note: 0 };
  const decisionCounts = { pass: 0, hold: 0, block: 0, quarantine: 0 };
  const affectedPaths = new Set();
  const blockedRuleIds = new Set();
  const heldRuleIds = new Set();
  const quarantinedRuleIds = new Set();
  const immutablePaths = new Set();
  for (const item of findingDecisions) {
    severityCounts[item.forge_severity] += 1;
    decisionCounts[item.decision] += 1;
    affectedPaths.add(item.path);
    if (item.decision === "block") blockedRuleIds.add(item.ruleId);
    if (item.decision === "hold") heldRuleIds.add(item.ruleId);
    if (item.decision === "quarantine") quarantinedRuleIds.add(item.ruleId);
    if (item.reasons.some((reason) => reason.includes("immutable_path_violation"))) immutablePaths.add(item.path);
  }
  for (const item of boundaryDecisions) decisionCounts[item.decision] += 1;
  const maxSeverity = findingDecisions.map((item) => item.forge_severity).sort((a, b) => SEVERITY_RANK[b] - SEVERITY_RANK[a])[0] ?? "note";
  return {
    result_count: findingDecisions.length,
    boundary_decision_count: boundaryDecisions.length,
    max_severity: maxSeverity,
    severity_counts: severityCounts,
    decision_counts: decisionCounts,
    affected_paths: [...affectedPaths].sort(),
    blocked_rule_ids: [...blockedRuleIds].sort(),
    held_rule_ids: [...heldRuleIds].sort(),
    quarantined_rule_ids: [...quarantinedRuleIds].sort(),
    immutable_path_violations: [...immutablePaths].sort(),
    pass_count: decisionCounts.pass,
    hold_count: decisionCounts.hold,
    block_count: decisionCounts.block,
    quarantine_count: decisionCounts.quarantine,
  };
}

function validateDecisionSource(source, issues) {
  const root = asRecord(source);
  if (!root) return issues.push(issue("/manifest/source", "required", "source is required"));
  expectStringOrNull(root, "repository", issues, "/manifest/source");
  expectStringOrNull(root, "task_id", issues, "/manifest/source");
  expectStringOrNull(root, "audit_id", issues, "/manifest/source");
  expectStringOrNull(root, "plan_id", issues, "/manifest/source");
  expectStringOrNull(root, "source_artifact_sha256", issues, "/manifest/source");
  expectString(root, "policy_id", issues, "/manifest/source", "forge://");
  expectString(root, "policy_revision", issues, "/manifest/source");
  expectString(root, "sarif_artifact_sha256", issues, "/manifest/source", "sha256:");
  if (typeof root.sarif_artifact_sha256 === "string" && !SHA256_RE.test(root.sarif_artifact_sha256)) issues.push(issue("/manifest/source/sarif_artifact_sha256", "sha256", "sarif_artifact_sha256 must use sha256:<64 hex>"));
}
function validatePolicySummary(policy, issues) {
  const root = asRecord(policy);
  if (!root) return issues.push(issue("/manifest/policy", "required", "policy summary is required"));
  else {
    expectString(root, "policy_id", issues, "/manifest/policy", "forge://");
    expectString(root, "revision", issues, "/manifest/policy");
    if (!asRecord(root.severity_actions)) issues.push(issue("/manifest/policy/severity_actions", "required", "severity_actions is required"));
    expectStringArray(root, "denied_rule_ids", issues, "/manifest/policy", true);
    expectStringArray(root, "allowed_rule_ids", issues, "/manifest/policy", true);
    expectStringArray(root, "immutable_path_patterns", issues, "/manifest/policy", false);
  }
}
function validateRuntimeSummary(runtime, issues) {
  const root = asRecord(runtime);
  if (!root) return issues.push(issue("/manifest/runtime_gate", "required", "runtime gate summary is required"));
  else {
    expectOneOf(root, "mode", RUNTIME_MODES, issues, "/manifest/runtime_gate");
    expectBooleanOrNull(root, "allowed", issues, "/manifest/runtime_gate");
    expectBooleanOrNull(root, "mutating_lane_open", issues, "/manifest/runtime_gate");
    expectBoolean(root, "kill_switch_engaged", issues, "/manifest/runtime_gate");
    expectBooleanOrNull(root, "live_transport_allowed", issues, "/manifest/runtime_gate");
    expectStringOrNull(root, "checked_at", issues, "/manifest/runtime_gate");
  }
}
function validateRateSummary(rate, issues) {
  const root = asRecord(rate);
  if (!root) return issues.push(issue("/manifest/rate_gate", "required", "rate gate summary is required"));
  else {
    expectString(root, "status", issues, "/manifest/rate_gate");
    expectStringOrNull(root, "dispatch_status", issues, "/manifest/rate_gate");
    expectBoolean(root, "cooldown_active", issues, "/manifest/rate_gate");
    expectStringOrNull(root, "cooldown_until", issues, "/manifest/rate_gate");
  }
}
function validateSummary(summary, issues) {
  const root = asRecord(summary);
  if (!root) return issues.push(issue("/manifest/summary", "required", "summary is required"));
  else {
    for (const key of ["result_count", "boundary_decision_count", "pass_count", "hold_count", "block_count", "quarantine_count"]) expectNonnegativeInteger(root, key, issues, "/manifest/summary");
    expectOneOf(root, "max_severity", SEVERITIES, issues, "/manifest/summary");
    for (const key of ["affected_paths", "blocked_rule_ids", "held_rule_ids", "quarantined_rule_ids", "immutable_path_violations"]) expectStringArray(root, key, issues, "/manifest/summary", true);
  }
}
function validateApprovalCheckpointSummary(summary, issues) {
  const root = asRecord(summary);
  if (!root) return issues.push(issue("/manifest/approval_checkpoint", "required", "approval checkpoint summary is required"));
  else {
    expectLiteral(root, "handoff_kind", "security_gate_summary_for_approval_checkpoint", issues, "/manifest/approval_checkpoint");
    expectString(root, "recommended_checkpoint_status", issues, "/manifest/approval_checkpoint");
    expectOneOf(root, "approval_class", APPROVAL_CLASSES, issues, "/manifest/approval_checkpoint");
    expectOneOf(root, "inherited_approval_class", APPROVAL_CLASSES, issues, "/manifest/approval_checkpoint");
    expectNonnegativeInteger(root, "min_human_approvals", issues, "/manifest/approval_checkpoint");
    expectBoolean(root, "codeowner_required", issues, "/manifest/approval_checkpoint");
    expectBoolean(root, "self_approval_forbidden", issues, "/manifest/approval_checkpoint");
    expectString(root, "summary", issues, "/manifest/approval_checkpoint");
  }
}
function validateFindings(findings, path, issues) {
  if (!Array.isArray(findings)) return issues.push(issue(path, "array", "finding decisions must be an array"));
  findings.forEach((item, index) => {
    const root = asRecord(item);
    const base = `${path}/${index}`;
    if (!root) return issues.push(issue(base, "object", "finding decision must be an object"));
    expectString(root, "kind", issues, base);
    expectOneOf(root, "decision", DECISIONS, issues, base);
    expectStringArray(root, "reasons", issues, base, false);
    if (root.kind === "sarif_finding") {
      expectString(root, "ruleId", issues, base);
      expectOneOf(root, "level", LEVELS, issues, base);
      expectOneOf(root, "forge_severity", SEVERITIES, issues, base);
      expectString(root, "source_severity", issues, base);
      expectString(root, "path", issues, base);
      expectString(root, "fingerprint", issues, base, "sha256:");
      expectString(root, "message", issues, base);
    } else {
      expectString(root, "code", issues, base);
      expectString(root, "message", issues, base);
    }
  });
}

function boundaryDecision(kind, decision, code, message) {
  return { kind, decision, code, message, reasons: [`${code}: ${message}`], policy_effect: policyEffectForDecision(decision) };
}
function candidate(decision, code, message) { return { decision, code, message }; }
function selectMaxDecision(candidates) { return candidates.slice().sort((a, b) => DECISION_RANK[b.decision] - DECISION_RANK[a.decision] || String(a.code).localeCompare(String(b.code)) || String(a.message).localeCompare(String(b.message)))[0] ?? candidate("pass", "none", "no findings"); }
function compareFindingDecisions(a, b) { return (DECISION_RANK[b.decision] - DECISION_RANK[a.decision]) || ((SEVERITY_RANK[b.forge_severity] ?? -1) - (SEVERITY_RANK[a.forge_severity] ?? -1)) || String(a.ruleId ?? a.code ?? "").localeCompare(String(b.ruleId ?? b.code ?? "")) || String(a.path ?? "").localeCompare(String(b.path ?? "")) || ((a.startLine ?? 0) - (b.startLine ?? 0)) || String(a.fingerprint ?? "").localeCompare(String(b.fingerprint ?? "")); }
function normalizeSeverity(value, level) { const raw = String(value ?? "").toLowerCase(); if (SEVERITIES.has(raw)) return raw; const l = String(level ?? "").toLowerCase(); if (l === "error") return "high"; if (l === "warning") return "medium"; if (l === "note") return "low"; return "note"; }
function levelFromSeverity(severity) { if (severity === "high") return "error"; if (severity === "medium") return "warning"; return "note"; }
function policyEffectForDecision(decision) { return decision === "pass" ? "allow_checkpoint" : decision === "hold" ? "hold_before_transport" : decision === "block" ? "block_transport" : "quarantine_candidate"; }
function statusForDecision(decision) { return decision === "pass" ? "passed" : decision === "hold" ? "held" : decision === "block" ? "blocked" : decision === "quarantine" ? "quarantined" : "invalid"; }
function transportAuthorizationForDecision(decision) { return decision === "pass" ? "eligible_for_approval_checkpoint" : decision === "hold" ? "held_before_transport_authorization" : decision === "block" ? "blocked_before_transport_authorization" : "quarantined_before_transport_authorization"; }
function approvalCheckpointStatusForDecision(decision) { return decision === "pass" ? "continue_to_approval_checkpoint" : decision === "hold" ? "hold_for_human_review" : decision === "block" ? "block_transport_authorization" : "quarantine_candidate"; }
function minApprovalsFor(approvalClass) { return approvalClass === "A" ? 0 : approvalClass === "B" ? 1 : 2; }
function normalizeRuleId(value) { const raw = stringOrNull(value); if (!raw) return null; return raw.trim().toLowerCase().replace(/[^a-z0-9_.\/-]+/g, "-").replace(/[\/]+/g, ".").replace(/\.{2,}/g, ".").replace(/^-+|-+$/g, "").slice(0, 160) || null; }
function matchesAny(path, patterns) { return arrayValue(patterns).some((pattern) => globToRegExp(pattern).test(path)); }
function globToRegExp(pattern) { let source = "^"; const value = String(pattern).replace(/\\/g, "/"); for (let i = 0; i < value.length; i++) { const c = value[i]; if (c === "*" && value[i + 1] === "*") { source += ".*"; i++; } else if (c === "*") source += "[^/]*"; else source += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); } return new RegExp(source + "$", "u"); }
function boundaryGuards() { return { no_github_api_call: true, no_github_code_scanning_upload: true, no_branch_protection_mutation: true, no_ruleset_mutation: true, no_workflow_mutation: true, no_policy_mutation_in_runtime: true, no_dependency_review_live_api_integration: true, no_pull_request_creation: true, no_merge_operation: true, no_auto_merge: true, no_memory_or_evaluation_update: true, no_federation_or_self_evolution: true }; }
function collectSecretLikeInputIssues(value, path) { const issues = []; const visit = (current, currentPath) => { if (Array.isArray(current)) { current.forEach((item, index) => visit(item, `${currentPath}/${index}`)); return; } if (!asRecord(current)) { if (typeof current === "string" && looksSecret(current)) issues.push(issue(currentPath, "secret_like_value", "input contains secret-looking material")); return; } for (const [key, item] of Object.entries(current)) { const nextPath = `${currentPath}/${key}`; const upper = key.toUpperCase(); if (["TOKEN", "SECRET", "PASSWORD", "PRIVATE_KEY", "CREDENTIAL"].some((part) => upper.includes(part)) && typeof item === "string" && item.length > 0) issues.push(issue(nextPath, "secret_like_field", "input contains a secret-like field")); visit(item, nextPath); } }; visit(value, path); return issues; }
function looksSecret(value) { const lower = String(value).toLowerCase(); return lower.includes("github_pat_") || lower.includes("ghp_") || lower.includes("sk-") || lower.includes("-----begin private key-----"); }
function stableSha256(value) { return `sha256:${sha256(canonicalJson(value))}`; }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) { if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`; if (asRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function clonePlain(value) { return JSON.parse(JSON.stringify(value)); }
function arrayValue(value) { return Array.isArray(value) ? value : []; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function stringOrNull(value) { return typeof value === "string" && value.trim().length > 0 ? value.trim() : null; }
function numberOrNull(value) { const number = Number(value); return Number.isFinite(number) ? number : null; }
function positiveIntegerOrNull(value) { const number = Number(value); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function booleanValue(value) { return typeof value === "boolean" ? value : null; }
function booleanOrNull(value) { return typeof value === "boolean" ? value : null; }
function issue(path, code, message) { return { path, code, message }; }
function invalid(path, code, message) { return { ok: false, issues: [issue(path, code, message)] }; }
function formatIssue(item) { return `${item.code}:${item.path}:${item.message}`; }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function expectLiteral(record, key, expected, issues, path) { if (record[key] !== expected) issues.push(issue(`${path}/${key}`, "literal", `${key} must be ${JSON.stringify(expected)}`)); }
function expectString(record, key, issues, path, prefix) { const value = record[key]; if (typeof value !== "string" || value.length === 0) { issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`)); return null; } if (prefix && !value.startsWith(prefix)) issues.push(issue(`${path}/${key}`, "prefix", `${key} must start with '${prefix}'`)); return value; }
function expectStringOrNull(record, key, issues, path) { const value = record[key]; if (!(typeof value === "string" || value === null)) issues.push(issue(`${path}/${key}`, "string_or_null", `${key} must be a string or null`)); }
function expectStringArray(record, key, issues, path, allowEmpty) { const value = record[key]; if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.length > 0)) { issues.push(issue(`${path}/${key}`, "string_array", `${key} must be an array of strings`)); return []; } if (!allowEmpty && value.length === 0) issues.push(issue(`${path}/${key}`, "non_empty", `${key} must not be empty`)); return value; }
function expectOneOf(record, key, allowed, issues, path) { const value = record[key]; if (typeof value !== "string" || !allowed.has(value)) issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`)); return value; }
function expectRfc3339(record, key, issues, path) { const value = expectString(record, key, issues, path); if (value && !RFC3339_UTC.test(value)) issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be RFC3339 UTC`)); }
function expectBoolean(record, key, issues, path) { const value = record[key]; if (typeof value !== "boolean") issues.push(issue(`${path}/${key}`, "boolean", `${key} must be boolean`)); return value; }
function expectBooleanOrNull(record, key, issues, path) { const value = record[key]; if (!(typeof value === "boolean" || value === null)) issues.push(issue(`${path}/${key}`, "boolean_or_null", `${key} must be boolean or null`)); }
function expectNonnegativeInteger(record, key, issues, path) { const value = record[key]; if (!Number.isSafeInteger(value) || value < 0) issues.push(issue(`${path}/${key}`, "nonnegative_integer", `${key} must be a non-negative integer`)); }
