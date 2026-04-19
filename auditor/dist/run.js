export const AUDIT_RESULT_SCHEMA_REF = "urn:forgeroot:audit-result:v1";

export const AUDITOR_RUNTIME_CONTRACT = {
  consumes: ["plan_spec", "branch_worktree_plan", "sandbox_execution_request", "sandbox_observed_output"],
  produces: ["audit_result"],
  validates: ["input_chain_consistency", "mutable_path_scope", "required_artifacts", "observed_commands", "observed_environment", "acceptance_criteria"],
  forbids: [
    "command_execution_in_auditor",
    "file_editing",
    "git_checkout",
    "git_branch_create",
    "git_worktree_add",
    "git_push",
    "commit_creation",
    "pull_request_creation",
    "github_mutation",
    "default_branch_write",
    "approval_checkpoint_mutation",
    "memory_or_evaluation_updates",
    "network_or_federation_behavior",
  ],
  oneTaskOnePr: true,
  independentFromExecutor: true,
};

const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const PLAN_SCHEMA_REF = "urn:forgeroot:plan-spec:v1";
const WORKTREE_SCHEMA_REF = "urn:forgeroot:branch-worktree:v1";
const SANDBOX_SCHEMA_REF = "urn:forgeroot:sandbox-execution-request:v1";
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const PLAN_STATUSES = new Set(["ready_for_execution", "blocked_for_human"]);
const SECRET_PATTERNS = ["TOKEN", "SECRET", "PASSWORD", "PRIVATE", "CREDENTIAL", "COOKIE", "SSH", "GPG", "KEY"];

export function runAuditor(input) {
  const auditTrail = [
    "auditor_runtime:T023",
    "contract:independent_audit",
    "contract:no_command_execution",
    "contract:no_file_or_git_mutation",
    "contract:no_pr_composition",
  ];

  const planValidation = validatePlanSpecForAudit(input?.plan);
  const worktreeValidation = validateBranchWorktreePlanForAudit(input?.worktreePlan);
  const requestValidation = validateSandboxExecutionRequestForAudit(input?.sandboxRequest);
  const structuralIssues = [...planValidation.issues, ...worktreeValidation.issues, ...requestValidation.issues];
  if (structuralIssues.length > 0) {
    const findings = structuralIssues.map((item, index) => finding(index + 1, "error", "input_validation", item.message, item.path));
    return {
      status: "invalid",
      decision: "invalid",
      findings,
      reasons: uniqueStrings(["invalid_auditor_input", ...structuralIssues.map((item) => item.code)]),
      auditTrail: [...auditTrail, "input:invalid", "audit_result:none"],
      issues: structuralIssues,
    };
  }

  const plan = input.plan;
  const worktreePlan = input.worktreePlan;
  const sandboxRequest = input.sandboxRequest;
  const evidence = normalizeEvidence(input.sandboxOutput, input.evidence);
  const chainFindings = validateChain(plan, worktreePlan, sandboxRequest);
  if (chainFindings.some((item) => item.severity === "error")) {
    const report = buildReport({ plan, worktreePlan, sandboxRequest, sandboxOutput: input.sandboxOutput, evidence, findings: chainFindings, checks: [], changedPathResults: [] }, input.now, "invalid", "invalid");
    return { status: "invalid", decision: "invalid", report, findings: chainFindings, reasons: reasonsFromFindings("chain_consistency_failed", chainFindings), auditTrail: [...auditTrail, "chain:invalid", "audit_result:generated"] };
  }

  const observed = validateObserved(plan, sandboxRequest, input.sandboxOutput, evidence);
  const acceptanceChecks = evaluateAcceptance(plan, evidence, observed.changedPathResults);
  const acceptanceFindings = acceptanceChecks
    .filter((check) => check.status === "fail")
    .map((check, index) => finding(10_000 + index, "error", "acceptance", `${check.id}: ${check.reason}`));
  const findings = [...chainFindings, ...observed.findings, ...acceptanceFindings];

  let status;
  let decision;
  if (input.sandboxOutput === undefined) {
    status = "blocked";
    decision = "block_pr_composition";
    findings.push(finding(20_000, "error", "artifact", "sandbox observed output is required before audit can pass", "/sandboxOutput"));
  } else if (findings.some((item) => item.severity === "error")) {
    status = "failed";
    decision = "request_changes";
  } else {
    status = "passed";
    decision = "allow_pr_composition";
  }

  const report = buildReport({ plan, worktreePlan, sandboxRequest, sandboxOutput: input.sandboxOutput, evidence, findings, checks: acceptanceChecks, changedPathResults: observed.changedPathResults }, input.now, status, decision);
  const reportValidation = validateAuditResult(report);
  if (!reportValidation.ok) {
    const validationFindings = reportValidation.issues.map((item, index) => finding(30_000 + index, "error", "input_validation", `generated audit result failed validation: ${item.message}`, item.path));
    return { status: "invalid", decision: "invalid", findings: [...findings, ...validationFindings], reasons: uniqueStrings(["generated_audit_result_failed_validation", ...reportValidation.issues.map((item) => item.code)]), auditTrail: [...auditTrail, "audit_result:invalid"], issues: reportValidation.issues };
  }

  return {
    status,
    decision,
    report,
    findings,
    reasons: reasonsForStatus(status, report, findings),
    auditTrail: [...auditTrail, "chain:consistent", `sandbox_output:${input.sandboxOutput === undefined ? "missing" : "present"}`, `audit_result:${status}`],
  };
}

