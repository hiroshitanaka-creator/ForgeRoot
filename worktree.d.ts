import {
  type BranchWorktreePlan,
  type BranchWorktreeValidationIssue,
  validateBranchWorktreePlan,
  validateChangedPaths,
} from "./worktree.js";

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
  readonly rejectedPaths: readonly { readonly path: string; readonly status: "accepted" | "rejected"; readonly reason: string }[];
}

export const SANDBOX_EXECUTION_REQUEST_SCHEMA_REF = "urn:forgeroot:sandbox-execution-request:v1" as const;

export const EXECUTOR_SANDBOX_HARNESS_CONTRACT = {
  produces: ["sandbox_execution_request"],
  validates: ["commands", "environment", "mutable_path_scope", "output_artifacts"],
  forbids: [
    "command_execution_in_harness",
    "git_checkout",
    "git_branch_create",
    "git_worktree_add",
    "git_push",
    "file_editing_in_harness",
    "commit_creation",
    "pull_request_creation",
    "audit_report_generation",
    "default_branch_write",
    "secret_mounts",
    "network_by_default",
  ],
  defaultNetworkMode: "off",
  defaultGithubTokenMode: "none",
  oneTaskOnePr: true,
} as const;

const MANIFEST_VERSION = 1 as const;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const DEFAULT_COMMAND_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_RUNTIME_MS = 1_200_000;
const DEFAULT_MAX_PROCESSES = 8;
const DEFAULT_MAX_COMMAND_COUNT = 8;
const DEFAULT_MAX_ARTIFACT_BYTES = 10 * 1024 * 1024;
const MAX_ENV_VALUE_LENGTH = 2048;
const MAX_ARG_LENGTH = 512;
const MAX_ARTIFACTS = 16;
const ALLOWED_COMMAND_BINARIES = new Set(["forge-sandbox", "node", "npm", "pnpm", "npx", "tsc"]);
const FORBIDDEN_COMMAND_BINARIES = new Set([
  "git",
  "gh",
  "hub",
  "curl",
  "wget",
  "ssh",
  "scp",
  "rsync",
  "docker",
  "podman",
  "sudo",
  "su",
  "bash",
  "sh",
  "zsh",
  "fish",
  "pwsh",
  "powershell",
]);
const FORBIDDEN_ENV_PATTERNS = ["TOKEN", "SECRET", "PASSWORD", "PRIVATE", "CREDENTIAL", "COOKIE", "SSH", "GPG", "KEY"] as const;
const ALLOWED_GITHUB_TOKEN_PERMISSIONS = new Set(["contents:read", "metadata:read"]);
const ALLOWED_ARTIFACT_MEDIA_TYPES = new Set(["text/plain", "application/json", "text/x-diff", "application/sarif+json"]);
const ALLOWED_ARTIFACT_KINDS = new Set<SandboxArtifactKind>(["patch", "changed_paths", "command_log", "test_output", "scan_result", "sandbox_report"]);

