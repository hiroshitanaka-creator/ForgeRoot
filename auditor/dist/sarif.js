import crypto from "node:crypto";

export const SARIF_BRIDGE_SCHEMA_REF = "urn:forgeroot:sarif-bridge:v1";
export const SARIF_BRIDGE_SARIF_VERSION = "2.1.0";

export const SARIF_BRIDGE_CONTRACT = {
  consumes: ["audit_findings", "scan_findings", "sandbox_evidence"],
  produces: ["sarif_like_artifact"],
  validates: [
    "severity_mapping",
    "sarif_level_mapping",
    "rule_id_normalization",
    "location_normalization",
    "fingerprint_stability",
    "deterministic_ordering",
    "malformed_finding_rejection",
  ],
  forbids: [
    "github_code_scanning_upload",
    "github_api_call",
    "workflow_mutation",
    "policy_mutation",
    "ruleset_mutation",
    "branch_protection_mutation",
    "security_gate_decision",
    "memory_or_evaluation_updates",
    "network_or_federation_behavior",
    "self_evolution",
  ],
  manifestOnly: true,
  deterministic: true,
};

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const SHA256_RE = /^sha256:[a-f0-9]{64}$/;
const SARIF_LEVELS = new Set(["error", "warning", "note", "none"]);
const FORGE_SEVERITIES = new Set(["high", "medium", "low", "note"]);
const FORGE_SEVERITY_RANK = { high: 3, medium: 2, low: 1, note: 0 };
const LEVEL_RANK = { error: 3, warning: 2, note: 1, none: 0 };
const DEFAULT_GENERATED_AT = "1970-01-01T00:00:00Z";

export function convertAuditFindingsToSarif(input, options = {}) {
  const normalized = normalizeSarifBridgeInput(input, options);
  if (!normalized.ok) {
    return {
      status: "invalid",
      artifact: null,
      issues: normalized.issues,
      reasons: uniqueStrings(["invalid_sarif_bridge_input", ...normalized.issues.map((item) => item.code)]),
      guards: boundaryGuards(),
    };
  }

  const results = normalized.findings
    .map((finding) => toSarifResult(finding))
    .sort(compareSarifResults);
  const rules = buildRules(results);
  const summary = summarizeResults(results, normalized.rejectedInputCount);
  const artifact = {
    schema_ref: SARIF_BRIDGE_SCHEMA_REF,
    sarif_version: SARIF_BRIDGE_SARIF_VERSION,
    generated_at: normalized.generatedAt,
    source: normalized.source,
    runs: [
      {
        tool: {
          driver: {
            name: normalized.source.tool_name,
            semanticVersion: "0.0.0-t040",
            rules,
          },
        },
        results,
      },
    ],
    summary,
    guards: boundaryGuards(),
    properties: {
      forge_task: "T040",
      bridge_kind: "sarif-like-deterministic-artifact",
      live_code_scanning_upload: false,
      security_gate_decision: false,
    },
  };

  const validation = validateSarifLikeArtifact(artifact);
  if (!validation.ok) {
    return {
      status: "invalid",
      artifact: null,
      issues: validation.issues,
      reasons: uniqueStrings(["generated_sarif_artifact_failed_validation", ...validation.issues.map((item) => item.code)]),
      guards: boundaryGuards(),
    };
  }

  return {
    status: "ready",
    artifact,
    issues: [],
    reasons: ["sarif_bridge_ready"],
    guards: boundaryGuards(),
  };
}

export const createSarifBridgeArtifact = convertAuditFindingsToSarif;
export const convertFindingsToSarif = convertAuditFindingsToSarif;
export const normalizeFindingsToSarif = convertAuditFindingsToSarif;
export const normalizeAuditFindingsToSarif = convertAuditFindingsToSarif;
export const validateSarifBridgeArtifact = validateSarifLikeArtifact;
export const validateSarifArtifact = validateSarifLikeArtifact;
export const validateSarifFindingsArtifact = validateSarifLikeArtifact;

