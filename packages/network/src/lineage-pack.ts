export const LINEAGE_PACK_VERSION = 1 as const;
export const LINEAGE_PACK_SCHEMA_REF = "urn:forgeroot:lineage-pack:v1" as const;
export const ARCHIVE_PACK_SCHEMA_REF = "urn:forgeroot:archive-pack:v1" as const;

export type LineagePackStatus = "lineage_pack_ready" | "blocked" | "invalid";
export type LineagePackDecision = "lineage_pack_ready" | "lineage_pack_blocked" | "invalid_lineage_pack_input";
export type PeerStatus = "active" | "quarantined" | "revoked";
export type LineageRecordKind = "mutation" | "evaluation" | "lineage_handoff" | "archive_pack" | "provenance";

export interface NetworkIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface PeerRefInput {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: PeerStatus;
}

export interface TreatyInput {
  readonly treaty_id: string;
  readonly status: "active" | "suspended" | "revoked";
  readonly source_peer_id: string;
  readonly target_peer_id: string;
  readonly allowed_actions: readonly string[];
  readonly allowed_lineage_roots: readonly string[];
  readonly allowed_record_kinds: readonly LineageRecordKind[];
  readonly expires_at?: string | null;
}

export interface TreatyScope {
  readonly allowed_actions: readonly string[];
  readonly allowed_lineage_roots: readonly string[];
  readonly allowed_record_kinds: readonly LineageRecordKind[];
  readonly expires_at: string | null;
}

export interface ArchivePackRefInput {
  readonly schema_ref: typeof ARCHIVE_PACK_SCHEMA_REF;
  readonly pack_id: string;
  readonly raw_sha256: string;
  readonly compressed_sha256: string;
  readonly record_count: number;
}

export interface LineageRecordInput {
  readonly record_id: string;
  readonly lineage_root: string;
  readonly kind: LineageRecordKind;
  readonly schema_ref: string;
  readonly source_ref: string;
  readonly artifact_sha256: string;
  readonly payload_sha256: string;
}

export interface SignatureRef {
  readonly algorithm: "sha256-ref";
  readonly signer_peer_id: string;
  readonly signed_payload_digest: string;
  readonly signature_digest: string;
}

export interface LineagePackInput {
  readonly now?: string;
  readonly treaty: TreatyInput;
  readonly source_peer: PeerRefInput;
  readonly target_peer: PeerRefInput;
  readonly archive_pack_ref: ArchivePackRefInput;
  readonly lineage_records: readonly LineageRecordInput[];
  readonly signature_ref?: SignatureRef;
}

export interface LineagePackRecord {
  readonly record_id: string;
  readonly lineage_root: string;
  readonly kind: LineageRecordKind;
  readonly schema_ref: string;
  readonly source_ref: string;
  readonly artifact_sha256: string;
  readonly payload_sha256: string;
}

export interface LineagePackResult {
  readonly manifest_version: typeof LINEAGE_PACK_VERSION;
  readonly schema_ref: typeof LINEAGE_PACK_SCHEMA_REF;
  readonly lineage_pack_id: string;
  readonly created_at: string;
  readonly status: LineagePackStatus;
  readonly decision: LineagePackDecision;
  readonly reasons: readonly string[];
  readonly treaty_ref: {
    readonly treaty_id: string;
    readonly treaty_status: string;
    readonly source_peer_id: string;
    readonly target_peer_id: string;
  };
  readonly treaty_scope: TreatyScope;
  readonly source_peer: PeerRefInput;
  readonly target_peer: PeerRefInput;
  readonly archive_pack_ref: ArchivePackRefInput;
  readonly records: readonly LineagePackRecord[];
  readonly export_payload_digest: string;
  readonly signature_ref: SignatureRef;
  readonly import_candidate: {
    readonly candidate_id: string;
    readonly registration_status: "candidate_registered" | "blocked" | "invalid";
    readonly adoption_performed: false;
    readonly quarantine_required: boolean;
    readonly reason: string;
  };
  readonly guards: {
    readonly treaty_scope_enforced: true;
    readonly deterministic_ordering: true;
    readonly archive_hash_ref_required: true;
    readonly signature_ref_required: true;
    readonly no_network_transport: true;
    readonly no_automatic_adoption: true;
    readonly no_file_write: true;
    readonly no_github_api_call: true;
    readonly no_git_push: true;
  };
  readonly dry_run: {
    readonly network_transport_performed: false;
    readonly adoption_performed: false;
    readonly file_written: false;
    readonly github_api_called: false;
    readonly git_push_performed: false;
  };
  readonly lineage_pack_digest: string;
  readonly issues?: readonly NetworkIssue[];
}

export interface LineagePackValidation {
  readonly ok: boolean;
  readonly issues: readonly NetworkIssue[];
}