export function createSandboxExecutionRequest(worktreePlan: BranchWorktreePlan, options: SandboxHarnessOptions = {}): SandboxHarnessResult {
  const auditTrail = [
    "executor_sandbox_harness:T019",
    "contract:manifest_only",
    "contract:no_command_execution_in_harness",
    "contract:no_default_branch_write",
    "contract:no_secret_mounts",
  ];

  const worktreeValidation = validateBranchWorktreePlan(worktreePlan);
  if (!worktreeValidation.ok) {
    return invalidResult(
      ["invalid_branch_worktree_plan", ...worktreeValidation.issues.map(formatBranchIssue)],
      [...auditTrail, "worktree_plan:invalid"],
      worktreeValidation.issues.map(fromBranchIssue),
    );
  }

  if (worktreePlan.approval.human_review_required_before_execution && !worktreePlan.approval.approved_for_execution) {
    return {
      status: "blocked",
      reasons: uniqueStrings([
        "human_review_required_before_sandbox_request",
        `approval_class:${worktreePlan.approval.approval_class}`,
        `risk:${worktreePlan.approval.risk}`,
      ]),
      auditTrail: [...auditTrail, "sandbox_request:none", "reason:approval_required"],
    };
  }

  const createdAtResult = resolveTimestamp(options.now ?? worktreePlan.created_at);
  if (!createdAtResult.ok) return invalidResult([createdAtResult.reason], [...auditTrail, "timestamp:invalid"]);

  const mode = options.mode ?? "dry_run";
  if (mode !== "dry_run" && mode !== "untrusted_execution") return invalidResult(["sandbox_mode_invalid"], [...auditTrail, "mode:invalid"]);

  const requestId = `forge-sandbox://${stableSlug(worktreePlan.plan_id)}-${stableHash(`${worktreePlan.manifest_id}:${createdAtResult.value}`).slice(0, 8)}`;

  const networkResult = normalizeNetwork(options.networkMode ?? "off", options.networkAllowedHosts ?? []);
  if (!networkResult.ok) return invalidResult([networkResult.reason], [...auditTrail, "network:invalid"]);

  const tokenResult = normalizeGithubToken(options.githubTokenMode ?? "none", options.githubTokenPermissions);
  if (!tokenResult.ok) return invalidResult([tokenResult.reason], [...auditTrail, "github_token:invalid"]);

  const maxRuntimeResult = normalizePositiveInteger(options.maxRuntimeMs ?? DEFAULT_MAX_RUNTIME_MS, "max_runtime_ms", 60_000, 3_600_000);
  if (!maxRuntimeResult.ok) return invalidResult([maxRuntimeResult.reason], [...auditTrail, "limits:invalid"]);

  const defaultCommandTimeoutResult = normalizePositiveInteger(options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS, "command_timeout_ms", 1_000, maxRuntimeResult.value);
  if (!defaultCommandTimeoutResult.ok) return invalidResult([defaultCommandTimeoutResult.reason], [...auditTrail, "limits:invalid"]);

  const maxProcessesResult = normalizePositiveInteger(options.maxProcesses ?? DEFAULT_MAX_PROCESSES, "max_processes", 1, 64);
  if (!maxProcessesResult.ok) return invalidResult([maxProcessesResult.reason], [...auditTrail, "limits:invalid"]);

  const maxArtifactBytesResult = normalizePositiveInteger(options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES, "max_artifact_bytes", 1_024, 100 * 1024 * 1024);
  if (!maxArtifactBytesResult.ok) return invalidResult([maxArtifactBytesResult.reason], [...auditTrail, "limits:invalid"]);

  const artifactRootResult = normalizeArtifactRoot(options.artifactRoot ?? defaultArtifactRoot(worktreePlan, requestId), worktreePlan.worktree.path);
  if (!artifactRootResult.ok) return invalidResult([artifactRootResult.reason], [...auditTrail, "artifact_root:invalid"]);

  const envResult = normalizeEnvironment(defaultEnvironment(worktreePlan, artifactRootResult.value), options.env ?? {});
  if (!envResult.ok) return invalidResult([envResult.reason], [...auditTrail, "environment:invalid"]);

  const commandsResult = normalizeCommands(
    options.commands ?? defaultCommands(worktreePlan, defaultCommandTimeoutResult.value, artifactRootResult.value),
    worktreePlan,
    defaultCommandTimeoutResult.value,
  );
  if (!commandsResult.ok) return invalidResult([commandsResult.reason], [...auditTrail, "commands:invalid"]);

  const artifactsResult = normalizeArtifacts(options.artifacts ?? defaultArtifacts(maxArtifactBytesResult.value), maxArtifactBytesResult.value);
  if (!artifactsResult.ok) return invalidResult([artifactsResult.reason], [...auditTrail, "artifacts:invalid"]);

  const request: SandboxExecutionRequest = {
    manifest_version: MANIFEST_VERSION,
    schema_ref: SANDBOX_EXECUTION_REQUEST_SCHEMA_REF,
    request_id: requestId,
    created_at: createdAtResult.value,
    mode,
    plan_id: worktreePlan.plan_id,
    worktree_manifest_id: worktreePlan.manifest_id,
    source: worktreePlan.source,
    branch: {
      name: worktreePlan.branch.name,
      base_ref: worktreePlan.branch.base_ref,
      default_branch: worktreePlan.branch.default_branch,
    },
    worktree: {
      root: worktreePlan.worktree.root,
      path: worktreePlan.worktree.path,
      ephemeral: true,
    },
    scope: {
      one_task_one_pr: true,
      no_default_branch_write: true,
      mutable_paths: [...worktreePlan.scope.mutable_paths],
      immutable_paths: [...worktreePlan.scope.immutable_paths],
      out_of_scope: [...worktreePlan.scope.out_of_scope],
      max_files_changed: worktreePlan.scope.max_files_changed,
      max_diff_lines: worktreePlan.scope.max_diff_lines,
    },
    isolation: {
      sandbox_kind: "ephemeral",
      execution_trust: "untrusted",
      network: networkResult.value,
      secrets: {
        mount: false,
        policy: "no_secrets",
      },
      github_token: tokenResult.value,
      max_runtime_ms: maxRuntimeResult.value,
      max_processes: maxProcessesResult.value,
    },
    filesystem: {
      worktree_path: worktreePlan.worktree.path,
      artifact_root: artifactRootResult.value,
      writable_paths: [...worktreePlan.scope.mutable_paths],
      immutable_paths: [...worktreePlan.scope.immutable_paths],
      out_of_scope: [...worktreePlan.scope.out_of_scope],
      enforce_clean_worktree: true,
      enforce_mutable_paths: true,
      artifacts_outside_worktree: true,
    },
    commands: commandsResult.value,
    environment: {
      variables: envResult.value,
      forbidden_variable_patterns: [...FORBIDDEN_ENV_PATTERNS],
      secret_mounts_allowed: false,
    },
    artifacts: artifactsResult.value,
    limits: {
      max_files_changed: worktreePlan.scope.max_files_changed,
      max_diff_lines: worktreePlan.scope.max_diff_lines,
      max_artifact_bytes: maxArtifactBytesResult.value,
      max_command_count: DEFAULT_MAX_COMMAND_COUNT,
      default_command_timeout_ms: defaultCommandTimeoutResult.value,
    },
    approval: {
      approval_class: worktreePlan.approval.approval_class,
      risk: worktreePlan.approval.risk,
      approved_for_execution: worktreePlan.approval.approved_for_execution,
      approval_ref: worktreePlan.approval.approval_ref,
      human_review_required_before_execution: worktreePlan.approval.human_review_required_before_execution,
    },
    guards: {
      no_default_branch_write: true,
      no_git_side_effects_in_harness: true,
      no_pr_creation: true,
      no_audit_report_generation: true,
      no_secret_mounts: true,
      no_network_by_default: true,
      enforce_declared_artifacts: true,
    },
  };

  const requestValidation = validateSandboxExecutionRequest(request);
  if (!requestValidation.ok) {
    return invalidResult(
      ["generated_sandbox_execution_request_failed_validation", ...requestValidation.issues.map(formatIssue)],
      [...auditTrail, "sandbox_request:invalid"],
      requestValidation.issues,
    );
  }

  return {
    status: "ready",
    request,
    reasons: uniqueStrings([
      "sandbox_execution_request_ready",
      `request:${request.request_id}`,
      `network:${request.isolation.network.mode}`,
      `commands:${request.commands.length}`,
      `artifact_root:${request.filesystem.artifact_root}`,
    ]),
    auditTrail: [...auditTrail, "sandbox_request:prepared_manifest_only", "commands:not_executed", "artifacts:declared_only"],
  };
}

