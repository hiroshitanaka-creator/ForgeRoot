export declare const SELF_HOST_BOOTSTRAP_VERSION: 1;
export declare const SELF_HOST_BOOTSTRAP_SCHEMA_REF: "urn:forgeroot:self-host-bootstrap:v1";
export declare const SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY: "hiroshitanaka-creator/ForgeRoot";
export type SelfHostBootstrapStatus = "ready" | "blocked" | "invalid";
export type SelfHostBootstrapDecision = "self_host_bootstrap_ready" | "self_host_bootstrap_blocked" | "invalid_self_host_bootstrap_input";
export interface SelfHostBootstrapIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}
export interface SelfHostBootstrapApprovalInput {
    readonly approved?: boolean;
    readonly approver?: string;
    readonly approved_at?: string;
}
export interface SelfHostBootstrapInput {
    readonly now?: string;
    readonly target_repository?: string;
    readonly self_host_mode?: string;
    readonly human_bootstrap_approval?: SelfHostBootstrapApprovalInput;
    readonly forgeDemoInput?: unknown;
    readonly forgeDemoResult?: unknown;
}
export interface SelfHostBootstrapResult {
    readonly manifest_version: typeof SELF_HOST_BOOTSTRAP_VERSION;
    readonly schema_ref: typeof SELF_HOST_BOOTSTRAP_SCHEMA_REF;
    readonly bootstrap_id: string;
    readonly created_at: string;
    readonly status: SelfHostBootstrapStatus;
    readonly decision: SelfHostBootstrapDecision;
    readonly reasons: readonly string[];
    readonly request: {
        readonly target_repository: string;
        readonly self_host_mode: string;
    };
    readonly approval: {
        readonly approved: boolean;
        readonly approver: string | null;
        readonly approved_at: string | null;
    };
    readonly invariants: {
        readonly self_host_target_locked: true;
        readonly self_host_live_mode_disabled: true;
        readonly self_host_execution_performed: false;
        readonly workflow_mutation_performed: false;
        readonly policy_mutation_performed: false;
        readonly real_pull_request_created: false;
        readonly merge_or_approval_executed: false;
        readonly human_bootstrap_approval_required: true;
        readonly forge_demo_chain_ready: boolean;
    };
    readonly forge_demo_ref: {
        readonly demo_id: string | null;
        readonly status: string | null;
    };
    readonly chain: {
        readonly forgeDemoResult?: unknown;
    };
    readonly bootstrap_digest: string;
    readonly issues?: readonly SelfHostBootstrapIssue[];
}
export interface SelfHostBootstrapValidation {
    readonly ok: boolean;
    readonly issues: readonly SelfHostBootstrapIssue[];
}
export declare const SELF_HOST_BOOTSTRAP_CONTRACT: {
    readonly consumes: readonly ["t028_e2e_forged_pr_demo_manifest", "human_bootstrap_approval"];
    readonly produces: readonly ["t071_self_host_bootstrap_manifest"];
    readonly validates: readonly ["target_repository_is_forgeroot_only", "self_host_mode_dry_run_only", "human_bootstrap_approval_present_and_valid", "forge_demo_chain_ready"];
    readonly forbids: readonly ["self_host_live_mode", "self_host_execution", "workflow_mutation", "policy_mutation", "real_pull_request_creation", "merge_operation", "approval_execution"];
    readonly deterministic: true;
    readonly labOnly: true;
    readonly manifestOnly: true;
};
export declare function runSelfHostBootstrap(input?: SelfHostBootstrapInput): SelfHostBootstrapResult;
export declare function validateSelfHostBootstrap(value: unknown): SelfHostBootstrapValidation;
export declare const runT071SelfHostBootstrap: typeof runSelfHostBootstrap;
export declare const validateT071SelfHostBootstrap: typeof validateSelfHostBootstrap;