export const LINEAGE_PACK_CONTRACT = {
  consumes: ["archive_pack_ref", "treaty_scope", "peer_refs", "lineage_records"],
  produces: ["lineage_export_import_pack_manifest"],
  validates: ["treaty_scope", "peer_allowlist", "record_hash_refs", "signature_ref", "deterministic_ordering"],
  forbids: ["network_transport", "automatic_adoption", "file_write", "github_api_call", "git_push"],
  deterministic: true,
  manifestOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-06T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const PEER_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HASH = /^(sha256:[0-9a-f]{64}|sha-[a-z0-9-]+-[0-9a-f]{8,})$/;
const PACK_URI = /^forge-archive-pack:\/\/[a-z0-9][a-z0-9:/.?=_-]*$/;
const LINEAGE_ROOT = /^forge-lineage:\/\/[a-z0-9][a-z0-9/._:-]*$/;
const SOURCE_REF = /^forge:\/\/[a-z0-9][a-z0-9/._:-]*$/;
const RECORD_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SCHEMA_REF = /^urn:forgeroot:[a-z0-9-]+:v[0-9]+$/;
const SIGNATURE_DIGEST = /^sig-sha256:[0-9a-f]{64}$/;
const RECORD_KINDS = new Set(["mutation", "evaluation", "lineage_handoff", "archive_pack", "provenance"]);
const ACTION_EXPORT = "lineage_export";
const ACTION_IMPORT_CANDIDATE = "lineage_import_candidate";
const ALLOWED_ACTIONS = new Set([ACTION_EXPORT, ACTION_IMPORT_CANDIDATE]);

export function exportLineagePack(input: unknown): LineagePackResult {
  const normalized = normalizeInput(input);
  const createdAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(createdAt === null ? [makeIssue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(createdAt ?? DEFAULT_NOW, normalized.fallback, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "lineage pack input must be an object")]);

  const scopeIssues = validateScope(normalized.input, createdAt ?? DEFAULT_NOW);
  if (scopeIssues.length > 0) return blockedResult(createdAt ?? DEFAULT_NOW, normalized.input, scopeIssues);

  const records = normalizeRecords(normalized.input.lineage_records);
  const payloadDigest = canonicalDigest(exportPayload(normalized.input, records));
  const signature = normalized.input.signature_ref ?? {
    algorithm: "sha256-ref" as const,
    signer_peer_id: normalized.input.source_peer.peer_id,
    signed_payload_digest: payloadDigest,
    signature_digest: signatureDigest(payloadDigest, normalized.input.source_peer.peer_id),
  };
  const ready = resultFor(createdAt ?? DEFAULT_NOW, normalized.input, records, signature, "lineage_pack_ready", ["treaty_scope_passed", "archive_hash_ref_verified", "signature_ref_verified", "import_candidate_registered"]);
  const validation = validateLineagePack(ready);
  if (!validation.ok) return invalidResult(createdAt ?? DEFAULT_NOW, normalized.input, validation.issues);
  return ready;
}

export function validateLineagePack(value: unknown): LineagePackValidation {
  const issues: NetworkIssue[] = [];
  if (!isRecord(value)) {
    return { ok: false, issues: [makeIssue("result", "result_must_be_object", "lineage pack result must be an object")] };
  }
  validateTopLevel(value, issues);
  validatePeer(value.source_peer, "source_peer", issues);
  validatePeer(value.target_peer, "target_peer", issues);
  validateArchiveRef(value.archive_pack_ref, "archive_pack_ref", issues);
  validateTreatyRef(value.treaty_ref, issues);
  validateTreatyScope(value.treaty_scope, "treaty_scope", issues);
  const records = validateRecords(value.records, issues, value.status === "invalid");
  validateSignature(value.signature_ref, "signature_ref", issues);
  validateImportCandidate(value.import_candidate, "import_candidate", issues);
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateNoSecretMaterial(value, "result", issues);
  validateTerminal(value, issues);

  if (value.status !== "invalid") {
    validateCrossField(value, records, issues);
  }

  const expectedDigest = canonicalDigest(lineagePackDigestPayload(value as unknown as LineagePackResult));
  if (typeof value.lineage_pack_digest !== "string" || value.lineage_pack_digest !== expectedDigest) issue(issues, "lineage_pack_digest", "digest_mismatch", "lineage_pack_digest must cover the lineage pack payload");
  if (typeof value.lineage_pack_id !== "string" || value.lineage_pack_id !== stableId("lineage-pack", [expectedDigest])) issue(issues, "lineage_pack_id", "id_mismatch", "lineage_pack_id must match the lineage pack digest");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(input: unknown): { input: LineagePackInput | null; now?: string; fallback: LineagePackInput; issues: readonly NetworkIssue[] } {
  const fallback = emptyInput();
  const issues: NetworkIssue[] = [];
  if (!isRecord(input)) return { input: null, fallback, issues: [makeIssue("input", "input_must_be_object", "lineage pack input must be an object")] };

  const treaty = normalizeTreaty(input.treaty, "treaty", issues);
  const sourcePeer = normalizePeer(input.source_peer, "source_peer", issues);
  const targetPeer = normalizePeer(input.target_peer, "target_peer", issues);
  const archiveRef = normalizeArchiveRef(input.archive_pack_ref, "archive_pack_ref", issues);
  const records = normalizeInputRecords(input.lineage_records, "lineage_records", issues);
  const signature = input.signature_ref === undefined ? undefined : normalizeSignature(input.signature_ref, "signature_ref", issues);
  const now = optionalString(input.now, "now", issues);
  return {
    input: { treaty, source_peer: sourcePeer, target_peer: targetPeer, archive_pack_ref: archiveRef, lineage_records: records, ...(signature === undefined ? {} : { signature_ref: signature }), ...(now === undefined ? {} : { now }) },
    now,
    fallback: { treaty, source_peer: sourcePeer, target_peer: targetPeer, archive_pack_ref: archiveRef, lineage_records: records, ...(signature === undefined ? {} : { signature_ref: signature }) },
    issues,
  };
}

function validateScope(input: LineagePackInput, createdAt: string): readonly NetworkIssue[] {
  const issues: NetworkIssue[] = [];
  if (input.treaty.status !== "active") issue(issues, "treaty.status", "treaty_not_active", "lineage export requires an active treaty");
  if (input.treaty.expires_at !== null && input.treaty.expires_at !== undefined && Date.parse(input.treaty.expires_at) <= Date.parse(createdAt)) issue(issues, "treaty.expires_at", "treaty_expired", "lineage export requires an unexpired treaty");
  if (input.source_peer.status !== "active") issue(issues, "source_peer.status", "source_peer_not_active", "source peer must be active");
  if (input.target_peer.status !== "active") issue(issues, "target_peer.status", "target_peer_not_active", "target peer must be active");
  if (input.treaty.source_peer_id !== input.source_peer.peer_id) issue(issues, "treaty.source_peer_id", "source_peer_mismatch", "treaty source peer must match source_peer");
  if (input.treaty.target_peer_id !== input.target_peer.peer_id) issue(issues, "treaty.target_peer_id", "target_peer_mismatch", "treaty target peer must match target_peer");
  if (!input.treaty.allowed_actions.includes(ACTION_EXPORT)) issue(issues, "treaty.allowed_actions", "export_action_not_allowed", "treaty must allow lineage_export");
  if (!input.treaty.allowed_actions.includes(ACTION_IMPORT_CANDIDATE)) issue(issues, "treaty.allowed_actions", "import_candidate_action_not_allowed", "treaty must allow lineage_import_candidate");
  for (const [index, record] of input.lineage_records.entries()) {
    if (!input.treaty.allowed_lineage_roots.includes(record.lineage_root)) issue(issues, `lineage_records[${index}].lineage_root`, "lineage_root_out_of_scope", "record lineage root must be treaty allowlisted");
    if (!input.treaty.allowed_record_kinds.includes(record.kind)) issue(issues, `lineage_records[${index}].kind`, "record_kind_out_of_scope", "record kind must be treaty allowlisted");
  }
  return issues;
}

function resultFor(createdAt: string, input: LineagePackInput, records: readonly LineagePackRecord[], signatureRef: SignatureRef, status: "lineage_pack_ready" | "blocked", reasons: readonly string[]): LineagePackResult {
  const payloadDigest = canonicalDigest(exportPayload(input, records));
  const candidateStatus = status === "lineage_pack_ready" ? "candidate_registered" : "blocked";
  const draft: Omit<LineagePackResult, "lineage_pack_id" | "lineage_pack_digest"> = {
    manifest_version: LINEAGE_PACK_VERSION,
    schema_ref: LINEAGE_PACK_SCHEMA_REF,
    created_at: createdAt,
    status,
    decision: status === "lineage_pack_ready" ? "lineage_pack_ready" : "lineage_pack_blocked",
    reasons,
    treaty_ref: treatyRef(input.treaty),
    treaty_scope: treatyScope(input.treaty),
    source_peer: input.source_peer,
    target_peer: input.target_peer,
    archive_pack_ref: input.archive_pack_ref,
    records,
    export_payload_digest: payloadDigest,
    signature_ref: signatureRef,
    import_candidate: {
      candidate_id: stableId("lineage-import-candidate", [payloadDigest, input.target_peer.peer_id]),
      registration_status: candidateStatus,
      adoption_performed: false,
      quarantine_required: status !== "lineage_pack_ready",
      reason: status === "lineage_pack_ready" ? "candidate_registered_not_adopted" : "candidate_blocked_not_adopted",
    },
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(lineagePackDigestPayload(draft));
  return { ...draft, lineage_pack_id: stableId("lineage-pack", [digest]), lineage_pack_digest: digest };
}

function blockedResult(createdAt: string, input: LineagePackInput, issues: readonly NetworkIssue[]): LineagePackResult {
  const records = normalizeRecords(input.lineage_records);
  const payloadDigest = canonicalDigest(exportPayload(input, records));
  const signature = input.signature_ref ?? {
    algorithm: "sha256-ref" as const,
    signer_peer_id: input.source_peer.peer_id,
    signed_payload_digest: payloadDigest,
    signature_digest: signatureDigest(payloadDigest, input.source_peer.peer_id),
  };
  const draft = resultFor(createdAt, input, records, signature, "blocked", uniqueStrings(["lineage_pack_blocked", ...issues.map((entry) => entry.code)]));
  const digest = canonicalDigest(lineagePackDigestPayload(draft));
  return { ...draft, lineage_pack_id: stableId("lineage-pack", [digest]), lineage_pack_digest: digest };
}

function invalidResult(createdAt: string, input: LineagePackInput, issues: readonly NetworkIssue[]): LineagePackResult {
  const safeInput = emptyInput();
  const records: readonly LineagePackRecord[] = [];
  const payloadDigest = canonicalDigest(exportPayload(safeInput, records));
  const signature = {
    algorithm: "sha256-ref" as const,
    signer_peer_id: safeInput.source_peer.peer_id,
    signed_payload_digest: payloadDigest,
    signature_digest: signatureDigest(payloadDigest, safeInput.source_peer.peer_id),
  };
  const draft = {
    ...resultFor(createdAt, safeInput, records, signature, "blocked", ["invalid_lineage_pack_input"]),
    status: "invalid" as const,
    decision: "invalid_lineage_pack_input" as const,
    reasons: uniqueStrings(["invalid_lineage_pack_input", ...issues.map((entry) => entry.code)]),
    import_candidate: {
      candidate_id: stableId("lineage-import-candidate", [payloadDigest, safeInput.target_peer.peer_id]),
      registration_status: "invalid" as const,
      adoption_performed: false as const,
      quarantine_required: true,
      reason: "invalid_candidate_not_adopted",
    },
    issues,
  };
  const digest = canonicalDigest(lineagePackDigestPayload(draft));
  return { ...draft, lineage_pack_id: stableId("lineage-pack", [digest]), lineage_pack_digest: digest };
}

function validateTopLevel(value: Record<string, unknown>, issues: NetworkIssue[]): void {
  if (value.manifest_version !== LINEAGE_PACK_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== LINEAGE_PACK_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T061 lineage pack v1");
  if (typeof value.created_at !== "string" || !isRfc3339Utc(value.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (value.status !== "lineage_pack_ready" && value.status !== "blocked" && value.status !== "invalid") issue(issues, "status", "invalid_status", "status must be lineage_pack_ready, blocked, or invalid");
  if (value.decision !== "lineage_pack_ready" && value.decision !== "lineage_pack_blocked" && value.decision !== "invalid_lineage_pack_input") issue(issues, "decision", "invalid_decision", "decision must be a T061 lineage pack decision");
  if (!Array.isArray(value.reasons) || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
  if (typeof value.export_payload_digest !== "string" || !HASH.test(value.export_payload_digest)) issue(issues, "export_payload_digest", "invalid_export_payload_digest", "export_payload_digest must be stable");
}

function validateCrossField(value: Record<string, unknown>, records: readonly LineagePackRecord[], issues: NetworkIssue[]): void {
  if (value.status === "lineage_pack_ready") {
    if (isRecord(value.treaty_ref) && value.treaty_ref.treaty_status !== "active") issue(issues, "treaty_ref.treaty_status", "ready_treaty_must_be_active", "ready lineage packs require an active treaty");
    if (isRecord(value.source_peer) && value.source_peer.status !== "active") issue(issues, "source_peer.status", "ready_source_peer_must_be_active", "ready lineage packs require an active source peer");
    if (isRecord(value.target_peer) && value.target_peer.status !== "active") issue(issues, "target_peer.status", "ready_target_peer_must_be_active", "ready lineage packs require an active target peer");
  }
  if (isRecord(value.treaty_ref) && isRecord(value.source_peer) && value.treaty_ref.source_peer_id !== value.source_peer.peer_id) issue(issues, "treaty_ref.source_peer_id", "source_peer_mismatch", "treaty_ref source peer must match source_peer");
  if (isRecord(value.treaty_ref) && isRecord(value.target_peer) && value.treaty_ref.target_peer_id !== value.target_peer.peer_id) issue(issues, "treaty_ref.target_peer_id", "target_peer_mismatch", "treaty_ref target peer must match target_peer");
  if (value.status === "lineage_pack_ready" && isRecord(value.treaty_scope)) {
    const actions = Array.isArray(value.treaty_scope.allowed_actions) ? value.treaty_scope.allowed_actions : [];
    const roots = Array.isArray(value.treaty_scope.allowed_lineage_roots) ? value.treaty_scope.allowed_lineage_roots : [];
    const kinds = Array.isArray(value.treaty_scope.allowed_record_kinds) ? value.treaty_scope.allowed_record_kinds : [];
    if (!actions.includes(ACTION_EXPORT)) issue(issues, "treaty_scope.allowed_actions", "export_action_not_allowed", "treaty scope must allow lineage_export");
    if (!actions.includes(ACTION_IMPORT_CANDIDATE)) issue(issues, "treaty_scope.allowed_actions", "import_candidate_action_not_allowed", "treaty scope must allow lineage_import_candidate");
    if (typeof value.created_at === "string" && typeof value.treaty_scope.expires_at === "string" && Date.parse(value.treaty_scope.expires_at) <= Date.parse(value.created_at)) issue(issues, "treaty_scope.expires_at", "treaty_expired", "ready lineage packs require an unexpired treaty");
    records.forEach((record, index) => {
      if (!roots.includes(record.lineage_root)) issue(issues, `records[${index}].lineage_root`, "lineage_root_out_of_scope", "record lineage root must be treaty scoped");
      if (!kinds.includes(record.kind)) issue(issues, `records[${index}].kind`, "record_kind_out_of_scope", "record kind must be treaty scoped");
    });
  }
  if (isRecord(value.archive_pack_ref) && value.archive_pack_ref.record_count !== records.length) issue(issues, "archive_pack_ref.record_count", "record_count_mismatch", "archive pack record_count must match lineage records");
  const payloadDigest = canonicalDigest(exportPayload(value, records));
  if (value.export_payload_digest !== payloadDigest) issue(issues, "export_payload_digest", "export_payload_digest_mismatch", "export payload digest must be rebuilt from treaty, peers, archive ref, and records");
  if (isRecord(value.signature_ref)) {
    if (value.signature_ref.signer_peer_id !== (isRecord(value.source_peer) ? value.source_peer.peer_id : "")) issue(issues, "signature_ref.signer_peer_id", "signer_peer_mismatch", "signature signer must be the source peer");
    if (value.signature_ref.signed_payload_digest !== value.export_payload_digest) issue(issues, "signature_ref.signed_payload_digest", "signature_payload_mismatch", "signature must reference the export payload digest");
  }
  if (isRecord(value.import_candidate)) {
    if (value.import_candidate.adoption_performed !== false) issue(issues, "import_candidate.adoption_performed", "automatic_adoption_forbidden", "lineage import must stop at candidate registration");
    if (value.status === "lineage_pack_ready" && value.import_candidate.registration_status !== "candidate_registered") issue(issues, "import_candidate.registration_status", "candidate_registration_required", "ready lineage packs must register only an import candidate");
  }
}

function validateTreatyRef(value: unknown, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, "treaty_ref", "treaty_ref_required", "treaty_ref must be present"); return; }
  if (typeof value.treaty_id !== "string" || !RECORD_ID.test(value.treaty_id)) issue(issues, "treaty_ref.treaty_id", "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  if (typeof value.treaty_status !== "string" || value.treaty_status.length === 0) issue(issues, "treaty_ref.treaty_status", "invalid_treaty_status", "treaty status is required");
  if (typeof value.source_peer_id !== "string" || !PEER_ID.test(value.source_peer_id)) issue(issues, "treaty_ref.source_peer_id", "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (typeof value.target_peer_id !== "string" || !PEER_ID.test(value.target_peer_id)) issue(issues, "treaty_ref.target_peer_id", "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
}

function validateTreatyScope(value: unknown, path: string, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "treaty_scope_required", "treaty scope must be present"); return; }
  validateStringSet(value.allowed_actions, `${path}.allowed_actions`, issues, (entry) => ALLOWED_ACTIONS.has(entry), "invalid_allowed_action");
  validateStringSet(value.allowed_lineage_roots, `${path}.allowed_lineage_roots`, issues, (entry) => LINEAGE_ROOT.test(entry), "invalid_allowed_lineage_root");
  validateStringSet(value.allowed_record_kinds, `${path}.allowed_record_kinds`, issues, (entry) => RECORD_KINDS.has(entry), "invalid_allowed_record_kind");
  if (value.expires_at !== null && (typeof value.expires_at !== "string" || !isRfc3339Utc(value.expires_at))) issue(issues, `${path}.expires_at`, "invalid_expires_at", "expires_at must be RFC3339 UTC or null");
}

function validatePeer(value: unknown, path: string, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "peer_required", "peer must be present"); return; }
  if (typeof value.peer_id !== "string" || !PEER_ID.test(value.peer_id)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (typeof value.repository_full_name !== "string" || !REPOSITORY.test(value.repository_full_name)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  if (value.status !== "active" && value.status !== "quarantined" && value.status !== "revoked") issue(issues, `${path}.status`, "invalid_peer_status", "peer status must be active, quarantined, or revoked");
}

function validateArchiveRef(value: unknown, path: string, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "archive_ref_required", "archive pack ref must be present"); return; }
  if (value.schema_ref !== ARCHIVE_PACK_SCHEMA_REF) issue(issues, `${path}.schema_ref`, "invalid_archive_schema", "archive pack schema_ref must be T032 archive pack v1");
  if (typeof value.pack_id !== "string" || !PACK_URI.test(value.pack_id)) issue(issues, `${path}.pack_id`, "invalid_pack_id", "pack_id must use forge-archive-pack URI");
  if (typeof value.raw_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.raw_sha256)) issue(issues, `${path}.raw_sha256`, "invalid_raw_sha256", "raw_sha256 must be sha256");
  if (typeof value.compressed_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.compressed_sha256)) issue(issues, `${path}.compressed_sha256`, "invalid_compressed_sha256", "compressed_sha256 must be sha256");
  if (typeof value.record_count !== "number" || !Number.isInteger(value.record_count) || value.record_count <= 0) issue(issues, `${path}.record_count`, "invalid_record_count", "record_count must be a positive integer");
}

function validateRecords(value: unknown, issues: NetworkIssue[], allowEmpty: boolean): readonly LineagePackRecord[] {
  if (!Array.isArray(value)) {
    issue(issues, "records", "records_required", "records must be an array");
    return [];
  }
  if (!allowEmpty && value.length === 0) issue(issues, "records", "records_required", "lineage packs require at least one record");
  const records: LineagePackRecord[] = [];
  const seen = new Set<string>();
  let previous = "";
  value.forEach((entry, index) => {
    const path = `records[${index}]`;
    if (!isRecord(entry)) { issue(issues, path, "record_must_be_object", "record must be an object"); return; }
    validateRecord(entry, path, issues);
    const id = typeof entry.record_id === "string" ? entry.record_id : "";
    if (seen.has(id)) issue(issues, `${path}.record_id`, "duplicate_record_id", "record ids must be unique");
    seen.add(id);
    if (index > 0 && previous > id) issue(issues, "records", "records_not_sorted", "records must be sorted by record_id");
    previous = id;
    records.push(entry as unknown as LineagePackRecord);
  });
  return records;
}

function validateRecord(value: Record<string, unknown>, path: string, issues: NetworkIssue[]): void {
  if (typeof value.record_id !== "string" || !RECORD_ID.test(value.record_id)) issue(issues, `${path}.record_id`, "invalid_record_id", "record id must be lowercase kebab-case");
  if (typeof value.lineage_root !== "string" || !LINEAGE_ROOT.test(value.lineage_root)) issue(issues, `${path}.lineage_root`, "invalid_lineage_root", "lineage_root must use forge-lineage URI");
  if (typeof value.kind !== "string" || !RECORD_KINDS.has(value.kind)) issue(issues, `${path}.kind`, "invalid_record_kind", "record kind must be known");
  if (typeof value.schema_ref !== "string" || !SCHEMA_REF.test(value.schema_ref)) issue(issues, `${path}.schema_ref`, "invalid_record_schema_ref", "record schema_ref must be a ForgeRoot URN");
  if (typeof value.source_ref !== "string" || !SOURCE_REF.test(value.source_ref)) issue(issues, `${path}.source_ref`, "invalid_source_ref", "source_ref must use forge URI");
  if (typeof value.artifact_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.artifact_sha256)) issue(issues, `${path}.artifact_sha256`, "invalid_artifact_sha256", "artifact_sha256 must be sha256");
  if (typeof value.payload_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(value.payload_sha256)) issue(issues, `${path}.payload_sha256`, "invalid_payload_sha256", "payload_sha256 must be sha256");
}