export function validatePlanSpecForAudit(plan) {
  const issues = [];
  const root = asRecord(plan);
  if (!root) return invalid("/plan", "type", "plan spec must be an object");
  expectLiteral(root, "plan_version", 1, issues, "/plan");
  expectLiteral(root, "schema_ref", PLAN_SCHEMA_REF, issues, "/plan");
  expectString(root, "plan_id", issues, "/plan", "forge-plan://");
  expectOneOf(root, "status", PLAN_STATUSES, issues, "/plan");
  expectRfc3339(root, "created_at", issues, "/plan");
  expectString(root, "title", issues, "/plan");
  validateSource(root.source, "/plan/source", issues, true);
  validateScope(root.scope_contract, "/plan/scope_contract", issues, true);
  const risk = asRecord(root.risk_and_approval);
  if (!risk) issues.push(issue("/plan/risk_and_approval", "required", "risk_and_approval is required"));
  else {
    expectOneOf(risk, "risk", RISKS, issues, "/plan/risk_and_approval");
    expectOneOf(risk, "approval_class", APPROVAL_CLASSES, issues, "/plan/risk_and_approval");
    expectBoolean(risk, "human_review_required_before_merge", issues, "/plan/risk_and_approval");
    expectStringArray(risk, "reasons", issues, "/plan/risk_and_approval", false);
  }
  if (!Array.isArray(root.acceptance_criteria) || root.acceptance_criteria.length === 0) issues.push(issue("/plan/acceptance_criteria", "non_empty", "acceptance criteria must be a non-empty array"));
  else root.acceptance_criteria.forEach((criterion, index) => validateAcceptanceCriterion(criterion, `/plan/acceptance_criteria/${index}`, issues));
  const audit = asRecord(root.audit);
  if (!audit) issues.push(issue("/plan/audit", "required", "audit contract is required"));
  else if (audit.independent_audit_required !== true) issues.push(issue("/plan/audit/independent_audit_required", "independent_required", "independent audit must be required"));
  return { ok: issues.length === 0, issues };
}

export function validateBranchWorktreePlanForAudit(value) {
  const issues = [];
  const root = asRecord(value);
  if (!root) return invalid("/worktreePlan", "type", "branch/worktree plan must be an object");
  expectLiteral(root, "manifest_version", 1, issues, "/worktreePlan");
  expectLiteral(root, "schema_ref", WORKTREE_SCHEMA_REF, issues, "/worktreePlan");
  expectString(root, "manifest_id", issues, "/worktreePlan", "forge-worktree://");
  expectString(root, "plan_id", issues, "/worktreePlan", "forge-plan://");
  validateSource(root.source, "/worktreePlan/source", issues, true);
  validateBranch(root.branch, "/worktreePlan/branch", issues);
  validateWorktree(root.worktree, "/worktreePlan/worktree", issues);
  validateScope(root.scope, "/worktreePlan/scope", issues, false);
  validateApproval(root.approval, "/worktreePlan/approval", issues, true);
  return { ok: issues.length === 0, issues };
}

