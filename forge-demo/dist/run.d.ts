export declare const FORGE_DEMO_VERSION: 1;
export declare const E2E_FORGED_PR_DEMO_SCHEMA_REF: "urn:forgeroot:e2e-forged-pr-demo:v1";
export type ForgeDemoStatus = "ready" | "blocked" | "delayed" | "quarantined" | "invalid";
export type ForgeDemoDecision = "demo_chain_ready" | "blocked_before_pr_transport" | "delayed_before_transport" | "quarantine_before_transport" | "invalid_demo_input_or_chain";
export interface ForgeDemoIssueInput {
    readonly sourceKind?: string;
    readonly action?: string;
    readonly repositoryFullName?: string;
    readonly number?: number;
    readonly url?: string;
    readonly title?: string;
    readonly body?: string;
    readonly labels?: readonly string[];
}
export interface ForgeDemoInput {
    readonly now?: string;
    readonly issue?: ForgeDemoIssueInput;
    readonly intake?: unknown;
    readonly plannerInput?: unknown;
    readonly defaultBranch?: string;
    readonly worktreeRoot?: string;
    readonly changedPaths?: readonly string[];
    readonly sandboxOutput?: unknown;
    readonly evidence?: unknown;
    readonly installation?: unknown;
    readonly runtime?: unknown;
    readonly rateLimit?: unknown;
    readonly rateState?: unknown;
    readonly humanApproval?: unknown;
    readonly humanApprovals?: readonly unknown[];
    readonly labels?: readonly string[];
    readonly reviewers?: readonly string[];
    readonly teamReviewers?: readonly string[];
    readonly draft?: boolean;
    readonly dryRun?: boolean;
    readonly idempotencyKey?: string;
}
export interface ForgeDemoStep {
    readonly name: string;
    readonly status: string;
    readonly produced: string | null;
    readonly id: string | null;
}
export interface ForgeDemoValidationIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}
export interface ForgeDemoValidationResult {
    readonly ok: boolean;
    readonly issues: readonly ForgeDemoValidationIssue[];
}
export interface ForgeDemoResult {
    readonly manifest_version: typeof FORGE_DEMO_VERSION;
    readonly schema_ref: typeof E2E_FORGED_PR_DEMO_SCHEMA_REF;
    readonly demo_id: string;
    readonly created_at: string;
    readonly status: ForgeDemoStatus;
    readonly decision: ForgeDemoDecision;
    readonly reasons: readonly string[];
    readonly auditTrail: readonly string[];
    readonly steps: readonly ForgeDemoStep[];
    readonly summary: {
        readonly source_issue: string | null;
        readonly repository: string | null;
        readonly plan_id: string | null;
        readonly worktree_manifest_id: string | null;
        readonly sandbox_request_id: string | null;
        readonly audit_id: string | null;
        readonly composition_id: string | null;
        readonly github_request_id: string | null;
        readonly authorization_id: string | null;
        readonly dispatch_id: string | null;
        readonly pr_title: string | null;
        readonly head: string | null;
        readonly base: string | null;
        readonly approval_class: string | null;
        readonly risk: string | null;
        readonly rate_governor_status: string | null;
    };
    readonly invariants: {
        readonly one_task_one_pr: boolean;
        readonly source_issue_count: number | null;
        readonly no_default_branch_write: boolean;
        readonly pr_body_contains_risk_summary: boolean;
        readonly pr_body_contains_acceptance_criteria: boolean;
        readonly approval_gate_preserved: boolean;
        readonly live_github_transport_performed: false;
        readonly real_pull_request_created: false;
        readonly merge_or_approval_executed: false;
        readonly memory_or_evaluation_updated: false;
        readonly federation_performed: false;
    };
    readonly chain: {
        readonly planner?: unknown;
        readonly plan?: unknown;
        readonly worktreeResult?: unknown;
        readonly worktreePlan?: unknown;
        readonly sandboxResult?: unknown;
        readonly sandboxRequest?: unknown;
        readonly sandboxObservedOutput?: unknown;
        readonly sandboxObservedValidation?: unknown;
        readonly auditResult?: unknown;
        readonly auditReport?: unknown;
        readonly prComposerResult?: unknown;
        readonly prComposition?: unknown;
        readonly githubAdapterResult?: unknown;
        readonly githubRequest?: unknown;
        readonly approvalCheckpointResult?: unknown;
        readonly transportAuthorization?: unknown;
        readonly rateGovernorResult?: unknown;
        readonly rateGovernorDispatch?: unknown;
    };
    readonly issues?: readonly ForgeDemoValidationIssue[];
}
export declare const E2E_FORGED_PR_DEMO_CONTRACT: {
    readonly consumes: readonly ["forge_auto_issue_like_input", "planner_runtime", "branch_worktree_manager", "sandbox_execution_request", "sandbox_observed_output", "audit_result", "pull_request_composition", "github_pull_request_creation_request", "trusted_transport_authorization"];
    readonly produces: readonly ["e2e_forged_pr_demo_manifest", "full_phase1_manifest_chain", "rate_governed_dispatch_manifest"];
    readonly validates: readonly ["one_issue_to_one_plan", "one_plan_to_one_worktree_manifest", "one_worktree_to_one_sandbox_request", "sandbox_output_with_declared_artifacts", "passed_independent_audit", "reviewable_pr_composition_body", "github_app_pr_request_manifest", "approval_checkpoint_authorization", "rate_governor_dispatch"];
    readonly forbids: readonly ["live_github_api_transport", "real_pull_request_creation", "merge_operation", "approval_execution", "default_branch_write", "file_editing_in_demo_harness", "command_execution_in_demo_harness", "token_material_or_token_persistence", "workflow_mutation", "policy_mutation", "memory_or_evaluation_updates", "network_or_federation_behavior", "self_evolution"];
    readonly oneTaskOnePr: true;
    readonly demoOnly: true;
};
export declare function runEndToEndForgedPrDemo(input?: ForgeDemoInput): ForgeDemoResult;
export declare const runForgeDemo: typeof runEndToEndForgedPrDemo;
export declare const runEndToEndDemo: typeof runEndToEndForgedPrDemo;
export declare const runE2EForgedPrDemo: typeof runEndToEndForgedPrDemo;
export declare const runT028Demo: typeof runEndToEndForgedPrDemo;
export declare function validateEndToEndForgedPrDemo(value: unknown): ForgeDemoValidationResult;
export declare const validateForgeDemo: typeof validateEndToEndForgedPrDemo;
export declare const validateE2EForgedPrDemo: typeof validateEndToEndForgedPrDemo;
export declare const validateT028Demo: typeof validateEndToEndForgedPrDemo;