function validateSignature(value: unknown, path: string, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "signature_ref_required", "signature ref must be present"); return; }
  if (value.algorithm !== "sha256-ref") issue(issues, `${path}.algorithm`, "invalid_signature_algorithm", "signature algorithm must be sha256-ref");
  if (typeof value.signer_peer_id !== "string" || !PEER_ID.test(value.signer_peer_id)) issue(issues, `${path}.signer_peer_id`, "invalid_signer_peer_id", "signer peer id must be lowercase kebab-case");
  if (typeof value.signed_payload_digest !== "string" || !HASH.test(value.signed_payload_digest)) issue(issues, `${path}.signed_payload_digest`, "invalid_signed_payload_digest", "signed payload digest must be stable");
  if (typeof value.signature_digest !== "string" || !SIGNATURE_DIGEST.test(value.signature_digest)) issue(issues, `${path}.signature_digest`, "invalid_signature_digest", "signature digest must be a signature hash reference");
}

function validateImportCandidate(value: unknown, path: string, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, path, "import_candidate_required", "import candidate must be present"); return; }
  if (typeof value.candidate_id !== "string" || !ID.test(value.candidate_id)) issue(issues, `${path}.candidate_id`, "invalid_candidate_id", "candidate id must be deterministic");
  if (value.registration_status !== "candidate_registered" && value.registration_status !== "blocked" && value.registration_status !== "invalid") issue(issues, `${path}.registration_status`, "invalid_registration_status", "registration status must be candidate_registered, blocked, or invalid");
  if (value.adoption_performed !== false) issue(issues, `${path}.adoption_performed`, "automatic_adoption_forbidden", "lineage import must not perform adoption");
  if (typeof value.quarantine_required !== "boolean") issue(issues, `${path}.quarantine_required`, "invalid_quarantine_required", "quarantine_required must be boolean");
  if (typeof value.reason !== "string" || value.reason.length === 0) issue(issues, `${path}.reason`, "reason_required", "candidate reason is required");
}