export function validateSarifBridgeInput(input, options = {}) {
  const normalized = normalizeSarifBridgeInput(input, options);
  return normalized.ok ? { ok: true, issues: [] } : { ok: false, issues: normalized.issues };
}

export function validateSarifLikeArtifact(artifact) {
  const issues = [];
  const root = asRecord(artifact);
  if (!root) return invalid("/artifact", "type", "SARIF-like artifact must be an object");
  expectLiteral(root, "schema_ref", SARIF_BRIDGE_SCHEMA_REF, issues, "/artifact");
  expectLiteral(root, "sarif_version", SARIF_BRIDGE_SARIF_VERSION, issues, "/artifact");
  expectRfc3339(root, "generated_at", issues, "/artifact");

  const source = asRecord(root.source);
  if (!source) issues.push(issue("/artifact/source", "required", "source is required"));
  else {
    expectString(source, "tool_name", issues, "/artifact/source");
    expectStringOrNull(source, "repository", issues, "/artifact/source");
    expectStringOrNull(source, "task_id", issues, "/artifact/source");
    expectStringOrNull(source, "audit_id", issues, "/artifact/source");
    expectStringOrNull(source, "plan_id", issues, "/artifact/source");
    expectStringOrNull(source, "source_artifact_sha256", issues, "/artifact/source");
    if (typeof source.source_artifact_sha256 === "string" && source.source_artifact_sha256.length > 0 && !SHA256_RE.test(source.source_artifact_sha256)) issues.push(issue("/artifact/source/source_artifact_sha256", "sha256", "source_artifact_sha256 must use sha256:<64 hex> or null"));
  }

  if (!Array.isArray(root.runs) || root.runs.length !== 1) issues.push(issue("/artifact/runs", "array", "runs must contain exactly one run"));
  const run = asRecord(root.runs?.[0]);
  if (run) {
    const driver = asRecord(asRecord(run.tool)?.driver);
    if (!driver) issues.push(issue("/artifact/runs/0/tool/driver", "required", "tool.driver is required"));
    else {
      expectString(driver, "name", issues, "/artifact/runs/0/tool/driver");
      if (!Array.isArray(driver.rules)) issues.push(issue("/artifact/runs/0/tool/driver/rules", "array", "rules must be an array"));
      else driver.rules.forEach((rule, index) => validateRule(rule, `/artifact/runs/0/tool/driver/rules/${index}`, issues));
    }
    if (!Array.isArray(run.results)) issues.push(issue("/artifact/runs/0/results", "array", "results must be an array"));
    else run.results.forEach((result, index) => validateResult(result, `/artifact/runs/0/results/${index}`, issues));
  }

  const summary = asRecord(root.summary);
  if (!summary) issues.push(issue("/artifact/summary", "required", "summary is required"));
  else validateSummary(root, summary, issues);

  const guards = asRecord(root.guards);
  if (!guards) issues.push(issue("/artifact/guards", "required", "guards are required"));
  else {
    for (const key of Object.keys(boundaryGuards())) if (guards[key] !== true) issues.push(issue(`/artifact/guards/${key}`, "literal", `${key} must be true`));
  }
  return { ok: issues.length === 0, issues };
}

export function normalizeSarifSeverity(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["critical", "high", "error", "fatal", "security_high"].includes(raw)) return { ok: true, forgeSeverity: "high", level: "error", sourceSeverity: raw };
  if (["medium", "moderate", "warning", "warn", "security_medium"].includes(raw)) return { ok: true, forgeSeverity: "medium", level: "warning", sourceSeverity: raw };
  if (["low", "minor", "info", "informational", "notice", "security_low"].includes(raw)) return { ok: true, forgeSeverity: "low", level: "note", sourceSeverity: raw };
  if (["note", "none", "pass", "passed"].includes(raw)) return { ok: true, forgeSeverity: "note", level: "note", sourceSeverity: raw };
  return { ok: false, issue: issue("/finding/severity", "enum", `severity '${raw || "<missing>"}' is not allowed`) };
}