export function validateSandboxExecutionRequestForAudit(value) {
  const issues = [];
  const root = asRecord(value);
  if (!root) return invalid("/sandboxRequest", "type", "sandbox execution request must be an object");
  expectLiteral(root, "manifest_version", 1, issues, "/sandboxRequest");
  expectLiteral(root, "schema_ref", SANDBOX_SCHEMA_REF, issues, "/sandboxRequest");
  expectString(root, "request_id", issues, "/sandboxRequest", "forge-sandbox://");
  expectString(root, "plan_id", issues, "/sandboxRequest", "forge-plan://");
  expectString(root, "worktree_manifest_id", issues, "/sandboxRequest", "forge-worktree://");
  validateSource(root.source, "/sandboxRequest/source", issues, true);
  validateBranch(root.branch, "/sandboxRequest/branch", issues);
  validateWorktree(root.worktree, "/sandboxRequest/worktree", issues);
  validateScope(root.scope, "/sandboxRequest/scope", issues, false);
  validateApproval(root.approval, "/sandboxRequest/approval", issues, true);
  if (!Array.isArray(root.commands) || root.commands.length === 0) issues.push(issue("/sandboxRequest/commands", "non_empty", "commands must be a non-empty array"));
  if (!Array.isArray(root.artifacts) || root.artifacts.length === 0) issues.push(issue("/sandboxRequest/artifacts", "non_empty", "artifacts must be a non-empty array"));
  const isolation = asRecord(root.isolation);
  if (!isolation) issues.push(issue("/sandboxRequest/isolation", "required", "isolation is required"));
  else {
    if (isolation.execution_trust !== "untrusted") issues.push(issue("/sandboxRequest/isolation/execution_trust", "literal", "execution_trust must be untrusted"));
    if (asRecord(isolation.secrets)?.mount !== false) issues.push(issue("/sandboxRequest/isolation/secrets/mount", "literal", "secret mounts must be false"));
  }
  const filesystem = asRecord(root.filesystem);
  if (!filesystem) issues.push(issue("/sandboxRequest/filesystem", "required", "filesystem is required"));
  else if (filesystem.artifacts_outside_worktree !== true) issues.push(issue("/sandboxRequest/filesystem/artifacts_outside_worktree", "literal", "artifacts must be outside worktree"));
  const guards = asRecord(root.guards);
  if (!guards) issues.push(issue("/sandboxRequest/guards", "required", "guards are required"));
  else {
    if (guards.no_default_branch_write !== true) issues.push(issue("/sandboxRequest/guards/no_default_branch_write", "literal", "no_default_branch_write guard must be true"));
    if (guards.no_pr_creation !== true) issues.push(issue("/sandboxRequest/guards/no_pr_creation", "literal", "no_pr_creation guard must be true"));
    if (guards.no_secret_mounts !== true) issues.push(issue("/sandboxRequest/guards/no_secret_mounts", "literal", "no_secret_mounts guard must be true"));
  }
  return { ok: issues.length === 0, issues };
}

export function validateAuditResult(report) {
  const issues = [];
  const root = asRecord(report);
  if (!root) return invalid("/auditResult", "type", "audit result must be an object");
  expectLiteral(root, "manifest_version", 1, issues, "/auditResult");
  expectLiteral(root, "schema_ref", AUDIT_RESULT_SCHEMA_REF, issues, "/auditResult");
  expectString(root, "audit_id", issues, "/auditResult", "forge-audit://");
  expectRfc3339(root, "created_at", issues, "/auditResult");
  expectOneOf(root, "status", new Set(["passed", "failed", "blocked", "invalid"]), issues, "/auditResult");
  expectOneOf(root, "decision", new Set(["allow_pr_composition", "request_changes", "block_pr_composition", "invalid"]), issues, "/auditResult");
  if (root.status === "passed" && root.decision !== "allow_pr_composition") issues.push(issue("/auditResult/decision", "coherence", "passed audit must allow PR composition"));
  if (root.status === "failed" && root.decision !== "request_changes") issues.push(issue("/auditResult/decision", "coherence", "failed audit must request changes"));
  if (root.status === "blocked" && root.decision !== "block_pr_composition") issues.push(issue("/auditResult/decision", "coherence", "blocked audit must block PR composition"));
  if (root.status === "invalid" && root.decision !== "invalid") issues.push(issue("/auditResult/decision", "coherence", "invalid audit must use invalid decision"));
  expectString(root, "plan_id", issues, "/auditResult", "forge-plan://");
  expectString(root, "worktree_manifest_id", issues, "/auditResult", "forge-worktree://");
  expectString(root, "sandbox_request_id", issues, "/auditResult", "forge-sandbox://");
  validateScope(root.scope, "/auditResult/scope", issues, false);
  const acceptance = asRecord(root.acceptance);
  if (!acceptance) issues.push(issue("/auditResult/acceptance", "required", "acceptance is required"));
  else if (!Array.isArray(acceptance.checks)) issues.push(issue("/auditResult/acceptance/checks", "array", "acceptance checks must be an array"));
  if (!Array.isArray(root.findings)) issues.push(issue("/auditResult/findings", "array", "findings must be an array"));
  const gates = asRecord(root.gates);
  if (!gates) issues.push(issue("/auditResult/gates", "required", "gates are required"));
  else if (gates.audit_independent !== true) issues.push(issue("/auditResult/gates/audit_independent", "literal", "audit_independent must be true"));
  const guards = asRecord(root.guards);
  if (!guards) issues.push(issue("/auditResult/guards", "required", "guards are required"));
  else for (const key of ["no_command_execution_in_auditor", "no_file_editing", "no_branch_creation", "no_commit_creation", "no_pull_request_creation", "no_github_mutation", "no_default_branch_write"]) {
    if (guards[key] !== true) issues.push(issue(`/auditResult/guards/${key}`, "literal", `${key} must be true`));
  }
  return { ok: issues.length === 0, issues };
}