export function validateSandboxExecutionRequest(request: unknown): SandboxValidationResult {
  const issues: SandboxValidationIssue[] = [];
  const root = asRecord(request);
  if (root === null) return { ok: false, issues: [issue("", "type", "sandbox execution request must be an object")] };

  expectLiteral(root, "manifest_version", MANIFEST_VERSION, issues);
  expectLiteral(root, "schema_ref", SANDBOX_EXECUTION_REQUEST_SCHEMA_REF, issues);
  expectString(root, "request_id", issues, { prefix: "forge-sandbox://" });
  expectRfc3339(root, "created_at", issues);
  expectOneOf(root, "mode", new Set(["dry_run", "untrusted_execution"]), issues);
  expectString(root, "plan_id", issues);
  expectString(root, "worktree_manifest_id", issues, { prefix: "forge-worktree://" });

  const source = asRecord(root["source"]);
  if (source === null) {
    issues.push(issue("/source", "required", "source must be an object"));
  } else {
    expectStringOrNull(source, "repository", issues, "/source");
    expectIntegerOrNull(source, "issue_number", issues, "/source");
    expectString(source, "candidate_id", issues, { pathPrefix: "/source" });
    expectString(source, "title", issues, { pathPrefix: "/source" });
  }

  const branch = asRecord(root["branch"]);
  if (branch === null) {
    issues.push(issue("/branch", "required", "branch must be an object"));
  } else {
    const name = expectString(branch, "name", issues, { pathPrefix: "/branch", prefix: "forge/" });
    const baseRef = expectString(branch, "base_ref", issues, { pathPrefix: "/branch" });
    const defaultBranch = expectString(branch, "default_branch", issues, { pathPrefix: "/branch" });
    if (name !== null && !isSafeRef(name)) issues.push(issue("/branch/name", "safe_ref", "branch name contains unsafe syntax"));
    if (name !== null && defaultBranch !== null && isDefaultBranchTarget(name, defaultBranch)) issues.push(issue("/branch/name", "default_branch_write", "branch must not target the default branch"));
    if (baseRef !== null && !isSafeRef(baseRef)) issues.push(issue("/branch/base_ref", "safe_ref", "base ref contains unsafe syntax"));
  }

  const worktree = asRecord(root["worktree"]);
  if (worktree === null) {
    issues.push(issue("/worktree", "required", "worktree must be an object"));
  } else {
    const worktreeRoot = expectString(worktree, "root", issues, { pathPrefix: "/worktree" });
    const worktreePath = expectString(worktree, "path", issues, { pathPrefix: "/worktree" });
    expectLiteral(worktree, "ephemeral", true, issues, "/worktree");
    if (worktreeRoot !== null && !isSafeRuntimePath(worktreeRoot)) issues.push(issue("/worktree/root", "safe_path", "worktree root must be a safe relative runtime path"));
    if (worktreePath !== null && !isSafeRuntimePath(worktreePath)) issues.push(issue("/worktree/path", "safe_path", "worktree path must be a safe relative runtime path"));
    if (worktreeRoot !== null && worktreePath !== null && !worktreePath.startsWith(`${trimTrailingSlash(worktreeRoot)}/`)) issues.push(issue("/worktree/path", "root_prefix", "worktree path must be under worktree root"));
  }

  const scope = validateScope(root["scope"], "/scope", issues);
  const isolation = asRecord(root["isolation"]);
  if (isolation === null) {
    issues.push(issue("/isolation", "required", "isolation must be an object"));
  } else {
    expectLiteral(isolation, "sandbox_kind", "ephemeral", issues, "/isolation");
    expectLiteral(isolation, "execution_trust", "untrusted", issues, "/isolation");
    const network = asRecord(isolation["network"]);
    if (network === null) {
      issues.push(issue("/isolation/network", "required", "network must be an object"));
    } else {
      const networkMode = expectOneOf(network, "mode", new Set(["off", "allowlisted"]), issues, "/isolation/network");
      const hosts = expectStringArray(network, "allowed_hosts", issues, "/isolation/network", { allowEmpty: true });
      if (networkMode === "off" && hosts.length > 0) issues.push(issue("/isolation/network/allowed_hosts", "network_off", "allowed_hosts must be empty when network mode is off"));
      if (networkMode === "allowlisted" && hosts.length === 0) issues.push(issue("/isolation/network/allowed_hosts", "allowlist_empty", "allowlisted network mode requires at least one host"));
      for (const host of hosts) if (!isSafeHost(host)) issues.push(issue("/isolation/network/allowed_hosts", "safe_host", `host '${host}' is not a safe allowlist entry`));
    }
    const secrets = asRecord(isolation["secrets"]);
    if (secrets === null) {
      issues.push(issue("/isolation/secrets", "required", "secrets must be an object"));
    } else {
      expectLiteral(secrets, "mount", false, issues, "/isolation/secrets");
      expectLiteral(secrets, "policy", "no_secrets", issues, "/isolation/secrets");
    }
    const githubToken = asRecord(isolation["github_token"]);
    if (githubToken === null) {
      issues.push(issue("/isolation/github_token", "required", "github_token must be an object"));
    } else {
      const tokenMode = expectOneOf(githubToken, "mode", new Set(["none", "read_only"]), issues, "/isolation/github_token");
      const permissions = expectStringArray(githubToken, "permissions", issues, "/isolation/github_token", { allowEmpty: true });
      if (tokenMode === "none" && permissions.length > 0) issues.push(issue("/isolation/github_token/permissions", "token_none", "permissions must be empty when github token mode is none"));
      for (const permission of permissions) if (!ALLOWED_GITHUB_TOKEN_PERMISSIONS.has(permission)) issues.push(issue("/isolation/github_token/permissions", "read_only_only", `github token permission '${permission}' is not read-only allowed`));
    }
    expectPositiveInteger(isolation, "max_runtime_ms", issues, "/isolation", 3_600_000);
    expectPositiveInteger(isolation, "max_processes", issues, "/isolation", 64);
  }

  const filesystem = asRecord(root["filesystem"]);
  if (filesystem === null) {
    issues.push(issue("/filesystem", "required", "filesystem must be an object"));
  } else {
    const worktreePath = expectString(filesystem, "worktree_path", issues, { pathPrefix: "/filesystem" });
    const artifactRoot = expectString(filesystem, "artifact_root", issues, { pathPrefix: "/filesystem" });
    const writablePaths = expectStringArray(filesystem, "writable_paths", issues, "/filesystem");
    const immutablePaths = expectStringArray(filesystem, "immutable_paths", issues, "/filesystem");
    expectStringArray(filesystem, "out_of_scope", issues, "/filesystem");
    expectLiteral(filesystem, "enforce_clean_worktree", true, issues, "/filesystem");
    expectLiteral(filesystem, "enforce_mutable_paths", true, issues, "/filesystem");
    expectLiteral(filesystem, "artifacts_outside_worktree", true, issues, "/filesystem");
    if (worktreePath !== null && !isSafeRuntimePath(worktreePath)) issues.push(issue("/filesystem/worktree_path", "safe_path", "worktree_path must be safe relative runtime path"));
    if (artifactRoot !== null && !isSafeRuntimePath(artifactRoot)) issues.push(issue("/filesystem/artifact_root", "safe_path", "artifact_root must be safe relative runtime path"));
    if (worktreePath !== null && artifactRoot !== null && isSameOrDescendant(artifactRoot, worktreePath)) issues.push(issue("/filesystem/artifact_root", "outside_worktree", "artifact_root must be outside the repo worktree"));
    if (scope !== null) {
      if (!sameStringArray(writablePaths, scope.mutable_paths)) issues.push(issue("/filesystem/writable_paths", "scope_mismatch", "writable_paths must match scope.mutable_paths"));
      if (!sameStringArray(immutablePaths, scope.immutable_paths)) issues.push(issue("/filesystem/immutable_paths", "scope_mismatch", "immutable_paths must match scope.immutable_paths"));
    }
  }

  const limits = asRecord(root["limits"]);
  let maxCommandCount = DEFAULT_MAX_COMMAND_COUNT;
  let defaultCommandTimeout = DEFAULT_COMMAND_TIMEOUT_MS;
  if (limits === null) {
    issues.push(issue("/limits", "required", "limits must be an object"));
  } else {
    expectPositiveInteger(limits, "max_files_changed", issues, "/limits", 50);
    expectPositiveInteger(limits, "max_diff_lines", issues, "/limits", 2000);
    expectPositiveInteger(limits, "max_artifact_bytes", issues, "/limits", 100 * 1024 * 1024);
    maxCommandCount = expectPositiveInteger(limits, "max_command_count", issues, "/limits", DEFAULT_MAX_COMMAND_COUNT) ?? DEFAULT_MAX_COMMAND_COUNT;
    defaultCommandTimeout = expectPositiveInteger(limits, "default_command_timeout_ms", issues, "/limits", 3_600_000) ?? DEFAULT_COMMAND_TIMEOUT_MS;
  }

  const commands = root["commands"];
  if (!Array.isArray(commands)) {
    issues.push(issue("/commands", "array", "commands must be an array"));
  } else {
    if (commands.length === 0) issues.push(issue("/commands", "non_empty", "commands must not be empty"));
    if (commands.length > maxCommandCount) issues.push(issue("/commands", "max", `commands must contain at most ${maxCommandCount} entries`));
    commands.forEach((command, index) => validateCommand(command, `/commands/${index}`, scope, defaultCommandTimeout, issues));
  }

  const environment = asRecord(root["environment"]);
  if (environment === null) {
    issues.push(issue("/environment", "required", "environment must be an object"));
  } else {
    const variables = asRecord(environment["variables"]);
    if (variables === null) issues.push(issue("/environment/variables", "required", "environment variables must be an object"));
    else validateEnvironmentMap(variables, "/environment/variables", issues);
    expectStringArray(environment, "forbidden_variable_patterns", issues, "/environment");
    expectLiteral(environment, "secret_mounts_allowed", false, issues, "/environment");
  }

  const artifacts = root["artifacts"];
  if (!Array.isArray(artifacts)) {
    issues.push(issue("/artifacts", "array", "artifacts must be an array"));
  } else {
    if (artifacts.length === 0) issues.push(issue("/artifacts", "non_empty", "artifacts must not be empty"));
    if (artifacts.length > MAX_ARTIFACTS) issues.push(issue("/artifacts", "max", `artifacts must contain at most ${MAX_ARTIFACTS} entries`));
    artifacts.forEach((artifact, index) => validateArtifact(artifact, `/artifacts/${index}`, issues));
  }

  const approval = asRecord(root["approval"]);
  if (approval === null) {
    issues.push(issue("/approval", "required", "approval must be an object"));
  } else {
    expectOneOf(approval, "approval_class", new Set(["A", "B", "C", "D"]), issues, "/approval");
    expectOneOf(approval, "risk", new Set(["low", "medium", "high", "critical"]), issues, "/approval");
    const approved = expectBoolean(approval, "approved_for_execution", issues, "/approval");
    const approvalRef = expectStringOrNull(approval, "approval_ref", issues, "/approval");
    const humanReview = expectBoolean(approval, "human_review_required_before_execution", issues, "/approval");
    if (humanReview === true && approved !== true) issues.push(issue("/approval/approved_for_execution", "approval_required", "execution approval is required before sandbox request is usable"));
    if (approved === true && approvalRef === null) issues.push(issue("/approval/approval_ref", "required", "approval_ref is required when approved_for_execution is true"));
  }

  const guards = asRecord(root["guards"]);
  if (guards === null) {
    issues.push(issue("/guards", "required", "guards must be an object"));
  } else {
    expectLiteral(guards, "no_default_branch_write", true, issues, "/guards");
    expectLiteral(guards, "no_git_side_effects_in_harness", true, issues, "/guards");
    expectLiteral(guards, "no_pr_creation", true, issues, "/guards");
    expectLiteral(guards, "no_audit_report_generation", true, issues, "/guards");
    expectLiteral(guards, "no_secret_mounts", true, issues, "/guards");
    expectLiteral(guards, "no_network_by_default", true, issues, "/guards");
    expectLiteral(guards, "enforce_declared_artifacts", true, issues, "/guards");
  }

  return { ok: issues.length === 0, issues };
}