export function normalizeSarifPath(value, workspaceRoot = null) {
  return normalizeSarifPathWithWorkspace(value, workspaceRoot);
}

function normalizeSarifPathWithWorkspace(value, workspaceRoot) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  let raw = value.trim();
  const normalizedWorkspaceRoot = normalizeWorkspaceRoot(workspaceRoot);
  const slashRaw = raw.replace(/\\/g, "/").replace(/\/+$/g, "");
  if (normalizedWorkspaceRoot && slashRaw.startsWith(`${normalizedWorkspaceRoot}/`)) raw = slashRaw.slice(normalizedWorkspaceRoot.length + 1);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(raw) && !/^[a-zA-Z]:[\\/]/.test(raw)) return null;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return null;
  if (raw.startsWith("/") || raw.startsWith("~") || raw.includes("\0")) return null;
  if (looksSecret(raw)) return null;
  const normalized = raw.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/").replace(/\/+$/g, "");
  if (!normalized || normalized.startsWith("/")) return null;
  if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null;
  return normalized;
}

function normalizeSarifBridgeInput(input, options = {}) {
  const root = Array.isArray(input) ? { findings: input } : asRecord(input);
  const issues = [];
  if (!root) return { ok: false, issues: [issue("/input", "type", "SARIF bridge input must be an object or findings array")] };
  const auditResult = asRecord(root.auditResult) ?? asRecord(root.audit_result);
  const findings = Array.isArray(root.findings) ? root.findings : Array.isArray(root.report?.findings) ? root.report.findings : Array.isArray(auditResult?.findings) ? auditResult.findings : null;
  if (!Array.isArray(findings)) issues.push(issue("/input/findings", "array", "findings must be an array"));
  else if (findings.length === 0) issues.push(issue("/input/findings", "non_empty", "findings must contain at least one finding"));
  const generatedAt = root.generated_at ?? root.generatedAt ?? root.now ?? options.generatedAt ?? options.now ?? DEFAULT_GENERATED_AT;
  if (typeof generatedAt !== "string" || !RFC3339_UTC.test(generatedAt)) issues.push(issue("/input/generated_at", "rfc3339", "generated_at must be RFC3339 UTC when supplied"));
  const secretIssues = collectSecretLikeInputIssues(root, "/input");
  if (secretIssues.length > 0) issues.push(...secretIssues);
  const source = normalizeSource(root, options);
  const workspaceRoot = root.workspace_root ?? root.workspaceRoot ?? asRecord(root.source)?.workspace_root ?? asRecord(root.source)?.workspaceRoot ?? options.workspaceRoot ?? null;
  const normalizedFindings = [];
  if (Array.isArray(findings)) {
    findings.forEach((findingValue, index) => {
      const normalized = normalizeFinding(findingValue, index, workspaceRoot);
      if (!normalized.ok) issues.push(...normalized.issues);
      else normalizedFindings.push(normalized.finding);
    });
  }
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, findings: normalizedFindings, source, generatedAt, rejectedInputCount: 0 };
}