export const validateAuditReport = validateAuditResult;

function validateChain(plan, worktreePlan, sandboxRequest) {
  const findings = [];
  let index = 1;
  const add = (message, path) => findings.push(finding(index++, "error", "chain_consistency", message, path));
  if (plan.plan_id !== worktreePlan.plan_id) add("Plan Spec and branch/worktree manifest plan_id values differ", "/worktreePlan/plan_id");
  if (plan.plan_id !== sandboxRequest.plan_id) add("Plan Spec and sandbox request plan_id values differ", "/sandboxRequest/plan_id");
  if (worktreePlan.manifest_id !== sandboxRequest.worktree_manifest_id) add("Sandbox request does not reference the supplied branch/worktree manifest", "/sandboxRequest/worktree_manifest_id");
  if (worktreePlan.branch.name !== sandboxRequest.branch.name) add("Sandbox request branch name differs from branch/worktree manifest", "/sandboxRequest/branch/name");
  if (!sameArray(plan.scope_contract.mutable_paths, worktreePlan.scope.mutable_paths) || !sameArray(worktreePlan.scope.mutable_paths, sandboxRequest.scope.mutable_paths)) add("Mutable path scopes are not consistent across plan, worktree, and sandbox request", "/scope/mutable_paths");
  if (!sameArray(plan.scope_contract.immutable_paths, worktreePlan.scope.immutable_paths) || !sameArray(worktreePlan.scope.immutable_paths, sandboxRequest.scope.immutable_paths)) add("Immutable path scopes are not consistent across plan, worktree, and sandbox request", "/scope/immutable_paths");
  if (sandboxRequest.isolation?.secrets?.mount !== false) add("Sandbox request violates no-secret isolation contract", "/sandboxRequest/isolation/secrets");
  if (sandboxRequest.guards?.no_pr_creation !== true) add("Sandbox request guard must forbid PR creation", "/sandboxRequest/guards/no_pr_creation");
  if (plan.risk_and_approval.approval_class !== sandboxRequest.approval.approval_class) add("Plan approval class differs from sandbox request approval", "/sandboxRequest/approval/approval_class");
  if (plan.risk_and_approval.risk !== sandboxRequest.approval.risk) add("Plan risk differs from sandbox request approval", "/sandboxRequest/approval/risk");
  return findings;
}