function validateGuards(value: unknown, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, "guards", "guards_required", "guards must be present"); return; }
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: NetworkIssue[]): void {
  if (!isRecord(value)) { issue(issues, "dry_run", "dry_run_required", "dry_run must be present"); return; }
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(value: Record<string, unknown>, issues: NetworkIssue[]): void {
  if (value.status === "lineage_pack_ready" && value.decision !== "lineage_pack_ready") issue(issues, "decision", "ready_decision_mismatch", "ready packs must use lineage_pack_ready");
  if (value.status === "blocked" && value.decision !== "lineage_pack_blocked") issue(issues, "decision", "blocked_decision_mismatch", "blocked packs must use lineage_pack_blocked");
  if (value.status === "invalid" && value.decision !== "invalid_lineage_pack_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid packs must use invalid_lineage_pack_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid packs must carry issues");
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid packs must not carry issues");
  }
}

function normalizeTreaty(value: unknown, path: string, issues: NetworkIssue[]): TreatyInput {
  if (!isRecord(value)) {
    issue(issues, path, "treaty_must_be_object", "treaty must be an object");
    return emptyInput().treaty;
  }
  const treatyId = stringField(value.treaty_id, `${path}.treaty_id`, issues);
  const status = value.status === "active" || value.status === "suspended" || value.status === "revoked" ? value.status : "revoked";
  if (value.status !== status) issue(issues, `${path}.status`, "invalid_treaty_status", "treaty status must be active, suspended, or revoked");
  const sourcePeerId = stringField(value.source_peer_id, `${path}.source_peer_id`, issues);
  const targetPeerId = stringField(value.target_peer_id, `${path}.target_peer_id`, issues);
  const allowedActions = normalizeStringArray(value.allowed_actions, `${path}.allowed_actions`, issues);
  const allowedRoots = normalizeStringArray(value.allowed_lineage_roots, `${path}.allowed_lineage_roots`, issues);
  const allowedKinds = normalizeRecordKinds(value.allowed_record_kinds, `${path}.allowed_record_kinds`, issues);
  const expiresAt = value.expires_at === undefined || value.expires_at === null ? null : stringField(value.expires_at, `${path}.expires_at`, issues);
  if (treatyId.length > 0 && !RECORD_ID.test(treatyId)) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  if (sourcePeerId.length > 0 && !PEER_ID.test(sourcePeerId)) issue(issues, `${path}.source_peer_id`, "invalid_source_peer_id", "source peer id must be lowercase kebab-case");
  if (targetPeerId.length > 0 && !PEER_ID.test(targetPeerId)) issue(issues, `${path}.target_peer_id`, "invalid_target_peer_id", "target peer id must be lowercase kebab-case");
  if (expiresAt !== null && !isRfc3339Utc(expiresAt)) issue(issues, `${path}.expires_at`, "invalid_expires_at", "expires_at must be RFC3339 UTC when present");
  allowedActions.forEach((entry, index) => { if (!ALLOWED_ACTIONS.has(entry)) issue(issues, `${path}.allowed_actions[${index}]`, "invalid_allowed_action", "allowed action must be known for T061"); });
  allowedRoots.forEach((entry, index) => { if (!LINEAGE_ROOT.test(entry)) issue(issues, `${path}.allowed_lineage_roots[${index}]`, "invalid_allowed_lineage_root", "allowed lineage root must use forge-lineage URI"); });
  return { treaty_id: treatyId, status, source_peer_id: sourcePeerId, target_peer_id: targetPeerId, allowed_actions: allowedActions, allowed_lineage_roots: allowedRoots, allowed_record_kinds: allowedKinds, expires_at: expiresAt };
}

