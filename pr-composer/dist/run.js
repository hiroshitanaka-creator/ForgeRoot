export const PR_COMPOSITION_SCHEMA_REF = "urn:forgeroot:pr-composition:v1";
export const PR_COMPOSER_VERSION = 1;
const PLAN_SCHEMA_REF = "urn:forgeroot:plan-spec:v1";
const WORKTREE_SCHEMA_REF = "urn:forgeroot:branch-worktree:v1";
const SANDBOX_SCHEMA_REF = "urn:forgeroot:sandbox-execution-request:v1";
const AUDIT_SCHEMA_REF = "urn:forgeroot:audit-result:v1";
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const AUDIT_ALLOWED_STATUSES = new Set(["passed", "failed", "blocked", "invalid"]);
const AUDIT_DECISIONS = new Set(["allow_pr_composition", "request_changes", "block_pr_composition", "invalid"]);
const COMPOSITION_STATUSES = new Set(["ready_for_github_adapter"]);
const MAX_LABEL_LENGTH = 64;
const MAX_TITLE_LENGTH = 120;
const MAX_BODY_LENGTH = 65_536;
export const PR_COMPOSER_CONTRACT = {
    consumes: ["plan_spec", "branch_worktree_plan", "sandbox_execution_request", "sandbox_observed_output", "audit_result"],
    produces: ["pull_request_composition"],
    validates: ["passed_audit_gate", "input_chain_consistency", "head_branch_safety", "review_body_completeness", "approval_gate_preservation", "artifact_traceability"],
    forbids: [
        "github_mutation",
        "pull_request_creation_in_composer",
        "merge_operation",
        "auto_approval",
        "default_branch_write",
        "workflow_mutation",
        "policy_mutation",
        "approval_gate_weakening",
        "memory_or_evaluation_updates",
        "network_or_federation_behavior",
        "self_evolution",
    ],
    oneTaskOnePr: true,
    composerOnly: true,
    requiresPassedAudit: true,
};
export function composePullRequest(input) {
    const auditTrail = [
        "pr_composer:T024",
        "contract:composition_manifest_only",
        "contract:no_github_mutation",
        "contract:no_pull_request_creation_in_composer",
        "contract:no_merge_or_auto_approval",
    ];
    const auditResult = extractAuditResult(input);
    const structuralIssues = [
        ...validatePlanForComposer(input?.plan).issues,
        ...validateWorktreeForComposer(input?.worktreePlan).issues,
        ...validateSandboxForComposer(input?.sandboxRequest).issues,
        ...validateSandboxOutputForComposer(input?.sandboxOutput).issues,
        ...validateAuditResultForComposer(auditResult).issues,
    ];
    if (structuralIssues.length > 0) {
        return invalidResult(["invalid_pr_composer_input", ...structuralIssues.map(formatIssue)], [...auditTrail, "input:invalid"], structuralIssues);
    }
    const plan = input.plan;
    const worktreePlan = input.worktreePlan;
    const sandboxRequest = input.sandboxRequest;
    const sandboxOutput = input.sandboxOutput;
    const audit = auditResult;
    const chainIssues = validateInputChain(plan, worktreePlan, sandboxRequest, sandboxOutput, audit);
    if (chainIssues.length > 0) {
        return invalidResult(["input_chain_consistency_failed", ...chainIssues.map(formatIssue)], [...auditTrail, "chain:invalid"], chainIssues);
    }
    const gateIssues = validatePassedAuditGate(audit);
    if (gateIssues.length > 0) {
        return {
            status: "blocked",
            reasons: uniqueStrings(["audit_does_not_allow_pr_composition", ...gateIssues.map(formatIssue)]),
            auditTrail: [...auditTrail, "audit_gate:blocked", "composition:none"],
            issues: gateIssues,
        };
    }
    const createdAt = resolveTimestamp(input.now, stringValue(audit["created_at"]) ?? stringValue(sandboxRequest["created_at"]) ?? stringValue(plan["created_at"]));
    if (createdAt === null)
        return invalidResult(["created_at_must_be_rfc3339_utc"], [...auditTrail, "timestamp:invalid"]);
    const composition = buildComposition(plan, worktreePlan, sandboxRequest, sandboxOutput, audit, input, createdAt);
    const validation = validatePullRequestComposition(composition);
    if (!validation.ok) {
        return invalidResult(["generated_pr_composition_failed_validation", ...validation.issues.map(formatIssue)], [...auditTrail, "composition:invalid"], validation.issues);
    }
    return {
        status: "ready",
        composition,
        reasons: uniqueStrings([
            "pull_request_composition_ready",
            `composition:${composition.composition_id}`,
            `head:${composition.pull_request.head}`,
            `base:${composition.pull_request.base}`,
            `audit:${composition.audit_id}`,
        ]),
        auditTrail: [...auditTrail, "audit_gate:passed", "composition:ready_for_github_adapter", "github_mutation:not_performed"],
    };
}
export const composePr = composePullRequest;
export const composePR = composePullRequest;
export function validatePullRequestComposition(value) {
    const issues = [];
    const root = asRecord(value);
    if (root === null)
        return { ok: false, issues: [issue("/composition", "type", "PR composition must be an object")] };
    expectLiteral(root, "manifest_version", PR_COMPOSER_VERSION, issues, "/composition");
    expectLiteral(root, "schema_ref", PR_COMPOSITION_SCHEMA_REF, issues, "/composition");
    expectString(root, "composition_id", issues, "/composition", "forge-pr://");
    expectRfc3339(root, "created_at", issues, "/composition");
    expectOneOf(root, "status", COMPOSITION_STATUSES, issues, "/composition");
    expectString(root, "plan_id", issues, "/composition", "forge-plan://");
    expectString(root, "worktree_manifest_id", issues, "/composition", "forge-worktree://");
    expectString(root, "sandbox_request_id", issues, "/composition", "forge-sandbox://");
    expectString(root, "audit_id", issues, "/composition", "forge-audit://");
    const pullRequest = asRecord(root["pull_request"]);
    if (pullRequest === null) {
        issues.push(issue("/composition/pull_request", "required", "pull_request is required"));
    }
    else {
        expectString(pullRequest, "title", issues, "/composition/pull_request");
        expectString(pullRequest, "body", issues, "/composition/pull_request");
        const head = expectString(pullRequest, "head", issues, "/composition/pull_request", "forge/");
        const base = expectString(pullRequest, "base", issues, "/composition/pull_request");
        if (head !== null && base !== null && isDefaultBranchTarget(head, base))
            issues.push(issue("/composition/pull_request/head", "default_branch_write", "head branch must not equal base/default branch"));
        if (pullRequest["maintainer_can_modify"] !== false)
            issues.push(issue("/composition/pull_request/maintainer_can_modify", "literal", "maintainer_can_modify must be false at composition boundary"));
        expectBoolean(pullRequest, "draft", issues, "/composition/pull_request");
        validateStringArrayField(pullRequest, "labels", issues, "/composition/pull_request", false);
        validateStringArrayField(pullRequest, "reviewers", issues, "/composition/pull_request", true);
        validateStringArrayField(pullRequest, "team_reviewers", issues, "/composition/pull_request", true);
    }
    const source = asRecord(root["source"]);
    if (source === null)
        issues.push(issue("/composition/source", "required", "source is required"));
    else {
        expectStringOrNull(source, "repository", issues, "/composition/source");
        expectIntegerOrNull(source, "issue_number", issues, "/composition/source");
        expectString(source, "candidate_id", issues, "/composition/source");
        expectString(source, "title", issues, "/composition/source");
        expectStringOrNull(source, "url", issues, "/composition/source");
    }
    const review = asRecord(root["review"]);
    if (review === null)
        issues.push(issue("/composition/review", "required", "review is required"));
    else {
        expectOneOf(review, "approval_class", APPROVAL_CLASSES, issues, "/composition/review");
        expectOneOf(review, "risk", RISKS, issues, "/composition/review");
        expectBoolean(review, "human_review_required_before_merge", issues, "/composition/review");
        expectOneOf(review, "merge_gate", new Set(["human_review_required", "checks_required_before_merge"]), issues, "/composition/review");
        const checkSummary = asRecord(review["check_summary"]);
        if (checkSummary === null)
            issues.push(issue("/composition/review/check_summary", "required", "check_summary is required"));
        else {
            expectNonNegativeInteger(checkSummary, "acceptance_total", issues, "/composition/review/check_summary");
            expectNonNegativeInteger(checkSummary, "acceptance_passed", issues, "/composition/review/check_summary");
            const failed = expectNonNegativeInteger(checkSummary, "acceptance_failed", issues, "/composition/review/check_summary");
            if (failed !== null && failed !== 0)
                issues.push(issue("/composition/review/check_summary/acceptance_failed", "acceptance_failed", "ready PR composition cannot carry failed acceptance checks"));
            validateStringArrayField(checkSummary, "changed_paths", issues, "/composition/review/check_summary", true);
            validateStringArrayField(checkSummary, "command_ids", issues, "/composition/review/check_summary", true);
            validateStringArrayField(checkSummary, "artifact_paths", issues, "/composition/review/check_summary", true);
        }
        if (!Array.isArray(review["checks"]) || review["checks"].length === 0)
            issues.push(issue("/composition/review/checks", "non_empty", "checks must be a non-empty array"));
    }
    validateScope(root["scope"], "/composition/scope", issues);
    if (!Array.isArray(root["artifacts"]))
        issues.push(issue("/composition/artifacts", "array", "artifacts must be an array"));
    const gates = asRecord(root["gates"]);
    if (gates === null)
        issues.push(issue("/composition/gates", "required", "gates are required"));
    else {
        expectLiteral(gates, "pr_creation", "requires_github_adapter", issues, "/composition/gates");
        expectLiteral(gates, "audit", "passed", issues, "/composition/gates");
        expectOneOf(gates, "merge", new Set(["human_review_required", "checks_required_before_merge"]), issues, "/composition/gates");
        expectOneOf(gates, "approval_class", APPROVAL_CLASSES, issues, "/composition/gates");
    }
    const guards = asRecord(root["guards"]);
    if (guards === null)
        issues.push(issue("/composition/guards", "required", "guards are required"));
    else
        for (const key of [
            "no_github_mutation",
            "no_pull_request_creation_in_composer",
            "no_merge_operation",
            "no_auto_approval",
            "no_default_branch_write",
            "head_branch_not_default",
            "one_task_one_pr",
            "audit_passed_required",
            "approval_gate_preserved",
            "no_memory_or_evaluation_update",
            "no_network_or_federation_behavior",
        ]) {
            if (guards[key] !== true)
                issues.push(issue(`/composition/guards/${key}`, "literal", `${key} must be true`));
        }
    return { ok: issues.length === 0, issues };
}
export const validatePrComposition = validatePullRequestComposition;
export const validatePRComposition = validatePullRequestComposition;
function extractAuditResult(input) {
    const raw = input?.auditResult ?? input?.auditReport ?? input?.audit;
    const record = asRecord(raw);
    if (record !== null) {
        const report = asRecord(record["report"]);
        if (report !== null && report["schema_ref"] === AUDIT_SCHEMA_REF)
            return report;
    }
    return raw;
}
function validatePlanForComposer(value) {
    const issues = [];
    const root = asRecord(value);
    if (root === null)
        return { ok: false, issues: [issue("/plan", "type", "plan spec must be an object")] };
    expectLiteral(root, "plan_version", 1, issues, "/plan");
    expectLiteral(root, "schema_ref", PLAN_SCHEMA_REF, issues, "/plan");
    expectString(root, "plan_id", issues, "/plan", "forge-plan://");
    expectOneOf(root, "status", new Set(["ready_for_execution", "blocked_for_human"]), issues, "/plan");
    expectRfc3339(root, "created_at", issues, "/plan");
    expectString(root, "title", issues, "/plan");
    expectString(root, "summary", issues, "/plan");
    validateSource(root["source"], "/plan/source", issues, true);
    validateScope(root["scope_contract"], "/plan/scope_contract", issues, true);
    validateRiskAndApproval(root["risk_and_approval"], "/plan/risk_and_approval", issues);
    if (!Array.isArray(root["acceptance_criteria"]) || root["acceptance_criteria"].length === 0)
        issues.push(issue("/plan/acceptance_criteria", "non_empty", "acceptance criteria must be a non-empty array"));
    return { ok: issues.length === 0, issues };
}
function validateWorktreeForComposer(value) {
    const issues = [];
    const root = asRecord(value);
    if (root === null)
        return { ok: false, issues: [issue("/worktreePlan", "type", "branch/worktree manifest must be an object")] };
    expectLiteral(root, "manifest_version", 1, issues, "/worktreePlan");
    expectLiteral(root, "schema_ref", WORKTREE_SCHEMA_REF, issues, "/worktreePlan");
    expectString(root, "manifest_id", issues, "/worktreePlan", "forge-worktree://");
    expectString(root, "plan_id", issues, "/worktreePlan", "forge-plan://");
    validateSource(root["source"], "/worktreePlan/source", issues, true);
    validateBranch(root["branch"], "/worktreePlan/branch", issues);
    validateScope(root["scope"], "/worktreePlan/scope", issues, false);
    return { ok: issues.length === 0, issues };
}
function validateSandboxForComposer(value) {
    const issues = [];
    const root = asRecord(value);
    if (root === null)
        return { ok: false, issues: [issue("/sandboxRequest", "type", "sandbox request must be an object")] };
    expectLiteral(root, "manifest_version", 1, issues, "/sandboxRequest");
    expectLiteral(root, "schema_ref", SANDBOX_SCHEMA_REF, issues, "/sandboxRequest");
    expectString(root, "request_id", issues, "/sandboxRequest", "forge-sandbox://");
    expectString(root, "plan_id", issues, "/sandboxRequest", "forge-plan://");
    expectString(root, "worktree_manifest_id", issues, "/sandboxRequest", "forge-worktree://");
    validateSource(root["source"], "/sandboxRequest/source", issues, true);
    validateBranch(root["branch"], "/sandboxRequest/branch", issues);
    validateScope(root["scope"], "/sandboxRequest/scope", issues, false);
    const isolation = asRecord(root["isolation"]);
    if (isolation === null)
        issues.push(issue("/sandboxRequest/isolation", "required", "isolation is required"));
    else {
        if (isolation["execution_trust"] !== "untrusted")
            issues.push(issue("/sandboxRequest/isolation/execution_trust", "literal", "execution_trust must be untrusted"));
        if (asRecord(isolation["secrets"])?.["mount"] !== false)
            issues.push(issue("/sandboxRequest/isolation/secrets/mount", "literal", "secret mounts must be false"));
    }
    const filesystem = asRecord(root["filesystem"]);
    if (filesystem === null)
        issues.push(issue("/sandboxRequest/filesystem", "required", "filesystem is required"));
    else if (filesystem["artifacts_outside_worktree"] !== true)
        issues.push(issue("/sandboxRequest/filesystem/artifacts_outside_worktree", "literal", "artifacts must remain outside the worktree"));
    if (!Array.isArray(root["commands"]) || root["commands"].length === 0)
        issues.push(issue("/sandboxRequest/commands", "non_empty", "commands must be a non-empty array"));
    if (!Array.isArray(root["artifacts"]) || root["artifacts"].length === 0)
        issues.push(issue("/sandboxRequest/artifacts", "non_empty", "artifacts must be a non-empty array"));
    const guards = asRecord(root["guards"]);
    if (guards === null)
        issues.push(issue("/sandboxRequest/guards", "required", "guards are required"));
    else {
        if (guards["no_default_branch_write"] !== true)
            issues.push(issue("/sandboxRequest/guards/no_default_branch_write", "literal", "no_default_branch_write must be true"));
        if (guards["no_pr_creation"] !== true)
            issues.push(issue("/sandboxRequest/guards/no_pr_creation", "literal", "sandbox request must not create PRs"));
        if (guards["no_secret_mounts"] !== true)
            issues.push(issue("/sandboxRequest/guards/no_secret_mounts", "literal", "no_secret_mounts must be true"));
    }
    return { ok: issues.length === 0, issues };
}
function validateSandboxOutputForComposer(value) {
    const issues = [];
    const root = asRecord(value);
    if (root === null)
        return { ok: false, issues: [issue("/sandboxOutput", "type", "sandbox observed output must be an object")] };
    validateOptionalStringArrayField(root, "command_ids", issues, "/sandboxOutput");
    validateOptionalStringArrayField(root, "changed_paths", issues, "/sandboxOutput");
    if (root["artifacts"] !== undefined && !Array.isArray(root["artifacts"]))
        issues.push(issue("/sandboxOutput/artifacts", "array", "artifacts must be an array when present"));
    return { ok: issues.length === 0, issues };
}
function validateAuditResultForComposer(value) {
    const issues = [];
    const root = asRecord(value);
    if (root === null)
        return { ok: false, issues: [issue("/auditResult", "type", "audit result must be an object")] };
    expectLiteral(root, "manifest_version", 1, issues, "/auditResult");
    expectLiteral(root, "schema_ref", AUDIT_SCHEMA_REF, issues, "/auditResult");
    expectString(root, "audit_id", issues, "/auditResult", "forge-audit://");
    expectRfc3339(root, "created_at", issues, "/auditResult");
    expectOneOf(root, "status", AUDIT_ALLOWED_STATUSES, issues, "/auditResult");
    expectOneOf(root, "decision", AUDIT_DECISIONS, issues, "/auditResult");
    expectString(root, "plan_id", issues, "/auditResult", "forge-plan://");
    expectString(root, "worktree_manifest_id", issues, "/auditResult", "forge-worktree://");
    expectString(root, "sandbox_request_id", issues, "/auditResult", "forge-sandbox://");
    validateScope(root["scope"], "/auditResult/scope", issues, false);
    if (!Array.isArray(root["findings"]))
        issues.push(issue("/auditResult/findings", "array", "findings must be an array"));
    const acceptance = asRecord(root["acceptance"]);
    if (acceptance === null)
        issues.push(issue("/auditResult/acceptance", "required", "acceptance is required"));
    else {
        expectNonNegativeInteger(acceptance, "total", issues, "/auditResult/acceptance");
        expectNonNegativeInteger(acceptance, "passed", issues, "/auditResult/acceptance");
        expectNonNegativeInteger(acceptance, "failed", issues, "/auditResult/acceptance");
        if (!Array.isArray(acceptance["checks"]))
            issues.push(issue("/auditResult/acceptance/checks", "array", "acceptance checks must be an array"));
    }
    const gates = asRecord(root["gates"]);
    if (gates === null)
        issues.push(issue("/auditResult/gates", "required", "gates are required"));
    else if (gates["audit_independent"] !== true)
        issues.push(issue("/auditResult/gates/audit_independent", "literal", "audit_independent must be true"));
    const guards = asRecord(root["guards"]);
    if (guards === null)
        issues.push(issue("/auditResult/guards", "required", "guards are required"));
    else
        for (const key of ["no_pull_request_creation", "no_github_mutation", "no_default_branch_write"]) {
            if (guards[key] !== true)
                issues.push(issue(`/auditResult/guards/${key}`, "literal", `${key} must be true`));
        }
    return { ok: issues.length === 0, issues };
}
function validateInputChain(plan, worktreePlan, sandboxRequest, sandboxOutput, audit) {
    const issues = [];
    const planId = stringValue(plan["plan_id"]);
    const worktreePlanId = stringValue(worktreePlan["plan_id"]);
    const sandboxPlanId = stringValue(sandboxRequest["plan_id"]);
    const auditPlanId = stringValue(audit["plan_id"]);
    const worktreeId = stringValue(worktreePlan["manifest_id"]);
    const sandboxWorktreeId = stringValue(sandboxRequest["worktree_manifest_id"]);
    const auditWorktreeId = stringValue(audit["worktree_manifest_id"]);
    const sandboxId = stringValue(sandboxRequest["request_id"]);
    const auditSandboxId = stringValue(audit["sandbox_request_id"]);
    if (planId !== worktreePlanId || planId !== sandboxPlanId || planId !== auditPlanId)
        issues.push(issue("/chain/plan_id", "mismatch", "plan_id must match across plan, worktree, sandbox request, and audit result"));
    if (worktreeId !== sandboxWorktreeId || worktreeId !== auditWorktreeId)
        issues.push(issue("/chain/worktree_manifest_id", "mismatch", "worktree manifest id must match sandbox request and audit result"));
    if (sandboxId !== auditSandboxId)
        issues.push(issue("/chain/sandbox_request_id", "mismatch", "sandbox request id must match audit result"));
    const worktreeBranch = asRecord(worktreePlan["branch"]);
    const sandboxBranch = asRecord(sandboxRequest["branch"]);
    const head = stringValue(worktreeBranch?.["name"]);
    const sandboxHead = stringValue(sandboxBranch?.["name"]);
    const base = stringValue(worktreeBranch?.["base_ref"]);
    const defaultBranch = stringValue(worktreeBranch?.["default_branch"]);
    if (head !== sandboxHead)
        issues.push(issue("/chain/branch/name", "mismatch", "sandbox request branch must match worktree branch"));
    if (head !== null && defaultBranch !== null && isDefaultBranchTarget(head, defaultBranch))
        issues.push(issue("/chain/branch/name", "default_branch_write", "PR head branch must not target the default branch"));
    if (head !== null && base !== null && isDefaultBranchTarget(head, base))
        issues.push(issue("/chain/branch/name", "default_branch_write", "PR head branch must not equal the PR base branch"));
    if (!sameStringArray(scopeArray(plan, "scope_contract", "mutable_paths"), scopeArray(worktreePlan, "scope", "mutable_paths")) || !sameStringArray(scopeArray(worktreePlan, "scope", "mutable_paths"), scopeArray(sandboxRequest, "scope", "mutable_paths")) || !sameStringArray(scopeArray(sandboxRequest, "scope", "mutable_paths"), scopeArray(audit, "scope", "mutable_paths")))
        issues.push(issue("/chain/scope/mutable_paths", "mismatch", "mutable path scope must match across all inputs"));
    const auditEvidence = asRecord(audit["evidence"]);
    const changedPaths = stringArray(sandboxOutput["changed_paths"]);
    const auditChanged = changedPathsFromAuditEvidence(auditEvidence);
    for (const changedPath of changedPaths) {
        const auditRecord = auditChanged.find((item) => item.path === changedPath);
        if (auditRecord === undefined)
            issues.push(issue("/chain/evidence/changed_paths", "mismatch", `changed path '${changedPath}' is missing from audit evidence`));
        else if (auditRecord.status === "rejected")
            issues.push(issue("/chain/evidence/changed_paths", "rejected_path", `changed path '${changedPath}' was rejected by audit`));
    }
    const observedArtifacts = artifactPathsFromSandboxOutput(sandboxOutput);
    const auditArtifacts = artifactPathsFromAuditEvidence(auditEvidence);
    for (const observed of observedArtifacts)
        if (!auditArtifacts.includes(observed))
            issues.push(issue("/chain/evidence/artifacts", "mismatch", `artifact '${observed}' is missing from audit evidence`));
    return issues;
}
function validatePassedAuditGate(audit) {
    const issues = [];
    if (audit["status"] !== "passed")
        issues.push(issue("/auditResult/status", "audit_not_passed", "PR composition requires audit.status === passed"));
    if (audit["decision"] !== "allow_pr_composition")
        issues.push(issue("/auditResult/decision", "composition_not_allowed", "PR composition requires decision === allow_pr_composition"));
    const gates = asRecord(audit["gates"]);
    if (gates?.["pr_composition"] !== "allowed")
        issues.push(issue("/auditResult/gates/pr_composition", "composition_not_allowed", "audit gate must allow PR composition"));
    const acceptance = asRecord(audit["acceptance"]);
    if (numberValue(acceptance?.["failed"]) !== 0)
        issues.push(issue("/auditResult/acceptance/failed", "acceptance_failed", "PR composition requires zero failed acceptance checks"));
    const findings = arrayValue(audit["findings"]);
    if (findings.some((findingValue) => asRecord(findingValue)?.["severity"] === "error"))
        issues.push(issue("/auditResult/findings", "error_findings", "passed audit cannot carry error findings into PR composition"));
    return issues;
}
function buildComposition(plan, worktreePlan, sandboxRequest, sandboxOutput, audit, input, createdAt) {
    const source = asRecord(plan["source"]);
    const planScope = asRecord(plan["scope_contract"]);
    const branch = asRecord(worktreePlan["branch"]);
    const risk = asRecord(plan["risk_and_approval"]);
    const auditAcceptance = asRecord(audit["acceptance"]);
    const auditEvidence = asRecord(audit["evidence"]);
    const planId = stringValue(plan["plan_id"]) ?? "forge-plan://unknown";
    const worktreeManifestId = stringValue(worktreePlan["manifest_id"]) ?? "forge-worktree://unknown";
    const sandboxRequestId = stringValue(sandboxRequest["request_id"]) ?? "forge-sandbox://unknown";
    const auditId = stringValue(audit["audit_id"]) ?? "forge-audit://unknown";
    const head = stringValue(branch["name"]) ?? "forge/p1/task";
    const base = stringValue(branch["base_ref"]) ?? "main";
    const repository = normalizeOptionalString(input.repository) ?? stringValue(source["repository"]) ?? stringValue(asRecord(worktreePlan["source"])?.["repository"]);
    const humanReviewRequired = booleanValue(risk["human_review_required_before_merge"]) ?? booleanValue(asRecord(audit["risk_summary"])?.["human_review_required_before_merge"]) ?? true;
    const approvalClass = stringValue(risk["approval_class"]) ?? stringValue(asRecord(audit["risk_summary"])?.["approval_class"]) ?? "B";
    const riskLevel = stringValue(risk["risk"]) ?? stringValue(asRecord(audit["risk_summary"])?.["risk"]) ?? "medium";
    const changedPaths = uniqueStrings([...stringArray(sandboxOutput["changed_paths"]), ...changedPathsFromAuditEvidence(auditEvidence).filter((item) => item.status !== "rejected").map((item) => item.path)]);
    const commandIds = stringArray(sandboxOutput["command_ids"]);
    const artifacts = artifactSummariesFromSandboxOutput(sandboxOutput);
    const acceptanceTotal = numberValue(auditAcceptance["total"]) ?? 0;
    const acceptancePassed = numberValue(auditAcceptance["passed"]) ?? acceptanceTotal;
    const acceptanceFailed = numberValue(auditAcceptance["failed"]) ?? 0;
    const mergeGate = humanReviewRequired ? "human_review_required" : "checks_required_before_merge";
    const labels = labelsFor(source, riskLevel, approvalClass, input.labels ?? []);
    const reviewers = normalizeReviewers(input.reviewers ?? []);
    const teamReviewers = normalizeReviewers(input.teamReviewers ?? []);
    const title = titleFor(plan);
    const checkSummary = {
        acceptance_total: acceptanceTotal,
        acceptance_passed: acceptancePassed,
        acceptance_failed: acceptanceFailed,
        changed_paths: changedPaths,
        command_ids: commandIds,
        artifact_paths: artifacts.map((artifact) => artifact.path),
    };
    const checks = checksFor(audit, checkSummary);
    const body = bodyFor({ plan, source, scope: planScope, audit, auditAcceptance, changedPaths, commandIds, artifacts, approvalClass, riskLevel, humanReviewRequired, planId, worktreeManifestId, sandboxRequestId, auditId, head, base });
    const compositionId = `forge-pr://${stableSlug(planId)}-${stableHash(`${auditId}:${head}:${createdAt}`).slice(0, 8)}`;
    return {
        manifest_version: PR_COMPOSER_VERSION,
        schema_ref: PR_COMPOSITION_SCHEMA_REF,
        composition_id: compositionId,
        created_at: createdAt,
        status: "ready_for_github_adapter",
        repository,
        plan_id: planId,
        worktree_manifest_id: worktreeManifestId,
        sandbox_request_id: sandboxRequestId,
        audit_id: auditId,
        source: {
            repository,
            issue_number: integerOrNull(source["issue_number"]),
            candidate_id: stringValue(source["candidate_id"]) ?? "unknown",
            title: stringValue(source["title"]) ?? title,
            url: stringValue(source["url"]),
        },
        pull_request: {
            title,
            head,
            base,
            draft: input.draft ?? true,
            maintainer_can_modify: false,
            body,
            labels,
            reviewers,
            team_reviewers: teamReviewers,
        },
        review: {
            approval_class: approvalClass,
            risk: riskLevel,
            human_review_required_before_merge: humanReviewRequired,
            merge_gate: mergeGate,
            check_summary: checkSummary,
            checks,
        },
        scope: {
            one_task_one_pr: true,
            no_default_branch_write: true,
            mutable_paths: stringArray(planScope["mutable_paths"]),
            immutable_paths: stringArray(planScope["immutable_paths"]),
            out_of_scope: stringArray(planScope["out_of_scope"]),
            max_files_changed: numberValue(planScope["max_files_changed"]) ?? 1,
            max_diff_lines: numberValue(planScope["max_diff_lines"]) ?? 1,
        },
        artifacts,
        provenance: {
            generated_by: "forgeroot-pr-composer.alpha",
            composer_version: "0.0.0-t024",
            plan_id: planId,
            worktree_manifest_id: worktreeManifestId,
            sandbox_request_id: sandboxRequestId,
            audit_id: auditId,
            source_issue: sourceIssueRef(source),
            branch: head,
            base_ref: base,
        },
        gates: {
            pr_creation: "requires_github_adapter",
            merge: mergeGate,
            audit: "passed",
            approval_class: approvalClass,
        },
        guards: {
            no_github_mutation: true,
            no_pull_request_creation_in_composer: true,
            no_merge_operation: true,
            no_auto_approval: true,
            no_default_branch_write: true,
            head_branch_not_default: true,
            one_task_one_pr: true,
            audit_passed_required: true,
            approval_gate_preserved: true,
            no_memory_or_evaluation_update: true,
            no_network_or_federation_behavior: true,
        },
    };
}
function titleFor(plan) {
    const raw = stringValue(plan["title"]) ?? "ForgeRoot task";
    const cleaned = raw.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
    const title = cleaned.startsWith("[ForgeRoot]") ? cleaned : `[ForgeRoot] ${cleaned}`;
    return title.length > MAX_TITLE_LENGTH ? `${title.slice(0, MAX_TITLE_LENGTH - 1).trimEnd()}…` : title;
}
function bodyFor(context) {
    const acceptanceChecks = arrayValue(context.auditAcceptance["checks"])
        .map((check) => asRecord(check))
        .filter((check) => check !== null)
        .map((check) => `${stringValue(check["id"]) ?? "criterion"}: ${stringValue(check["status"]) ?? "unknown"} — ${stringValue(check["description"]) ?? stringValue(check["reason"]) ?? "machine-checkable criterion"}`);
    const lines = [
        "## ForgeRoot PR composition",
        "",
        `This is a deterministic PR composition manifest for one ForgeRoot task. The composer prepared this body only; it did not call GitHub, create a pull request, approve, merge, or mutate the repository.`,
        "",
        "### Source",
        `- Source issue: ${sourceIssueRef(context.source) ?? "not declared"}`,
        `- Candidate: ${stringValue(context.source["candidate_id"]) ?? "unknown"}`,
        `- Title: ${stringValue(context.source["title"]) ?? stringValue(context.plan["title"]) ?? "unknown"}`,
        "",
        "### Scope",
        `- One task / one PR: true`,
        `- Mutable paths: ${inlineList(stringArray(context.scope["mutable_paths"]))}`,
        `- Immutable paths: ${inlineList(stringArray(context.scope["immutable_paths"]))}`,
        `- Out of scope: ${inlineList(stringArray(context.scope["out_of_scope"]))}`,
        `- Diff budget: ${numberValue(context.scope["max_files_changed"]) ?? "unknown"} files / ${numberValue(context.scope["max_diff_lines"]) ?? "unknown"} lines`,
        "",
        "### Audit gate",
        `- Audit result: passed`,
        `- Audit ID: ${context.auditId}`,
        `- PR composition gate: allowed`,
        `- Acceptance: ${numberValue(context.auditAcceptance["passed"]) ?? 0}/${numberValue(context.auditAcceptance["total"]) ?? 0} passed, ${numberValue(context.auditAcceptance["failed"]) ?? 0} failed`,
        "",
        "### Review gate",
        `- Approval class: ${context.approvalClass}`,
        `- Risk: ${context.riskLevel}`,
        `- Human review before merge: ${context.humanReviewRequired}`,
        "",
        "### Changed paths",
        ...markdownList(context.changedPaths),
        "",
        "### Acceptance criteria",
        ...markdownList(acceptanceChecks.length > 0 ? acceptanceChecks : ["all machine-checkable acceptance criteria passed"]),
        "",
        "### Sandbox evidence",
        `- Command IDs: ${inlineList(context.commandIds)}`,
        `- Artifacts: ${inlineList(context.artifacts.map((artifact) => artifact.path))}`,
        "",
        "### Provenance",
        `- Plan: ${context.planId}`,
        `- Worktree manifest: ${context.worktreeManifestId}`,
        `- Sandbox request: ${context.sandboxRequestId}`,
        `- Audit result: ${context.auditId}`,
        `- Head branch: ${context.head}`,
        `- Base branch: ${context.base}`,
        "",
        "### Safety gates preserved",
        "- No default-branch write",
        "- No GitHub mutation by composer",
        "- No merge operation",
        "- No auto-approval",
        "- No memory/evaluation update",
        "- No network/federation behavior",
    ];
    const body = lines.join("\n").slice(0, MAX_BODY_LENGTH);
    return body.endsWith("\n") ? body : `${body}\n`;
}
function checksFor(audit, summary) {
    return [
        {
            name: "ForgeRoot audit gate",
            status: "passed",
            summary: `Audit ${stringValue(audit["audit_id"]) ?? "unknown"} allowed PR composition.`,
            details: ["audit.status=passed", "audit.decision=allow_pr_composition", "gates.pr_composition=allowed"],
        },
        {
            name: "ForgeRoot acceptance criteria",
            status: "passed",
            summary: `${summary.acceptance_passed}/${summary.acceptance_total} machine-checkable criteria passed.`,
            details: [`failed=${summary.acceptance_failed}`, `changed_paths=${summary.changed_paths.length}`, `artifacts=${summary.artifact_paths.length}`],
        },
    ];
}
function labelsFor(source, risk, approvalClass, extra) {
    const sourceLabels = stringArray(source["labels"]);
    return uniqueStrings([...sourceLabels, ...extra, "forge:generated", "forge:pr-composed", `risk:${risk}`, `class:${approvalClass}`])
        .map(normalizeLabel)
        .filter((label) => label !== null);
}
function normalizeLabel(value) {
    const label = value.replace(/[\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH)
        return null;
    return label;
}
function normalizeReviewers(values) {
    return uniqueStrings(values.map((value) => value.replace(/^@/, "").trim()).filter((value) => /^[A-Za-z0-9_.-]+$/.test(value)));
}
function artifactSummariesFromSandboxOutput(output) {
    return arrayValue(output["artifacts"])
        .map((value) => asRecord(value))
        .filter((value) => value !== null)
        .map((artifact) => ({
        path: stringValue(artifact["path"]) ?? "unknown",
        media_type: stringValue(artifact["media_type"]),
        bytes: numberValue(artifact["bytes"]),
        sha256: stringValue(artifact["sha256"]),
    }));
}
function artifactPathsFromSandboxOutput(output) {
    return artifactSummariesFromSandboxOutput(output).map((artifact) => artifact.path);
}
function artifactPathsFromAuditEvidence(evidence) {
    if (evidence === null)
        return [];
    return arrayValue(evidence["artifacts"])
        .map((value) => asRecord(value))
        .filter((value) => value !== null)
        .map((artifact) => stringValue(artifact["path"]))
        .filter((path) => path !== null);
}
function changedPathsFromAuditEvidence(evidence) {
    if (evidence === null)
        return [];
    return arrayValue(evidence["changed_paths"])
        .map((value) => asRecord(value))
        .filter((value) => value !== null)
        .map((value) => ({ path: stringValue(value["path"]) ?? "", status: stringValue(value["status"]) ?? "accepted" }))
        .filter((value) => value.path.length > 0);
}
function sourceIssueRef(source) {
    const url = stringValue(source["url"]);
    if (url !== null)
        return url;
    const repository = stringValue(source["repository"]);
    const number = integerOrNull(source["issue_number"]);
    if (repository !== null && number !== null)
        return `${repository}#${number}`;
    return null;
}
function validateSource(value, path, issues, required) {
    const root = asRecord(value);
    if (root === null) {
        if (required)
            issues.push(issue(path, "required", "source is required"));
        return;
    }
    expectStringOrNull(root, "repository", issues, path);
    expectIntegerOrNull(root, "issue_number", issues, path);
    expectString(root, "candidate_id", issues, path);
    expectString(root, "title", issues, path);
}
function validateBranch(value, path, issues) {
    const root = asRecord(value);
    if (root === null) {
        issues.push(issue(path, "required", "branch is required"));
        return;
    }
    const name = expectString(root, "name", issues, path, "forge/");
    const base = expectString(root, "base_ref", issues, path);
    const def = expectString(root, "default_branch", issues, path);
    if (name !== null && !isSafeRef(name))
        issues.push(issue(`${path}/name`, "safe_ref", "branch name contains unsafe syntax"));
    if (base !== null && !isSafeRef(base))
        issues.push(issue(`${path}/base_ref`, "safe_ref", "base ref contains unsafe syntax"));
    if (name !== null && def !== null && isDefaultBranchTarget(name, def))
        issues.push(issue(`${path}/name`, "default_branch_write", "branch name must not target default branch"));
}
function validateScope(value, path, issues, requireSourceIssueCount = false) {
    const root = asRecord(value);
    if (root === null) {
        issues.push(issue(path, "required", "scope is required"));
        return;
    }
    expectLiteral(root, "one_task_one_pr", true, issues, path);
    if (requireSourceIssueCount)
        expectLiteral(root, "source_issue_count", 1, issues, path);
    expectLiteral(root, "no_default_branch_write", true, issues, path);
    validateStringArrayField(root, "mutable_paths", issues, path, false);
    validateStringArrayField(root, "immutable_paths", issues, path, false);
    validateStringArrayField(root, "out_of_scope", issues, path, false);
    expectPositiveInteger(root, "max_files_changed", issues, path, 50);
    expectPositiveInteger(root, "max_diff_lines", issues, path, 2000);
}
function validateRiskAndApproval(value, path, issues) {
    const root = asRecord(value);
    if (root === null) {
        issues.push(issue(path, "required", "risk_and_approval is required"));
        return;
    }
    expectOneOf(root, "risk", RISKS, issues, path);
    expectOneOf(root, "approval_class", APPROVAL_CLASSES, issues, path);
    expectBoolean(root, "human_review_required_before_merge", issues, path);
    expectBoolean(root, "human_review_required_before_execution", issues, path);
}
function expectLiteral(record, key, expected, issues, path) {
    if (record[key] !== expected)
        issues.push(issue(`${path}/${key}`, "literal", `${key} must be ${JSON.stringify(expected)}`));
}
function expectString(record, key, issues, path, prefix) {
    const value = record[key];
    if (typeof value !== "string" || value.trim().length === 0) {
        issues.push(issue(`${path}/${key}`, "string", `${key} must be a non-empty string`));
        return null;
    }
    if (prefix !== undefined && !value.startsWith(prefix))
        issues.push(issue(`${path}/${key}`, "prefix", `${key} must start with '${prefix}'`));
    return value;
}
function expectStringOrNull(record, key, issues, path) {
    const value = record[key];
    if (!(typeof value === "string" || value === null))
        issues.push(issue(`${path}/${key}`, "string_or_null", `${key} must be a string or null`));
}
function expectIntegerOrNull(record, key, issues, path) {
    const value = record[key];
    if (!(Number.isSafeInteger(value) || value === null))
        issues.push(issue(`${path}/${key}`, "integer_or_null", `${key} must be an integer or null`));
}
function expectBoolean(record, key, issues, path) {
    const value = record[key];
    if (typeof value !== "boolean") {
        issues.push(issue(`${path}/${key}`, "boolean", `${key} must be boolean`));
        return null;
    }
    return value;
}
function expectOneOf(record, key, allowed, issues, path) {
    const value = record[key];
    if (typeof value !== "string" || !allowed.has(value)) {
        issues.push(issue(`${path}/${key}`, "enum", `${key} is not allowed`));
        return null;
    }
    return value;
}
function expectRfc3339(record, key, issues, path) {
    const value = expectString(record, key, issues, path);
    if (value !== null && !RFC3339_UTC.test(value))
        issues.push(issue(`${path}/${key}`, "rfc3339", `${key} must be an RFC3339 UTC timestamp`));
}
function expectPositiveInteger(record, key, issues, path, max) {
    const value = record[key];
    if (!Number.isSafeInteger(value) || value <= 0) {
        issues.push(issue(`${path}/${key}`, "positive_integer", `${key} must be a positive integer`));
        return null;
    }
    if (value > max)
        issues.push(issue(`${path}/${key}`, "max", `${key} must be <= ${max}`));
    return value;
}
function expectNonNegativeInteger(record, key, issues, path) {
    const value = record[key];
    if (!Number.isSafeInteger(value) || value < 0) {
        issues.push(issue(`${path}/${key}`, "non_negative_integer", `${key} must be a non-negative integer`));
        return null;
    }
    return value;
}
function validateStringArrayField(record, key, issues, path, allowEmpty) {
    const values = stringArray(record[key]);
    if (!Array.isArray(record[key]) || values.length !== record[key].length)
        issues.push(issue(`${path}/${key}`, "string_array", `${key} must be an array of strings`));
    if (!allowEmpty && values.length === 0)
        issues.push(issue(`${path}/${key}`, "non_empty", `${key} must not be empty`));
    return values;
}
function validateOptionalStringArrayField(record, key, issues, path) {
    if (record[key] === undefined)
        return [];
    return validateStringArrayField(record, key, issues, path, true);
}
function issue(path, code, message) { return { path, code, message }; }
function formatIssue(item) { return `${item.path}:${item.code}:${item.message}`; }
function invalidResult(reasons, auditTrail, issues) { return { status: "invalid", reasons: uniqueStrings(reasons), auditTrail: [...auditTrail, "composition:none"], ...(issues === undefined ? {} : { issues }) }; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function arrayValue(value) { return Array.isArray(value) ? value : []; }
function stringValue(value) { return typeof value === "string" && value.length > 0 ? value : null; }
function normalizeOptionalString(value) { return typeof value === "string" && value.trim().length > 0 ? value.trim() : null; }
function booleanValue(value) { return typeof value === "boolean" ? value : null; }
function numberValue(value) { return Number.isSafeInteger(value) ? value : null; }
function integerOrNull(value) { return Number.isSafeInteger(value) ? value : null; }
function stringArray(value) { return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.length > 0) : []; }
function scopeArray(root, scopeKey, arrayKey) { const scope = asRecord(root[scopeKey]); return scope === null ? [] : stringArray(scope[arrayKey]); }
function sameStringArray(a, b) { return a.length === b.length && a.every((value, index) => value === b[index]); }
function uniqueStrings(values) { return [...new Set(values.filter((value) => typeof value === "string" && value.length > 0))]; }
function resolveTimestamp(candidate, fallback) { if (candidate !== undefined)
    return RFC3339_UTC.test(candidate) ? candidate : null; if (fallback !== null && RFC3339_UTC.test(fallback))
    return fallback; return null; }
function isSafeRef(value) { return /^[A-Za-z0-9._/-]+$/.test(value) && !value.includes("..") && !value.endsWith(".lock") && !value.startsWith("/") && !value.endsWith("/"); }
function isDefaultBranchTarget(branch, defaultBranch) { const b = branch.toLowerCase().replace(/^refs\/heads\//, ""); const d = defaultBranch.toLowerCase().replace(/^refs\/heads\//, ""); return b === d || b === "main" || b === "master" || b === "trunk"; }
function inlineList(values) { return values.length === 0 ? "none" : values.join(", "); }
function markdownList(values) { return values.length === 0 ? ["- none"] : values.map((value) => `- ${value}`); }
function stableSlug(value) { const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96); return slug || "task"; }
function stableHash(value) { let hash = 0x811c9dc5; for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
} return hash.toString(16).padStart(8, "0"); }
//# sourceMappingURL=run.js.map