function validateObserved(plan, request, output, evidence) {
  const findings = [];
  const changedPathResults = [];
  if (!output) return { findings, changedPathResults };
  let index = 1_000;
  const add = (category, message, path) => findings.push(finding(index++, "error", category, message, path));
  const declaredCommandIds = new Set(request.commands.map((command) => command.id));
  for (const id of output.command_ids ?? []) if (!declaredCommandIds.has(id)) add("command", `observed command '${id}' was not declared`, "/sandboxOutput/command_ids");
  const declaredArtifacts = new Map(request.artifacts.map((artifact) => [normalizePath(artifact.path) ?? artifact.path, artifact]));
  const observedArtifacts = new Set();
  for (const artifact of output.artifacts ?? []) {
    const normalized = normalizePath(artifact.path);
    if (!normalized) { add("artifact", `artifact path '${artifact.path}' is not safe`, "/sandboxOutput/artifacts/path"); continue; }
    observedArtifacts.add(normalized);
    const declared = declaredArtifacts.get(normalized);
    if (!declared) { add("artifact", `observed artifact '${normalized}' was not declared by the sandbox request`, "/sandboxOutput/artifacts"); continue; }
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) add("artifact", `artifact '${normalized}' has invalid byte count`, "/sandboxOutput/artifacts/bytes");
    else if (artifact.bytes > declared.max_bytes) add("artifact", `artifact '${normalized}' exceeds declared max_bytes`, "/sandboxOutput/artifacts/bytes");
    if (artifact.media_type !== undefined && artifact.media_type !== declared.media_type) add("artifact", `artifact '${normalized}' media type does not match declaration`, "/sandboxOutput/artifacts/media_type");
    if (artifact.sha256 !== undefined && !/^sha256:[a-f0-9]{64}$/.test(artifact.sha256)) add("artifact", `artifact '${normalized}' sha256 must use sha256:<64 hex>`, "/sandboxOutput/artifacts/sha256");
  }
  for (const artifact of request.artifacts) {
    const path = normalizePath(artifact.path) ?? artifact.path;
    if (artifact.required && !observedArtifacts.has(path)) add("artifact", `required artifact '${path}' is missing from sandbox output`, "/sandboxOutput/artifacts");
  }
  for (const [name, value] of Object.entries(output.environment ?? {})) {
    if (isForbiddenEnvName(name)) add("safety_contract", `observed environment variable '${name}' looks secret-bearing`, "/sandboxOutput/environment");
    if (looksSecret(String(value))) add("safety_contract", `observed environment variable '${name}' looks like a secret value`, "/sandboxOutput/environment");
  }
  const changedPaths = uniqueStrings(evidence.changedPaths);
  for (const raw of changedPaths) {
    const normalized = normalizePath(raw);
    if (!normalized) { changedPathResults.push({ path: raw, status: "rejected", reason: "invalid_path" }); add("scope", `changed path '${raw}' is not a safe relative path`, "/sandboxOutput/changed_paths"); continue; }
    if (matchesAny(normalized, request.scope.immutable_paths)) { changedPathResults.push({ path: normalized, status: "rejected", reason: "immutable" }); add("scope", `changed path '${normalized}' touches immutable scope`, "/sandboxOutput/changed_paths"); continue; }
    if (!matchesAny(normalized, request.scope.mutable_paths)) { changedPathResults.push({ path: normalized, status: "rejected", reason: "outside_mutable_scope" }); add("scope", `changed path '${normalized}' is outside mutable scope`, "/sandboxOutput/changed_paths"); continue; }
    changedPathResults.push({ path: normalized, status: "accepted", reason: "mutable" });
  }
  if (evidence.filesChanged !== null && evidence.filesChanged > plan.scope_contract.max_files_changed) add("scope", "observed files_changed exceeds Plan Spec budget", "/evidence/files_changed");
  if (evidence.diffLines !== null && evidence.diffLines > plan.scope_contract.max_diff_lines) add("scope", "observed diff_lines exceeds Plan Spec budget", "/evidence/diff_lines");
  return { findings, changedPathResults };
}

