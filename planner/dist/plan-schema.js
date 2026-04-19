export const PLAN_SPEC_VERSION = 1;
export const PLAN_SPEC_SCHEMA_REF = "urn:forgeroot:plan-spec:v1";
const APPROVAL_ORDER = { A: 0, B: 1, C: 2, D: 3 };
const RISK_ORDER = { low: 0, medium: 1, high: 2, critical: 3 };
const ACCEPTANCE_CHECK_KINDS = new Set([
    "command",
    "path_changed",
    "path_not_changed",
    "forbidden_paths_unchanged",
    "diff_budget",
    "text_contains",
    "plan_field_equals",
]);
const ACCEPTANCE_EVIDENCE = new Set(["diff", "command_output", "metadata", "file_content"]);
const PLAN_STEP_KINDS = new Set(["inspect", "edit", "diagnose", "test", "audit", "document", "dependency"]);
const PLAN_STATUSES = new Set(["draft", "ready_for_execution", "blocked_for_human", "superseded"]);
const GOVERNANCE_FORBIDDEN_PATHS = [".github/workflows/**", ".forge/policies/**", ".forge/network/**"];
export function createPlanSpecFromTaskCandidate(task, options = {}) {
    const profile = profileForCategory(task.category, task.plannerHints.mutablePathHints, task.plannerHints.forbiddenPathHints);
    const maxFilesChanged = options.maxFilesChanged ?? profile.maxFilesChanged;
    const maxDiffLines = options.maxDiffLines ?? profile.maxDiffLines;
    const approval = approvalLinkFor(task.approvalClass, task.risk, task.plannerHints.requiresHumanReviewBeforePlanning);
    const mutablePaths = uniqueStrings(profile.mutablePaths);
    const immutablePaths = uniqueStrings([...GOVERNANCE_FORBIDDEN_PATHS, ...task.plannerHints.forbiddenPathHints]);
    const createdAt = options.createdAt ?? new Date().toISOString();
    const planIdPrefix = options.planIdPrefix ?? "forge-plan";
    const planId = `${planIdPrefix}://${sanitizeIdentifier(task.candidateId)}`;
    const branchNamingHint = `forge/p1/${slugForTitle(task.title)}`;
    return {
        plan_version: PLAN_SPEC_VERSION,
        schema_ref: PLAN_SPEC_SCHEMA_REF,
        plan_id: planId,
        status: approval.escalation_required ? "blocked_for_human" : "ready_for_execution",
        created_at: createdAt,
        source: {
            kind: task.sourceKind,
            source_key: task.sourceKey,
            candidate_id: task.candidateId,
            repository: task.repositoryFullName,
            issue_number: task.number,
            url: task.url,
            title: task.title,
            labels: [...task.labels],
        },
        title: task.title,
        goal: `Resolve exactly one ${task.category} task: ${task.title}`,
        summary: task.summary,
        category: task.category,
        scope_contract: {
            one_task_one_pr: true,
            source_issue_count: 1,
            no_default_branch_write: true,
            mutable_paths: mutablePaths,
            immutable_paths: immutablePaths,
            out_of_scope: outOfScopeFor(task.category),
            max_files_changed: maxFilesChanged,
            max_diff_lines: maxDiffLines,
            branch_naming_hint: branchNamingHint,
        },
        risk_and_approval: approval,
        acceptance_criteria: acceptanceCriteriaFor(task.category, mutablePaths, immutablePaths, maxFilesChanged, maxDiffLines),
        execution_steps: executionStepsFor(task.category, mutablePaths),
        audit: {
            required_evidence: ["diff", "metadata", "command_output"],
            independent_audit_required: true,
        },
        extensions: {},
    };
}
export function validatePlanSpec(plan) {
    const issues = [];
    const root = asRecord(plan);
    if (root === null)
        return fail("", "type", "plan spec must be an object");
    expectLiteral(root, "plan_version", PLAN_SPEC_VERSION, issues);
    expectLiteral(root, "schema_ref", PLAN_SPEC_SCHEMA_REF, issues);
    expectString(root, "plan_id", issues, { prefix: "forge-plan://" });
    expectOneOf(root, "status", PLAN_STATUSES, issues);
    expectRfc3339ish(root, "created_at", issues);
    expectString(root, "title", issues);
    expectString(root, "goal", issues);
    expectString(root, "summary", issues);
    const source = asRecord(root["source"]);
    if (source === null) {
        issues.push(issue("/source", "required", "source must be an object"));
    }
    else {
        expectString(source, "kind", issues, { pathPrefix: "/source" });
        expectString(source, "source_key", issues, { pathPrefix: "/source" });
        expectString(source, "candidate_id", issues, { pathPrefix: "/source" });
        expectNumberOrNull(source, "issue_number", issues, { pathPrefix: "/source" });
        expectStringOrNull(source, "repository", issues, { pathPrefix: "/source" });
        expectStringOrNull(source, "url", issues, { pathPrefix: "/source" });
        expectString(source, "title", issues, { pathPrefix: "/source" });
        expectStringArray(source, "labels", issues, { pathPrefix: "/source", allowEmpty: true });
    }
    const scope = asRecord(root["scope_contract"]);
    if (scope === null) {
        issues.push(issue("/scope_contract", "required", "scope_contract must be an object"));
    }
    else {
        expectLiteral(scope, "one_task_one_pr", true, issues, "/scope_contract");
        expectLiteral(scope, "source_issue_count", 1, issues, "/scope_contract");
        expectLiteral(scope, "no_default_branch_write", true, issues, "/scope_contract");
        const mutablePaths = expectStringArray(scope, "mutable_paths", issues, { pathPrefix: "/scope_contract" });
        const immutablePaths = expectStringArray(scope, "immutable_paths", issues, { pathPrefix: "/scope_contract" });
        expectStringArray(scope, "out_of_scope", issues, { pathPrefix: "/scope_contract" });
        expectPositiveInteger(scope, "max_files_changed", issues, { pathPrefix: "/scope_contract", max: 50 });
        expectPositiveInteger(scope, "max_diff_lines", issues, { pathPrefix: "/scope_contract", max: 2000 });
        expectString(scope, "branch_naming_hint", issues, { pathPrefix: "/scope_contract", prefix: "forge/" });
        if (mutablePaths.length === 0)
            issues.push(issue("/scope_contract/mutable_paths", "non_empty", "mutable_paths must name at least one bounded path glob"));
        if (immutablePaths.length === 0)
            issues.push(issue("/scope_contract/immutable_paths", "non_empty", "immutable_paths must name at least one forbidden path glob"));
        for (const path of mutablePaths) {
            if (isDefaultBranchWriteHint(path))
                issues.push(issue("/scope_contract/mutable_paths", "default_branch", `mutable path '${path}' looks like a default-branch write target`));
            for (const immutable of immutablePaths) {
                if (pathIntersects(path, immutable))
                    issues.push(issue("/scope_contract/mutable_paths", "immutable_overlap", `mutable path '${path}' overlaps immutable path '${immutable}'`));
            }
        }
    }
    const risk = asRecord(root["risk_and_approval"]);
    if (risk === null) {
        issues.push(issue("/risk_and_approval", "required", "risk_and_approval must be an object"));
    }
    else {
        const riskLevel = expectOneOf(risk, "risk", new Set(["low", "medium", "high", "critical"]), issues, "/risk_and_approval");
        const approvalClass = expectOneOf(risk, "approval_class", new Set(["A", "B", "C", "D"]), issues, "/risk_and_approval");
        expectBoolean(risk, "human_review_required_before_execution", issues, "/risk_and_approval");
        expectBoolean(risk, "human_review_required_before_merge", issues, "/risk_and_approval");
        expectBoolean(risk, "escalation_required", issues, "/risk_and_approval");
        expectStringArray(risk, "reasons", issues, { pathPrefix: "/risk_and_approval", allowEmpty: false });
        if (riskLevel !== null && approvalClass !== null) {
            const escalationRequired = risk["escalation_required"];
            const humanBeforeExecution = risk["human_review_required_before_execution"];
            if ((RISK_ORDER[riskLevel] >= RISK_ORDER.high || APPROVAL_ORDER[approvalClass] >= APPROVAL_ORDER.C) && escalationRequired !== true) {
                issues.push(issue("/risk_and_approval/escalation_required", "approval_link", "high-risk or Class C/D plans must set escalation_required=true"));
            }
            if (APPROVAL_ORDER[approvalClass] >= APPROVAL_ORDER.C && humanBeforeExecution !== true) {
                issues.push(issue("/risk_and_approval/human_review_required_before_execution", "approval_link", "Class C/D plans must require human review before execution"));
            }
        }
    }
    validateAcceptanceCriteria(root["acceptance_criteria"], issues);
    validateExecutionSteps(root["execution_steps"], issues, stringArrayFromScope(root, "mutable_paths"));
    const audit = asRecord(root["audit"]);
    if (audit === null) {
        issues.push(issue("/audit", "required", "audit must be an object"));
    }
    else {
        expectStringArray(audit, "required_evidence", issues, { pathPrefix: "/audit" });
        expectBoolean(audit, "independent_audit_required", issues, "/audit");
    }
    const extensions = asRecord(root["extensions"]);
    if (extensions === null)
        issues.push(issue("/extensions", "required", "extensions must be an object"));
    return { ok: issues.length === 0, issues };
}
export function assertValidPlanSpec(plan) {
    const result = validatePlanSpec(plan);
    if (!result.ok) {
        const message = result.issues.map((item) => `${item.path} ${item.code}: ${item.message}`).join("; ");
        throw new Error(`invalid ForgeRoot plan spec: ${message}`);
    }
}
function validateAcceptanceCriteria(value, issues) {
    if (!Array.isArray(value)) {
        issues.push(issue("/acceptance_criteria", "required", "acceptance_criteria must be an array"));
        return;
    }
    if (value.length === 0)
        issues.push(issue("/acceptance_criteria", "non_empty", "acceptance_criteria must contain at least one criterion"));
    const seenIds = new Set();
    value.forEach((criterion, index) => {
        const path = `/acceptance_criteria/${index}`;
        const record = asRecord(criterion);
        if (record === null) {
            issues.push(issue(path, "type", "criterion must be an object"));
            return;
        }
        const id = expectString(record, "id", issues, { pathPrefix: path });
        if (id !== null) {
            if (seenIds.has(id))
                issues.push(issue(`${path}/id`, "duplicate", `duplicate criterion id '${id}'`));
            seenIds.add(id);
        }
        expectString(record, "description", issues, { pathPrefix: path });
        expectLiteral(record, "required", true, issues, path);
        expectOneOf(record, "evidence", ACCEPTANCE_EVIDENCE, issues, path);
        const check = asRecord(record["check"]);
        if (check === null) {
            issues.push(issue(`${path}/check`, "required", "criterion check must be an object"));
            return;
        }
        const kind = expectOneOf(check, "kind", ACCEPTANCE_CHECK_KINDS, issues, `${path}/check`);
        expectLiteral(check, "machine", true, issues, `${path}/check`);
        validateCheckShape(check, kind, `${path}/check`, issues);
    });
}
function validateCheckShape(check, kind, path, issues) {
    if (kind === null)
        return;
    if (kind === "command") {
        expectString(check, "command", issues, { pathPrefix: path });
        expectPositiveInteger(check, "expected_exit_code", issues, { pathPrefix: path, allowZero: true, max: 255 });
    }
    if (kind === "path_changed" || kind === "path_not_changed" || kind === "forbidden_paths_unchanged") {
        expectStringArray(check, "paths", issues, { pathPrefix: path });
    }
    if (kind === "diff_budget") {
        expectPositiveInteger(check, "max_files_changed", issues, { pathPrefix: path, max: 50 });
        expectPositiveInteger(check, "max_diff_lines", issues, { pathPrefix: path, max: 2000 });
    }
    if (kind === "text_contains") {
        expectStringArray(check, "paths", issues, { pathPrefix: path });
        expectString(check, "needle", issues, { pathPrefix: path });
    }
    if (kind === "plan_field_equals") {
        expectString(check, "field", issues, { pathPrefix: path });
        if (!("expected" in check))
            issues.push(issue(`${path}/expected`, "required", "plan_field_equals requires expected"));
    }
}
function validateExecutionSteps(value, issues, mutablePaths) {
    if (!Array.isArray(value)) {
        issues.push(issue("/execution_steps", "required", "execution_steps must be an array"));
        return;
    }
    if (value.length === 0)
        issues.push(issue("/execution_steps", "non_empty", "execution_steps must contain at least one step"));
    if (value.length > 8)
        issues.push(issue("/execution_steps", "too_many", "execution_steps must stay small enough for one reviewable PR"));
    const seenIds = new Set();
    value.forEach((step, index) => {
        const path = `/execution_steps/${index}`;
        const record = asRecord(step);
        if (record === null) {
            issues.push(issue(path, "type", "execution step must be an object"));
            return;
        }
        const id = expectString(record, "id", issues, { pathPrefix: path });
        if (id !== null) {
            if (seenIds.has(id))
                issues.push(issue(`${path}/id`, "duplicate", `duplicate execution step id '${id}'`));
            seenIds.add(id);
        }
        expectOneOf(record, "kind", PLAN_STEP_KINDS, issues, path);
        expectString(record, "description", issues, { pathPrefix: path });
        const allowedPaths = expectStringArray(record, "allowed_paths", issues, { pathPrefix: path });
        expectStringArray(record, "produces", issues, { pathPrefix: path, allowEmpty: true });
        for (const allowedPath of allowedPaths) {
            if (!isAllowedByAny(allowedPath, mutablePaths)) {
                issues.push(issue(`${path}/allowed_paths`, "scope_escape", `allowed path '${allowedPath}' is not covered by scope_contract.mutable_paths`));
            }
        }
    });
}
function acceptanceCriteriaFor(category, mutablePaths, immutablePaths, maxFilesChanged, maxDiffLines) {
    const criteria = [
        {
            id: "AC-001",
            description: "The diff stays within the Plan Spec file and line budget.",
            required: true,
            evidence: "diff",
            check: { kind: "diff_budget", machine: true, max_files_changed: maxFilesChanged, max_diff_lines: maxDiffLines },
        },
        {
            id: "AC-002",
            description: "Immutable governance paths remain unchanged.",
            required: true,
            evidence: "diff",
            check: { kind: "forbidden_paths_unchanged", machine: true, paths: immutablePaths },
        },
        {
            id: "AC-003",
            description: "The final diff changes at least one declared mutable path.",
            required: true,
            evidence: "diff",
            check: { kind: "path_changed", machine: true, paths: mutablePaths },
        },
    ];
    if (category === "docs") {
        criteria.push({ id: "AC-004", description: "Markdown or documentation files are the only expected changed content paths.", required: true, evidence: "diff", check: { kind: "path_changed", machine: true, paths: mutablePaths } });
    }
    else if (category === "test") {
        criteria.push({ id: "AC-004", description: "The relevant test command exits successfully after the change.", required: true, evidence: "command_output", check: { kind: "command", machine: true, command: "npm test -- --runInBand", expected_exit_code: 0 } });
    }
    else if (category === "dependency") {
        criteria.push({ id: "AC-004", description: "The dependency manifest or lockfile diff is present and bounded to this task.", required: true, evidence: "diff", check: { kind: "path_changed", machine: true, paths: mutablePaths } });
    }
    else {
        criteria.push({ id: "AC-004", description: "The repository test command exits successfully after the change.", required: true, evidence: "command_output", check: { kind: "command", machine: true, command: "npm test", expected_exit_code: 0 } });
    }
    return criteria;
}
function executionStepsFor(category, mutablePaths) {
    const inspect = { id: "STEP-001", kind: "inspect", description: "Inspect the source issue and the smallest relevant repository context before editing.", allowed_paths: mutablePaths, produces: ["context_digest"] };
    const editKind = category === "dependency" ? "dependency" : category === "ci" ? "diagnose" : category === "docs" ? "document" : "edit";
    const edit = { id: "STEP-002", kind: editKind, description: "Apply the smallest change that satisfies the single source task and declared scope contract.", allowed_paths: mutablePaths, produces: ["patch"] };
    const test = { id: "STEP-003", kind: "test", description: "Run the declared machine checks and capture their outputs as audit evidence.", allowed_paths: mutablePaths, produces: ["check_output"] };
    const audit = { id: "STEP-004", kind: "audit", description: "Verify acceptance criteria, immutable path protection, and one-task-one-PR boundaries before PR composition.", allowed_paths: mutablePaths, produces: ["audit_summary"] };
    return [inspect, edit, test, audit];
}
function profileForCategory(category, hintedMutablePaths, hintedForbiddenPaths) {
    const fallback = fallbackMutablePaths(category);
    return {
        mutablePaths: hintedMutablePaths.length > 0 ? hintedMutablePaths : fallback,
        forbiddenPaths: hintedForbiddenPaths.length > 0 ? hintedForbiddenPaths : GOVERNANCE_FORBIDDEN_PATHS,
        maxFilesChanged: category === "docs" ? 6 : category === "dependency" ? 4 : 12,
        maxDiffLines: category === "docs" ? 250 : category === "dependency" ? 600 : 900,
    };
}
function fallbackMutablePaths(category) {
    switch (category) {
        case "docs": return ["README.md", "docs/**", "*.md"];
        case "test": return ["tests/**", "**/*.test.*", "docs/specs/fixtures/**"];
        case "dependency": return ["package.json", "pnpm-lock.yaml", "package-lock.json", "Cargo.toml", "Cargo.lock"];
        case "bug":
        case "ci":
        case "feature":
        case "chore": return ["src/**", "tests/**", "docs/**", "packages/**", "apps/**", "crates/**"];
        case "security":
        case "workflow":
        case "policy":
        case "question":
        case "network_offer":
        case "operator_command":
        case "unknown": return [];
    }
}
function outOfScopeFor(category) {
    const base = [
        "any second issue or unrelated feature request",
        "direct writes to the default branch",
        "workflow, permission, policy, network, or treaty changes",
        "large refactors not required by the source issue",
    ];
    if (category === "docs")
        return [...base, "runtime behavior changes", "test framework changes"];
    if (category === "test")
        return [...base, "production behavior changes unless required for compiling the test"];
    if (category === "dependency")
        return [...base, "multiple unrelated dependency families"];
    if (category === "ci")
        return [...base, "workflow YAML edits without separate Class C/D approval"];
    return base;
}
function approvalLinkFor(approvalClass, risk, requiresHumanReviewBeforePlanning) {
    const elevated = APPROVAL_ORDER[approvalClass] >= APPROVAL_ORDER.C || RISK_ORDER[risk] >= RISK_ORDER.high || requiresHumanReviewBeforePlanning;
    return {
        risk,
        approval_class: approvalClass,
        human_review_required_before_execution: elevated,
        human_review_required_before_merge: APPROVAL_ORDER[approvalClass] >= APPROVAL_ORDER.B,
        escalation_required: elevated,
        reasons: [
            `risk:${risk}`,
            `approval_class:${approvalClass}`,
            elevated ? "elevated_review_before_execution" : "automatic_planning_allowed",
        ],
    };
}
function expectLiteral(record, key, expected, issues, pathPrefix = "") {
    const value = record[key];
    if (value !== expected) {
        issues.push(issue(`${pathPrefix}/${key}`, "literal", `${key} must equal ${JSON.stringify(expected)}`));
        return null;
    }
    return expected;
}
function expectString(record, key, issues, options = {}) {
    const value = record[key];
    const path = `${options.pathPrefix ?? ""}/${key}`;
    if (typeof value !== "string" || value.trim().length === 0) {
        issues.push(issue(path, "string", `${key} must be a non-empty string`));
        return null;
    }
    if (options.prefix !== undefined && !value.startsWith(options.prefix)) {
        issues.push(issue(path, "prefix", `${key} must start with '${options.prefix}'`));
        return null;
    }
    return value;
}
function expectStringOrNull(record, key, issues, options = {}) {
    const value = record[key];
    if (value === null)
        return null;
    return expectString(record, key, issues, options);
}
function expectNumberOrNull(record, key, issues, options = {}) {
    const value = record[key];
    const path = `${options.pathPrefix ?? ""}/${key}`;
    if (value === null)
        return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        issues.push(issue(path, "integer_or_null", `${key} must be an integer or null`));
        return null;
    }
    return value;
}
function expectBoolean(record, key, issues, pathPrefix = "") {
    const value = record[key];
    if (typeof value !== "boolean") {
        issues.push(issue(`${pathPrefix}/${key}`, "boolean", `${key} must be boolean`));
        return null;
    }
    return value;
}
function expectOneOf(record, key, allowed, issues, pathPrefix = "") {
    const value = record[key];
    if (typeof value !== "string" || !allowed.has(value)) {
        issues.push(issue(`${pathPrefix}/${key}`, "enum", `${key} must be one of ${[...allowed].join(", ")}`));
        return null;
    }
    return value;
}
function expectStringArray(record, key, issues, options = {}) {
    const value = record[key];
    const path = `${options.pathPrefix ?? ""}/${key}`;
    if (!Array.isArray(value)) {
        issues.push(issue(path, "array", `${key} must be an array of strings`));
        return [];
    }
    const result = [];
    value.forEach((item, index) => {
        if (typeof item !== "string" || item.trim().length === 0) {
            issues.push(issue(`${path}/${index}`, "string", `${key}[${index}] must be a non-empty string`));
        }
        else {
            result.push(item);
        }
    });
    if (result.length === 0 && options.allowEmpty !== true)
        issues.push(issue(path, "non_empty", `${key} must not be empty`));
    return result;
}
function expectPositiveInteger(record, key, issues, options = {}) {
    const value = record[key];
    const path = `${options.pathPrefix ?? ""}/${key}`;
    const min = options.allowZero === true ? 0 : 1;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min) {
        issues.push(issue(path, "positive_integer", `${key} must be an integer >= ${min}`));
        return null;
    }
    if (options.max !== undefined && value > options.max)
        issues.push(issue(path, "max", `${key} must be <= ${options.max}`));
    return value;
}
function expectRfc3339ish(record, key, issues) {
    const value = expectString(record, key, issues);
    if (value !== null && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) {
        issues.push(issue(`/${key}`, "rfc3339", `${key} must be an RFC3339 UTC timestamp`));
    }
    return value;
}
function fail(path, code, message) { return { ok: false, issues: [issue(path, code, message)] }; }
function issue(path, code, message) { return { path, code, message }; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function uniqueStrings(values) { return [...new Set(values.filter((value) => value.trim().length > 0))]; }
function sanitizeIdentifier(value) { return value.replace(/^[A-Za-z0-9+.-]+(?:-[A-Za-z0-9+.-]+)*:\/\//, "").replace(/[^A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]+/g, "-"); }
function slugForTitle(title) { const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48); return slug.length > 0 ? slug : "task"; }
function isDefaultBranchWriteHint(path) { const lowered = path.toLowerCase(); return lowered === "main" || lowered === "master" || lowered.includes("default-branch") || lowered.includes("refs/heads/main") || lowered.includes("refs/heads/master"); }
function pathIntersects(a, b) { const pa = globPrefix(a); const pb = globPrefix(b); return pa.length > 0 && pb.length > 0 && (pa.startsWith(pb) || pb.startsWith(pa)); }
function globPrefix(pattern) { return pattern.replace(/\*\*.*$/, "").replace(/\*.*$/, "").replace(/\/$/, "").toLowerCase(); }
function isAllowedByAny(path, allowed) { return allowed.length === 0 || allowed.some((candidate) => pathIntersects(path, candidate) || path === candidate); }
function stringArrayFromScope(root, key) { const scope = asRecord(root["scope_contract"]); const value = scope?.[key]; return Array.isArray(value) ? value.filter((item) => typeof item === "string") : []; }
//# sourceMappingURL=plan-schema.js.map