import { type IntakeClassification, type IntakeInput, type NormalizedTaskCandidate } from "./intake.js";
import { type PlanSpec } from "./plan-schema.js";
export type PlannerRunSource = "github_webhook" | "intake_input" | "task_candidate";
export type PlannerRunStatus = "planned" | "ignored" | "blocked" | "escalated" | "invalid";
export interface PlannerRunInput {
    readonly source: PlannerRunSource;
    readonly eventName?: string;
    readonly action?: string | null;
    readonly deliveryId?: string | null;
    readonly repositoryFullName?: string | null;
    readonly receivedAt?: string | null;
    readonly payload?: unknown;
    readonly intake?: IntakeInput;
    readonly task?: NormalizedTaskCandidate;
    readonly now?: string;
}
export interface PlannerRunResult {
    readonly status: PlannerRunStatus;
    readonly intake?: IntakeClassification;
    readonly task?: NormalizedTaskCandidate;
    readonly plan?: PlanSpec;
    readonly reasons: readonly string[];
    readonly auditTrail: readonly string[];
}
export interface PlannerContextRecipe {
    readonly staticSlots: readonly string[];
    readonly dynamicSlots: readonly string[];
    readonly forbiddenSlots: readonly string[];
    readonly outputContract: readonly string[];
}
export declare const PLANNER_CONTEXT_RECIPE: PlannerContextRecipe;
export declare const PLANNER_BOUNDED_OUTPUT_CONTRACT: {
    readonly produces: readonly ["plan_spec"];
    readonly forbids: readonly ["executor_file_editing", "branch_creation", "commit_creation", "pull_request_creation", "audit_report_generation", "network_or_federation_action"];
    readonly maxPlanSpecsPerRun: 1;
    readonly oneTaskOnePr: true;
};
export declare function runPlanner(input: PlannerRunInput): PlannerRunResult;
