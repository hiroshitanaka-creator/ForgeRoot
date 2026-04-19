import type { ApprovalClass, IntakeCategory, IntakeRisk, IntakeSourceKind, JsonValue, NormalizedTaskCandidate } from "./intake.js";
export declare const PLAN_SPEC_VERSION: 1;
export declare const PLAN_SPEC_SCHEMA_REF = "urn:forgeroot:plan-spec:v1";
export type PlanSpecVersion = typeof PLAN_SPEC_VERSION;
export type PlanStatus = "draft" | "ready_for_execution" | "blocked_for_human" | "superseded";
export type PlanStepKind = "inspect" | "edit" | "diagnose" | "test" | "audit" | "document" | "dependency";
export type AcceptanceEvidence = "diff" | "command_output" | "metadata" | "file_content";
export type AcceptanceCheckKind = "command" | "path_changed" | "path_not_changed" | "forbidden_paths_unchanged" | "diff_budget" | "text_contains" | "plan_field_equals";
export interface PlanSource {
    kind: IntakeSourceKind;
    source_key: string;
    candidate_id: string;
    repository: string | null;
    issue_number: number | null;
    url: string | null;
    title: string;
    labels: readonly string[];
}
export interface ScopeContract {
    one_task_one_pr: true;
    source_issue_count: 1;
    no_default_branch_write: true;
    mutable_paths: readonly string[];
    immutable_paths: readonly string[];
    out_of_scope: readonly string[];
    max_files_changed: number;
    max_diff_lines: number;
    branch_naming_hint: string;
}
export interface RiskAndApprovalLink {
    risk: IntakeRisk;
    approval_class: ApprovalClass;
    human_review_required_before_execution: boolean;
    human_review_required_before_merge: boolean;
    escalation_required: boolean;
    reasons: readonly string[];
}
export interface AcceptanceCheck {
    kind: AcceptanceCheckKind;
    machine: true;
    paths?: readonly string[];
    command?: string;
    expected_exit_code?: number;
    max_files_changed?: number;
    max_diff_lines?: number;
    field?: string;
    expected?: JsonValue;
    needle?: string;
}
export interface AcceptanceCriterion {
    id: string;
    description: string;
    required: true;
    evidence: AcceptanceEvidence;
    check: AcceptanceCheck;
}
export interface PlanStep {
    id: string;
    kind: PlanStepKind;
    description: string;
    allowed_paths: readonly string[];
    produces: readonly string[];
}
export interface PlanSpec {
    plan_version: PlanSpecVersion;
    schema_ref: typeof PLAN_SPEC_SCHEMA_REF;
    plan_id: string;
    status: PlanStatus;
    created_at: string;
    source: PlanSource;
    title: string;
    goal: string;
    summary: string;
    category: IntakeCategory;
    scope_contract: ScopeContract;
    risk_and_approval: RiskAndApprovalLink;
    acceptance_criteria: readonly AcceptanceCriterion[];
    execution_steps: readonly PlanStep[];
    audit: {
        required_evidence: readonly AcceptanceEvidence[];
        independent_audit_required: boolean;
    };
    extensions: Record<string, JsonValue>;
}
export interface CreatePlanSpecOptions {
    createdAt?: string;
    planIdPrefix?: string;
    maxFilesChanged?: number;
    maxDiffLines?: number;
}
export interface PlanValidationIssue {
    path: string;
    code: string;
    message: string;
}
export interface PlanValidationResult {
    ok: boolean;
    issues: readonly PlanValidationIssue[];
}
export declare function createPlanSpecFromTaskCandidate(task: NormalizedTaskCandidate, options?: CreatePlanSpecOptions): PlanSpec;
export declare function validatePlanSpec(plan: unknown): PlanValidationResult;
export declare function assertValidPlanSpec(plan: unknown): asserts plan is PlanSpec;