export function validateSandboxObservedOutput(request: SandboxExecutionRequest, output: SandboxObservedOutput): SandboxObservedValidationResult {
  const issues: SandboxValidationIssue[] = [];
  const reasons: string[] = [];
  const requestValidation = validateSandboxExecutionRequest(request);
  if (!requestValidation.ok) {
    issues.push(...requestValidation.issues.map((value) => issue(`/request${value.path}`, value.code, value.message)));
    reasons.push("invalid_sandbox_execution_request");
  }

  const outputRecord = asRecord(output);
  if (outputRecord === null) {
    issues.push(issue("/output", "type", "observed output must be an object"));
    return { ok: false, reasons: ["invalid_observed_output"], issues, acceptedPaths: [], rejectedPaths: [] };
  }

  const declaredCommandIds = new Set(request.commands.map((command) => command.id));
  const commandIds = output.command_ids ?? [];
  for (const commandId of commandIds) {
    if (!declaredCommandIds.has(commandId)) {
      issues.push(issue("/output/command_ids", "undeclared_command", `observed command '${commandId}' was not declared`));
      reasons.push("undeclared_command_observed");
    }
  }

  if (output.environment !== undefined) {
    const normalized = normalizeEnvironment({}, output.environment);
    if (!normalized.ok) {
      issues.push(issue("/output/environment", "invalid", normalized.reason));
      reasons.push("invalid_observed_environment");
    }
  }

  const changedPaths = output.changed_paths ?? [];
  const pathResult = validateChangedPaths(scopeOnlyPlan(request), changedPaths);
  for (const rejected of pathResult.rejectedPaths) {
    issues.push(issue("/output/changed_paths", rejected.reason, `changed path '${rejected.path}' was rejected: ${rejected.reason}`));
  }
  if (!pathResult.ok) reasons.push(...pathResult.reasons);

  const declaredArtifacts = new Map(request.artifacts.map((artifact) => [artifact.path, artifact]));
  const artifacts = output.artifacts ?? [];
  for (const artifact of artifacts) {
    const normalizedPath = normalizeArtifactPath(artifact.path);
    if (normalizedPath === null) {
      issues.push(issue("/output/artifacts/path", "safe_path", `artifact path '${artifact.path}' is not safe`));
      reasons.push("invalid_artifact_path");
      continue;
    }
    const declared = declaredArtifacts.get(normalizedPath);
    if (declared === undefined) {
      issues.push(issue("/output/artifacts", "undeclared_artifact", `artifact '${normalizedPath}' was not declared`));
      reasons.push("undeclared_artifact_observed");
      continue;
    }
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes < 0) {
      issues.push(issue("/output/artifacts/bytes", "integer", `artifact '${normalizedPath}' bytes must be a non-negative integer`));
      reasons.push("invalid_artifact_size");
    } else if (artifact.bytes > declared.max_bytes) {
      issues.push(issue("/output/artifacts/bytes", "max", `artifact '${normalizedPath}' exceeds its declared size limit`));
      reasons.push("artifact_size_exceeded");
    }
    if (artifact.media_type !== undefined && artifact.media_type !== declared.media_type) {
      issues.push(issue("/output/artifacts/media_type", "media_type", `artifact '${normalizedPath}' media type does not match declaration`));
      reasons.push("artifact_media_type_mismatch");
    }
    if (artifact.sha256 !== undefined && !/^sha256:[a-f0-9]{64}$/.test(artifact.sha256)) {
      issues.push(issue("/output/artifacts/sha256", "sha256", `artifact '${normalizedPath}' sha256 must use sha256:<64 hex>`));
      reasons.push("invalid_artifact_hash");
    }
  }

  return {
    ok: issues.length === 0,
    reasons: uniqueStrings(reasons),
    issues,
    acceptedPaths: pathResult.acceptedPaths,
    rejectedPaths: pathResult.rejectedPaths,
  };
}

function defaultCommands(worktreePlan: BranchWorktreePlan, timeoutMs: number, artifactRoot: string): readonly SandboxCommandInput[] {
  return [
    {
      id: "inspect_scope",
      phase: "prepare",
      argv: ["forge-sandbox", "inspect-scope", "--plan", worktreePlan.plan_id],
      cwd: ".",
      timeout_ms: Math.min(timeoutMs, 60_000),
      writable_paths: [],
    },
    {
      id: "apply_bounded_patch",
      phase: "execute",
      argv: ["forge-sandbox", "apply-bounded-patch", "--worktree", worktreePlan.worktree.path],
      cwd: ".",
      timeout_ms: timeoutMs,
      writable_paths: [...worktreePlan.scope.mutable_paths],
    },
    {
      id: "run_verification",
      phase: "verify",
      argv: ["forge-sandbox", "run-verification", "--no-network"],
      cwd: ".",
      timeout_ms: timeoutMs,
      writable_paths: [],
    },
    {
      id: "collect_artifacts",
      phase: "collect",
      argv: ["forge-sandbox", "collect-artifacts", "--artifact-root", artifactRoot],
      cwd: ".",
      timeout_ms: Math.min(timeoutMs, 60_000),
      writable_paths: [],
    },
  ];
}