function evaluateAcceptance(plan, evidence, changedPathResults) {
  const accepted = changedPathResults.filter((item) => item.status === "accepted").map((item) => item.path);
  const rejected = changedPathResults.filter((item) => item.status === "rejected").map((item) => item.path);
  return plan.acceptance_criteria.map((criterion) => {
    const check = criterion.check ?? {};
    if (check.kind === "diff_budget") {
      if (evidence.filesChanged === null) return checkResult(criterion, "fail", "files_changed evidence is missing");
      if (evidence.diffLines === null) return checkResult(criterion, "fail", "diff_lines evidence is missing");
      const maxFiles = check.max_files_changed ?? plan.scope_contract.max_files_changed;
      const maxLines = check.max_diff_lines ?? plan.scope_contract.max_diff_lines;
      if (evidence.filesChanged > maxFiles) return checkResult(criterion, "fail", `files_changed ${evidence.filesChanged} exceeds ${maxFiles}`);
      if (evidence.diffLines > maxLines) return checkResult(criterion, "fail", `diff_lines ${evidence.diffLines} exceeds ${maxLines}`);
      return checkResult(criterion, "pass", "diff budget evidence is within declared limits");
    }
    if (check.kind === "forbidden_paths_unchanged") {
      const paths = check.paths ?? plan.scope_contract.immutable_paths;
      const changed = [...accepted, ...rejected].find((path) => matchesAny(path, paths));
      return changed ? checkResult(criterion, "fail", `forbidden path changed: ${changed}`) : checkResult(criterion, "pass", "no forbidden path changes observed");
    }
    if (check.kind === "path_changed") {
      const paths = check.paths ?? plan.scope_contract.mutable_paths;
      return accepted.some((path) => matchesAny(path, paths)) ? checkResult(criterion, "pass", "at least one declared path changed") : checkResult(criterion, "fail", "no changed path matched the declared path set");
    }
    if (check.kind === "path_not_changed") {
      const paths = check.paths ?? [];
      const changed = accepted.find((path) => matchesAny(path, paths));
      return changed ? checkResult(criterion, "fail", `path changed unexpectedly: ${changed}`) : checkResult(criterion, "pass", "declared unchanged paths stayed unchanged");
    }
    if (check.kind === "command") {
      const command = check.command;
      const commandResult = evidence.commandResults.find((item) => item.command === command || item.id === stableCommandId(command ?? ""));
      if (!commandResult) return checkResult(criterion, "fail", `missing command evidence for '${command}'`);
      const expected = check.expected_exit_code ?? 0;
      return commandResult.exit_code === expected ? checkResult(criterion, "pass", `command '${command}' matched expected exit code`) : checkResult(criterion, "fail", `command '${command}' exited ${commandResult.exit_code}, expected ${expected}`);
    }
    if (check.kind === "text_contains") {
      const found = Object.values(evidence.textEvidence).some((value) => value.includes(check.needle ?? ""));
      return found ? checkResult(criterion, "pass", "text evidence contains expected needle") : checkResult(criterion, "fail", "text evidence does not contain expected needle");
    }
    if (check.kind === "plan_field_equals") {
      const actual = getDotted(plan, check.field ?? "");
      return JSON.stringify(actual) === JSON.stringify(check.expected) ? checkResult(criterion, "pass", "plan field matched") : checkResult(criterion, "fail", "plan field did not match expected value");
    }
    return checkResult(criterion, "fail", `unsupported acceptance check kind '${check.kind}'`);
  });
}

function buildReport(context, now, status, decision) {
  const { plan, worktreePlan, sandboxRequest, sandboxOutput, evidence, findings, checks, changedPathResults } = context;
  const createdAt = RFC3339_UTC.test(now ?? "") ? now : sandboxRequest.created_at;
  const auditId = `forge-audit://${stableSlug(plan.plan_id)}-${stableHash(`${sandboxRequest.request_id}:${createdAt}`).slice(0, 8)}`;
  const failed = checks.filter((item) => item.status === "fail").length;
  const passed = checks.filter((item) => item.status === "pass").length;
  return {
    manifest_version: 1,
    schema_ref: AUDIT_RESULT_SCHEMA_REF,
    audit_id: auditId,
    created_at: createdAt,
    status,
    decision,
    plan_id: plan.plan_id,
    worktree_manifest_id: worktreePlan.manifest_id,
    sandbox_request_id: sandboxRequest.request_id,
    source: { repository: plan.source.repository, issue_number: plan.source.issue_number, candidate_id: plan.source.candidate_id, title: plan.source.title },
    risk_summary: { risk: plan.risk_and_approval.risk, approval_class: plan.risk_and_approval.approval_class, human_review_required_before_merge: plan.risk_and_approval.human_review_required_before_merge, reasons: [...plan.risk_and_approval.reasons] },
    scope: { one_task_one_pr: true, no_default_branch_write: true, mutable_paths: [...plan.scope_contract.mutable_paths], immutable_paths: [...plan.scope_contract.immutable_paths], out_of_scope: [...plan.scope_contract.out_of_scope], max_files_changed: plan.scope_contract.max_files_changed, max_diff_lines: plan.scope_contract.max_diff_lines },
    evidence: { sandbox_output_present: sandboxOutput !== undefined, changed_paths: changedPathResults, command_results: evidence.commandResults, artifacts: evidence.artifacts, files_changed: evidence.filesChanged, diff_lines: evidence.diffLines },
    acceptance: { total: checks.length, passed, failed, checks },
    findings,
    gates: { pr_composition: status === "passed" ? "allowed" : "blocked", merge: plan.risk_and_approval.human_review_required_before_merge ? "human_review_required" : "not_evaluated", audit_independent: true },
    guards: { no_command_execution_in_auditor: true, no_file_editing: true, no_branch_creation: true, no_commit_creation: true, no_pull_request_creation: true, no_github_mutation: true, no_default_branch_write: true },
  };
}