function normalizePeer(value: unknown, path: string, issues: NetworkIssue[]): PeerRefInput {
  if (!isRecord(value)) {
    issue(issues, path, "peer_must_be_object", "peer must be an object");
    return { peer_id: "", repository_full_name: "", status: "revoked" };
  }
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const repository = stringField(value.repository_full_name, `${path}.repository_full_name`, issues);
  const status = value.status === "active" || value.status === "quarantined" || value.status === "revoked" ? value.status : "revoked";
  if (value.status !== status) issue(issues, `${path}.status`, "invalid_peer_status", "peer status must be active, quarantined, or revoked");
  if (peerId.length > 0 && !PEER_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (repository.length > 0 && !REPOSITORY.test(repository)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  return { peer_id: peerId, repository_full_name: repository, status };
}

function normalizeArchiveRef(value: unknown, path: string, issues: NetworkIssue[]): ArchivePackRefInput {
  if (!isRecord(value)) {
    issue(issues, path, "archive_ref_must_be_object", "archive pack ref must be an object");
    return emptyInput().archive_pack_ref;
  }
  const ref = {
    schema_ref: value.schema_ref as typeof ARCHIVE_PACK_SCHEMA_REF,
    pack_id: stringField(value.pack_id, `${path}.pack_id`, issues),
    raw_sha256: stringField(value.raw_sha256, `${path}.raw_sha256`, issues),
    compressed_sha256: stringField(value.compressed_sha256, `${path}.compressed_sha256`, issues),
    record_count: typeof value.record_count === "number" ? value.record_count : 0,
  };
  validateArchiveRef(ref, path, issues);
  return ref;
}

function normalizeInputRecords(value: unknown, path: string, issues: NetworkIssue[]): readonly LineageRecordInput[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "records_must_be_array", "lineage_records must be an array");
    return [];
  }
  return value.map((entry, index) => normalizeRecordInput(entry, `${path}[${index}]`, issues));
}