function defaultArtifacts(maxArtifactBytes: number): readonly SandboxArtifactInput[] {
  return [
    { path: "patch.diff", kind: "patch", media_type: "text/x-diff", required: true, max_bytes: maxArtifactBytes },
    { path: "changed-paths.json", kind: "changed_paths", media_type: "application/json", required: true, max_bytes: 128 * 1024 },
    { path: "command-log.jsonl", kind: "command_log", media_type: "text/plain", required: true, max_bytes: maxArtifactBytes },
    { path: "test-output.txt", kind: "test_output", media_type: "text/plain", required: false, max_bytes: maxArtifactBytes },
    { path: "sandbox-report.json", kind: "sandbox_report", media_type: "application/json", required: true, max_bytes: 512 * 1024 },
  ];
}

function defaultEnvironment(worktreePlan: BranchWorktreePlan, artifactRoot: string): Readonly<Record<string, string>> {
  return {
    CI: "1",
    FORGE_SANDBOX: "1",
    FORGE_PLAN_ID: worktreePlan.plan_id,
    FORGE_WORKTREE_MANIFEST_ID: worktreePlan.manifest_id,
    FORGE_WORKTREE_PATH: worktreePlan.worktree.path,
    FORGE_ARTIFACT_ROOT: artifactRoot,
  };
}

function normalizeCommands(inputs: readonly SandboxCommandInput[], worktreePlan: BranchWorktreePlan, defaultTimeoutMs: number): { ok: true; value: readonly SandboxCommand[] } | { ok: false; reason: string } {
  if (inputs.length === 0) return { ok: false, reason: "commands_empty" };
  if (inputs.length > DEFAULT_MAX_COMMAND_COUNT) return { ok: false, reason: "commands_exceed_max_count" };
  const result: SandboxCommand[] = [];
  const seen = new Set<string>();
  for (const [index, input] of inputs.entries()) {
    const id = normalizeCommandId(input.id ?? `command_${index + 1}`);
    if (id === null) return { ok: false, reason: `command_id_invalid:${index}` };
    if (seen.has(id)) return { ok: false, reason: `command_id_duplicate:${id}` };
    seen.add(id);

    const phase = input.phase ?? "execute";
    if (!isCommandPhase(phase)) return { ok: false, reason: `command_phase_invalid:${id}` };

    const argv = normalizeArgv(input.argv);
    if (argv === null) return { ok: false, reason: `command_argv_invalid:${id}` };
    const binary = basename(argv[0] ?? "");
    if (FORBIDDEN_COMMAND_BINARIES.has(binary)) return { ok: false, reason: `forbidden_command_binary:${binary}` };
    if (!ALLOWED_COMMAND_BINARIES.has(binary)) return { ok: false, reason: `command_binary_not_allowlisted:${binary}` };

    const cwd = normalizeRepoRelativePath(input.cwd ?? ".");
    if (cwd === null) return { ok: false, reason: `command_cwd_invalid:${id}` };

    const timeoutResult = normalizePositiveInteger(input.timeout_ms ?? defaultTimeoutMs, `command_timeout_ms:${id}`, 1_000, defaultTimeoutMs);
    if (!timeoutResult.ok) return { ok: false, reason: timeoutResult.reason };

    const writablePaths = uniqueStrings(input.writable_paths ?? []);
    for (const writablePath of writablePaths) {
      if (!isWritablePatternAllowed(writablePath, worktreePlan.scope.mutable_paths, worktreePlan.scope.immutable_paths)) return { ok: false, reason: `command_writable_path_out_of_scope:${id}:${writablePath}` };
    }

    const env = normalizeEnvironment({}, input.env ?? {});
    if (!env.ok) return { ok: false, reason: `command_env_invalid:${id}:${env.reason}` };

    result.push({ id, phase, argv, cwd, timeout_ms: timeoutResult.value, writable_paths: writablePaths, env: env.value });
  }
  return { ok: true, value: result };
}

function normalizeArtifacts(inputs: readonly SandboxArtifactInput[], maxArtifactBytes: number): { ok: true; value: readonly SandboxArtifact[] } | { ok: false; reason: string } {
  if (inputs.length === 0) return { ok: false, reason: "artifacts_empty" };
  if (inputs.length > MAX_ARTIFACTS) return { ok: false, reason: "artifacts_exceed_max_count" };
  const result: SandboxArtifact[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    const path = normalizeArtifactPath(input.path);
    if (path === null) return { ok: false, reason: `artifact_path_invalid:${input.path}` };
    if (seen.has(path)) return { ok: false, reason: `artifact_path_duplicate:${path}` };
    seen.add(path);
    const kind = input.kind ?? inferArtifactKind(path);
    if (!ALLOWED_ARTIFACT_KINDS.has(kind)) return { ok: false, reason: `artifact_kind_invalid:${path}` };
    const mediaType = input.media_type ?? inferArtifactMediaType(path, kind);
    if (!ALLOWED_ARTIFACT_MEDIA_TYPES.has(mediaType)) return { ok: false, reason: `artifact_media_type_invalid:${path}` };
    const maxBytes = input.max_bytes ?? maxArtifactBytes;
    const maxBytesResult = normalizePositiveInteger(maxBytes, `artifact_max_bytes:${path}`, 1, maxArtifactBytes);
    if (!maxBytesResult.ok) return { ok: false, reason: maxBytesResult.reason };
    result.push({ path, kind, media_type: mediaType, required: input.required ?? false, max_bytes: maxBytesResult.value });
  }
  return { ok: true, value: result };
}

function normalizeEnvironment(defaults: Readonly<Record<string, string>>, overrides: Readonly<Record<string, string | number | boolean>>): { ok: true; value: Readonly<Record<string, string>> } | { ok: false; reason: string } {
  const result: Record<string, string> = { ...defaults };
  for (const [rawName, rawValue] of Object.entries(overrides)) {
    const name = rawName.trim();
    if (!isSafeEnvName(name)) return { ok: false, reason: `env_name_invalid:${rawName}` };
    if (isForbiddenEnvName(name)) return { ok: false, reason: `env_name_forbidden:${name}` };
    const value = String(rawValue);
    if (!isSafeEnvValue(value)) return { ok: false, reason: `env_value_invalid:${name}` };
    if (looksLikeSecretValue(value)) return { ok: false, reason: `env_value_looks_secret:${name}` };
    if (Object.prototype.hasOwnProperty.call(defaults, name) && defaults[name] !== value) return { ok: false, reason: `env_locked_variable_override:${name}` };
    result[name] = value;
  }
  for (const [name, value] of Object.entries(result)) {
    if (!isSafeEnvName(name)) return { ok: false, reason: `env_name_invalid:${name}` };
    if (!isSafeEnvValue(value)) return { ok: false, reason: `env_value_invalid:${name}` };
  }
  return { ok: true, value: result };
}

