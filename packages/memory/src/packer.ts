// T032: Deterministic memory archive pack manifest
// Produces a deterministic MemoryArchivePack manifest over a set of
// memory records. Does NOT perform live zstd compression, does NOT
// write to .forge directly, does NOT call GitHub APIs.
// The compression boundary (format: "jsonl.zst") is defined here;
// actual compression is a follow-up operation outside this manifest.

import { createHash } from "node:crypto";

export const MEMORY_ARCHIVE_PACK_VERSION = 1 as const;
export const MEMORY_ARCHIVE_PACK_SCHEMA_REF =
  "urn:forgeroot:memory-archive-pack:v1" as const;

const PACK_ID_PREFIX = "forge-memory-pack://";
const RFC3339_UTC_RE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
const ARTIFACT_SHA256_RE = /^sha256:[0-9a-f]{64}$/;
const TASK_ID_RE = /^T\d+/;

const VALID_PACK_KINDS = new Set([
  "episode_digest",
  "working_memory",
  "mixed",
] as const);

const SECRET_KEY_TERMS = [
  "TOKEN",
  "SECRET",
  "PASSWORD",
  "PRIVATE_KEY",
  "CREDENTIAL",
] as const;

const DESTRUCTIVE_KEY_TERMS = [
  "DELETE",
  "REMOVE",
  "PURGE",
  "WIPE",
  "DROP",
  "DESTROY",
] as const;

export type PackKind = "episode_digest" | "working_memory" | "mixed";

export interface MemoryArchiveRecordRef {
  readonly record_id: string;
  readonly record_type: "working_memory_update" | "episode_digest";
  readonly source_ref: string;
  readonly artifact_sha256: string;
  readonly raw_sha256: string;
}

export interface MemoryArchivePack {
  readonly manifest_version: 1;
  readonly schema_ref: typeof MEMORY_ARCHIVE_PACK_SCHEMA_REF;
  readonly pack_id: string;
  readonly created_at: string;
  readonly pack: {
    readonly kind: PackKind;
    readonly format: "jsonl.zst";
    readonly compression: "zstd";
    readonly compression_performed: false;
    readonly record_count: number;
    readonly raw_jsonl_sha256: string;
    readonly compressed_sha256: null;
    readonly deterministic_ordering: true;
  };
  readonly source: {
    readonly repository: string | null;
    readonly task_id: string;
    readonly source_artifacts: readonly string[];
  };
  readonly records: readonly MemoryArchiveRecordRef[];
  readonly guards: {
    readonly no_destructive_delete: true;
    readonly source_refs_required: true;
    readonly deterministic_record_ordering: true;
    readonly runtime_db_not_authority: true;
    readonly no_github_api_call: true;
    readonly no_eval_score_update: true;
    readonly no_federation: true;
  };
  readonly provenance: {
    readonly generated_by: "forgeroot-memory.packer";
    readonly task: "T032";
  };
}

export interface MemoryArchivePackResult {
  readonly ok: boolean;
  readonly pack?: MemoryArchivePack;
  readonly errors?: readonly string[];
}

export interface MemoryArchivePackValidationResult {
  readonly ok: boolean;
  readonly issues?: readonly string[];
}

export interface MemoryArchivePackVerificationResult {
  readonly ok: boolean;
  readonly verified_count?: number;
  readonly issues?: readonly string[];
}

// ── helpers ──────────────────────────────────────────────────────────────────

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function hasSecretKey(key: string): boolean {
  const up = key.toUpperCase().replace(/-/g, "_");
  return SECRET_KEY_TERMS.some((t) => up === t || up.endsWith("_" + t));
}

function hasDestructiveKey(key: string): boolean {
  const up = key.toUpperCase().replace(/-/g, "_");
  // Keys starting with NO_ are guard declarations (no_destructive_delete), not operations.
  if (up.startsWith("NO_") || up.startsWith("PREVENT_") || up.startsWith("GUARD_")) return false;
  return DESTRUCTIVE_KEY_TERMS.some((t) => up.includes(t));
}

function scanForSecrets(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const h = scanForSecrets(item);
      if (h !== null) return h;
    }
    return null;
  }
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (hasSecretKey(k)) return k;
    const h = scanForSecrets((obj as Record<string, unknown>)[k]);
    if (h !== null) return h;
  }
  return null;
}