function normalizeRecordInput(value: unknown, path: string, issues: NetworkIssue[]): LineageRecordInput {
  if (!isRecord(value)) {
    issue(issues, path, "record_must_be_object", "record must be an object");
    return { record_id: "", lineage_root: "", kind: "mutation", schema_ref: "", source_ref: "", artifact_sha256: "", payload_sha256: "" };
  }
  const record = {
    record_id: stringField(value.record_id, `${path}.record_id`, issues),
    lineage_root: stringField(value.lineage_root, `${path}.lineage_root`, issues),
    kind: RECORD_KINDS.has(value.kind as string) ? value.kind as LineageRecordKind : "mutation",
    schema_ref: stringField(value.schema_ref, `${path}.schema_ref`, issues),
    source_ref: stringField(value.source_ref, `${path}.source_ref`, issues),
    artifact_sha256: stringField(value.artifact_sha256, `${path}.artifact_sha256`, issues),
    payload_sha256: stringField(value.payload_sha256, `${path}.payload_sha256`, issues),
  };
  if (record.kind !== value.kind) issue(issues, `${path}.kind`, "invalid_record_kind", "record kind must be known");
  validateRecord(record, path, issues);
  return record;
}

function normalizeRecords(records: readonly LineageRecordInput[]): readonly LineagePackRecord[] {
  return [...records].map((entry) => ({
    record_id: entry.record_id,
    lineage_root: entry.lineage_root,
    kind: entry.kind,
    schema_ref: entry.schema_ref,
    source_ref: entry.source_ref,
    artifact_sha256: entry.artifact_sha256,
    payload_sha256: entry.payload_sha256,
  })).sort((left, right) => left.record_id < right.record_id ? -1 : left.record_id > right.record_id ? 1 : 0);
}

