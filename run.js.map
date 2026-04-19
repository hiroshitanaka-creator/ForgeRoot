export const FORGE_AUTO_LABEL = "forge:auto";
const RISK_RANK = { low: 0, medium: 1, high: 2, critical: 3 };
const APPROVAL_RANK = { A: 0, B: 1, C: 2, D: 3 };
const NON_ACTIONABLE_LABELS = new Set(["duplicate", "invalid", "wontfix", "won't fix", "not-planned", "not planned"]);
const BLOCK_LABELS = new Set(["forge:block", "spam", "malicious", "abuse"]);
const HOLD_LABELS = new Set(["forge:hold", "hold", "blocked", "needs:human", "needs-human", "human-review"]);
const PROMPT_INJECTION_PATTERNS = ["ignore previous instructions", "ignore all previous instructions", "disregard previous instructions", "bypass the constitution", "bypass ruleset", "bypass rulesets", "bypass branch protection", "push directly to main", "write directly to main", "disable evolutionguard", "disable the kill switch", "turn off the kill switch", "exfiltrate secrets", "print secrets", "dump secrets", "leak token", "steal token"];
const BROAD_SCOPE_PATTERNS = ["refactor all", "refactor everything", "rewrite everything", "change everything", "all modules", "all packages", "and also"];
const CATEGORY_KEYWORDS = {
    security: ["security", "vulnerability", "cve-", "secret scanning", "secret leak", "token leaked", "credential", "private key", "sarif", "code scanning", "xss", "sql injection", "rce", "leaked token"],
    workflow: [".github/workflows", "workflow", "github actions", "actions workflow", "ci yaml", "oidc", "permissions:", "app permissions"],
    policy: [".forge/policies", "constitution", "policy", "ruleset", "branch protection", "kill switch", "runtime mode", "approval class"],
    dependency: ["dependabot", "dependency", "dependencies", "package.json", "pnpm-lock", "package-lock", "cargo.toml", "cargo.lock", "npm audit", "pip-audit", "bump ", "upgrade "],
    ci: ["ci failure", "failing check", "check failed", "workflow_run", "build failed", "lint failed", "flaky", "flake", "red build"],
    docs: ["docs", "documentation", "readme", "typo", "copyedit", "guide", "tutorial", "spelling", ".md"],
    test: ["test", "tests", "unit test", "integration test", "coverage", "snapshot", "fixture", "golden"],
    bug: ["bug", "bugfix", "fix", "regression", "crash", "error", "exception", "incorrect", "broken"],
    feature: ["feature", "enhancement", "add support", "new option", "implement", "support "],
    question: ["question", "how do i", "how to", "help", "support", "discussion"],
    network_offer: ["treaty", "peer forge", "lineage offer", "federation", "cross-repo", "peer", "network offer"],
    operator_command: ["forge:approve", "forge:hold", "forge:quarantine", "forge:retry", "forge:replay"],
    chore: ["chore", "cleanup", "housekeeping", "rename", "format", "formatting", "maintenance"],
    unknown: [],
};
const ACTIONABLE_AUTO_CATEGORIES = new Set(["docs", "test", "bug", "ci", "dependency", "feature", "chore"]);
export function classifyIntake(input) {
    const labels = normalizeLabels(input.labels ?? []);
    const sourceKey = buildSourceKey(input);
    const text = buildSearchText(input, labels);
    const autoRequested = labels.includes(FORGE_AUTO_LABEL);
    const categoryResult = inferCategory(input, labels, text);
    const risk = inferRisk(input, labels, text, categoryResult.category);
    const approvalClass = inferApprovalClass(labels, text, categoryResult.category, risk);
    const decision = decideDisposition({ input, labels, text, autoRequested, category: categoryResult.category, risk, approvalClass });
    const isAutoTarget = decision.disposition === "accept" && autoRequested;
    const title = normalizeTitle(input);
    const summary = summarizeText(input.body ?? input.commentBody ?? title);
    const task = isAutoTarget ? buildTaskCandidate({ input, sourceKey, title, summary, labels, category: categoryResult.category, risk, approvalClass }) : null;
    return { sourceKind: input.sourceKind, sourceKey, category: categoryResult.category, disposition: decision.disposition, autoRequested, isAutoTarget, risk, approvalClass, task, labels, reasons: decision.reasons, signals: categoryResult.signals, blockedBy: decision.blockedBy, ignoredBy: decision.ignoredBy, escalatedBy: decision.escalatedBy };
}
export const classifyIssueIntake = classifyIntake;
export function classifyIssue(input) { return classifyIntake({ ...input, sourceKind: "issue" }); }
export function classifyIssueComment(input) { return classifyIntake({ ...input, sourceKind: "issue_comment" }); }
export function classifyAlert(input) { return classifyIntake({ ...input, sourceKind: "alert" }); }
export function classifyGitHubWebhook(input) { const intakeInput = intakeInputFromGitHubWebhook(input); return intakeInput === null ? null : classifyIntake(intakeInput); }
export function intakeInputFromGitHubWebhook(input) {
    const payload = asRecord(input.payload);
    if (payload === null)
        return null;
    const repositoryFullName = readNestedString(payload, ["repository", "full_name"]) ?? input.repositoryFullName ?? null;
    const action = readString(payload, "action") ?? input.action ?? null;
    const externalId = input.deliveryId === null || input.deliveryId === undefined ? null : `github-delivery:${input.deliveryId}`;
    const receivedAt = input.receivedAt ?? null;
    if (input.eventName === "issues") {
        const issue = asRecord(payload["issue"]);
        if (issue === null)
            return null;
        return { sourceKind: "issue", eventName: input.eventName, action, repositoryFullName, number: readNumber(issue, "number"), title: readString(issue, "title"), body: readString(issue, "body"), labels: readLabels(issue["labels"]), state: readString(issue, "state"), url: readString(issue, "html_url"), receivedAt, externalId };
    }
    if (input.eventName === "issue_comment") {
        const issue = asRecord(payload["issue"]);
        const comment = asRecord(payload["comment"]);
        if (issue === null || comment === null)
            return null;
        return { sourceKind: "issue_comment", eventName: input.eventName, action, repositoryFullName, number: readNumber(issue, "number"), title: readString(issue, "title"), body: readString(issue, "body"), commentBody: readString(comment, "body"), labels: readLabels(issue["labels"]), state: readString(issue, "state"), url: readString(comment, "html_url") ?? readString(issue, "html_url"), receivedAt, externalId };
    }
    if (input.eventName === "check_run") {
        const checkRun = asRecord(payload["check_run"]);
        if (checkRun === null)
            return null;
        return { sourceKind: "check_run", eventName: input.eventName, action, repositoryFullName, title: readString(checkRun, "name") ?? "GitHub check run", body: readNestedString(checkRun, ["output", "summary"]) ?? readNestedString(checkRun, ["output", "text"]), labels: readLabels(payload["labels"]), url: readString(checkRun, "html_url") ?? readString(checkRun, "details_url"), checkConclusion: readString(checkRun, "conclusion"), receivedAt, externalId };
    }
    if (input.eventName === "workflow_run") {
        const workflowRun = asRecord(payload["workflow_run"]);
        if (workflowRun === null)
            return null;
        return { sourceKind: "workflow_run", eventName: input.eventName, action, repositoryFullName, title: readString(workflowRun, "name") ?? "GitHub workflow run", body: readString(workflowRun, "display_title") ?? readString(workflowRun, "head_branch"), labels: readLabels(payload["labels"]), url: readString(workflowRun, "html_url"), checkConclusion: readString(workflowRun, "conclusion"), receivedAt, externalId };
    }
    if (input.eventName === "dependabot_alert" || input.eventName === "code_scanning_alert" || input.eventName === "secret_scanning_alert" || input.eventName === "security_alert") {
        const alert = asRecord(payload["alert"]) ?? payload;
        return { sourceKind: "alert", eventName: input.eventName, action, repositoryFullName, title: readString(alert, "title") ?? readNestedString(alert, ["security_advisory", "summary"]), body: readString(alert, "description") ?? readString(alert, "message"), labels: readLabels(payload["labels"]), url: readString(alert, "html_url"), alertKind: input.eventName, severity: readString(alert, "severity") ?? readNestedString(alert, ["security_advisory", "severity"]), receivedAt, externalId };
    }
    return null;
}
export function normalizeLabels(labels) {
    const seen = new Set();
    const normalized = [];
    for (const label of labels) {
        const raw = typeof label === "string" ? label : label.name;
        if (typeof raw !== "string")
            continue;
        const value = normalizeWhitespace(raw).toLowerCase();
        if (value.length === 0 || seen.has(value))
            continue;
        seen.add(value);
        normalized.push(value);
    }
    return normalized.sort((a, b) => a.localeCompare(b));
}
function decideDisposition(params) {
    const blockedBy = [];
    const ignoredBy = [];
    const escalatedBy = [];
    const state = normalizeWhitespace(params.input.state ?? "open").toLowerCase();
    if (state === "closed" || state === "merged")
        ignoredBy.push(`state:${state}`);
    for (const label of params.labels) {
        if (BLOCK_LABELS.has(label))
            blockedBy.push(`label:${label}`);
        if (NON_ACTIONABLE_LABELS.has(label))
            ignoredBy.push(`label:${label}`);
        if (HOLD_LABELS.has(label))
            ignoredBy.push(`label:${label}`);
    }
    for (const pattern of PROMPT_INJECTION_PATTERNS)
        if (params.text.includes(pattern))
            blockedBy.push(`prompt-injection:${pattern}`);
    if (BROAD_SCOPE_PATTERNS.some((pattern) => params.text.includes(pattern)))
        blockedBy.push("scope:too-large");
    const conclusion = normalizeWhitespace(params.input.checkConclusion ?? "").toLowerCase();
    if ((params.input.sourceKind === "check_run" || params.input.sourceKind === "workflow_run") && conclusion.length > 0 && conclusion !== "failure" && conclusion !== "timed_out" && conclusion !== "action_required")
        ignoredBy.push(`check_conclusion:${conclusion}`);
    if (blockedBy.length > 0)
        return { disposition: "block", blockedBy: uniqueStrings(blockedBy), ignoredBy: uniqueStrings(ignoredBy), escalatedBy, reasons: ["blocked_before_planning"] };
    if (ignoredBy.length > 0)
        return { disposition: "ignore", blockedBy, ignoredBy: uniqueStrings(ignoredBy), escalatedBy, reasons: ["not_sent_to_planner"] };
    if (params.category === "security")
        escalatedBy.push("category:security");
    if (params.category === "workflow")
        escalatedBy.push("category:workflow");
    if (params.category === "policy")
        escalatedBy.push("category:policy");
    if (params.category === "network_offer")
        escalatedBy.push("category:network_offer");
    if (params.category === "operator_command")
        escalatedBy.push("category:operator_command");
    if (params.category === "unknown" && params.autoRequested)
        escalatedBy.push("category:unknown_with_forge_auto");
    if (RISK_RANK[params.risk] >= RISK_RANK.high)
        escalatedBy.push(`risk:${params.risk}`);
    if (APPROVAL_RANK[params.approvalClass] >= APPROVAL_RANK.C)
        escalatedBy.push(`approval_class:${params.approvalClass}`);
    if (params.input.sourceKind === "alert" && params.category !== "dependency")
        escalatedBy.push("source:alert");
    if (escalatedBy.length > 0)
        return { disposition: "escalate", blockedBy, ignoredBy, escalatedBy: uniqueStrings(escalatedBy), reasons: ["human_review_required_before_planning"] };
    if (!params.autoRequested)
        return { disposition: "ignore", blockedBy, ignoredBy: [`missing_label:${FORGE_AUTO_LABEL}`], escalatedBy, reasons: ["forge_auto_label_required_for_automation"] };
    if (!ACTIONABLE_AUTO_CATEGORIES.has(params.category))
        return { disposition: "ignore", blockedBy, ignoredBy: [`category:${params.category}`], escalatedBy, reasons: ["not_actionable_for_auto_intake"] };
    return { disposition: "accept", blockedBy, ignoredBy, escalatedBy, reasons: ["accepted_for_planner_candidate_queue"] };
}
function inferCategory(input, labels, text) {
    if (input.sourceKind === "alert") {
        const alertKind = normalizeWhitespace(input.alertKind ?? "").toLowerCase();
        if (alertKind.includes("secret") || alertKind.includes("code scanning") || alertKind.includes("security"))
            return { category: "security", signals: [`alert_kind:${alertKind || "security"}`] };
        if (alertKind.includes("dependabot") || alertKind.includes("dependency"))
            return { category: "dependency", signals: [`alert_kind:${alertKind}`] };
    }
    if (input.sourceKind === "workflow_run" || input.sourceKind === "check_run")
        return { category: "ci", signals: [`source:${input.sourceKind}`] };
    const labelCategory = categoryFromLabels(labels);
    if (labelCategory !== null)
        return { category: labelCategory, signals: [`label-category:${labelCategory}`] };
    const changedPathCategory = categoryFromChangedPaths(input.changedPaths ?? []);
    if (changedPathCategory !== null)
        return { category: changedPathCategory, signals: [`changed-path:${changedPathCategory}`] };
    const orderedCategories = ["security", "policy", "workflow", "network_offer", "dependency", "ci", "docs", "test", "bug", "feature", "question", "chore", "operator_command"];
    for (const category of orderedCategories) {
        const keyword = firstMatchingKeyword(text, CATEGORY_KEYWORDS[category]);
        if (keyword !== null)
            return { category, signals: [`keyword:${keyword}`] };
    }
    return { category: "unknown", signals: ["fallback:unknown"] };
}
function categoryFromLabels(labels) {
    if (hasAnyLabel(labels, ["security", "type:security", "security-alert", "vulnerability"]))
        return "security";
    if (hasAnyLabel(labels, ["policy", "type:policy", "governance", "ruleset"]))
        return "policy";
    if (hasAnyLabel(labels, ["workflow", "github-actions", "ci-config", "type:workflow"]))
        return "workflow";
    if (hasAnyLabel(labels, ["network", "federation", "treaty", "peer-offer"]))
        return "network_offer";
    if (hasAnyLabel(labels, ["dependencies", "dependency", "dependabot", "type:dependency"]))
        return "dependency";
    if (hasAnyLabel(labels, ["ci", "failing-check", "flaky", "type:ci"]))
        return "ci";
    if (hasAnyLabel(labels, ["docs", "documentation", "type:docs"]))
        return "docs";
    if (hasAnyLabel(labels, ["tests", "test", "type:test"]))
        return "test";
    if (hasAnyLabel(labels, ["bug", "regression", "type:bug"]))
        return "bug";
    if (hasAnyLabel(labels, ["feature", "enhancement", "type:feature"]))
        return "feature";
    if (hasAnyLabel(labels, ["question", "support", "discussion"]))
        return "question";
    if (hasAnyLabel(labels, ["chore", "cleanup", "type:chore", "type:maintenance", "maintenance"]))
        return "chore";
    return null;
}
function categoryFromChangedPaths(paths) { for (const path of paths) {
    const n = path.toLowerCase();
    if (n.startsWith(".forge/policies/"))
        return "policy";
    if (n.startsWith(".github/workflows/"))
        return "workflow";
    if (n.startsWith("docs/") || n.endsWith(".md"))
        return "docs";
    if (n.includes("test") || n.includes("spec") || n.includes("fixture"))
        return "test";
    if (["package.json", "package-lock.json", "pnpm-lock.yaml", "cargo.toml", "cargo.lock"].some((candidate) => n.endsWith(candidate)))
        return "dependency";
} return null; }
function inferRisk(input, labels, text, category) { const explicitRisk = riskFromLabelsOrSeverity(labels, input.severity); const inferred = inferRiskFromCategoryAndText(category, text); return explicitRisk === null ? inferred : maxRisk(explicitRisk, inferred); }
function riskFromLabelsOrSeverity(labels, severity) { const values = [severity ?? "", ...labels]; let risk = null; for (const value of values) {
    const n = normalizeWhitespace(value).toLowerCase();
    if (n === "risk:low" || n === "severity:low" || n === "low")
        risk = risk === null ? "low" : maxRisk(risk, "low");
    if (n === "risk:medium" || n === "severity:medium" || n === "medium" || n === "moderate")
        risk = risk === null ? "medium" : maxRisk(risk, "medium");
    if (n === "risk:high" || n === "severity:high" || n === "high")
        risk = risk === null ? "high" : maxRisk(risk, "high");
    if (n === "risk:critical" || n === "severity:critical" || n === "critical")
        risk = risk === null ? "critical" : maxRisk(risk, "critical");
} return risk; }
function inferRiskFromCategoryAndText(category, text) { if (containsAny(text, ["private key", "secret leak", "token leaked", "rce", "remote code execution", "critical"]))
    return "critical"; if (containsAny(text, ["branch protection", "app permissions", "administrator", "workflow", ".github/workflows", "kill switch"]))
    return "high"; switch (category) {
    case "security":
    case "policy":
    case "workflow":
    case "network_offer": return "high";
    case "docs":
    case "test":
    case "question":
    case "chore": return "low";
    case "bug":
    case "ci":
    case "dependency":
    case "feature":
    case "operator_command":
    case "unknown": return "medium";
} }
function inferApprovalClass(labels, text, category, risk) { const explicit = approvalClassFromLabels(labels); if (explicit !== null)
    return explicit; if (containsAny(text, ["branch protection", "app permissions", "github app permissions", "administration", "open federation"]))
    return "D"; if (risk === "critical")
    return "D"; if (risk === "high" || category === "workflow" || category === "policy" || category === "security" || category === "network_offer")
    return "C"; if (category === "docs" || category === "test" || category === "chore")
    return "A"; return "B"; }