function normalizeSource(root, options) {
  const rawSource = asRecord(root.source) ?? {};
  const report = asRecord(root.report) ?? asRecord(root.auditResult) ?? asRecord(root.audit_result) ?? {};
  const reportSource = asRecord(report.source) ?? {};
  return {
    repository: stringOrNull(rawSource.repository ?? root.repository ?? reportSource.repository),
    task_id: stringOrNull(rawSource.task_id ?? rawSource.taskId ?? root.task_id ?? root.taskId ?? reportSource.candidate_id ?? options.taskId),
    audit_id: stringOrNull(rawSource.audit_id ?? rawSource.auditId ?? root.audit_id ?? root.auditId ?? report.audit_id),
    issue_number: Number.isSafeInteger(rawSource.issue_number ?? rawSource.issueNumber ?? reportSource.issue_number ?? reportSource.issueNumber) ? (rawSource.issue_number ?? rawSource.issueNumber ?? reportSource.issue_number ?? reportSource.issueNumber) : null,
    plan_id: stringOrNull(rawSource.plan_id ?? rawSource.planId ?? root.plan_id ?? root.planId ?? report.plan_id),
    source_artifact_sha256: stringOrNull(rawSource.source_artifact_sha256 ?? rawSource.sourceArtifactSha256 ?? root.source_artifact_sha256 ?? root.sourceArtifactSha256),
    tool_name: String(rawSource.tool_name ?? rawSource.toolName ?? root.tool_name ?? root.toolName ?? options.toolName ?? "ForgeRoot Auditor"),
  };
}

function normalizeFinding(value, index, workspaceRoot) {
  const issues = [];
  const root = asRecord(value);
  const base = `/input/findings/${index}`;
  if (!root) return { ok: false, issues: [issue(base, "object", "finding must be an object")] };

  const message = stringOrNull(root.message ?? asRecord(root.message)?.text ?? root.description ?? root.title);
  if (!message) issues.push(issue(`${base}/message`, "required", "finding message is required"));

  const severity = normalizeSarifSeverity(root.severity ?? root.level ?? root.risk);
  if (!severity.ok) issues.push({ ...severity.issue, path: `${base}/severity` });

  const ruleId = normalizeRuleId(root.ruleId ?? root.rule_id ?? asRecord(root.rule)?.id ?? root.category ?? root.code);
  if (!ruleId) issues.push(issue(`${base}/ruleId`, "required", "ruleId, category, or code is required"));

  const location = extractLocation(root);
  const path = normalizeSarifPathWithWorkspace(location.path, workspaceRoot);
  if (!path) issues.push(issue(`${base}/location/path`, "safe_relative_path", "finding path must be a safe repository-relative path"));
  const startLine = normalizePositiveInteger(location.line, 1);
  const startColumn = normalizePositiveInteger(location.column, 1);
  if (startLine === null) issues.push(issue(`${base}/location/line`, "positive_integer", "line must be a positive safe integer"));
  if (startColumn === null) issues.push(issue(`${base}/location/column`, "positive_integer", "column must be a positive safe integer"));

  if (issues.length > 0) return { ok: false, issues };
  const forgeSeverity = severity.forgeSeverity;
  const level = severity.level;
  const id = stringOrNull(root.id ?? root.finding_id ?? root.findingId) ?? `${ruleId}:${path}:${startLine}:${startColumn}:${stableHash(message)}`;
  const category = stringOrNull(root.category ?? root.code) ?? ruleId;
  const fingerprint = stableFingerprint({ ruleId, path, startLine, startColumn, message, forgeSeverity, category });
  return {
    ok: true,
    finding: {
      id,
      ruleId,
      level,
      forgeSeverity,
      sourceSeverity: severity.sourceSeverity,
      category,
      message,
      path,
      startLine,
      startColumn,
      fingerprint,
    },
  };
}

function extractLocation(root) {
  const location = asRecord(root.location) ?? {};
  const physical = asRecord(location.physicalLocation) ?? asRecord(root.physicalLocation) ?? {};
  const artifact = asRecord(physical.artifactLocation) ?? {};
  const region = asRecord(physical.region) ?? asRecord(location.region) ?? {};
  return {
    path: root.path ?? root.file ?? root.uri ?? location.path ?? location.uri ?? artifact.uri,
    line: root.line ?? root.startLine ?? root.start_line ?? location.line ?? location.startLine ?? region.startLine,
    column: root.column ?? root.startColumn ?? root.start_column ?? location.column ?? location.startColumn ?? region.startColumn,
  };
}

