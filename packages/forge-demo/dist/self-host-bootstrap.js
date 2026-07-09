import { runEndToEndForgedPrDemo, validateEndToEndForgedPrDemo } from "./run.js";
export const SELF_HOST_BOOTSTRAP_VERSION = 1;
export const SELF_HOST_BOOTSTRAP_SCHEMA_REF = "urn:forgeroot:self-host-bootstrap:v1";
export const SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY = "hiroshitanaka-creator/ForgeRoot";
export const SELF_HOST_BOOTSTRAP_CONTRACT = {
    consumes: ["t028_e2e_forged_pr_demo_manifest", "human_bootstrap_approval"],
    produces: ["t071_self_host_bootstrap_manifest"],
    validates: [
        "target_repository_is_forgeroot_only",
        "self_host_mode_dry_run_only",
        "human_bootstrap_approval_present_and_valid",
        "forge_demo_chain_ready",
    ],
    forbids: [
        "self_host_live_mode",
        "self_host_execution",
        "workflow_mutation",
        "policy_mutation",
        "real_pull_request_creation",
        "merge_operation",
        "approval_execution",
    ],
    deterministic: true,
    labOnly: true,
    manifestOnly: true,
};
const DEFAULT_NOW = "2026-07-09T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ALLOWED_SELF_HOST_MODES = ["dry_run"];
const TOP_LEVEL_KEYS = ["manifest_version", "schema_ref", "bootstrap_id", "created_at", "status", "decision", "reasons", "request", "approval", "invariants", "forge_demo_ref", "chain", "bootstrap_digest", "issues"];
const REQUEST_KEYS = ["target_repository", "self_host_mode"];
const APPROVAL_KEYS = ["approved", "approver", "approved_at"];
const INVARIANTS_KEYS = ["self_host_target_locked", "self_host_live_mode_disabled", "self_host_execution_performed", "workflow_mutation_performed", "policy_mutation_performed", "real_pull_request_created", "merge_or_approval_executed", "human_bootstrap_approval_required", "forge_demo_chain_ready"];
const FORGE_DEMO_REF_KEYS = ["demo_id", "status"];
const CHAIN_KEYS = ["forgeDemoResult"];
export function runSelfHostBootstrap(input = {}) {
    const createdAt = resolveTimestamp(input.now, DEFAULT_NOW);
    const targetRepository = input.target_repository === undefined ? SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY : input.target_repository;
    const selfHostMode = input.self_host_mode === undefined ? "dry_run" : input.self_host_mode;
    const approvalInput = input.human_bootstrap_approval;
    const inputIssues = [];
    if (createdAt === null)
        inputIssues.push(issue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp"));
    if (targetRepository !== SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY)
        inputIssues.push(issue("target_repository", "forbidden_target", "self-host bootstrap only targets hiroshitanaka-creator/ForgeRoot"));
    if (!ALLOWED_SELF_HOST_MODES.includes(selfHostMode))
        inputIssues.push(issue("self_host_mode", "self_host_mode_not_allowed", "self_host_mode must be dry_run"));
    if (inputIssues.length > 0) {
        return invalidResult(createdAt ?? DEFAULT_NOW, targetRepository, selfHostMode, approvalInput, inputIssues);
    }
    const approval = normalizeApproval(approvalInput);
    const forgeDemoResult = input.forgeDemoResult ?? runEndToEndForgedPrDemo(input.forgeDemoInput ?? { now: createdAt });
    const forgeDemoRecord = asRecord(forgeDemoResult);
    const forgeDemoValidation = validateEndToEndForgedPrDemo(forgeDemoResult);
    const forgeDemoChainReady = forgeDemoValidation.ok && stringValue(forgeDemoRecord?.status) === "ready";
    const reasons = [];
    if (!approval.approved)
        reasons.push("human_bootstrap_approval_required");
    if (!forgeDemoChainReady)
        reasons.push("forge_demo_chain_not_ready");
    const status = reasons.length > 0 ? "blocked" : "ready";
    const decision = status === "ready" ? "self_host_bootstrap_ready" : "self_host_bootstrap_blocked";
    const draft = resultDraft({
        createdAt: createdAt,
        targetRepository,
        selfHostMode,
        approval,
        forgeDemoResult,
        forgeDemoChainReady,
        status,
        decision,
        reasons: status === "ready" ? ["self_host_bootstrap_ready", "forge_demo_chain_ready", "human_bootstrap_approval_present"] : uniqueStrings(["self_host_bootstrap_blocked", ...reasons]),
    });
    const digest = canonicalDigest(bootstrapDigestPayload(draft));
    const result = { ...draft, bootstrap_id: stableId("self-host-bootstrap", [digest]), bootstrap_digest: digest };
    const selfValidation = validateSelfHostBootstrap(result);
    if (!selfValidation.ok)
        return invalidResult(createdAt, targetRepository, selfHostMode, approvalInput, selfValidation.issues);
    return result;
}
export function validateSelfHostBootstrap(value) {
    const issues = [];
    if (!isRecord(value))
        return { ok: false, issues: [issue("result", "result_must_be_object", "bootstrap result must be an object")] };
    if (value.manifest_version !== SELF_HOST_BOOTSTRAP_VERSION)
        issues.push(issue("manifest_version", "invalid_manifest_version", "manifest_version must be 1"));
    if (value.schema_ref !== SELF_HOST_BOOTSTRAP_SCHEMA_REF)
        issues.push(issue("schema_ref", "invalid_schema_ref", "schema_ref must identify T071 self-host bootstrap"));
    if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at))
        issues.push(issue("created_at", "invalid_created_at", "created_at must be RFC3339 UTC"));
    const status = value.status;
    if (status !== "ready" && status !== "blocked" && status !== "invalid")
        issues.push(issue("status", "invalid_status", "status must be ready, blocked, or invalid"));
    if (value.decision !== "self_host_bootstrap_ready" && value.decision !== "self_host_bootstrap_blocked" && value.decision !== "invalid_self_host_bootstrap_input")
        issues.push(issue("decision", "invalid_decision", "decision must be a T071 decision"));
    if (!Array.isArray(value.reasons) || value.reasons.length === 0 || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0))
        issues.push(issue("reasons", "invalid_reasons", "reasons must be non-empty strings"));
    rejectUnknownKeys(value, TOP_LEVEL_KEYS, "result", issues);
    validateStatusConsistency(value, issues);
    validateRequest(value.request, issues);
    validateApproval(value.approval, issues);
    validateInvariants(value.invariants, issues);
    validateForgeDemoRef(value.forge_demo_ref, value.invariants, issues);
    validateChain(value.chain, value.forge_demo_ref, value.status, issues);
    validateNoSecretMaterial(value, "result", issues);
    if (value.status === "invalid") {
        if (!Array.isArray(value.issues) || value.issues.length === 0)
            issues.push(issue("issues", "invalid_issues_required", "invalid results must carry issues"));
    }
    else if (value.issues !== undefined && !Array.isArray(value.issues)) {
        issues.push(issue("issues", "invalid_issues", "issues must be an array when present"));
    }
    if (value.status === "ready" && Array.isArray(value.issues) && value.issues.length > 0)
        issues.push(issue("issues", "ready_issues_forbidden", "ready results must not carry issues"));
    const expectedDigest = canonicalDigest(bootstrapDigestPayload(value));
    if (typeof value.bootstrap_digest !== "string" || value.bootstrap_digest !== expectedDigest)
        issues.push(issue("bootstrap_digest", "digest_mismatch", "bootstrap_digest must cover the bootstrap payload"));
    if (typeof value.bootstrap_id !== "string" || value.bootstrap_id !== stableId("self-host-bootstrap", [expectedDigest]))
        issues.push(issue("bootstrap_id", "id_mismatch", "bootstrap_id must match bootstrap_digest"));
    return { ok: issues.length === 0, issues };
}
export const runT071SelfHostBootstrap = runSelfHostBootstrap;
export const validateT071SelfHostBootstrap = validateSelfHostBootstrap;
function resultDraft(context) {
    const forgeDemoRecord = asRecord(context.forgeDemoResult);
    return {
        manifest_version: SELF_HOST_BOOTSTRAP_VERSION,
        schema_ref: SELF_HOST_BOOTSTRAP_SCHEMA_REF,
        created_at: context.createdAt,
        status: context.status,
        decision: context.decision,
        reasons: context.reasons,
        request: { target_repository: context.targetRepository, self_host_mode: context.selfHostMode },
        approval: context.approval,
        invariants: {
            self_host_target_locked: true,
            self_host_live_mode_disabled: true,
            self_host_execution_performed: false,
            workflow_mutation_performed: false,
            policy_mutation_performed: false,
            real_pull_request_created: false,
            merge_or_approval_executed: false,
            human_bootstrap_approval_required: true,
            forge_demo_chain_ready: context.forgeDemoChainReady,
        },
        forge_demo_ref: {
            demo_id: stringValue(forgeDemoRecord?.demo_id),
            status: stringValue(forgeDemoRecord?.status),
        },
        chain: { forgeDemoResult: context.forgeDemoResult },
    };
}
function invalidResult(createdAt, targetRepository, selfHostMode, approvalInput, issues) {
    const approval = normalizeApproval(approvalInput);
    const draft = {
        manifest_version: SELF_HOST_BOOTSTRAP_VERSION,
        schema_ref: SELF_HOST_BOOTSTRAP_SCHEMA_REF,
        created_at: createdAt,
        status: "invalid",
        decision: "invalid_self_host_bootstrap_input",
        reasons: uniqueStrings(["invalid_self_host_bootstrap_input", ...issues.map((entry) => entry.code)]),
        request: { target_repository: targetRepository, self_host_mode: selfHostMode },
        approval,
        invariants: {
            self_host_target_locked: true,
            self_host_live_mode_disabled: true,
            self_host_execution_performed: false,
            workflow_mutation_performed: false,
            policy_mutation_performed: false,
            real_pull_request_created: false,
            merge_or_approval_executed: false,
            human_bootstrap_approval_required: true,
            forge_demo_chain_ready: false,
        },
        forge_demo_ref: { demo_id: null, status: null },
        chain: {},
        issues,
    };
    const digest = canonicalDigest(bootstrapDigestPayload(draft));
    return { ...draft, bootstrap_id: stableId("self-host-bootstrap", [digest]), bootstrap_digest: digest };
}
function normalizeApproval(value) {
    const approver = stringValue(value?.approver);
    const approvedAt = typeof value?.approved_at === "string" && isRfc3339Utc(value.approved_at) ? value.approved_at : null;
    const approved = value?.approved === true && approver !== null && approvedAt !== null;
    return { approved, approver: approved ? approver : null, approved_at: approved ? approvedAt : null };
}
function bootstrapDigestPayload(value) {
    return {
        manifest_version: value.manifest_version,
        schema_ref: value.schema_ref,
        created_at: value.created_at,
        status: value.status,
        decision: value.decision,
        reasons: value.reasons,
        request: value.request,
        approval: value.approval,
        invariants: value.invariants,
        forge_demo_ref: value.forge_demo_ref,
        chain: value.chain,
        issues: value.issues ?? [],
    };
}
function validateStatusConsistency(value, issues) {
    if (value.status === "ready" && value.decision !== "self_host_bootstrap_ready")
        issues.push(issue("decision", "status_decision_mismatch", "ready status requires self_host_bootstrap_ready"));
    if (value.status === "blocked" && value.decision !== "self_host_bootstrap_blocked")
        issues.push(issue("decision", "status_decision_mismatch", "blocked status requires self_host_bootstrap_blocked"));
    if (value.status === "invalid" && value.decision !== "invalid_self_host_bootstrap_input")
        issues.push(issue("decision", "status_decision_mismatch", "invalid status requires invalid_self_host_bootstrap_input"));
    if (value.status === "ready") {
        const approval = asRecord(value.approval);
        const invariants = asRecord(value.invariants);
        if (approval?.approved !== true)
            issues.push(issue("approval.approved", "ready_requires_approval", "ready results require an approved human_bootstrap_approval"));
        if (invariants?.forge_demo_chain_ready !== true)
            issues.push(issue("invariants.forge_demo_chain_ready", "ready_requires_forge_demo_chain", "ready results require forge_demo_chain_ready"));
    }
}
function validateRequest(value, issues) {
    const request = asRecord(value);
    if (request === null) {
        issues.push(issue("request", "request_required", "request is required"));
        return;
    }
    if (request.target_repository !== SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY)
        issues.push(issue("request.target_repository", "forbidden_target", "target_repository must be hiroshitanaka-creator/ForgeRoot"));
    if (!ALLOWED_SELF_HOST_MODES.includes(String(request.self_host_mode)))
        issues.push(issue("request.self_host_mode", "self_host_mode_not_allowed", "self_host_mode must be dry_run"));
    rejectUnknownKeys(request, REQUEST_KEYS, "request", issues);
}
function validateApproval(value, issues) {
    const approval = asRecord(value);
    if (approval === null) {
        issues.push(issue("approval", "approval_required", "approval is required"));
        return;
    }
    if (typeof approval.approved !== "boolean")
        issues.push(issue("approval.approved", "boolean_required", "approved must be boolean"));
    if (!(approval.approver === null || (typeof approval.approver === "string" && approval.approver.length > 0)))
        issues.push(issue("approval.approver", "invalid_approver", "approver must be null or a non-empty string"));
    if (!(approval.approved_at === null || (typeof approval.approved_at === "string" && isRfc3339Utc(approval.approved_at))))
        issues.push(issue("approval.approved_at", "invalid_approved_at", "approved_at must be null or RFC3339 UTC"));
    if (approval.approved === true && (approval.approver === null || approval.approved_at === null))
        issues.push(issue("approval", "approval_incomplete", "approved true requires approver and approved_at"));
    if (approval.approved === false && (approval.approver !== null || approval.approved_at !== null))
        issues.push(issue("approval", "approval_envelope_not_empty", "unapproved requests must carry an empty approval envelope"));
    rejectUnknownKeys(approval, APPROVAL_KEYS, "approval", issues);
}
function validateInvariants(value, issues) {
    const invariants = asRecord(value);
    if (invariants === null) {
        issues.push(issue("invariants", "invariants_required", "invariants are required"));
        return;
    }
    const trueKeys = ["self_host_target_locked", "self_host_live_mode_disabled", "human_bootstrap_approval_required"];
    const falseKeys = ["self_host_execution_performed", "workflow_mutation_performed", "policy_mutation_performed", "real_pull_request_created", "merge_or_approval_executed"];
    for (const key of trueKeys)
        if (invariants[key] !== true)
            issues.push(issue(`invariants.${key}`, "invariant_required", `${key} must be true`));
    for (const key of falseKeys)
        if (invariants[key] !== false)
            issues.push(issue(`invariants.${key}`, "side_effect_forbidden", `${key} must be false`));
    if (typeof invariants.forge_demo_chain_ready !== "boolean")
        issues.push(issue("invariants.forge_demo_chain_ready", "boolean_required", "forge_demo_chain_ready must be boolean"));
    rejectUnknownKeys(invariants, INVARIANTS_KEYS, "invariants", issues);
}
function validateForgeDemoRef(value, invariantsValue, issues) {
    const ref = asRecord(value);
    if (ref === null) {
        issues.push(issue("forge_demo_ref", "forge_demo_ref_required", "forge_demo_ref is required"));
        return;
    }
    if (!(ref.demo_id === null || typeof ref.demo_id === "string"))
        issues.push(issue("forge_demo_ref.demo_id", "invalid_demo_id", "demo_id must be string or null"));
    if (!(ref.status === null || typeof ref.status === "string"))
        issues.push(issue("forge_demo_ref.status", "invalid_status", "status must be string or null"));
    const invariants = asRecord(invariantsValue);
    if (invariants !== null && typeof invariants.forge_demo_chain_ready === "boolean") {
        const expectedReady = ref.status === "ready";
        if (invariants.forge_demo_chain_ready !== expectedReady)
            issues.push(issue("invariants.forge_demo_chain_ready", "forge_demo_ref_mismatch", "forge_demo_chain_ready must match forge_demo_ref.status"));
    }
    rejectUnknownKeys(ref, FORGE_DEMO_REF_KEYS, "forge_demo_ref", issues);
}
function validateChain(value, forgeDemoRefValue, status, issues) {
    const chain = asRecord(value);
    if (chain === null) {
        issues.push(issue("chain", "chain_required", "chain is required"));
        return;
    }
    rejectUnknownKeys(chain, CHAIN_KEYS, "chain", issues);
    if (status !== "invalid") {
        if (chain.forgeDemoResult === undefined) {
            issues.push(issue("chain.forgeDemoResult", "chain_manifest_required", "forgeDemoResult is required for non-invalid results"));
            return;
        }
        const forgeDemoValidation = validateEndToEndForgedPrDemo(chain.forgeDemoResult);
        if (!forgeDemoValidation.ok)
            issues.push(issue("chain.forgeDemoResult", "invalid_forge_demo_result", "forgeDemoResult must pass T028 validation"));
        const forgeDemoRecord = asRecord(chain.forgeDemoResult);
        const forgeDemoRef = asRecord(forgeDemoRefValue);
        if (forgeDemoRef !== null) {
            if (forgeDemoRef.status !== stringValue(forgeDemoRecord?.status))
                issues.push(issue("forge_demo_ref.status", "forge_demo_ref_status_mismatch", "forge_demo_ref.status must match chain.forgeDemoResult.status"));
            if (forgeDemoRef.demo_id !== stringValue(forgeDemoRecord?.demo_id))
                issues.push(issue("forge_demo_ref.demo_id", "forge_demo_ref_id_mismatch", "forge_demo_ref.demo_id must match chain.forgeDemoResult.demo_id"));
        }
    }
}
function validateNoSecretMaterial(value, path, issues) {
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key"))
            issues.push(issue(path, "secret_material_forbidden", "bootstrap manifests must not contain token or private-key material"));
        return;
    }
    if (Array.isArray(value)) {
        value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}.${index}`, issues));
        return;
    }
    if (isRecord(value))
        for (const [key, child] of Object.entries(value))
            validateNoSecretMaterial(child, `${path}.${key}`, issues);
}
function resolveTimestamp(value, fallback) {
    return value === undefined ? fallback : isRfc3339Utc(value) ? value : null;
}
function isRfc3339Utc(value) {
    if (!RFC3339_UTC.test(value))
        return false;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime()))
        return false;
    const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
    return parsed.toISOString() === normalized;
}
function canonicalDigest(value) {
    return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`;
}
function canonicalStringify(value) {
    if (value === undefined)
        return "undefined";
    if (typeof value === "number" && Number.isNaN(value))
        return "NaN";
    if (Array.isArray(value))
        return `[${value.map(canonicalStringify).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const keys = Object.keys(value).sort();
        return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
function stableId(prefix, parts) {
    return `${prefix}-${fnv1a(parts.join("")).toString(16).padStart(8, "0")}`;
}
function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
}
function issue(path, code, message) {
    return { path, code, message };
}
function uniqueStrings(values) {
    return [...new Set(values.filter((entry) => entry.length > 0))];
}
function rejectUnknownKeys(record, allowed, path, issues) {
    for (const key of Object.keys(record)) {
        if (!allowed.includes(key))
            issues.push(issue(`${path}.${key}`, "unknown_key", `${path} does not allow field ${key}`));
    }
}
function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asRecord(value) {
    return isRecord(value) ? value : null;
}
function stringValue(value) {
    return typeof value === "string" && value.length > 0 ? value : null;
}
//# sourceMappingURL=self-host-bootstrap.js.map