function approvalClassFromLabels(labels) { for (const label of labels) {
    if (label === "class:a" || label === "approval:a")
        return "A";
    if (label === "class:b" || label === "approval:b")
        return "B";
    if (label === "class:c" || label === "approval:c")
        return "C";
    if (label === "class:d" || label === "approval:d")
        return "D";
} return null; }
function buildTaskCandidate(params) { return { candidateId: candidateIdFromSourceKey(params.sourceKey), sourceKey: params.sourceKey, sourceKind: params.input.sourceKind, repositoryFullName: params.input.repositoryFullName ?? null, number: Number.isSafeInteger(params.input.number) ? params.input.number ?? null : null, url: params.input.url ?? null, title: params.title, summary: params.summary, category: params.category, risk: params.risk, approvalClass: params.approvalClass, labels: params.labels, autoRequested: true, bodyExcerpt: truncate(normalizeWhitespace(params.input.body ?? params.input.commentBody ?? ""), 500), plannerHints: plannerHintsForCategory(params.category) }; }
function plannerHintsForCategory(category) { const forbiddenPathHints = [".github/workflows/**", ".forge/policies/**", ".forge/network/**"]; switch (category) {
    case "docs": return { oneTaskOnePr: true, recommendedScope: "docs-only", mutablePathHints: ["README.md", "docs/**", "*.md"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "test": return { oneTaskOnePr: true, recommendedScope: "tests-only-or-test-adjacent", mutablePathHints: ["tests/**", "**/*.test.*", "docs/specs/fixtures/**"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "bug": return { oneTaskOnePr: true, recommendedScope: "minimal-bugfix-with-regression-test", mutablePathHints: ["src/**", "tests/**", "packages/**", "apps/**", "crates/**"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "ci": return { oneTaskOnePr: true, recommendedScope: "diagnose-ci-before-editing", mutablePathHints: ["src/**", "tests/**", "docs/**", "packages/**", "apps/**", "crates/**"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "dependency": return { oneTaskOnePr: true, recommendedScope: "single-dependency-or-lockfile-change", mutablePathHints: ["package.json", "pnpm-lock.yaml", "package-lock.json", "Cargo.toml", "Cargo.lock"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "feature": return { oneTaskOnePr: true, recommendedScope: "small-feature-slice", mutablePathHints: ["src/**", "tests/**", "docs/**", "packages/**", "apps/**", "crates/**"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "chore": return { oneTaskOnePr: true, recommendedScope: "small-maintenance-change", mutablePathHints: ["docs/**", "src/**", "tests/**", "packages/**", "apps/**", "crates/**"], forbiddenPathHints, requiresHumanReviewBeforePlanning: false };
    case "security":
    case "workflow":
    case "policy":
    case "network_offer":
    case "operator_command":
    case "question":
    case "unknown": return { oneTaskOnePr: true, recommendedScope: "manual-triage-required", mutablePathHints: [], forbiddenPathHints, requiresHumanReviewBeforePlanning: true };
} }
function buildSourceKey(input) { if (typeof input.externalId === "string" && input.externalId.trim().length > 0)
    return normalizeWhitespace(input.externalId); const repo = normalizeRepository(input.repositoryFullName ?? "unknown/unknown"); const number = Number.isSafeInteger(input.number) ? `${input.number}` : "unknown"; return `github://${repo}/${input.sourceKind}/${number}`; }
function candidateIdFromSourceKey(sourceKey) { return `forge-task://${sourceKey.replace(/^github:\/\//, "github/").replace(/[^A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=-]+/g, "-")}`; }
function normalizeRepository(repositoryFullName) { const normalized = normalizeWhitespace(repositoryFullName).toLowerCase(); return normalized.length === 0 ? "unknown/unknown" : normalized; }
function normalizeTitle(input) { const direct = normalizeWhitespace(input.title ?? ""); if (direct.length > 0)
    return truncate(direct, 140); const body = normalizeWhitespace(input.body ?? input.commentBody ?? ""); if (body.length > 0)
    return truncate(body, 140); return `Untitled ${input.sourceKind}`; }
function buildSearchText(input, labels) { return [input.sourceKind, input.alertKind ?? "", input.severity ?? "", input.eventName ?? "", input.action ?? "", input.checkConclusion ?? "", input.title ?? "", input.body ?? "", input.commentBody ?? "", (input.changedPaths ?? []).join(" "), labels.join(" ")].join("\n").toLowerCase(); }
function summarizeText(text) { const normalized = normalizeWhitespace(text ?? ""); if (normalized.length === 0)
    return "No body text was supplied."; const sentenceEnd = normalized.search(/[.!?。！？]\s/); const firstSentence = sentenceEnd > 0 ? normalized.slice(0, sentenceEnd + 1) : normalized; return truncate(firstSentence, 240); }
function normalizeWhitespace(value) { return value.replace(/\s+/g, " ").trim(); }
function truncate(value, maxLength) { if (value.length <= maxLength)
    return value; if (maxLength <= 1)
    return value.slice(0, maxLength); return `${value.slice(0, maxLength - 1)}…`; }
function hasAnyLabel(labels, candidates) { for (const candidate of candidates)
    if (labels.includes(candidate))
        return true; return false; }
function firstMatchingKeyword(text, keywords) { for (const keyword of keywords)
    if (text.includes(keyword))
        return keyword; return null; }
function containsAny(text, keywords) { return firstMatchingKeyword(text, keywords) !== null; }
function maxRisk(a, b) { return RISK_RANK[a] >= RISK_RANK[b] ? a : b; }
function uniqueStrings(values) { const seen = new Set(); const result = []; for (const value of values) {
    if (seen.has(value))
        continue;
    seen.add(value);
    result.push(value);
} return result; }
function asRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null; }
function readString(object, key) { if (object === null)
    return null; const value = object[key]; return typeof value === "string" ? value : null; }
function readNumber(object, key) { if (object === null)
    return null; const value = object[key]; return typeof value === "number" && Number.isSafeInteger(value) ? value : null; }
function readNestedString(object, path) { let current = object; for (let index = 0; index < path.length; index += 1) {
    const key = path[index];
    if (key === undefined || current === null)
        return null;
    const value = current[key];
    if (index === path.length - 1)
        return typeof value === "string" ? value : null;
    current = asRecord(value);
} return null; }
function readLabels(value) { if (!Array.isArray(value))
    return []; const labels = []; for (const item of value) {
    if (typeof item === "string")
        labels.push(item);
    else if (typeof item === "object" && item !== null && !Array.isArray(item)) {
        const name = item.name;
        if (typeof name === "string")
            labels.push({ name });
    }
} return labels; }
//# sourceMappingURL=intake.js.map