function toSarifResult(finding) {
  return {
    ruleId: finding.ruleId,
    level: finding.level,
    message: { text: finding.message },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: finding.path },
          region: {
            startLine: finding.startLine,
            startColumn: finding.startColumn,
          },
        },
      },
    ],
    partialFingerprints: {
      forgeRootFingerprint: finding.fingerprint,
    },
    properties: {
      forge_severity: finding.forgeSeverity,
      source_severity: finding.sourceSeverity,
      category: finding.category,
      forge_finding_id: finding.id,
      normalized_path: finding.path,
    },
  };
}

function buildRules(results) {
  const byRule = new Map();
  for (const result of results) {
    const current = byRule.get(result.ruleId);
    const level = result.level;
    if (!current || LEVEL_RANK[level] > LEVEL_RANK[current.defaultConfiguration.level]) {
      byRule.set(result.ruleId, {
        id: result.ruleId,
        name: result.ruleId,
        shortDescription: { text: `ForgeRoot normalized finding rule ${result.ruleId}` },
        defaultConfiguration: { level },
      });
    }
  }
  return [...byRule.values()].sort((a, b) => a.id.localeCompare(b.id));
}

function summarizeResults(results, rejectedInputCount) {
  const severityCounts = { high: 0, medium: 0, low: 0, note: 0 };
  const levelCounts = { error: 0, warning: 0, note: 0, none: 0 };
  const ruleIds = new Set();
  const paths = new Set();
  for (const result of results) {
    severityCounts[result.properties.forge_severity] += 1;
    levelCounts[result.level] += 1;
    ruleIds.add(result.ruleId);
    paths.add(result.locations[0].physicalLocation.artifactLocation.uri);
  }
  return {
    result_count: results.length,
    rejected_input_count: rejectedInputCount,
    severity_counts: severityCounts,
    level_counts: levelCounts,
    rule_ids: [...ruleIds].sort(),
    paths: [...paths].sort(),
  };
}

function validateRule(rule, path, issues) {
  const root = asRecord(rule);
  if (!root) return issues.push(issue(path, "object", "rule must be an object"));
  expectString(root, "id", issues, path);
  expectString(root, "name", issues, path);
  const shortDescription = asRecord(root.shortDescription);
  if (!shortDescription) issues.push(issue(`${path}/shortDescription`, "required", "shortDescription is required"));
  else expectString(shortDescription, "text", issues, `${path}/shortDescription`);
  const defaultConfiguration = asRecord(root.defaultConfiguration);
  if (!defaultConfiguration) issues.push(issue(`${path}/defaultConfiguration`, "required", "defaultConfiguration is required"));
  else expectOneOf(defaultConfiguration, "level", SARIF_LEVELS, issues, `${path}/defaultConfiguration`);
}

