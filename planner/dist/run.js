import { classifyGitHubWebhook, classifyIntake, } from "./intake.js";
import { createPlanSpecFromTaskCandidate, validatePlanSpec, } from "./plan-schema.js";
export const PLANNER_CONTEXT_RECIPE = {
    staticSlots: [
        "mind_summary",
        "constitution_digest",
        "runtime_mode_digest",
        "plan_spec_contract",
    ],
    dynamicSlots: [
        "source_issue_or_event",
        "intake_classification",
        "normalized_task_candidate",
        "mutable_path_hints",
    ],
    forbiddenSlots: [
        "executor_patch",
        "audit_report",
        "pr_body",
        "branch_or_commit_mutation",
    ],
    outputContract: [
        "at_most_one_plan_spec",
        "one_task_one_pr_true",
        "mutable_paths_non_empty",
        "out_of_scope_non_empty",
        "approval_class_present",
        "machine_checkable_acceptance_criteria",
    ],
};
export const PLANNER_BOUNDED_OUTPUT_CONTRACT = {
    produces: ["plan_spec"],
    forbids: [
        "executor_file_editing",
        "branch_creation",
        "commit_creation",
        "pull_request_creation",
        "audit_report_generation",
        "network_or_federation_action",
    ],
    maxPlanSpecsPerRun: 1,
    oneTaskOnePr: true,
};
const PLANNER_RUN_SOURCES = new Set(["github_webhook", "intake_input", "task_candidate"]);
const SOURCE_KINDS = new Set(["issue", "issue_comment", "alert", "check_run", "workflow_run"]);
const CATEGORIES = new Set(["docs", "test", "bug", "ci", "dependency", "security", "workflow", "policy", "feature", "question", "network_offer", "operator_command", "chore", "unknown"]);
const RISKS = new Set(["low", "medium", "high", "critical"]);
const APPROVAL_CLASSES = new Set(["A", "B", "C", "D"]);
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
export function runPlanner(input) {
    const auditTrail = ["planner_runtime:T017", "contract:one_task_one_pr", "contract:no_mutating_operations"];
    if (!isPlannerRunSource(input.source)) {
        return invalidResult([`unsupported_source:${String(input.source)}`], auditTrail);
    }
    const nowResult = resolveCreatedAt(input.now);
    if (!nowResult.ok)
        return invalidResult([nowResult.reason], [...auditTrail, `source:${input.source}`]);
    const createdAt = nowResult.value;
    if (input.source === "github_webhook") {
        return runFromGitHubWebhook(input, createdAt, [...auditTrail, "source:github_webhook"]);
    }
    if (input.source === "intake_input") {
        return runFromIntakeInput(input, createdAt, [...auditTrail, "source:intake_input"]);
    }
    return runFromTaskCandidate(input, createdAt, [...auditTrail, "source:task_candidate"]);
}
function runFromGitHubWebhook(input, createdAt, auditTrail) {
    const eventName = normalizeNonEmptyString(input.eventName);
    if (eventName === null)
        return invalidResult(["missing_event_name"], auditTrail);
    const payload = asJsonObject(input.payload);
    if (payload === null)
        return invalidResult(["payload_must_be_object"], [...auditTrail, `event:${eventName}`]);
    const webhook = {
        eventName,
        action: input.action ?? null,
        deliveryId: input.deliveryId ?? null,
        receivedAt: input.receivedAt ?? createdAt,
        repositoryFullName: input.repositoryFullName ?? null,
        payload,
    };
    const intake = classifyGitHubWebhook(webhook);
    if (intake === null)
        return invalidResult([`unsupported_or_malformed_webhook:${eventName}`], [...auditTrail, `event:${eventName}`]);
    return resultFromClassification(intake, createdAt, [...auditTrail, `event:${eventName}`, `classification:${intake.disposition}`]);
}
function runFromIntakeInput(input, createdAt, auditTrail) {
    if (!isIntakeInput(input.intake))
        return invalidResult(["intake_input_required"], auditTrail);
    const intake = classifyIntake(input.intake);
    return resultFromClassification(intake, createdAt, [...auditTrail, `classification:${intake.disposition}`]);
}
function runFromTaskCandidate(input, createdAt, auditTrail) {
    if (!isNormalizedTaskCandidate(input.task))
        return invalidResult(["task_candidate_required"], auditTrail);
    return plannedResult(input.task, undefined, createdAt, [...auditTrail, "classification:pre_accepted_task_candidate"]);
}
function resultFromClassification(intake, createdAt, auditTrail) {
    const baseReasons = combineReasons(intake.reasons);
    if (intake.disposition === "ignore") {
        return {
            status: "ignored",
            intake,
            reasons: combineReasons(baseReasons, intake.ignoredBy),
            auditTrail: [...auditTrail, "plan:none", "reason:ignored_before_planning"],
        };
    }
    if (intake.disposition === "block") {
        return {
            status: "blocked",
            intake,
            reasons: combineReasons(baseReasons, intake.blockedBy),
            auditTrail: [...auditTrail, "plan:none", "reason:block_before_planning"],
        };
    }
    if (intake.disposition === "escalate") {
        return {
            status: "escalated",
            intake,
            reasons: combineReasons(baseReasons, intake.escalatedBy),
            auditTrail: [...auditTrail, "plan:none", "reason:human_review_required_before_planning"],
        };
    }
    if (intake.task === null) {
        return {
            status: "invalid",
            intake,
            reasons: combineReasons(baseReasons, ["accepted_intake_missing_task_candidate"]),
            auditTrail: [...auditTrail, "plan:none", "reason:accepted_without_task_candidate"],
        };
    }
    return plannedResult(intake.task, intake, createdAt, auditTrail);
}
function plannedResult(task, intake, createdAt, auditTrail) {
    const options = { createdAt };
    const plan = createPlanSpecFromTaskCandidate(task, options);
    const validation = validatePlanSpec(plan);
    if (!validation.ok) {
        return {
            status: "invalid",
            ...(intake === undefined ? {} : { intake }),
            task,
            reasons: combineReasons(["generated_plan_failed_validation"], validation.issues.map(formatValidationIssue)),
            auditTrail: [...auditTrail, "plan:invalid", `validation_issues:${validation.issues.length}`],
        };
    }
    return {
        status: "planned",
        ...(intake === undefined ? {} : { intake }),
        task,
        plan,
        reasons: combineReasons([
            "accepted_for_planner_runtime",
            `plan_status:${plan.status}`,
            `approval_class:${plan.risk_and_approval.approval_class}`,
            `risk:${plan.risk_and_approval.risk}`,
        ]),
        auditTrail: [
            ...auditTrail,
            "plan:created",
            "plan_count:1",
            `plan_id:${plan.plan_id}`,
            `plan_status:${plan.status}`,
            `mutable_paths:${plan.scope_contract.mutable_paths.length}`,
            `out_of_scope:${plan.scope_contract.out_of_scope.length}`,
            `approval_class:${plan.risk_and_approval.approval_class}`,
            "validation:ok",
        ],
    };
}
function invalidResult(reasons, auditTrail) {
    return { status: "invalid", reasons: combineReasons(reasons), auditTrail: [...auditTrail, "plan:none"] };
}
function resolveCreatedAt(now) {
    if (now === undefined)
        return { ok: true, value: new Date().toISOString() };
    if (!RFC3339_UTC.test(now))
        return { ok: false, reason: "now_must_be_rfc3339_utc" };
    return { ok: true, value: now };
}
function isPlannerRunSource(value) {
    return typeof value === "string" && PLANNER_RUN_SOURCES.has(value);
}
function isIntakeInput(value) {
    const record = asRecord(value);
    if (record === null)
        return false;
    return typeof record.sourceKind === "string" && SOURCE_KINDS.has(record.sourceKind);
}
function isNormalizedTaskCandidate(value) {
    const record = asRecord(value);
    if (record === null)
        return false;
    const hints = asRecord(record.plannerHints);
    return (typeof record.candidateId === "string" && record.candidateId.length > 0 &&
        typeof record.sourceKey === "string" && record.sourceKey.length > 0 &&
        typeof record.sourceKind === "string" && SOURCE_KINDS.has(record.sourceKind) &&
        (typeof record.repositoryFullName === "string" || record.repositoryFullName === null) &&
        (typeof record.number === "number" || record.number === null) &&
        (typeof record.url === "string" || record.url === null) &&
        typeof record.title === "string" && record.title.length > 0 &&
        typeof record.summary === "string" && record.summary.length > 0 &&
        typeof record.category === "string" && CATEGORIES.has(record.category) &&
        typeof record.risk === "string" && RISKS.has(record.risk) &&
        typeof record.approvalClass === "string" && APPROVAL_CLASSES.has(record.approvalClass) &&
        isStringArray(record.labels) &&
        record.autoRequested === true &&
        typeof record.bodyExcerpt === "string" &&
        isPlannerHints(hints));
}
function isPlannerHints(value) {
    return value !== null &&
        value.oneTaskOnePr === true &&
        typeof value.recommendedScope === "string" &&
        isStringArray(value.mutablePathHints) &&
        isStringArray(value.forbiddenPathHints) &&
        typeof value.requiresHumanReviewBeforePlanning === "boolean";
}
function asJsonObject(value) {
    const record = asRecord(value);
    return record === null ? null : record;
}
function asRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : null;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function normalizeNonEmptyString(value) {
    if (typeof value !== "string")
        return null;
    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
}
function combineReasons(...reasonGroups) {
    const result = [];
    const seen = new Set();
    for (const group of reasonGroups) {
        const reasons = typeof group === "string" ? [group] : group;
        for (const reason of reasons) {
            const normalized = reason.trim();
            if (normalized.length === 0 || seen.has(normalized))
                continue;
            seen.add(normalized);
            result.push(normalized);
        }
    }
    return result;
}
function formatValidationIssue(issue) {
    return `${issue.path}:${issue.code}`;
}
//# sourceMappingURL=run.js.map