function scanForDestructive(obj: unknown): string | null {
  if (typeof obj !== "object" || obj === null) return null;
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const h = scanForDestructive(item);
      if (h !== null) return h;
    }
    return null;
  }
  for (const k of Object.keys(obj as Record<string, unknown>)) {
    if (hasDestructiveKey(k)) return k;
    const h = scanForDestructive((obj as Record<string, unknown>)[k]);
    if (h !== null) return h;
  }
  return null;
}

function resolveCreatedAt(raw: unknown): string {
  if (typeof raw === "string" && RFC3339_UTC_RE.test(raw)) return raw;
  return new Date().toISOString().replace(/\.\d{3}Z$/, ".000Z");
}

// Deterministic JSON stringify — objects have keys sorted, no spaces.
function deterministicJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(deterministicJson).join(",") + "]";
  }
  const rec = value as Record<string, unknown>;
  const keys = Object.keys(rec).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + deterministicJson(rec[k]))
      .join(",") +
    "}"
  );
}

function sha256Hex(data: string): string {
  return createHash("sha256").update(data, "utf8").digest("hex");
}

function sha256Field(data: string): string {
  return `sha256:${sha256Hex(data)}`;
}

// Build canonical JSONL from sorted record refs.
// Each line is the deterministic JSON of the record, joined by "\n",
// with a trailing "\n".
function buildCanonicalJsonl(records: readonly MemoryArchiveRecordRef[]): string {
  const sorted = [...records].sort((a, b) =>
    a.record_id.localeCompare(b.record_id),
  );
  return sorted.map((r) => deterministicJson(r)).join("\n") + "\n";
}

// Normalize a raw record ref from unknown input.
function normalizeRecordRef(
  raw: unknown,
  index: number,
  errors: string[],
): MemoryArchiveRecordRef | null {
  const r = asRecord(raw);
  if (r === null) {
    errors.push(`record[${index}]_must_be_object`);
    return null;
  }
  const record_id =
    typeof r.record_id === "string" ? r.record_id.trim() : "";
  const source_ref =
    typeof r.source_ref === "string" ? r.source_ref.trim() : "";
  const artifact_sha256 =
    typeof r.artifact_sha256 === "string" ? r.artifact_sha256.trim() : "";
  const rawType = typeof r.record_type === "string" ? r.record_type : "";

  let invalid = false;
  if (record_id.length === 0) {
    errors.push(`record[${index}].record_id_required`);
    invalid = true;
  }
  if (source_ref.length === 0) {
    errors.push(`record[${index}].source_ref_required`);
    invalid = true;
  }
  if (!ARTIFACT_SHA256_RE.test(artifact_sha256)) {
    errors.push(`record[${index}].artifact_sha256_invalid`);
    invalid = true;
  }
  if (rawType !== "working_memory_update" && rawType !== "episode_digest") {
    errors.push(`record[${index}].record_type_must_be_working_memory_update_or_episode_digest`);
    invalid = true;
  }
  if (invalid) return null;

  // raw_sha256: if provided, validate; if not, compute from record fields.
  let raw_sha256: string;
  if (typeof r.raw_sha256 === "string" && ARTIFACT_SHA256_RE.test(r.raw_sha256)) {
    raw_sha256 = r.raw_sha256;
  } else {
    // Compute from the record content.
    const content = deterministicJson({ artifact_sha256, record_id, record_type: rawType, source_ref });
    raw_sha256 = sha256Field(content);
  }

  return {
    record_id,
    record_type: rawType as "working_memory_update" | "episode_digest",
    source_ref,
    artifact_sha256,
    raw_sha256,
  };
}

function inferPackKind(records: readonly MemoryArchiveRecordRef[]): PackKind {
  const types = new Set(records.map((r) => r.record_type));
  if (types.size === 1) {
    const only = [...types][0];
    if (only === "episode_digest") return "episode_digest";
    if (only === "working_memory_update") return "working_memory";
  }
  return "mixed";
}

// ── public API ────────────────────────────────────────────────────────────────