function validateResult(result, path, issues) {
  const root = asRecord(result);
  if (!root) return issues.push(issue(path, "object", "result must be an object"));
  expectString(root, "ruleId", issues, path);
  expectOneOf(root, "level", SARIF_LEVELS, issues, path);
  const message = asRecord(root.message);
  if (!message) issues.push(issue(`${path}/message`, "required", "message is required"));
  else expectString(message, "text", issues, `${path}/message`);
  const location = asRecord(root.locations?.[0]?.physicalLocation);
  if (!Array.isArray(root.locations) || root.locations.length !== 1 || !location) issues.push(issue(`${path}/locations`, "location", "exactly one physical location is required"));
  else {
    const artifact = asRecord(location.artifactLocation);
    const region = asRecord(location.region);
    if (!artifact) issues.push(issue(`${path}/locations/0/physicalLocation/artifactLocation`, "required", "artifactLocation is required"));
    else if (!normalizeSarifPath(artifact.uri)) issues.push(issue(`${path}/locations/0/physicalLocation/artifactLocation/uri`, "safe_relative_path", "uri must be safe repository-relative path"));
    if (!region) issues.push(issue(`${path}/locations/0/physicalLocation/region`, "required", "region is required"));
    else {
      if (!Number.isSafeInteger(region.startLine) || region.startLine <= 0) issues.push(issue(`${path}/locations/0/physicalLocation/region/startLine`, "positive_integer", "startLine must be positive"));
      if (!Number.isSafeInteger(region.startColumn) || region.startColumn <= 0) issues.push(issue(`${path}/locations/0/physicalLocation/region/startColumn`, "positive_integer", "startColumn must be positive"));
    }
  }
  const fingerprints = asRecord(root.partialFingerprints);
  if (!fingerprints || !SHA256_RE.test(fingerprints.forgeRootFingerprint)) issues.push(issue(`${path}/partialFingerprints/forgeRootFingerprint`, "sha256", "forgeRootFingerprint must use sha256:<64 hex>"));
  const properties = asRecord(root.properties);
  if (!properties) issues.push(issue(`${path}/properties`, "required", "properties are required"));
  else {
    expectOneOf(properties, "forge_severity", FORGE_SEVERITIES, issues, `${path}/properties`);
    expectString(properties, "category", issues, `${path}/properties`);
    expectString(properties, "forge_finding_id", issues, `${path}/properties`);
    expectString(properties, "normalized_path", issues, `${path}/properties`);
  }
}

function validateSummary(root, summary, issues) {
  if (!Number.isSafeInteger(summary.result_count) || summary.result_count < 0) issues.push(issue("/artifact/summary/result_count", "nonnegative_integer", "result_count must be a non-negative integer"));
  if (!Number.isSafeInteger(summary.rejected_input_count) || summary.rejected_input_count < 0) issues.push(issue("/artifact/summary/rejected_input_count", "nonnegative_integer", "rejected_input_count must be a non-negative integer"));
  const results = root.runs?.[0]?.results ?? [];
  if (Array.isArray(results) && Number.isSafeInteger(summary.result_count) && summary.result_count !== results.length) issues.push(issue("/artifact/summary/result_count", "count_mismatch", "result_count must equal results length"));
  const severityCounts = asRecord(summary.severity_counts);
  if (!severityCounts) issues.push(issue("/artifact/summary/severity_counts", "required", "severity_counts is required"));
  else for (const severity of FORGE_SEVERITIES) if (!Number.isSafeInteger(severityCounts[severity]) || severityCounts[severity] < 0) issues.push(issue(`/artifact/summary/severity_counts/${severity}`, "nonnegative_integer", `${severity} count must be non-negative integer`));
  const levelCounts = asRecord(summary.level_counts);
  if (!levelCounts) issues.push(issue("/artifact/summary/level_counts", "required", "level_counts is required"));
  else for (const level of SARIF_LEVELS) if (!Number.isSafeInteger(levelCounts[level]) || levelCounts[level] < 0) issues.push(issue(`/artifact/summary/level_counts/${level}`, "nonnegative_integer", `${level} count must be non-negative integer`));
  if (!Array.isArray(summary.rule_ids) || !summary.rule_ids.every((value) => typeof value === "string")) issues.push(issue("/artifact/summary/rule_ids", "string_array", "rule_ids must be strings"));
  if (!Array.isArray(summary.paths) || !summary.paths.every((value) => typeof value === "string" && normalizeSarifPath(value))) issues.push(issue("/artifact/summary/paths", "path_array", "paths must be safe relative strings"));
}

function compareSarifResults(a, b) {
  const aSeverity = FORGE_SEVERITY_RANK[a.properties.forge_severity] ?? -1;
  const bSeverity = FORGE_SEVERITY_RANK[b.properties.forge_severity] ?? -1;
  return bSeverity - aSeverity
    || a.ruleId.localeCompare(b.ruleId)
    || a.locations[0].physicalLocation.artifactLocation.uri.localeCompare(b.locations[0].physicalLocation.artifactLocation.uri)
    || a.locations[0].physicalLocation.region.startLine - b.locations[0].physicalLocation.region.startLine
    || a.locations[0].physicalLocation.region.startColumn - b.locations[0].physicalLocation.region.startColumn
    || a.message.text.localeCompare(b.message.text)
    || a.properties.forge_finding_id.localeCompare(b.properties.forge_finding_id);
}

