export const BRANCH_WORKTREE_SCHEMA_REF = "urn:forgeroot:branch-worktree:v1";
export const BRANCH_WORKTREE_MANAGER_CONTRACT = {
    produces: ["branch_worktree_plan"],
    forbids: [
        "git_checkout",
        "git_branch_create",
        "git_worktree_add",
        "file_editing",
        "commit_creation",
        "pull_request_creation",
        "default_branch_write",
    ],
    branchPrefix: "forge/",
    defaultWorktreeRoot: ".forgeroot/worktrees",
    oneTaskOnePr: true,
};
const MANIFEST_VERSION = 1;
const DEFAULT_BRANCH = "main";
const DEFAULT_WORKTREE_ROOT = ".forgeroot/worktrees";
const MAX_BRANCH_LENGTH = 96;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const RESERVED_BRANCH_TARGETS = new Set(["main", "master", "trunk", "default", "refs/heads/main", "refs/heads/master"]);
const PLAN_STATUSES = new Set(["draft", "ready_for_execution", "blocked_for_human", "superseded"]);
const GOVERNANCE_GLOBS = [".github/workflows/**", ".forge/policies/**", ".forge/network/**"];
export function createBranchWorktreePlan(plan, options = {}) {
    const auditTrail = [
        "worktree_branch_manager:T018",
        "contract:one_task_one_pr",
        "contract:no_git_side_effects",
        "contract:no_default_branch_write",
    ];
    const planIssues = validatePlanSpecLike(plan);
    if (planIssues.length > 0) {
        return invalidResult(["invalid_plan_spec_like", ...planIssues.map(formatIssue)], auditTrail, planIssues);
    }
    const normalizedPlan = plan;
    if (normalizedPlan.status !== "ready_for_execution" && normalizedPlan.status !== "blocked_for_human") {
        return {
            status: "blocked",
            reasons: uniqueStrings([`plan_status_not_ready_for_worktree:${normalizedPlan.status}`]),
            auditTrail: [...auditTrail, "branch:none", "worktree:none", "reason:plan_not_ready"],
        };
    }
    const approvalNeeded = normalizedPlan.status === "blocked_for_human" || normalizedPlan.risk_and_approval.human_review_required_before_execution || normalizedPlan.risk_and_approval.escalation_required;
    const approvedForExecution = options.approvedForExecution === true;
    const approvalRef = normalizeOptionalString(options.approvalRef);
    if (approvalNeeded && !approvedForExecution) {
        return {
            status: "blocked",
            reasons: uniqueStrings([
                "human_review_required_before_branch_preparation",
                `plan_status:${normalizedPlan.status}`,
                `approval_class:${normalizedPlan.risk_and_approval.approval_class}`,
                `risk:${normalizedPlan.risk_and_approval.risk}`,
            ]),
            auditTrail: [...auditTrail, "branch:none", "worktree:none", "reason:approval_required"],
        };
    }
    if (approvedForExecution && approvalRef === null) {
        return invalidResult(["approval_ref_required_when_approved_for_execution"], [...auditTrail, "approval:invalid"]);
    }
    const createdAtResult = resolveTimestamp(options.now ?? normalizedPlan.created_at);
    if (!createdAtResult.ok)
        return invalidResult([createdAtResult.reason], [...auditTrail, "timestamp:invalid"]);
    const defaultBranchResult = normalizeBranchRef(options.defaultBranch ?? DEFAULT_BRANCH, "default_branch");
    if (!defaultBranchResult.ok)
        return invalidResult([defaultBranchResult.reason], [...auditTrail, "default_branch:invalid"]);
    const baseRefResult = normalizeBranchRef(options.baseRef ?? defaultBranchResult.value, "base_ref");
    if (!baseRefResult.ok)
        return invalidResult([baseRefResult.reason], [...auditTrail, "base_ref:invalid"]);
    const branchResult = resolveBranchName(normalizedPlan, options, defaultBranchResult.value);
    if (!branchResult.ok)
        return invalidResult([branchResult.reason], [...auditTrail, "branch:invalid"]);
    const worktreeRootResult = normalizeWorktreeRoot(options.worktreeRoot ?? DEFAULT_WORKTREE_ROOT);
    if (!worktreeRootResult.ok)
        return invalidResult([worktreeRootResult.reason], [...auditTrail, "worktree_root:invalid"]);
    const worktreePath = `${worktreeRootResult.value}/${branchNameToPathSegment(branchResult.value)}`;
    const manifestId = `forge-worktree://${stableSlug(normalizedPlan.plan_id)}-${stableHash(branchResult.value).slice(0, 8)}`;
    const source = normalizedPlan.source;
    const manifest = {
        manifest_version: MANIFEST_VERSION,
        schema_ref: BRANCH_WORKTREE_SCHEMA_REF,
        manifest_id: manifestId,
        created_at: createdAtResult.value,
        plan_id: normalizedPlan.plan_id,
        source: {
            repository: source.repository ?? null,
            issue_number: source.issue_number ?? null,
            candidate_id: source.candidate_id ?? normalizedPlan.plan_id,
            title: source.title ?? normalizedPlan.title,
        },
        branch: {
            name: branchResult.value,
            base_ref: baseRefResult.value,
            default_branch: defaultBranchResult.value,
            naming_rule: "forge/<phase>/<task-id>-<slug>",
            delete_after_pr: true,
        },
        worktree: {
            root: worktreeRootResult.value,
            path: worktreePath,
            ephemeral: true,
            cleanup: "delete_after_pr_or_failure",
        },
        scope: {
            one_task_one_pr: true,
            no_default_branch_write: true,
            mutable_paths: [...normalizedPlan.scope_contract.mutable_paths],
            immutable_paths: uniqueStrings([...GOVERNANCE_GLOBS, ...normalizedPlan.scope_contract.immutable_paths]),
            out_of_scope: [...normalizedPlan.scope_contract.out_of_scope],
            max_files_changed: normalizedPlan.scope_contract.max_files_changed,
            max_diff_lines: normalizedPlan.scope_contract.max_diff_lines,
        },
        approval: {
            approval_class: normalizedPlan.risk_and_approval.approval_class,
            risk: normalizedPlan.risk_and_approval.risk,
            approved_for_execution: approvedForExecution,
            approval_ref: approvalRef,
            human_review_required_before_execution: normalizedPlan.risk_and_approval.human_review_required_before_execution,
        },
        guards: {
            enforce_clean_worktree: true,
            enforce_mutable_paths: true,
            forbid_default_branch_write: true,
            forbid_workflow_policy_network_paths: true,
            forbid_git_side_effects_in_manager: true,
        },
    };
    const validation = validateBranchWorktreePlan(manifest);
    if (!validation.ok) {
        return invalidResult(["generated_branch_worktree_plan_failed_validation", ...validation.issues.map(formatIssue)], [...auditTrail, "manifest:invalid"], validation.issues);
    }
    return {
        status: "ready",
        plan: manifest,
        reasons: uniqueStrings([
            "branch_worktree_plan_ready",
            `branch:${manifest.branch.name}`,
            `worktree:${manifest.worktree.path}`,
            `approval_class:${manifest.approval.approval_class}`,
        ]),
        auditTrail: [...auditTrail, "branch:prepared_manifest_only", "worktree:prepared_manifest_only", "git:side_effects_not_performed"],
    };
}
export function validateBranchWorktreePlan(plan) {
    const issues = [];
    const root = asRecord(plan);
    if (root === null)
        return { ok: false, issues: [issue("", "type", "branch worktree plan must be an object")] };
    expectLiteral(root, "manifest_version", MANIFEST_VERSION, issues);
    expectLiteral(root, "schema_ref", BRANCH_WORKTREE_SCHEMA_REF, issues);
    expectString(root, "manifest_id", issues, { prefix: "forge-worktree://" });
    expectString(root, "plan_id", issues);
    expectRfc3339(root, "created_at", issues);
    const source = asRecord(root["source"]);
    if (source === null) {
        issues.push(issue("/source", "required", "source must be an object"));
    }
    else {
        expectStringOrNull(source, "repository", issues, "/source");
        expectIntegerOrNull(source, "issue_number", issues, "/source");
        expectString(source, "candidate_id", issues, { pathPrefix: "/source" });
        expectString(source, "title", issues, { pathPrefix: "/source" });
    }
    const branch = asRecord(root["branch"]);
    if (branch === null) {
        issues.push(issue("/branch", "required", "branch must be an object"));
    }
    else {
        const name = expectString(branch, "name", issues, { pathPrefix: "/branch", prefix: "forge/" });
        const baseRef = expectString(branch, "base_ref", issues, { pathPrefix: "/branch" });
        const defaultBranch = expectString(branch, "default_branch", issues, { pathPrefix: "/branch" });
        expectLiteral(branch, "naming_rule", "forge/<phase>/<task-id>-<slug>", issues, "/branch");
        expectLiteral(branch, "delete_after_pr", true, issues, "/branch");
        if (name !== null) {
            if (name.length > MAX_BRANCH_LENGTH)
                issues.push(issue("/branch/name", "max_length", `branch name must be <= ${MAX_BRANCH_LENGTH} characters`));
            if (!isSafeBranchRef(name))
                issues.push(issue("/branch/name", "safe_ref", "branch name contains unsafe ref syntax"));
            if (isDefaultBranchTarget(name, defaultBranch))
                issues.push(issue("/branch/name", "default_branch_write", "branch target must not be the default branch"));
        }
        if (baseRef !== null && !isSafeBranchRef(baseRef))
            issues.push(issue("/branch/base_ref", "safe_ref", "base_ref contains unsafe ref syntax"));
        if (defaultBranch !== null && !isSafeBranchRef(defaultBranch))
            issues.push(issue("/branch/default_branch", "safe_ref", "default_branch contains unsafe ref syntax"));
    }
    const worktree = asRecord(root["worktree"]);
    if (worktree === null) {
        issues.push(issue("/worktree", "required", "worktree must be an object"));
    }
    else {
        const rootPath = expectString(worktree, "root", issues, { pathPrefix: "/worktree" });
        const path = expectString(worktree, "path", issues, { pathPrefix: "/worktree" });
        expectLiteral(worktree, "ephemeral", true, issues, "/worktree");
        expectLiteral(worktree, "cleanup", "delete_after_pr_or_failure", issues, "/worktree");
        if (rootPath !== null && normalizeWorktreeRoot(rootPath).ok === false)
            issues.push(issue("/worktree/root", "safe_path", "worktree root must be a safe runtime-owned relative path"));
        if (path !== null && !isSafeRuntimePath(path))
            issues.push(issue("/worktree/path", "safe_path", "worktree path must be a safe runtime-owned relative path"));
        if (rootPath !== null && path !== null && !path.startsWith(`${rootPath.replace(/\/+$/, "")}/`))
            issues.push(issue("/worktree/path", "root_prefix", "worktree path must be under worktree root"));
    }
    const scope = asRecord(root["scope"]);
    if (scope === null) {
        issues.push(issue("/scope", "required", "scope must be an object"));
    }
    else {
        expectLiteral(scope, "one_task_one_pr", true, issues, "/scope");
        expectLiteral(scope, "no_default_branch_write", true, issues, "/scope");
        const mutable = expectStringArray(scope, "mutable_paths", issues, "/scope");
        const immutable = expectStringArray(scope, "immutable_paths", issues, "/scope");
        expectStringArray(scope, "out_of_scope", issues, "/scope");
        expectPositiveInteger(scope, "max_files_changed", issues, "/scope", 50);
        expectPositiveInteger(scope, "max_diff_lines", issues, "/scope", 2000);
        for (const path of mutable) {
            for (const forbidden of immutable) {
                if (globIntersects(path, forbidden))
                    issues.push(issue("/scope/mutable_paths", "immutable_overlap", `mutable path '${path}' overlaps immutable path '${forbidden}'`));
            }
        }
    }
    const approval = asRecord(root["approval"]);
    if (approval === null) {
        issues.push(issue("/approval", "required", "approval must be an object"));
    }
    else {
        expectOneOf(approval, "approval_class", APPROVAL_CLASSES, issues, "/approval");
        expectOneOf(approval, "risk", RISKS, issues, "/approval");
        expectBoolean(approval, "approved_for_execution", issues, "/approval");
        expectStringOrNull(approval, "approval_ref", issues, "/approval");
        expectBoolean(approval, "human_review_required_before_execution", issues, "/approval");
    }
    const guards = asRecord(root["guards"]);
    if (guards === null) {
        issues.push(issue("/guards", "required", "guards must be an object"));
    }
    else {
        expectLiteral(guards, "enforce_clean_worktree", true, issues, "/guards");
        expectLiteral(guards, "enforce_mutable_paths", true, issues, "/guards");
        expectLiteral(guards, "forbid_default_branch_write", true, issues, "/guards");
        expectLiteral(guards, "forbid_workflow_policy_network_paths", true, issues, "/guards");
        expectLiteral(guards, "forbid_git_side_effects_in_manager", true, issues, "/guards");
    }
    return { ok: issues.length === 0, issues };
}
export function validateChangedPaths(plan, changedPaths) {
    const acceptedPaths = [];
    const rejectedPaths = [];
    const reasons = [];
    const seen = new Set();
    for (const rawPath of changedPaths) {
        const normalized = normalizeRepoPath(rawPath);
        if (normalized === null) {
            rejectedPaths.push({ path: rawPath, status: "rejected", reason: "invalid_path" });
            reasons.push("invalid_changed_path");
            continue;
        }
        if (seen.has(normalized))
            continue;
        seen.add(normalized);
        if (matchesAnyGlob(normalized, plan.scope.immutable_paths)) {
            rejectedPaths.push({ path: normalized, status: "rejected", reason: "immutable" });
            reasons.push("immutable_path_changed");
            continue;
        }
        if (!matchesAnyGlob(normalized, plan.scope.mutable_paths)) {
            rejectedPaths.push({ path: normalized, status: "rejected", reason: "outside_mutable_scope" });
            reasons.push("path_outside_mutable_scope");
            continue;
        }
        acceptedPaths.push(normalized);
    }
    if (acceptedPaths.length > plan.scope.max_files_changed)
        reasons.push("max_files_changed_exceeded");
    const ok = rejectedPaths.length === 0 && acceptedPaths.length <= plan.scope.max_files_changed;
    return { ok, acceptedPaths, rejectedPaths, reasons: uniqueStrings(reasons) };
}
function validatePlanSpecLike(plan) {
    const issues = [];
    const root = asRecord(plan);
    if (root === null)
        return [issue("", "type", "plan spec must be an object")];
    expectString(root, "plan_id", issues);
    expectOneOf(root, "status", PLAN_STATUSES, issues);
    expectString(root, "created_at", issues);
    expectString(root, "title", issues);
    const source = asRecord(root["source"]);
    if (source === null) {
        issues.push(issue("/source", "required", "plan source must be an object"));
    }
    else {
        expectStringOrNull(source, "repository", issues, "/source");
        expectIntegerOrNull(source, "issue_number", issues, "/source");
    }
    const scope = asRecord(root["scope_contract"]);
    if (scope === null) {
        issues.push(issue("/scope_contract", "required", "scope_contract must be an object"));
    }
    else {
        expectLiteral(scope, "one_task_one_pr", true, issues, "/scope_contract");
        expectLiteral(scope, "source_issue_count", 1, issues, "/scope_contract");
        expectLiteral(scope, "no_default_branch_write", true, issues, "/scope_contract");
        expectStringArray(scope, "mutable_paths", issues, "/scope_contract");
        expectStringArray(scope, "immutable_paths", issues, "/scope_contract");
        expectStringArray(scope, "out_of_scope", issues, "/scope_contract");
        expectPositiveInteger(scope, "max_files_changed", issues, "/scope_contract", 50);
        expectPositiveInteger(scope, "max_diff_lines", issues, "/scope_contract", 2000);
        expectString(scope, "branch_naming_hint", issues, { pathPrefix: "/scope_contract", prefix: "forge/" });
    }
    const approval = asRecord(root["risk_and_approval"]);
    if (approval === null) {
        issues.push(issue("/risk_and_approval", "required", "risk_and_approval must be an object"));
    }
    else {
        expectOneOf(approval, "approval_class", APPROVAL_CLASSES, issues, "/risk_and_approval");
        expectOneOf(approval, "risk", RISKS, issues, "/risk_and_approval");
        expectBoolean(approval, "human_review_required_before_execution", issues, "/risk_and_approval");
        expectBoolean(approval, "escalation_required", issues, "/risk_and_approval");
    }
    return issues;
}
function resolveBranchName(plan, options, defaultBranch) {
    const override = normalizeOptionalString(options.branchName);
    const raw = override ?? derivedBranchName(plan, options);
    const normalized = normalizeBranchName(raw);
    if (normalized === null)
        return { ok: false, reason: "branch_name_invalid" };
    if (!normalized.startsWith("forge/"))
        return { ok: false, reason: "branch_name_must_start_with_forge_prefix" };
    if (normalized.length > MAX_BRANCH_LENGTH)
        return { ok: false, reason: `branch_name_exceeds_${MAX_BRANCH_LENGTH}_chars` };
    if (!isSafeBranchRef(normalized))
        return { ok: false, reason: "branch_name_contains_unsafe_ref_syntax" };
    if (isDefaultBranchTarget(normalized, defaultBranch))
        return { ok: false, reason: "branch_name_targets_default_branch" };
    return { ok: true, value: normalized };
}
function derivedBranchName(plan, options) {
    const title = plan.source.title ?? plan.title;
    const parsed = parseTaskTitle(title);
    const phase = sanitizePhase(options.phase ?? parsed.phase ?? "p1");
    const taskId = sanitizeTaskId(options.taskId ?? parsed.taskId ?? fallbackTaskId(plan));
    const titleWithoutPrefix = stripTaskPrefix(title);
    const hintSlug = plan.scope_contract.branch_naming_hint.split("/").filter(Boolean).pop() ?? "task";
    const slug = slugify(titleWithoutPrefix.length > 0 ? titleWithoutPrefix : hintSlug);
    const candidate = `forge/${phase}/${taskId}-${slug}`;
    if (candidate.length <= MAX_BRANCH_LENGTH)
        return candidate;
    const suffix = stableHash(`${plan.plan_id}:${candidate}`).slice(0, 8);
    const baseLength = MAX_BRANCH_LENGTH - suffix.length - 1;
    return `${candidate.slice(0, baseLength).replace(/-+$/, "")}-${suffix}`;
}
function parseTaskTitle(title) {
    const match = title.match(/\[P(\d+)\]\s*\[T(\d{3})\]/i);
    if (match === null)
        return { phase: null, taskId: null };
    return { phase: `p${match[1]}`, taskId: `T${match[2]}` };
}
function stripTaskPrefix(title) {
    return title.replace(/^\s*\[P\d+\]\s*\[T\d{3}\]\s*/i, "").trim();
}
function fallbackTaskId(plan) {
    const issueNumber = plan.source.issue_number;
    if (typeof issueNumber === "number" && Number.isSafeInteger(issueNumber) && issueNumber > 0)
        return `issue-${issueNumber}`;
    return `task-${stableHash(plan.plan_id).slice(0, 8)}`;
}
function sanitizePhase(value) {
    const normalized = value.trim().toLowerCase();
    const numberMatch = normalized.match(/^p?(\d+)$/);
    if (numberMatch !== null)
        return `p${numberMatch[1]}`;
    const slug = slugify(normalized);
    return slug.length > 0 ? slug : "p1";
}
function sanitizeTaskId(value) {
    const normalized = value.trim();
    const taskMatch = normalized.match(/^t?(\d{3})$/i);
    if (taskMatch !== null)
        return `T${taskMatch[1]}`;
    const slug = slugify(normalized);
    return slug.length > 0 ? slug : "task";
}
function normalizeBranchName(value) {
    const trimmed = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+|\/+$/g, "");
    if (trimmed.length === 0 || trimmed.includes("..") || trimmed.includes("@{") || trimmed.includes("~") || trimmed.includes("^") || trimmed.includes(":"))
        return null;
    if (/\s/.test(trimmed))
        return null;
    if (trimmed.endsWith(".") || trimmed.endsWith(".lock"))
        return null;
    return trimmed;
}
function normalizeBranchRef(value, label) {
    const normalized = normalizeBranchName(value);
    if (normalized === null)
        return { ok: false, reason: `${label}_invalid` };
    if (!isSafeBranchRef(normalized))
        return { ok: false, reason: `${label}_contains_unsafe_ref_syntax` };
    return { ok: true, value: normalized };
}
function isSafeBranchRef(value) {
    if (value.length === 0 || value.startsWith("/") || value.endsWith("/") || value.includes("//"))
        return false;
    if (value.includes("..") || value.includes("@{") || value.includes("\\") || value.includes("~") || value.includes("^") || value.includes(":"))
        return false;
    if (/\s/.test(value))
        return false;
    if (value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.endsWith(".lock")))
        return false;
    return true;
}
function isDefaultBranchTarget(branchName, defaultBranch) {
    const lowered = branchName.toLowerCase();
    const defaultLowered = (defaultBranch ?? DEFAULT_BRANCH).toLowerCase();
    return lowered === defaultLowered || lowered === `refs/heads/${defaultLowered}` || RESERVED_BRANCH_TARGETS.has(lowered);
}
function normalizeWorktreeRoot(value) {
    const trimmed = value.trim().replace(/\\/g, "/").replace(/\/+/g, "/").replace(/\/+$/g, "");
    if (trimmed.length === 0)
        return { ok: false, reason: "worktree_root_empty" };
    if (trimmed.startsWith("/") || trimmed.includes("\0"))
        return { ok: false, reason: "worktree_root_must_be_relative" };
    const segments = trimmed.split("/");
    if (segments.some((segment) => segment === ".." || segment.length === 0))
        return { ok: false, reason: "worktree_root_contains_unsafe_segment" };
    return { ok: true, value: trimmed };
}
function isSafeRuntimePath(value) {
    const normalized = value.trim().replace(/\\/g, "/");
    if (normalized.length === 0 || normalized.startsWith("/") || normalized.includes("\0"))
        return false;
    return !normalized.split("/").some((segment) => segment === ".." || segment.length === 0);
}
function branchNameToPathSegment(branchName) {
    return branchName.replace(/[^A-Za-z0-9._-]+/g, "__").replace(/^_+|_+$/g, "").slice(0, 120);
}
function normalizeRepoPath(value) {
    const trimmed = value.trim().replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
    if (trimmed.length === 0 || trimmed.startsWith("/") || trimmed.includes("\0"))
        return null;
    const segments = trimmed.split("/");
    if (segments.some((segment) => segment.length === 0 || segment === "." || segment === ".."))
        return null;
    return trimmed;
}
function matchesAnyGlob(path, patterns) {
    return patterns.some((pattern) => matchesGlob(path, pattern));
}
function matchesGlob(path, pattern) {
    const normalizedPattern = pattern.trim().replace(/\\/g, "/").replace(/^\.\/+/, "");
    if (normalizedPattern.length === 0)
        return false;
    const target = normalizedPattern.includes("/") ? path : basename(path);
    return globToRegExp(normalizedPattern).test(target);
}
function globToRegExp(pattern) {
    let source = "^";
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        const next = pattern[index + 1];
        const afterNext = pattern[index + 2];
        if (char === "*" && next === "*" && afterNext === "/") {
            source += "(?:.*/)?";
            index += 2;
            continue;
        }
        if (char === "*" && next === "*") {
            source += ".*";
            index += 1;
            continue;
        }
        if (char === "*") {
            source += "[^/]*";
            continue;
        }
        source += escapeRegExp(char);
    }
    source += "$";
    return new RegExp(source);
}
function globIntersects(a, b) {
    const pa = globLiteralPrefix(a);
    const pb = globLiteralPrefix(b);
    if (pa.length === 0 || pb.length === 0)
        return false;
    return pa.startsWith(pb) || pb.startsWith(pa);
}
function globLiteralPrefix(pattern) {
    return pattern.replace(/\\/g, "/").split(/[?*]/, 1)[0].replace(/\/+$/, "").toLowerCase();
}
function basename(path) {
    const parts = path.split("/");
    return parts[parts.length - 1] ?? path;
}
function resolveTimestamp(value) {
    const trimmed = value.trim();
    if (!RFC3339_UTC.test(trimmed))
        return { ok: false, reason: "timestamp_must_be_rfc3339_utc" };
    return { ok: true, value: trimmed };
}
function normalizeOptionalString(value) {
    if (value === undefined)
        return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
}
function expectLiteral(record, key, expected, issues, pathPrefix = "") {
    if (record[key] !== expected)
        issues.push(issue(`${pathPrefix}/${key}`, "literal", `${key} must equal ${JSON.stringify(expected)}`));
}
function expectString(record, key, issues, options = {}) {
    const value = record[key];
    const path = `${options.pathPrefix ?? ""}/${key}`;
    if (typeof value !== "string" || value.trim().length === 0) {
        issues.push(issue(path, "string", `${key} must be a non-empty string`));
        return null;
    }
    if (options.prefix !== undefined && !value.startsWith(options.prefix))
        issues.push(issue(path, "prefix", `${key} must start with '${options.prefix}'`));
    return value;
}
function expectStringOrNull(record, key, issues, pathPrefix = "") {
    const value = record[key];
    if (value === null || value === undefined)
        return null;
    return expectString(record, key, issues, { pathPrefix });
}
function expectIntegerOrNull(record, key, issues, pathPrefix = "") {
    const value = record[key];
    if (value === null || value === undefined)
        return null;
    if (typeof value !== "number" || !Number.isSafeInteger(value)) {
        issues.push(issue(`${pathPrefix}/${key}`, "integer_or_null", `${key} must be an integer or null`));
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
function expectStringArray(record, key, issues, pathPrefix = "") {
    const value = record[key];
    if (!Array.isArray(value)) {
        issues.push(issue(`${pathPrefix}/${key}`, "array", `${key} must be an array of strings`));
        return [];
    }
    const result = [];
    value.forEach((item, index) => {
        if (typeof item !== "string" || item.trim().length === 0)
            issues.push(issue(`${pathPrefix}/${key}/${index}`, "string", `${key}[${index}] must be a non-empty string`));
        else
            result.push(item);
    });
    if (result.length === 0)
        issues.push(issue(`${pathPrefix}/${key}`, "non_empty", `${key} must not be empty`));
    return result;
}
function expectPositiveInteger(record, key, issues, pathPrefix = "", max) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
        issues.push(issue(`${pathPrefix}/${key}`, "positive_integer", `${key} must be a positive integer`));
        return null;
    }
    if (max !== undefined && value > max)
        issues.push(issue(`${pathPrefix}/${key}`, "max", `${key} must be <= ${max}`));
    return value;
}
function expectRfc3339(record, key, issues) {
    const value = expectString(record, key, issues);
    if (value !== null && !RFC3339_UTC.test(value))
        issues.push(issue(`/${key}`, "rfc3339", `${key} must be an RFC3339 UTC timestamp`));
    return value;
}
function invalidResult(reasons, auditTrail, issues) {
    return { status: "invalid", reasons: uniqueStrings(reasons), auditTrail: [...auditTrail, "result:invalid"], ...(issues === undefined ? {} : { issues }) };
}
function issue(path, code, message) { return { path, code, message }; }
function formatIssue(value) { return `${value.path}:${value.code}`; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function escapeRegExp(value) { return value.replace(/[|\\{}()[\]^$+?.]/g, "\\$&"); }
function uniqueStrings(values) { return [...new Set(values.filter((value) => value.trim().length > 0))]; }
function slugify(value) {
    const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug : "task";
}
function stableSlug(value) {
    const slug = value.replace(/^[A-Za-z0-9+.-]+:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return slug.length > 0 ? slug.slice(0, 72) : "plan";
}
function stableHash(value) {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(8, "0");
}
//# sourceMappingURL=worktree.js.map