function normalizeSignature(value: unknown, path: string, issues: NetworkIssue[]): SignatureRef {
  if (!isRecord(value)) {
    issue(issues, path, "signature_ref_must_be_object", "signature ref must be an object");
    return emptySignature();
  }
  const ref = {
    algorithm: value.algorithm as "sha256-ref",
    signer_peer_id: stringField(value.signer_peer_id, `${path}.signer_peer_id`, issues),
    signed_payload_digest: stringField(value.signed_payload_digest, `${path}.signed_payload_digest`, issues),
    signature_digest: stringField(value.signature_digest, `${path}.signature_digest`, issues),
  };
  validateSignature(ref, path, issues);
  return ref;
}

function treatyRef(treaty: TreatyInput): LineagePackResult["treaty_ref"] {
  return { treaty_id: treaty.treaty_id, treaty_status: treaty.status, source_peer_id: treaty.source_peer_id, target_peer_id: treaty.target_peer_id };
}

function treatyScope(treaty: TreatyInput): TreatyScope {
  return {
    allowed_actions: [...treaty.allowed_actions].sort(),
    allowed_lineage_roots: [...treaty.allowed_lineage_roots].sort(),
    allowed_record_kinds: [...treaty.allowed_record_kinds].sort(),
    expires_at: treaty.expires_at ?? null,
  };
}

function exportPayload(input: unknown, records: readonly LineagePackRecord[]): unknown {
  const value = input as LineagePackInput | LineagePackResult;
  return {
    treaty_ref: "treaty_ref" in value ? value.treaty_ref : treatyRef(value.treaty),
    treaty_scope: "treaty_scope" in value ? value.treaty_scope : treatyScope(value.treaty),
    source_peer: value.source_peer,
    target_peer: value.target_peer,
    archive_pack_ref: value.archive_pack_ref,
    records,
  };
}