function normalizeNetwork(mode: SandboxNetworkMode, hosts: readonly string[]): { ok: true; value: SandboxExecutionRequest["isolation"]["network"] } | { ok: false; reason: string } {
  if (mode !== "off" && mode !== "allowlisted") return { ok: false, reason: "network_mode_invalid" };
  const normalizedHosts = uniqueStrings(hosts.map((host) => host.trim().toLowerCase()).filter((host) => host.length > 0));
  if (mode === "off" && normalizedHosts.length > 0) return { ok: false, reason: "network_off_requires_empty_allowlist" };
  if (mode === "allowlisted" && normalizedHosts.length === 0) return { ok: false, reason: "allowlisted_network_requires_hosts" };
  for (const host of normalizedHosts) {
    if (!isSafeHost(host)) return { ok: false, reason: `network_host_invalid:${host}` };
  }
  return { ok: true, value: { mode, allowed_hosts: normalizedHosts } };
}

function normalizeGithubToken(mode: SandboxGithubTokenMode, permissions: readonly string[] | undefined): { ok: true; value: SandboxExecutionRequest["isolation"]["github_token"] } | { ok: false; reason: string } {
  if (mode !== "none" && mode !== "read_only") return { ok: false, reason: "github_token_mode_invalid" };
  const normalizedPermissions = uniqueStrings((permissions ?? (mode === "read_only" ? ["contents:read", "metadata:read"] : [])).map((permission) => permission.trim().toLowerCase()).filter((permission) => permission.length > 0));
  if (mode === "none" && normalizedPermissions.length > 0) return { ok: false, reason: "github_token_none_requires_empty_permissions" };
  for (const permission of normalizedPermissions) {
    if (!ALLOWED_GITHUB_TOKEN_PERMISSIONS.has(permission)) return { ok: false, reason: `github_token_permission_not_read_only:${permission}` };
  }
  return { ok: true, value: { mode, permissions: normalizedPermissions } };
}

function normalizeArtifactRoot(value: string, worktreePath: string): { ok: true; value: string } | { ok: false; reason: string } {
  const normalized = normalizeRuntimePath(value);
  if (normalized === null) return { ok: false, reason: "artifact_root_invalid" };
  if (isSameOrDescendant(normalized, worktreePath)) return { ok: false, reason: "artifact_root_must_be_outside_worktree" };
  return { ok: true, value: normalized };
}

function defaultArtifactRoot(worktreePlan: BranchWorktreePlan, requestId: string): string {
  const worktreeRoot = trimTrailingSlash(worktreePlan.worktree.root);
  const runtimeRoot = worktreeRoot.endsWith("/worktrees") ? trimTrailingSlash(worktreeRoot.slice(0, -"/worktrees".length)) : `${worktreeRoot}/runtime`;
  const safeRuntimeRoot = runtimeRoot.length > 0 ? runtimeRoot : ".forgeroot";
  return `${safeRuntimeRoot}/artifacts/${stableSlug(requestId)}`;
}

function validateScope(value: unknown, pathPrefix: string, issues: SandboxValidationIssue[]): SandboxExecutionRequest["scope"] | null {
  const scope = asRecord(value);
  if (scope === null) {
    issues.push(issue(pathPrefix, "required", "scope must be an object"));
    return null;
  }
  expectLiteral(scope, "one_task_one_pr", true, issues, pathPrefix);
  expectLiteral(scope, "no_default_branch_write", true, issues, pathPrefix);
  const mutablePaths = expectStringArray(scope, "mutable_paths", issues, pathPrefix);
  const immutablePaths = expectStringArray(scope, "immutable_paths", issues, pathPrefix);
  const outOfScope = expectStringArray(scope, "out_of_scope", issues, pathPrefix);
  const maxFilesChanged = expectPositiveInteger(scope, "max_files_changed", issues, pathPrefix, 50);
  const maxDiffLines = expectPositiveInteger(scope, "max_diff_lines", issues, pathPrefix, 2000);
  for (const mutablePath of mutablePaths) {
    for (const immutablePath of immutablePaths) {
      if (globIntersects(mutablePath, immutablePath)) issues.push(issue(`${pathPrefix}/mutable_paths`, "immutable_overlap", `mutable path '${mutablePath}' overlaps immutable path '${immutablePath}'`));
    }
  }
  if (maxFilesChanged === null || maxDiffLines === null) return null;
  return {
    one_task_one_pr: true,
    no_default_branch_write: true,
    mutable_paths: mutablePaths,
    immutable_paths: immutablePaths,
    out_of_scope: outOfScope,
    max_files_changed: maxFilesChanged,
    max_diff_lines: maxDiffLines,
  };
}

function validateCommand(value: unknown, pathPrefix: string, scope: SandboxExecutionRequest["scope"] | null, maxTimeoutMs: number, issues: SandboxValidationIssue[]): void {
  const command = asRecord(value);
  if (command === null) {
    issues.push(issue(pathPrefix, "object", "command must be an object"));
    return;
  }
  expectString(command, "id", issues, { pathPrefix });
  expectOneOf(command, "phase", new Set(["prepare", "execute", "verify", "collect"]), issues, pathPrefix);
  const argv = expectStringArray(command, "argv", issues, pathPrefix);
  const cwd = expectString(command, "cwd", issues, { pathPrefix });
  expectPositiveInteger(command, "timeout_ms", issues, pathPrefix, maxTimeoutMs);
  const writablePaths = expectStringArray(command, "writable_paths", issues, pathPrefix, { allowEmpty: true });
  const env = asRecord(command["env"]);
  if (env === null) issues.push(issue(`${pathPrefix}/env`, "required", "command env must be an object"));
  else validateEnvironmentMap(env, `${pathPrefix}/env`, issues);
  if (argv.length > 0) {
    const binary = basename(argv[0] ?? "");
    if (FORBIDDEN_COMMAND_BINARIES.has(binary)) issues.push(issue(`${pathPrefix}/argv/0`, "forbidden_binary", `command binary '${binary}' is forbidden`));
    if (!ALLOWED_COMMAND_BINARIES.has(binary)) issues.push(issue(`${pathPrefix}/argv/0`, "allowlist", `command binary '${binary}' is not allowlisted`));
    for (const [index, arg] of argv.entries()) {
      if (!isSafeArg(arg)) issues.push(issue(`${pathPrefix}/argv/${index}`, "safe_arg", `argv[${index}] contains unsafe shell syntax or control characters`));
    }
  }
  if (cwd !== null && normalizeRepoRelativePath(cwd) === null) issues.push(issue(`${pathPrefix}/cwd`, "safe_path", "command cwd must be safe and repo-relative"));
  if (scope !== null) {
    for (const writablePath of writablePaths) {
      if (!isWritablePatternAllowed(writablePath, scope.mutable_paths, scope.immutable_paths)) issues.push(issue(`${pathPrefix}/writable_paths`, "outside_mutable_scope", `writable path '${writablePath}' is not within mutable scope`));
    }
  }
}