export function createMemoryArchivePack(
  input: unknown,
  _options?: unknown,
): MemoryArchivePackResult {
  const errors: string[] = [];

  const r = asRecord(input);
  if (r === null) return { ok: false, errors: ["input_must_be_object"] };

  const secretKey = scanForSecrets(input);
  if (secretKey !== null)
    return { ok: false, errors: [`secret_like_key_detected:${secretKey}`] };

  const destructiveKey = scanForDestructive(input);
  if (destructiveKey !== null)
    return { ok: false, errors: [`destructive_key_detected:${destructiveKey}`] };

  const pack_id =
    typeof r.pack_id === "string" && r.pack_id.startsWith(PACK_ID_PREFIX)
      ? r.pack_id
      : `${PACK_ID_PREFIX}${Date.now().toString(36)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;

  const created_at = resolveCreatedAt(r.created_at);

  // source
  const sourceRaw = asRecord(r.source);
  let task_id = "";
  let repository: string | null = null;
  let source_artifacts: readonly string[] = [];
  if (sourceRaw === null) {
    errors.push("source_required");
  } else {
    task_id =
      typeof sourceRaw.task_id === "string" ? sourceRaw.task_id.trim() : "";
    if (!TASK_ID_RE.test(task_id))
      errors.push("source.task_id_must_start_with_T");
    repository =
      typeof sourceRaw.repository === "string" ? sourceRaw.repository : null;
    const rawArtifacts = Array.isArray(sourceRaw.source_artifacts)
      ? sourceRaw.source_artifacts
      : [];
    source_artifacts = rawArtifacts
      .filter(
        (a): a is string =>
          typeof a === "string" && ARTIFACT_SHA256_RE.test(a.trim()),
      )
      .map((a) => a.trim());
    if (source_artifacts.length === 0)
      errors.push("source.source_artifacts_required_non_empty_sha256_array");
  }

  // records
  const rawRecords = Array.isArray(r.records) ? r.records : [];
  if (rawRecords.length === 0) errors.push("records_required_non_empty");

  const seenIds = new Set<string>();
  const normalizedRecords: MemoryArchiveRecordRef[] = [];
  for (let i = 0; i < rawRecords.length; i++) {
    const rec = normalizeRecordRef(rawRecords[i], i, errors);
    if (rec === null) continue;
    if (seenIds.has(rec.record_id)) continue; // deterministic dedupe
    seenIds.add(rec.record_id);
    normalizedRecords.push(rec);
  }

  const sortedRecords = [...normalizedRecords].sort((a, b) =>
    a.record_id.localeCompare(b.record_id),
  );

  if (errors.length > 0) return { ok: false, errors };

  // Compute canonical JSONL and hash
  const canonicalJsonl = buildCanonicalJsonl(sortedRecords);
  const raw_jsonl_sha256 = sha256Field(canonicalJsonl);

  // Infer pack kind unless explicitly provided
  const packRaw = asRecord(r.pack);
  let kind: PackKind = inferPackKind(sortedRecords);
  if (
    packRaw &&
    typeof packRaw.kind === "string" &&
    VALID_PACK_KINDS.has(packRaw.kind as PackKind)
  ) {
    kind = packRaw.kind as PackKind;
  }

  const pack: MemoryArchivePack = {
    manifest_version: 1,
    schema_ref: MEMORY_ARCHIVE_PACK_SCHEMA_REF,
    pack_id,
    created_at,
    pack: {
      kind,
      format: "jsonl.zst",
      compression: "zstd",
      compression_performed: false,
      record_count: sortedRecords.length,
      raw_jsonl_sha256,
      compressed_sha256: null,
      deterministic_ordering: true,
    },
    source: { repository, task_id, source_artifacts },
    records: sortedRecords,
    guards: {
      no_destructive_delete: true,
      source_refs_required: true,
      deterministic_record_ordering: true,
      runtime_db_not_authority: true,
      no_github_api_call: true,
      no_eval_score_update: true,
      no_federation: true,
    },
    provenance: {
      generated_by: "forgeroot-memory.packer",
      task: "T032",
    },
  };

  return { ok: true, pack };
}

export function validateMemoryArchivePack(
  value: unknown,
): MemoryArchivePackValidationResult {
  const issues: string[] = [];

  const r = asRecord(value);
  if (r === null) return { ok: false, issues: ["value_must_be_object"] };

  const secretKey = scanForSecrets(value);
  if (secretKey !== null) issues.push(`secret_like_key_detected:${secretKey}`);

  const destructiveKey = scanForDestructive(value);
  if (destructiveKey !== null)
    issues.push(`destructive_key_detected:${destructiveKey}`);

  if (r.manifest_version !== 1) issues.push("manifest_version_must_be_1");
  if (r.schema_ref !== MEMORY_ARCHIVE_PACK_SCHEMA_REF)
    issues.push("schema_ref_mismatch");
  if (
    typeof r.pack_id !== "string" ||
    !r.pack_id.startsWith(PACK_ID_PREFIX)
  )
    issues.push("pack_id_must_start_with_forge-memory-pack://");
  if (
    typeof r.created_at !== "string" ||
    !RFC3339_UTC_RE.test(r.created_at)
  )
    issues.push("created_at_must_be_rfc3339_utc");

  const packMeta = asRecord(r.pack);
  if (packMeta === null) {
    issues.push("pack_must_be_object");
  } else {
    if (
      typeof packMeta.kind !== "string" ||
      !VALID_PACK_KINDS.has(packMeta.kind as PackKind)
    )
      issues.push(
        `pack.kind_must_be_one_of:${[...VALID_PACK_KINDS].join(",")}`,
      );
    if (packMeta.compression_performed !== false)
      issues.push("pack.compression_performed_must_be_false");
    if (
      typeof packMeta.raw_jsonl_sha256 !== "string" ||
      !ARTIFACT_SHA256_RE.test(packMeta.raw_jsonl_sha256)
    )
      issues.push("pack.raw_jsonl_sha256_invalid");
    if (
      packMeta.compressed_sha256 !== null &&
      (typeof packMeta.compressed_sha256 !== "string" ||
        !ARTIFACT_SHA256_RE.test(packMeta.compressed_sha256))
    )
      issues.push("pack.compressed_sha256_must_be_null_or_valid_sha256");
    if (packMeta.deterministic_ordering !== true)
      issues.push("pack.deterministic_ordering_must_be_true");
    if (
      typeof packMeta.record_count !== "number" ||
      packMeta.record_count < 0
    )
      issues.push("pack.record_count_must_be_non_negative_number");
  }

  const source = asRecord(r.source);
  if (source === null) {
    issues.push("source_must_be_object");
  } else {
    if (
      typeof source.task_id !== "string" ||
      !TASK_ID_RE.test(source.task_id)
    )
      issues.push("source.task_id_must_start_with_T");
    if (!Array.isArray(source.source_artifacts) || (source.source_artifacts as unknown[]).length === 0)
      issues.push("source.source_artifacts_must_be_non_empty_array");
    else {
      for (const a of source.source_artifacts as unknown[]) {
        if (typeof a !== "string" || !ARTIFACT_SHA256_RE.test(a))
          issues.push(`source.source_artifacts_entry_invalid:${String(a).slice(0, 30)}`);
      }
    }
  }

  const records = r.records;
  if (!Array.isArray(records)) {
    issues.push("records_must_be_array");
  } else {
    if (records.length === 0) issues.push("records_must_not_be_empty");
    const seenIds = new Set<string>();
    let prevId: string | null = null;
    for (let i = 0; i < records.length; i++) {
      const rec = asRecord(records[i]);
      if (rec === null) {
        issues.push(`record[${i}]_must_be_object`);
        continue;
      }
      const rid = typeof rec.record_id === "string" ? rec.record_id : "";
      if (rid.length === 0) issues.push(`record[${i}].record_id_required`);
      if (seenIds.has(rid)) issues.push(`record[${i}].duplicate_record_id:${rid}`);
      seenIds.add(rid);
      if (prevId !== null && rid.localeCompare(prevId) < 0)
        issues.push(`record[${i}].ordering_violation:${rid}_before_${prevId}`);
      prevId = rid;
      if (
        typeof rec.source_ref !== "string" ||
        rec.source_ref.trim().length === 0
      )
        issues.push(`record[${i}].source_ref_required`);
      if (
        typeof rec.artifact_sha256 !== "string" ||
        !ARTIFACT_SHA256_RE.test(rec.artifact_sha256)
      )
        issues.push(`record[${i}].artifact_sha256_invalid`);
      if (
        typeof rec.raw_sha256 !== "string" ||
        !ARTIFACT_SHA256_RE.test(rec.raw_sha256)
      )
        issues.push(`record[${i}].raw_sha256_invalid`);
    }

    // Validate record_count matches records.length
    const packMeta2 = asRecord(r.pack);
    if (
      packMeta2 &&
      typeof packMeta2.record_count === "number" &&
      packMeta2.record_count !== records.length
    )
      issues.push(
        `pack.record_count_mismatch:declared_${packMeta2.record_count}_actual_${records.length}`,
      );
  }

  const guards = asRecord(r.guards);
  if (guards === null) {
    issues.push("guards_must_be_object");
  } else {
    const required = [
      "no_destructive_delete",
      "source_refs_required",
      "deterministic_record_ordering",
      "runtime_db_not_authority",
      "no_github_api_call",
      "no_eval_score_update",
      "no_federation",
    ] as const;
    for (const g of required) {
      if (guards[g] !== true) issues.push(`guards.${g}_must_be_true`);
    }
  }

  const provenance = asRecord(r.provenance);
  if (provenance === null) {
    issues.push("provenance_must_be_object");
  } else {
    if (provenance.generated_by !== "forgeroot-memory.packer")
      issues.push("provenance.generated_by_mismatch");
    if (provenance.task !== "T032")
      issues.push("provenance.task_must_be_T032");
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function verifyMemoryArchivePack(
  pack: unknown,
  records: unknown,
): MemoryArchivePackVerificationResult {
  const issues: string[] = [];

  const packVal = validateMemoryArchivePack(pack);
  if (!packVal.ok) {
    return {
      ok: false,
      issues: [
        "pack_manifest_invalid",
        ...(packVal.issues ?? []),
      ],
    };
  }

  const p = pack as MemoryArchivePack;

  if (!Array.isArray(records)) {
    return { ok: false, issues: ["records_must_be_array"] };
  }

  // Build record refs from the supplied raw records using the same normalization
  const normErrors: string[] = [];
  const normalizedRefs: MemoryArchiveRecordRef[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < records.length; i++) {
    const ref = normalizeRecordRef(records[i], i, normErrors);
    if (ref === null) continue;
    if (seenIds.has(ref.record_id)) continue;
    seenIds.add(ref.record_id);
    normalizedRefs.push(ref);
  }
  if (normErrors.length > 0) {
    return { ok: false, issues: normErrors };
  }

  const sorted = [...normalizedRefs].sort((a, b) =>
    a.record_id.localeCompare(b.record_id),
  );

  // Check record count
  if (sorted.length !== p.pack.record_count) {
    issues.push(
      `record_count_mismatch:pack_declares_${p.pack.record_count}_supplied_${sorted.length}`,
    );
  }

  // Recompute canonical JSONL hash and compare
  const canonicalJsonl = buildCanonicalJsonl(sorted);
  const computedHash = sha256Field(canonicalJsonl);

  if (computedHash !== p.pack.raw_jsonl_sha256) {
    issues.push(
      `raw_jsonl_sha256_mismatch:pack_has_${p.pack.raw_jsonl_sha256}_computed_${computedHash}`,
    );
  }

  // Verify each record ref matches pack's records by id
  const packRecordMap = new Map(p.records.map((r) => [r.record_id, r]));
  for (const supplied of sorted) {
    const inPack = packRecordMap.get(supplied.record_id);
    if (inPack === undefined) {
      issues.push(`record_not_in_pack:${supplied.record_id}`);
      continue;
    }
    if (inPack.artifact_sha256 !== supplied.artifact_sha256) {
      issues.push(
        `record_artifact_sha256_mismatch:${supplied.record_id}`,
      );
    }
    if (inPack.raw_sha256 !== supplied.raw_sha256) {
      issues.push(
        `record_raw_sha256_mismatch:${supplied.record_id}`,
      );
    }
  }

  return issues.length === 0
    ? { ok: true, verified_count: sorted.length }
    : { ok: false, issues };
}