function normalizeWorkspaceRoot(value) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const raw = value.trim().replace(/\\/g, "/").replace(/\/+$/g, "");
  if (!raw.startsWith("/") && !/^[a-zA-Z]:\//.test(raw)) return null;
  return raw;
}

function collectSecretLikeInputIssues(value, path) {
  const issues = [];
  const visit = (current, currentPath) => {
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${currentPath}/${index}`));
      return;
    }
    if (!asRecord(current)) {
      if (typeof current === "string" && looksSecret(current)) issues.push(issue(currentPath, "secret_like_value", "input contains secret-looking material"));
      return;
    }
    for (const [key, item] of Object.entries(current)) {
      const nextPath = `${currentPath}/${key}`;
      const upper = key.toUpperCase();
      if (["TOKEN", "SECRET", "PASSWORD", "PRIVATE_KEY", "CREDENTIAL"].some((part) => upper.includes(part)) && typeof item === "string" && item.length > 0) {
        issues.push(issue(nextPath, "secret_like_field", "input contains a secret-like field"));
      }
      visit(item, nextPath);
    }
  };
  visit(value, path);
  return issues;
}

function boundaryGuards() {
  return {
    no_github_code_scanning_upload: true,
    no_github_api_call: true,
    no_workflow_mutation: true,
    no_policy_mutation: true,
    no_ruleset_mutation: true,
    no_branch_protection_mutation: true,
    no_security_gate_decision: true,
    no_memory_or_evaluation_update: true,
    no_federation_or_self_evolution: true,
  };
}

function normalizeRuleId(value) {
  const raw = stringOrNull(value);
  if (!raw) return null;
  const valueText = raw.includes(".") || raw.includes("/") ? raw : `forge.${raw}`;
  const normalized = valueText
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.\/-]+/g, "-")
    .replace(/[\/]+/g, ".")
    .replace(/\.{2,}/g, ".")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
  return normalized || null;
}

function stableFingerprint(value) { return `sha256:${sha256(canonicalJson(value))}`; }
function stableHash(value) { return sha256(String(value)).slice(0, 12); }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex"); }
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (asRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function normalizePositiveInteger(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}
function looksSecret(value) {
  const lower = String(value).toLowerCase();
  return lower.includes("github_pat_") || lower.includes("ghp_") || lower.includes("sk-") || lower.includes("-----begin private key-----");
}
function stringOrNull(value) { return typeof value === "string" && value.trim().length > 0 ? value.trim() : null; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function issue(path, code, message) { return { path, code, message }; }
function invalid(path, code, message) { return { ok: false, issues: [issue(path, code, message)] }; }
function expectLiteral(record, key, expected, issues, path) { if (record[key] !== expected) issues.push(issue(`${path}/${key}`, "literal", `${key} must be ${JSON.stringify(expected)}`)); }
function expectString(record, key, issues, path) { const value = record[key]; if (typeof value !== "string" || value.length === 0) { issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`)); return null; } return value; }
function expectStringOrNull(record, key, issues, path) { const value = record[key]; if (!(typeof value === "string" || value === null)) issues.push(issue(`${path}/${key}`, "string_or_null", `${key} must be a string or null`)); }
function expectOneOf(record, key, allowed, issues, path) { const value = record[key]; if (typeof value !== "string" || !allowed.has(value)) issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`)); return value; }
function expectRfc3339(record, key, issues, path) { const value = expectString(record, key, issues, path); if (value && !RFC3339_UTC.test(value)) issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be RFC3339 UTC`)); }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
