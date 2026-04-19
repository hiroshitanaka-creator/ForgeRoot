export declare const PR_COMPOSITION_SCHEMA_REF: "urn:forgeroot:pr-composition:v1";
export declare const PR_COMPOSER_VERSION: 1;
export type PullRequestComposerStatus = "ready" | "blocked" | "invalid";
export interface PullRequestComposerInput {
    readonly plan: unknown;
    readonly worktreePlan: unknown;
    readonly sandboxRequest: unknown;
    readonly sandboxOutput: unknown;
    readonly auditResult?: unknown;
    readonly auditReport?: unknown;
    readonly audit?: unknown;
    readonly now?: string;
    readonly repository?: string;
    readonly draft?: boolean;
    readonly labels?: readonly string[];
    readonly reviewers?: readonly string[];
    readonly teamReviewers?: readonly string[];
}
export interface PullRequestComposerIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}
export interface PullRequestComposerValidationResult {
    readonly ok: boolean;
    readonly issues: readonly PullRequestComposerIssue[];
}
export interface PullRequestComposerResult {
    readonly status: PullRequestComposerStatus;
    readonly composition?: PullRequestComposition;
    readonly reasons: readonly string[];
    readonly auditTrail: readonly string[];
    readonly issues?: readonly PullRequestComposerIssue[];
}
export interface PullRequestComposition {
    readonly manifest_version: typeof PR_COMPOSER_VERSION;
    readonly schema_ref: typeof PR_COMPOSITION_SCHEMA_REF;
    readonly composition_id: string;
    readonly created_at: string;
    readonly status: "ready_for_github_adapter";
    readonly repository: string | null;
    readonly plan_id: string;
    readonly worktree_manifest_id: string;
    readonly sandbox_request_id: string;
    readonly audit_id: string;
    readonly source: {
        readonly repository: string | null;
        readonly issue_number: number | null;
        readonly candidate_id: string;
        readonly title: string;
        readonly url: string | null;
    };
    readonly pull_request: {
        readonly title: string;
        readonly head: string;
        readonly base: string;
        readonly draft: boolean;
        readonly maintainer_can_modify: false;
        readonly body: string;
        readonly labels: readonly string[];
        readonly reviewers: readonly string[];
        readonly team_reviewers: readonly string[];
    };
    readonly review: {
        readonly approval_class: string;
        readonly risk: string;
        readonly human_review_required_before_merge: boolean;
        readonly merge_gate: "human_review_required" | "checks_required_before_merge";
        readonly check_summary: {
            readonly acceptance_total: number;
            readonly acceptance_passed: number;
            readonly acceptance_failed: number;
            readonly changed_paths: readonly string[];
            readonly command_ids: readonly string[];
            readonly artifact_paths: readonly string[];
        };
        readonly checks: readonly PullRequestCheckSummary[];
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
    readonly artifacts: readonly PullRequestArtifactSummary[];
    readonly provenance: {
        readonly generated_by: "forgeroot-pr-composer.alpha";
        readonly composer_version: string;
        readonly plan_id: string;
        readonly worktree_manifest_id: string;
        readonly sandbox_request_id: string;
        readonly audit_id: string;
        readonly source_issue: string | null;
        readonly branch: string;
        readonly base_ref: string;
    };
    readonly gates: {
        readonly pr_creation: "requires_github_adapter";
        readonly merge: "human_review_required" | "checks_required_before_merge";
        readonly audit: "passed";
        readonly approval_class: string;
    };
    readonly guards: {
        readonly no_github_mutation: true;
        readonly no_pull_request_creation_in_composer: true;
        readonly no_merge_operation: true;
        readonly no_auto_approval: true;
        readonly no_default_branch_write: true;
        readonly head_branch_not_default: true;
        readonly one_task_one_pr: true;
        readonly audit_passed_required: true;
        readonly approval_gate_preserved: true;
        readonly no_memory_or_evaluation_update: true;
        readonly no_network_or_federation_behavior: true;
    };
}
export interface PullRequestCheckSummary {
    readonly name: string;
    readonly status: "passed";
    readonly summary: string;
    readonly details: readonly string[];
}
export interface PullRequestArtifactSummary {
    readonly path: string;
    readonly media_type: string | null;
    readonly bytes: number | null;
    readonly sha256: string | null;
}
export declare const PR_COMPOSER_CONTRACT: {
    readonly consumes: readonly ["plan_spec", "branch_worktree_plan", "sandbox_execution_request", "sandbox_observed_output", "audit_result"];
    readonly produces: readonly ["pull_request_composition"];
    readonly validates: readonly ["passed_audit_gate", "input_chain_consistency", "head_branch_safety", "review_body_completeness", "approval_gate_preservation", "artifact_traceability"];
    readonly forbids: readonly ["github_mutation", "pull_request_creation_in_composer", "merge_operation", "auto_approval", "default_branch_write", "workflow_mutation", "policy_mutation", "approval_gate_weakening", "memory_or_evaluation_updates", "network_or_federation_behavior", "self_evolution"];
    readonly oneTaskOnePr: true;
    readonly composerOnly: true;
    readonly requiresPassedAudit: true;
};
export declare function composePullRequest(input: PullRequestComposerInput): PullRequestComposerResult;
export declare const composePr: typeof composePullRequest;
export declare const composePR: typeof composePullRequest;
export declare function validatePullRequestComposition(value: unknown): PullRequestComposerValidationResult;
export declare const validatePrComposition: typeof validatePullRequestComposition;
export declare const validatePRComposition: typeof validatePullRequestComposition;
