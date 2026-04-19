export type WorktreePrepareStatus = "ready" | "blocked" | "invalid";
export type ApprovalClassLike = "A" | "B" | "C" | "D";
export type RiskLike = "low" | "medium" | "high" | "critical";
export interface PlanSpecLike {
    readonly plan_id: string;
    readonly status: string;
    readonly created_at: string;
    readonly title: string;
    readonly source: {
        readonly kind?: string;
        readonly source_key?: string;
        readonly candidate_id?: string;
        readonly repository?: string | null;
        readonly issue_number?: number | null;
        readonly title?: string;
        readonly labels?: readonly string[];
    };
    readonly scope_contract: {
        readonly one_task_one_pr: true;
        readonly source_issue_count: 1;
        readonly no_default_branch_write: true;
        readonly mutable_paths: readonly string[];
        readonly immutable_paths: readonly string[];
        readonly out_of_scope: readonly string[];
        readonly max_files_changed: number;
        readonly max_diff_lines: number;
        readonly branch_naming_hint: string;
    };
    readonly risk_and_approval: {
        readonly risk: RiskLike | string;
        readonly approval_class: ApprovalClassLike | string;
        readonly human_review_required_before_execution: boolean;
        readonly human_review_required_before_merge?: boolean;
        readonly escalation_required: boolean;
        readonly reasons?: readonly string[];
    };
}
export interface BranchWorktreeOptions {
    readonly defaultBranch?: string;
    readonly baseRef?: string;
    readonly branchName?: string;
    readonly worktreeRoot?: string;
    readonly phase?: string;
    readonly taskId?: string;
    readonly approvedForExecution?: boolean;
    readonly approvalRef?: string;
    readonly now?: string;
}
export interface BranchWorktreePlan {
    readonly manifest_version: 1;
    readonly schema_ref: "urn:forgeroot:branch-worktree:v1";
    readonly manifest_id: string;
    readonly created_at: string;
    readonly plan_id: string;
    readonly source: {
        readonly repository: string | null;
        readonly issue_number: number | null;
        readonly candidate_id: string;
        readonly title: string;
    };
    readonly branch: {
        readonly name: string;
        readonly base_ref: string;
        readonly default_branch: string;
        readonly naming_rule: "forge/<phase>/<task-id>-<slug>";
        readonly delete_after_pr: true;
    };
    readonly worktree: {
        readonly root: string;
        readonly path: string;
        readonly ephemeral: true;
        readonly cleanup: "delete_after_pr_or_failure";
    };
    readonly scope: {
        readonly one_task_one_pr: true;
        readonly no_default_branch_write: true;
        readonly mutable_paths: readonly string[];
        readonly immutable_paths: readonly string[];
        readonly out_of_scope: readonly string[];
        readonly max_files_changed: number;
        readonly max_diff_lines: number;
    };
    readonly approval: {
        readonly approval_class: string;
        readonly risk: string;
        readonly approved_for_execution: boolean;
        readonly approval_ref: string | null;
        readonly human_review_required_before_execution: boolean;
    };
    readonly guards: {
        readonly enforce_clean_worktree: true;
        readonly enforce_mutable_paths: true;
        readonly forbid_default_branch_write: true;
        readonly forbid_workflow_policy_network_paths: true;
        readonly forbid_git_side_effects_in_manager: true;
    };
}
export interface BranchWorktreeValidationIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}
export interface BranchWorktreeValidationResult {
    readonly ok: boolean;
    readonly issues: readonly BranchWorktreeValidationIssue[];
}
export interface BranchWorktreeResult {
    readonly status: WorktreePrepareStatus;
    readonly plan?: BranchWorktreePlan;
    readonly reasons: readonly string[];
    readonly auditTrail: readonly string[];
    readonly issues?: readonly BranchWorktreeValidationIssue[];
}
export interface ChangedPathResult {
    readonly path: string;
    readonly status: "accepted" | "rejected";
    readonly reason: "mutable" | "immutable" | "outside_mutable_scope" | "invalid_path";
}
export interface ChangedPathsValidationResult {
    readonly ok: boolean;
    readonly acceptedPaths: readonly string[];
    readonly rejectedPaths: readonly ChangedPathResult[];
    readonly reasons: readonly string[];
}
export declare const BRANCH_WORKTREE_SCHEMA_REF: "urn:forgeroot:branch-worktree:v1";
export declare const BRANCH_WORKTREE_MANAGER_CONTRACT: {
    readonly produces: readonly ["branch_worktree_plan"];
    readonly forbids: readonly ["git_checkout", "git_branch_create", "git_worktree_add", "file_editing", "commit_creation", "pull_request_creation", "default_branch_write"];
    readonly branchPrefix: "forge/";
    readonly defaultWorktreeRoot: ".forgeroot/worktrees";
    readonly oneTaskOnePr: true;
};
export declare function createBranchWorktreePlan(plan: PlanSpecLike, options?: BranchWorktreeOptions): BranchWorktreeResult;
export declare function validateBranchWorktreePlan(plan: unknown): BranchWorktreeValidationResult;
export declare function validateChangedPaths(plan: BranchWorktreePlan, changedPaths: readonly string[]): ChangedPathsValidationResult;