function validateArtifact(value: unknown, pathPrefix: string, issues: SandboxValidationIssue[]): void {
  const artifact = asRecord(value);
  if (artifact === null) {
    issues.push(issue(pathPrefix, "object", "artifact must be an object"));
    return;
  }
  const artifactPath = expectString(artifact, "path", issues, { pathPrefix });
  const kind = expectString(artifact, "kind", issues, { pathPrefix });
  const mediaType = expectString(artifact, "media_type", issues, { pathPrefix });
  expectBoolean(artifact, "required", issues, pathPrefix);
  expectPositiveInteger(artifact, "max_bytes", issues, pathPrefix, 100 * 1024 * 1024);
  if (artifactPath !== null && normalizeArtifactPath(artifactPath) === null) issues.push(issue(`${pathPrefix}/path`, "safe_path", "artifact path must be safe and relative"));
  if (kind !== null && !ALLOWED_ARTIFACT_KINDS.has(kind as SandboxArtifactKind)) issues.push(issue(`${pathPrefix}/kind`, "enum", "artifact kind is not allowed"));
  if (mediaType !== null && !ALLOWED_ARTIFACT_MEDIA_TYPES.has(mediaType)) issues.push(issue(`${pathPrefix}/media_type`, "media_type", "artifact media type is not allowed"));
}

function validateEnvironmentMap(record: Record<string, unknown>, pathPrefix: string, issues: SandboxValidationIssue[]): void {
  for (const [name, value] of Object.entries(record)) {
    if (!isSafeEnvName(name)) issues.push(issue(`${pathPrefix}/${name}`, "env_name", `environment variable '${name}' has an unsafe name`));
    if (isForbiddenEnvName(name)) issues.push(issue(`${pathPrefix}/${name}`, "secret_name", `environment variable '${name}' is forbidden because it looks secret-bearing`));
    if (typeof value !== "string") {
      issues.push(issue(`${pathPrefix}/${name}`, "string", `environment variable '${name}' must be a string`));
      continue;
    }
    if (!isSafeEnvValue(value)) issues.push(issue(`${pathPrefix}/${name}`, "env_value", `environment variable '${name}' has an unsafe value`));
    if (looksLikeSecretValue(value)) issues.push(issue(`${pathPrefix}/${name}`, "secret_value", `environment variable '${name}' looks like a secret`));
  }
}

function normalizeArgv(argv: readonly string[]): readonly string[] | null {
  if (!Array.isArray(argv) || argv.length === 0 || argv.length > 32) return null;
  const result: string[] = [];
  for (const arg of argv) {
    if (typeof arg !== "string" || !isSafeArg(arg)) return null;
    result.push(arg);
  }
  return result;
}

function isSafeArg(value: string): boolean {
  if (value.length === 0 || value.length > MAX_ARG_LENGTH || value.includes("\0")) return false;
  return !/[;&|`$<>]/.test(value);
}

function normalizeCommandId(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "_").replace(/^_+|_+$/g, "");
  if (trimmed.length === 0 || trimmed.length > 64) return null;
  return trimmed;
}

function isCommandPhase(value: string): value is SandboxCommandPhase {
  return value === "prepare" || value === "execute" || value === "verify" || value === "collect";
}

function normalizeArtifactPath(value: string): string | null {
  const normalized = normalizeRepoRelativePath(value);
  if (normalized === null || normalized === ".") return null;
  if (normalized.startsWith(".git/") || normalized === ".git") return null;
  return normalized;
}

function normalizeRepoRelativePath(value: string): string | null {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/^\.\/+/g, "").replace(/\/+/g, "/").replace(/\/+$/g, "");
  if (trimmed === "" || trimmed === ".") return ".";
  if (trimmed.startsWith("/") || trimmed.includes("\0")) return null;
  const segments = trimmed.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return null;
  return trimmed;
}

function normalizeRuntimePath(value: string): string | null {
  const normalized = normalizeRepoRelativePath(value);
  return normalized === "." ? null : normalized;
}

function isSafeRuntimePath(value: string): boolean {
  return normalizeRuntimePath(value) !== null;
}

function isSafeRef(value: string): boolean {
  if (value.length === 0 || value.startsWith("/") || value.endsWith("/") || value.includes("//")) return false;
  if (value.includes("..") || value.includes("@{") || value.includes("\\") || value.includes("~") || value.includes("^") || value.includes(":")) return false;
  if (/\s/.test(value)) return false;
  return !value.split("/").some((segment) => segment.length === 0 || segment === "." || segment === ".." || segment.endsWith(".lock"));
}

function isDefaultBranchTarget(branchName: string, defaultBranch: string): boolean {
  const branch = branchName.toLowerCase();
  const target = defaultBranch.toLowerCase();
  return branch === target || branch === `refs/heads/${target}` || branch === "main" || branch === "master" || branch === "trunk";
}

function isSafeHost(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  if (host.includes("://") || host.includes("/") || host.includes("*") || host.includes("..")) return false;
  if (host === "localhost" || host.endsWith(".local")) return false;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/i.test(host);
}

function isSafeEnvName(name: string): boolean {
  return /^[A-Z_][A-Z0-9_]{0,63}$/.test(name);
}

function isForbiddenEnvName(name: string): boolean {
  return FORBIDDEN_ENV_PATTERNS.some((pattern) => name.includes(pattern));
}

function isSafeEnvValue(value: string): boolean {
  return value.length <= MAX_ENV_VALUE_LENGTH && !value.includes("\0") && !/[\r\n]/.test(value);
}

function looksLikeSecretValue(value: string): boolean {
  const lower = value.toLowerCase();
  return lower.startsWith("ghp_") || lower.startsWith("github_pat_") || lower.startsWith("sk-") || value.includes("-----BEGIN PRIVATE KEY-----");
}

function isWritablePatternAllowed(pattern: string, mutablePatterns: readonly string[], immutablePatterns: readonly string[]): boolean {
  const normalized = normalizeGlobPattern(pattern);
  if (normalized === null) return false;
  if (immutablePatterns.some((immutable) => globIntersects(normalized, immutable))) return false;
  return mutablePatterns.some((mutable) => globCovers(mutable, normalized));
}

function normalizeGlobPattern(value: string): string | null {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/^\.\/+/g, "").replace(/\/+/g, "/").replace(/\/+$/g, "");
  if (trimmed.length === 0 || trimmed.startsWith("/") || trimmed.includes("\0")) return null;
  const segments = trimmed.split("/");
  if (segments.some((segment) => segment.length === 0 || segment === "." || segment === "..")) return null;
  return trimmed;
}

function globCovers(allowedPattern: string, requestedPattern: string): boolean {
  const allowed = normalizeGlobPattern(allowedPattern);
  const requested = normalizeGlobPattern(requestedPattern);
  if (allowed === null || requested === null) return false;
  if (allowed === requested || allowed === "**") return true;
  const allowedPrefix = globLiteralPrefix(allowed);
  const requestedPrefix = globLiteralPrefix(requested);
  if (allowed.endsWith("/**")) return requestedPrefix === allowedPrefix || requestedPrefix.startsWith(`${allowedPrefix}/`);
  if (!allowed.includes("*") && !requested.includes("*")) return requested === allowed;
  return requestedPrefix.length > 0 && allowedPrefix.length > 0 && requestedPrefix.startsWith(allowedPrefix);
}

function globIntersects(a: string, b: string): boolean {
  const left = globLiteralPrefix(a);
  const right = globLiteralPrefix(b);
  if (left.length === 0 || right.length === 0) return false;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`) || left.startsWith(right) || right.startsWith(left);
}

