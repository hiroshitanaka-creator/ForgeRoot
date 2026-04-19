import { type BranchWorktreePlan } from "./worktree.js";
export type SandboxHarnessStatus = "ready" | "blocked" | "invalid";
export type SandboxExecutionMode = "dry_run" | "untrusted_execution";
export type SandboxNetworkMode = "off" | "allowlisted";
export type SandboxGithubTokenMode = "none" | "read_only";
export type SandboxCommandPhase = "prepare" | "execute" | "verify" | "collect";
export type SandboxArtifactKind = "patch" | "changed_paths" | "command_log" | "test_output" | "scan_result" | "sandbox_report";
export interface SandboxCommandInput {
    readonly id?: string;
    readonly phase?: SandboxCommandPhase;
    readonly argv: readonly string[];
    readonly cwd?: string;
    readonly timeout_ms?: number;
    readonly writable_paths?: readonly string[];
    readonly env?: Readonly<Record<string, string | number | boolean>>;
}
export interface SandboxCommand {
    readonly id: string;
    readonly phase: SandboxCommandPhase;
    readonly argv: readonly string[];
    readonly cwd: string;
    readonly timeout_ms: number;
    readonly writable_paths: readonly string[];
    readonly env: Readonly<Record<string, string>>;
}
export interface SandboxArtifactInput {
    readonly path: string;
    readonly kind?: SandboxArtifactKind;
    readonly media_type?: string;
    readonly required?: boolean;
    readonly max_bytes?: number;
}
export interface SandboxArtifact {
    readonly path: string;
    readonly kind: SandboxArtifactKind;
    readonly media_type: string;
    readonly required: boolean;
    readonly max_bytes: number;
}
export interface SandboxHarnessOptions {
    readonly now?: string;
    readonly mode?: SandboxExecutionMode;
    readonly commands?: readonly SandboxCommandInput[];
    readonly env?: Readonly<Record<string, string | number | boolean>>;
    readonly artifactRoot?: string;
    readonly artifacts?: readonly SandboxArtifactInput[];
    readonly networkMode?: SandboxNetworkMode;
    readonly networkAllowedHosts?: readonly string[];
    readonly githubTokenMode?: SandboxGithubTokenMode;
    readonly githubTokenPermissions?: readonly string[];
    readonly maxRuntimeMs?: number;
    readonly commandTimeoutMs?: number;
    readonly maxProcesses?: number;
    readonly maxArtifactBytes?: number;
}
export interface SandboxExecutionRequest {
    readonly manifest_version: 1;
    readonly schema_ref: "urn:forgeroot:sandbox-execution-request:v1";
    readonly request_id: string;
    readonly created_at: string;
    readonly mode: SandboxExecutionMode;
    readonly plan_id: string;
    readonly worktree_manifest_id: string;
    readonly source: BranchWorktreePlan["source"];
    readonly branch: {
        readonly name: string;
        readonly base_ref: string;
        readonly default_branch: string;
    };
    readonly worktree: {
        readonly root: string;
        readonly path: string;
        readonly ephemeral: true;
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
    readonly isolation: {
        readonly sandbox_kind: "ephemeral";
        readonly execution_trust: "untrusted";
        readonly network: {
            readonly mode: SandboxNetworkMode;
            readonly allowed_hosts: readonly string[];
        };
        readonly secrets: {
            readonly mount: false;
            readonly policy: "no_secrets";
        };
        readonly github_token: {
            readonly mode: SandboxGithubTokenMode;
            readonly permissions: readonly string[];
        };
        readonly max_runtime_ms: number;
        readonly max_processes: number;
    };
    readonly filesystem: {
        readonly worktree_path: string;
        readonly artifact_root: string;
        readonly writable_paths: readonly string[];
        readonly immutable_paths: readonly string[];
        readonly out_of_scope: readonly string[];
        readonly enforce_clean_worktree: true;
        readonly enforce_mutable_paths: true;
        readonly artifacts_outside_worktree: true;
    };
    readonly commands: readonly SandboxCommand[];
    readonly environment: {
        readonly variables: Readonly<Record<string, string>>;
        readonly forbidden_variable_patterns: readonly string[];
        readonly secret_mounts_allowed: false;
    };
    readonly artifacts: readonly SandboxArtifact[];
    readonly limits: {
        readonly max_files_changed: number;
        readonly max_diff_lines: number;
        readonly max_artifact_bytes: number;
        readonly max_command_count: number;
        readonly default_command_timeout_ms: number;
    };
    readonly approval: {
        readonly approval_class: string;
        readonly risk: string;
        readonly approved_for_execution: boolean;
        readonly approval_ref: string | null;
        readonly human_review_required_before_execution: boolean;
    };
    readonly guards: {
        readonly no_default_branch_write: true;
        readonly no_git_side_effects_in_harness: true;
        readonly no_pr_creation: true;
        readonly no_audit_report_generation: true;
        readonly no_secret_mounts: true;
        readonly no_network_by_default: true;
        readonly enforce_declared_artifacts: true;
    };
}
export interface SandboxValidationIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}
export interface SandboxValidationResult {
    readonly ok: boolean;
    readonly issues: readonly SandboxValidationIssue[];
}
export interface SandboxHarnessResult {
    readonly status: SandboxHarnessStatus;
    readonly request?: SandboxExecutionRequest;
    readonly reasons: readonly string[];
    readonly auditTrail: readonly string[];
    readonly issues?: readonly SandboxValidationIssue[];
}
export interface SandboxObservedArtifact {
    readonly path: string;
    readonly bytes: number;
    readonly media_type?: string;
    readonly sha256?: string;
}
export interface SandboxObservedOutput {
    readonly command_ids?: readonly string[];
    readonly changed_paths?: readonly string[];
    readonly artifacts?: readonly SandboxObservedArtifact[];
    readonly environment?: Readonly<Record<string, string | number | boolean>>;
}
export interface SandboxObservedValidationResult {
    readonly ok: boolean;
    readonly reasons: readonly string[];
    readonly issues: readonly SandboxValidationIssue[];
    readonly acceptedPaths: readonly string[];
    readonly rejectedPaths: readonly {
        readonly path: string;
        readonly status: "accepted" | "rejected";
        readonly reason: string;
    }[];
}
export declare const SANDBOX_EXECUTION_REQUEST_SCHEMA_REF: "urn:forgeroot:sandbox-execution-request:v1";
export declare const EXECUTOR_SANDBOX_HARNESS_CONTRACT: {
    readonly produces: readonly ["sandbox_execution_request"];
    readonly validates: readonly ["commands", "environment", "mutable_path_scope", "output_artifacts"];
    readonly forbids: readonly ["command_execution_in_harness", "git_checkout", "git_branch_create", "git_worktree_add", "git_push", "file_editing_in_harness", "commit_creation", "pull_request_creation", "audit_report_generation", "default_branch_write", "secret_mounts", "network_by_default"];
    readonly defaultNetworkMode: "off";
    readonly defaultGithubTokenMode: "none";
    readonly oneTaskOnePr: true;
};
export declare function createSandboxExecutionRequest(worktreePlan: BranchWorktreePlan, options?: SandboxHarnessOptions): SandboxHarnessResult;
export declare function validateSandboxExecutionRequest(request: unknown): SandboxValidationResult;
export declare function validateSandboxObservedOutput(request: SandboxExecutionRequest, output: SandboxObservedOutput): SandboxObservedValidationResult;
