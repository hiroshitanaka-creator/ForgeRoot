export declare const FORGE_AUTO_LABEL = "forge:auto";
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = {
    [key: string]: JsonValue | undefined;
};
export type IntakeSourceKind = "issue" | "issue_comment" | "alert" | "check_run" | "workflow_run";
export type IntakeCategory = "docs" | "test" | "bug" | "ci" | "dependency" | "security" | "workflow" | "policy" | "feature" | "question" | "network_offer" | "operator_command" | "chore" | "unknown";
export type IntakeDisposition = "accept" | "ignore" | "block" | "escalate";
export type IntakeRisk = "low" | "medium" | "high" | "critical";
export type ApprovalClass = "A" | "B" | "C" | "D";
export interface IntakeInput {
    sourceKind: IntakeSourceKind;
    repositoryFullName?: string | null;
    number?: number | null;
    externalId?: string | null;
    url?: string | null;
    title?: string | null;
    body?: string | null;
    commentBody?: string | null;
    labels?: readonly (string | {
        name?: string | null;
    })[];
    state?: string | null;
    alertKind?: string | null;
    severity?: string | null;
    action?: string | null;
    eventName?: string | null;
    checkConclusion?: string | null;
    changedPaths?: readonly string[];
    receivedAt?: string | null;
}
export interface GitHubWebhookLike {
    eventName: string;
    action?: string | null;
    deliveryId?: string | null;
    receivedAt?: string | null;
    repositoryFullName?: string | null;
    payload: JsonObject;
}
export interface PlannerHints {
    oneTaskOnePr: true;
    recommendedScope: string;
    mutablePathHints: readonly string[];
    forbiddenPathHints: readonly string[];
    requiresHumanReviewBeforePlanning: boolean;
}
export interface NormalizedTaskCandidate {
    candidateId: string;
    sourceKey: string;
    sourceKind: IntakeSourceKind;
    repositoryFullName: string | null;
    number: number | null;
    url: string | null;
    title: string;
    summary: string;
    category: IntakeCategory;
    risk: IntakeRisk;
    approvalClass: ApprovalClass;
    labels: readonly string[];
    autoRequested: true;
    bodyExcerpt: string;
    plannerHints: PlannerHints;
}
export interface IntakeClassification {
    sourceKind: IntakeSourceKind;
    sourceKey: string;
    category: IntakeCategory;
    disposition: IntakeDisposition;
    autoRequested: boolean;
    isAutoTarget: boolean;
    risk: IntakeRisk;
    approvalClass: ApprovalClass;
    task: NormalizedTaskCandidate | null;
    labels: readonly string[];
    reasons: readonly string[];
    signals: readonly string[];
    blockedBy: readonly string[];
    ignoredBy: readonly string[];
    escalatedBy: readonly string[];
}
export declare function classifyIntake(input: IntakeInput): IntakeClassification;
export declare const classifyIssueIntake: typeof classifyIntake;
export declare function classifyIssue(input: Omit<IntakeInput, "sourceKind">): IntakeClassification;
export declare function classifyIssueComment(input: Omit<IntakeInput, "sourceKind">): IntakeClassification;
export declare function classifyAlert(input: Omit<IntakeInput, "sourceKind">): IntakeClassification;
export declare function classifyGitHubWebhook(input: GitHubWebhookLike): IntakeClassification | null;
export declare function intakeInputFromGitHubWebhook(input: GitHubWebhookLike): IntakeInput | null;
export declare function normalizeLabels(labels: readonly (string | {
    name?: string | null;
})[]): readonly string[];