function globLiteralPrefix(pattern: string): string {
  return pattern.replace(/\\/g, "/").split(/[?*]/, 1)[0].replace(/\/+$/, "").toLowerCase();
}

function inferArtifactKind(path: string): SandboxArtifactKind {
  if (path.endsWith(".diff") || path.endsWith(".patch")) return "patch";
  if (path === "changed-paths.json") return "changed_paths";
  if (path.endsWith(".sarif") || path.endsWith(".sarif.json")) return "scan_result";
  if (path.endsWith("report.json")) return "sandbox_report";
  if (path.endsWith(".jsonl") || path.includes("log")) return "command_log";
  return "test_output";
}

function inferArtifactMediaType(path: string, kind: SandboxArtifactKind): string {
  if (kind === "patch") return "text/x-diff";
  if (kind === "changed_paths" || kind === "sandbox_report") return "application/json";
  if (kind === "scan_result") return "application/sarif+json";
  return "text/plain";
}

function normalizePositiveInteger(value: number, label: string, min: number, max: number): { ok: true; value: number } | { ok: false; reason: string } {
  if (!Number.isSafeInteger(value) || value < min || value > max) return { ok: false, reason: `${label}_must_be_integer_between_${min}_and_${max}` };
  return { ok: true, value };
}

function resolveTimestamp(value: string): { ok: true; value: string } | { ok: false; reason: string } {
  const trimmed = value.trim();
  if (!RFC3339_UTC.test(trimmed)) return { ok: false, reason: "timestamp_must_be_rfc3339_utc" };
  return { ok: true, value: trimmed };
}

function scopeOnlyPlan(request: SandboxExecutionRequest): BranchWorktreePlan {
  return { scope: request.scope } as unknown as BranchWorktreePlan;
}

function expectLiteral(record: Record<string, unknown>, key: string, expected: unknown, issues: SandboxValidationIssue[], pathPrefix = ""): void {
  if (record[key] !== expected) issues.push(issue(`${pathPrefix}/${key}`, "literal", `${key} must equal ${JSON.stringify(expected)}`));
}

function expectString(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[], options: { pathPrefix?: string; prefix?: string } = {}): string | null {
  const value = record[key];
  const path = `${options.pathPrefix ?? ""}/${key}`;
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(issue(path, "string", `${key} must be a non-empty string`));
    return null;
  }
  if (options.prefix !== undefined && !value.startsWith(options.prefix)) issues.push(issue(path, "prefix", `${key} must start with '${options.prefix}'`));
  return value;
}

function expectStringOrNull(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[], pathPrefix = ""): string | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  return expectString(record, key, issues, { pathPrefix });
}

function expectIntegerOrNull(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[], pathPrefix = ""): number | null {
  const value = record[key];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    issues.push(issue(`${pathPrefix}/${key}`, "integer_or_null", `${key} must be an integer or null`));
    return null;
  }
  return value;
}

function expectBoolean(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[], pathPrefix = ""): boolean | null {
  const value = record[key];
  if (typeof value !== "boolean") {
    issues.push(issue(`${pathPrefix}/${key}`, "boolean", `${key} must be boolean`));
    return null;
  }
  return value;
}

function expectOneOf(record: Record<string, unknown>, key: string, allowed: ReadonlySet<string>, issues: SandboxValidationIssue[], pathPrefix = ""): string | null {
  const value = record[key];
  if (typeof value !== "string" || !allowed.has(value)) {
    issues.push(issue(`${pathPrefix}/${key}`, "enum", `${key} must be one of ${[...allowed].join(", ")}`));
    return null;
  }
  return value;
}

function expectStringArray(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[], pathPrefix = "", options: { allowEmpty?: boolean } = {}): readonly string[] {
  const value = record[key];
  if (!Array.isArray(value)) {
    issues.push(issue(`${pathPrefix}/${key}`, "array", `${key} must be an array of strings`));
    return [];
  }
  const result: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) issues.push(issue(`${pathPrefix}/${key}/${index}`, "string", `${key}[${index}] must be a non-empty string`));
    else result.push(item);
  });
  if (options.allowEmpty !== true && result.length === 0) issues.push(issue(`${pathPrefix}/${key}`, "non_empty", `${key} must not be empty`));
  return result;
}

function expectPositiveInteger(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[], pathPrefix = "", max?: number): number | null {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    issues.push(issue(`${pathPrefix}/${key}`, "positive_integer", `${key} must be a positive integer`));
    return null;
  }
  if (max !== undefined && value > max) issues.push(issue(`${pathPrefix}/${key}`, "max", `${key} must be <= ${max}`));
  return value;
}

function expectRfc3339(record: Record<string, unknown>, key: string, issues: SandboxValidationIssue[]): string | null {
  const value = expectString(record, key, issues);
  if (value !== null && !RFC3339_UTC.test(value)) issues.push(issue(`/${key}`, "rfc3339", `${key} must be an RFC3339 UTC timestamp`));
  return value;
}

function invalidResult(reasons: readonly string[], auditTrail: readonly string[], issues?: readonly SandboxValidationIssue[]): SandboxHarnessResult {
  return { status: "invalid", reasons: uniqueStrings(reasons), auditTrail: [...auditTrail, "result:invalid"], ...(issues === undefined ? {} : { issues }) };
}

function fromBranchIssue(value: BranchWorktreeValidationIssue): SandboxValidationIssue {
  return issue(`/worktree_plan${value.path}`, value.code, value.message);
}

function formatBranchIssue(value: BranchWorktreeValidationIssue): string { return `/worktree_plan${value.path}:${value.code}`; }
function formatIssue(value: SandboxValidationIssue): string { return `${value.path}:${value.code}`; }
function issue(path: string, code: string, message: string): SandboxValidationIssue { return { path, code, message }; }
function asRecord(value: unknown): Record<string, unknown> | null { return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null; }
function basename(path: string): string { const parts = path.split("/"); return parts[parts.length - 1] ?? path; }
function trimTrailingSlash(value: string): string { return value.replace(/\/+$/g, ""); }
function isSameOrDescendant(path: string, parent: string): boolean { const left = trimTrailingSlash(path); const right = trimTrailingSlash(parent); return left === right || left.startsWith(`${right}/`); }
function sameStringArray(left: readonly string[], right: readonly string[]): boolean { return left.length === right.length && left.every((value, index) => value === right[index]); }
function uniqueStrings(values: readonly string[]): readonly string[] { return [...new Set(values.filter((value) => value.trim().length > 0))]; }

function stableSlug(value: string): string {
  const slug = value.replace(/^[A-Za-z0-9+.-]+:\/\//, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug.slice(0, 96) : "sandbox";
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).padStart(8, "0");
}