function normalizeEvidence(output, evidence = {}) {
  const changedPaths = uniqueStrings([...(output?.changed_paths ?? []), ...(evidence.changed_paths ?? [])]);
  const filesChanged = output?.diff_summary?.files_changed ?? evidence.files_changed ?? (changedPaths.length > 0 ? changedPaths.length : null);
  const diffLines = output?.diff_summary?.total_lines_changed ?? evidence.diff_lines ?? null;
  return { changedPaths, filesChanged, diffLines, commandResults: [...(evidence.command_results ?? [])], textEvidence: { ...(evidence.text_evidence ?? {}) }, artifacts: [...(output?.artifacts ?? [])] };
}

function validateSource(source, path, issues, required) {
  const root = asRecord(source);
  if (!root) { if (required) issues.push(issue(path, "required", "source is required")); return; }
  expectStringOrNull(root, "repository", issues, path);
  expectIntegerOrNull(root, "issue_number", issues, path);
  expectString(root, "candidate_id", issues, path);
  expectString(root, "title", issues, path);
}
function validateBranch(branch, path, issues) {
  const root = asRecord(branch);
  if (!root) return issues.push(issue(path, "required", "branch is required"));
  const name = expectString(root, "name", issues, path, "forge/");
  const defaultBranch = expectString(root, "default_branch", issues, path);
  expectString(root, "base_ref", issues, path);
  if (name && defaultBranch && isDefaultBranchTarget(name, defaultBranch)) issues.push(issue(`${path}/name`, "default_branch_write", "branch must not target default branch"));
}
function validateWorktree(worktree, path, issues) {
  const root = asRecord(worktree);
  if (!root) return issues.push(issue(path, "required", "worktree is required"));
  expectString(root, "path", issues, path);
  if (root.ephemeral !== true) issues.push(issue(`${path}/ephemeral`, "literal", "worktree must be ephemeral"));
}
function validateApproval(approval, path, issues, requireApprovedIfNeeded) {
  const root = asRecord(approval);
  if (!root) return issues.push(issue(path, "required", "approval is required"));
  expectOneOf(root, "approval_class", APPROVAL_CLASSES, issues, path);
  expectOneOf(root, "risk", RISKS, issues, path);
  const approved = expectBoolean(root, "approved_for_execution", issues, path);
  const human = expectBoolean(root, "human_review_required_before_execution", issues, path);
  expectStringOrNull(root, "approval_ref", issues, path);
  if (requireApprovedIfNeeded && human === true && approved !== true) issues.push(issue(`${path}/approved_for_execution`, "approval_required", "execution approval is required before audit"));
}
function validateScope(scope, path, issues, requireSourceIssueCount) {
  const root = asRecord(scope);
  if (!root) return issues.push(issue(path, "required", "scope is required"));
  expectLiteral(root, "one_task_one_pr", true, issues, path);
  if (requireSourceIssueCount) expectLiteral(root, "source_issue_count", 1, issues, path);
  expectLiteral(root, "no_default_branch_write", true, issues, path);
  const mutable = expectStringArray(root, "mutable_paths", issues, path, false);
  const immutable = expectStringArray(root, "immutable_paths", issues, path, false);
  expectStringArray(root, "out_of_scope", issues, path, false);
  expectPositiveInteger(root, "max_files_changed", issues, path, 50);
  expectPositiveInteger(root, "max_diff_lines", issues, path, 2000);
  for (const m of mutable) for (const im of immutable) if (m === im || (m.endsWith("/**") && im.startsWith(m.slice(0, -3))) || (im.endsWith("/**") && m.startsWith(im.slice(0, -3)))) issues.push(issue(`${path}/mutable_paths`, "immutable_overlap", `mutable path '${m}' overlaps immutable path '${im}'`));
}
function validateAcceptanceCriterion(value, path, issues) {
  const root = asRecord(value);
  if (!root) return issues.push(issue(path, "object", "acceptance criterion must be an object"));
  expectString(root, "id", issues, path);
  expectString(root, "description", issues, path);
  expectLiteral(root, "required", true, issues, path);
  const check = asRecord(root.check);
  if (!check) return issues.push(issue(`${path}/check`, "required", "acceptance check is required"));
  expectString(check, "kind", issues, `${path}/check`);
  expectLiteral(check, "machine", true, issues, `${path}/check`);
}
function checkResult(criterion, status, reason) {
  return { id: criterion.id, status, kind: criterion.check.kind, description: criterion.description, evidence: criterion.evidence, reason };
}
function finding(index, severity, category, message, path) { return { id: `AUD-${String(index).padStart(4, "0")}`, severity, category, message, ...(path ? { path } : {}) }; }
function issue(path, code, message) { return { path, code, message }; }
function invalid(path, code, message) { return { ok: false, issues: [issue(path, code, message)] }; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function expectLiteral(record, key, expected, issues, path) { if (record[key] !== expected) issues.push(issue(`${path}/${key}`, "literal", `${key} must be ${JSON.stringify(expected)}`)); }
function expectString(record, key, issues, path, prefix) { const value = record[key]; if (typeof value !== "string" || value.length === 0) { issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`)); return null; } if (prefix && !value.startsWith(prefix)) issues.push(issue(`${path}/${key}`, "prefix", `${key} must start with '${prefix}'`)); return value; }
function expectStringOrNull(record, key, issues, path) { const value = record[key]; if (!(typeof value === "string" || value === null)) issues.push(issue(`${path}/${key}`, "string_or_null", `${key} must be a string or null`)); }
function expectIntegerOrNull(record, key, issues, path) { const value = record[key]; if (!(Number.isSafeInteger(value) || value === null)) issues.push(issue(`${path}/${key}`, "integer_or_null", `${key} must be an integer or null`)); }
function expectBoolean(record, key, issues, path) { const value = record[key]; if (typeof value !== "boolean") { issues.push(issue(`${path}/${key}`, "boolean", `${key} must be boolean`)); return null; } return value; }
function expectOneOf(record, key, allowed, issues, path) { const value = record[key]; if (typeof value !== "string" || !allowed.has(value)) issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`)); return value; }
function expectRfc3339(record, key, issues, path) { const value = expectString(record, key, issues, path); if (value && !RFC3339_UTC.test(value)) issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be RFC3339 UTC`)); }
function expectStringArray(record, key, issues, path, allowEmpty) { const value = record[key]; if (!Array.isArray(value) || !value.every((x) => typeof x === "string" && x.length > 0)) { issues.push(issue(`${path}/${key}`, "string_array", `${key} must be an array of strings`)); return []; } if (!allowEmpty && value.length === 0) issues.push(issue(`${path}/${key}`, "non_empty", `${key} must not be empty`)); return value; }
function expectPositiveInteger(record, key, issues, path, max) { const value = record[key]; if (!Number.isSafeInteger(value) || value <= 0) { issues.push(issue(`${path}/${key}`, "positive_integer", `${key} must be a positive integer`)); return null; } if (value > max) issues.push(issue(`${path}/${key}`, "max", `${key} must be <= ${max}`)); return value; }
function reasonsFromFindings(prefix, findings) { return uniqueStrings([prefix, ...findings.map((item) => `${item.category}:${item.message}`)]); }
function reasonsForStatus(status, report, findings) { if (status === "passed") return uniqueStrings(["audit_passed", `audit:${report.audit_id}`, `acceptance:${report.acceptance.passed}/${report.acceptance.total}`]); return uniqueStrings([`audit_${status}`, ...findings.map((item) => item.message)]); }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function sameArray(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((value, index) => value === b[index]); }
function normalizePath(value) { const normalized = String(value).trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/").replace(/\/+$/g, ""); if (!normalized || normalized.startsWith("/") || normalized.includes("\0")) return null; if (normalized.split("/").some((segment) => !segment || segment === "." || segment === "..")) return null; return normalized; }
function matchesAny(path, patterns) { return patterns.some((pattern) => globToRegExp(pattern).test(path)); }
function globToRegExp(pattern) { let source = "^"; const value = pattern.replace(/\\/g, "/"); for (let i = 0; i < value.length; i++) { const c = value[i]; if (c === "*" && value[i + 1] === "*") { source += ".*"; i++; } else if (c === "*") source += "[^/]*"; else source += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); } return new RegExp(source + "$"); }
function isDefaultBranchTarget(branch, def) { const b = branch.toLowerCase(); const d = def.toLowerCase(); return b === d || b === `refs/heads/${d}` || b === "main" || b === "master" || b === "trunk"; }
function isForbiddenEnvName(name) { const upper = name.toUpperCase(); return SECRET_PATTERNS.some((pattern) => upper.includes(pattern)); }
function looksSecret(value) { const lower = value.toLowerCase(); return lower.startsWith("ghp_") || lower.startsWith("github_pat_") || lower.startsWith("sk-") || value.includes("-----BEGIN PRIVATE KEY-----"); }
function stableSlug(value) { const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80); return slug || "unnamed"; }
function stableCommandId(command) { return String(command).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64); }
function stableHash(value) { let hash = 0x811c9dc5; const text = String(value); for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash.toString(16).padStart(8, "0"); }
function getDotted(root, path) { return String(path).split(".").reduce((current, segment) => asRecord(current)?.[segment], root); }