function lineagePackDigestPayload(value: Omit<LineagePackResult, "lineage_pack_id" | "lineage_pack_digest"> | LineagePackResult): unknown {
  return {
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    treaty_ref: value.treaty_ref,
    treaty_scope: value.treaty_scope,
    source_peer: value.source_peer,
    target_peer: value.target_peer,
    archive_pack_ref: value.archive_pack_ref,
    records: value.records,
    export_payload_digest: value.export_payload_digest,
    signature_ref: value.signature_ref,
    import_candidate: value.import_candidate,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function guards(): LineagePackResult["guards"] {
  return {
    treaty_scope_enforced: true,
    deterministic_ordering: true,
    archive_hash_ref_required: true,
    signature_ref_required: true,
    no_network_transport: true,
    no_automatic_adoption: true,
    no_file_write: true,
    no_github_api_call: true,
    no_git_push: true,
  };
}

function dryRun(): LineagePackResult["dry_run"] {
  return {
    network_transport_performed: false,
    adoption_performed: false,
    file_written: false,
    github_api_called: false,
    git_push_performed: false,
  };
}

function emptyInput(): LineagePackInput {
  return {
    treaty: {
      treaty_id: "invalid-treaty",
      status: "revoked",
      source_peer_id: "source-peer",
      target_peer_id: "target-peer",
      allowed_actions: [ACTION_EXPORT, ACTION_IMPORT_CANDIDATE],
      allowed_lineage_roots: ["forge-lineage://invalid/root"],
      allowed_record_kinds: ["lineage_handoff"],
      expires_at: null,
    },
    source_peer: { peer_id: "source-peer", repository_full_name: "owner/source", status: "revoked" },
    target_peer: { peer_id: "target-peer", repository_full_name: "owner/target", status: "revoked" },
    archive_pack_ref: {
      schema_ref: ARCHIVE_PACK_SCHEMA_REF,
      pack_id: "forge-archive-pack://invalid",
      raw_sha256: `sha256:${"0".repeat(64)}`,
      compressed_sha256: `sha256:${"0".repeat(64)}`,
      record_count: 1,
    },
    lineage_records: [],
  };
}

function validateStringSet(value: unknown, path: string, issues: NetworkIssue[], valid: (entry: string) => boolean, invalidCode: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    issue(issues, path, "non_empty_array_required", `${path} must be a non-empty array`);
    return;
  }
  const seen = new Set<string>();
  let previous = "";
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      issue(issues, `${path}[${index}]`, "non_empty_string_required", `${path} entries must be non-empty strings`);
      return;
    }
    if (seen.has(entry)) issue(issues, `${path}[${index}]`, "duplicate_entry", `${path} entries must be unique`);
    seen.add(entry);
    if (index > 0 && previous > entry) issue(issues, path, "entries_not_sorted", `${path} must be sorted`);
    previous = entry;
    if (!valid(entry)) issue(issues, `${path}[${index}]`, invalidCode, `${path} contains an out-of-policy value`);
  });
}

function emptySignature(): SignatureRef {
  return { algorithm: "sha256-ref", signer_peer_id: "source-peer", signed_payload_digest: canonicalDigest(null), signature_digest: `sig-sha256:${"0".repeat(64)}` };
}

function normalizeStringArray(value: unknown, path: string, issues: NetworkIssue[]): readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "array_required", `${path} must be an array`);
    return [];
  }
  const values = value.map((entry, index) => {
    if (typeof entry !== "string" || entry.trim().length === 0) {
      issue(issues, `${path}[${index}]`, "non_empty_string_required", `${path} entries must be non-empty strings`);
      return "";
    }
    return entry.trim();
  }).filter((entry) => entry.length > 0).sort();
  if (new Set(values).size !== values.length) issue(issues, path, "duplicate_entry", `${path} must not contain duplicates`);
  return [...new Set(values)];
}

function normalizeRecordKinds(value: unknown, path: string, issues: NetworkIssue[]): readonly LineageRecordKind[] {
  const values = normalizeStringArray(value, path, issues);
  for (const [index, entry] of values.entries()) if (!RECORD_KINDS.has(entry)) issue(issues, `${path}[${index}]`, "invalid_record_kind", "allowed record kind must be known");
  return values.filter((entry): entry is LineageRecordKind => RECORD_KINDS.has(entry));
}

function validateNoSecretMaterial(value: unknown, path: string, issues: NetworkIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "network manifests must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) { value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}[${index}]`, issues)); return; }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function stringField(value: unknown, path: string, issues: NetworkIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: NetworkIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") { issue(issues, path, "string_required", `${path} must be a string when provided`); return undefined; }
  return value;
}

function resolveTimestamp(value: string | undefined, fallback: string): string | null {
  if (value !== undefined) return isRfc3339Utc(value) ? value : null;
  return isRfc3339Utc(fallback) ? fallback : DEFAULT_NOW;
}

function isRfc3339Utc(value: string): boolean {
  if (!RFC3339_UTC.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === normalized;
}

function signatureDigest(payloadDigest: string, signerPeerId: string): string {
  return `sig-sha256:${fnvHex(`${payloadDigest}\u001f${signerPeerId}`).repeat(8).slice(0, 64)}`;
}

function canonicalDigest(value: unknown): string {
  return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`;
}

function canonicalStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`;
}

function fnvHex(value: string): string {
  return fnv1a(value).toString(16).padStart(8, "0");
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))];
}

function issue(issues: NetworkIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): NetworkIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT061LineagePackExport = exportLineagePack;
export const validateT061LineagePackExport = validateLineagePack;
