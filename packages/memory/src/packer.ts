import { createHash } from "node:crypto";
import { constants as zlibConstants, zstdCompressSync } from "node:zlib";
import {
  HASH_RE, hasSecretLike, isValidRfc3339Utc, stableId, invalid, issue, asRecord,
  stringOr, presentOr, nonEmpty, isManifestUri, isPositiveInt, checkAllowedKeys,
  validateSectionIsObject,
} from "./contract.js";

export const ARCHIVE_PACK_VERSION = 1;
export const ARCHIVE_PACK_SCHEMA_REF = "urn:forgeroot:archive-pack:v1";
const PACK_URI_PREFIX = "forge-archive-pack://";
const DEFAULT_PACK_CATEGORY = "episodes";
const ZSTD_LEVEL = 7;
const CATEGORY_RE = /^[a-z][a-z0-9-]*$/;
const TOP_KEYS = new Set(["manifest_version", "schema_ref", "pack_id", "created_at", "category", "header_record", "header", "records", "guards", "provenance"]);
const HEADER_RECORD_KEYS = new Set(["record_type", "pack_version", "schema_ref", "category", "created_at", "record_count", "deterministic_ordering"]);
const HEADER_KEYS = new Set(["pack_format", "compression", "compression_level", "pack_path", "record_count", "raw_sha256", "compressed_sha256", "raw_size_bytes", "compressed_size_bytes", "deterministic_ordering"]);
const RECORD_KEYS = new Set(["record_id", "kind", "source_ref", "artifact_sha256", "payload_sha256", "payload"]);
const GUARD_KEYS = ["source_refs_required", "deterministic_ordering", "raw_hash_verifiable", "compressed_hash_verifiable", "no_external_storage_authority", "no_direct_forge_write", "no_runtime_db_authority", "no_github_api_call"];
const PROVENANCE_KEYS = new Set(["generated_by", "task"]);
const RECORD_KINDS = new Set(["episode_digest", "working_memory_update", "mutation_artifact", "eval_artifact", "provenance_artifact", "other"]);

export function createArchivePack(input, options: any = {}) {
  if (hasSecretLike(input)) return invalid(["secret_like_field_or_value"]);
  const r = asRecord(input);
  if (!r) return invalid(["input_must_be_object"]);
  const createdAt = options.created_at !== undefined ? options.created_at : r.created_at;
  const category = presentOr(options.category !== undefined ? options.category : r.category, DEFAULT_PACK_CATEGORY);
  const records = Array.isArray(r.records)
    ? r.records.map(normalizeRecord).sort((a, b) => stringOr(a.record_id, "") < stringOr(b.record_id, "") ? -1 : stringOr(a.record_id, "") > stringOr(b.record_id, "") ? 1 : 0)
    : r.records;
  const headerRecord = Array.isArray(records) ? createPackHeaderRecord(createdAt, category, records.length) : null;
  const header = Array.isArray(records) ? createHeader(headerRecord, records) : null;
  const pack = {
    manifest_version: 1,
    schema_ref: ARCHIVE_PACK_SCHEMA_REF,
    pack_id: presentOr(r.pack_id, `${PACK_URI_PREFIX}${stableId([createdAt, category, records, header?.raw_sha256, header?.compressed_sha256])}`),
    created_at: createdAt,
    category,
    header_record: headerRecord ?? {},
    header: header ?? {},
    records,
    guards: {
      source_refs_required: true,
      deterministic_ordering: true,
      raw_hash_verifiable: true,
      compressed_hash_verifiable: true,
      no_external_storage_authority: true,
      no_direct_forge_write: true,
      no_runtime_db_authority: true,
      no_github_api_call: true,
    },
    provenance: { generated_by: "forgeroot-memory.packer", task: "T032" },
  };
  const validation = validateArchivePack(pack);
  return validation.ok ? { ok: true, pack } : { ok: false, issues: validation.issues };
}

export function packMemoryRecords(input, options: any = {}) {
  return createArchivePack(input, options);
}

export function validateArchivePack(value) {
  const issues = [];
  const r = asRecord(value);
  if (!r) return { ok: false, issues: [issue("", "must_be_object")] };
  if (hasSecretLike(value)) issues.push(issue("", "secret_like_field_or_value"));
  checkAllowedKeys(r, TOP_KEYS, "", issues);
  validateSectionIsObject(r.header_record, "header_record", issues);
  validateSectionIsObject(r.header, "header", issues);
  validateSectionIsObject(r.guards, "guards", issues);
  validateSectionIsObject(r.provenance, "provenance", issues);
  checkAllowedKeys(r.header_record, HEADER_RECORD_KEYS, "header_record", issues);
  checkAllowedKeys(r.header, HEADER_KEYS, "header", issues);
  checkAllowedKeys(r.guards, new Set(GUARD_KEYS), "guards", issues);
  checkAllowedKeys(r.provenance, PROVENANCE_KEYS, "provenance", issues);

  if (r.manifest_version !== 1) issues.push(issue("manifest_version", "must_equal_1"));
  if (r.schema_ref !== ARCHIVE_PACK_SCHEMA_REF) issues.push(issue("schema_ref", "must_match_schema_ref"));
  if (!isManifestUri(stringOr(r.pack_id, ""), PACK_URI_PREFIX)) issues.push(issue("pack_id", "must_use_forge_archive_pack_uri"));
  if (!isValidRfc3339Utc(r.created_at)) issues.push(issue("created_at", "must_be_rfc3339_utc"));
  if (!CATEGORY_RE.test(stringOr(r.category, ""))) issues.push(issue("category", "must_be_pack_category"));

  if (r.header_record?.record_type !== "pack_header") issues.push(issue("header_record.record_type", "must_equal_pack_header"));
  if (r.header_record?.pack_version !== 1) issues.push(issue("header_record.pack_version", "must_equal_1"));
  if (r.header_record?.schema_ref !== ARCHIVE_PACK_SCHEMA_REF) issues.push(issue("header_record.schema_ref", "must_match_schema_ref"));
  if (r.header_record?.category !== r.category) issues.push(issue("header_record.category", "category_mismatch"));
  if (r.header_record?.created_at !== r.created_at) issues.push(issue("header_record.created_at", "created_at_mismatch"));
  if (r.header_record?.deterministic_ordering !== "record_id_ordinal") issues.push(issue("header_record.deterministic_ordering", "must_be_record_id_ordinal"));

  if (r.header?.pack_format !== "jsonl.zst") issues.push(issue("header.pack_format", "must_equal_jsonl_zst"));
  if (r.header?.compression !== "zstd") issues.push(issue("header.compression", "must_equal_zstd"));
  if (r.header?.compression_level !== ZSTD_LEVEL) issues.push(issue("header.compression_level", "must_equal_7"));
  if (!isPackPathForCategory(r.header?.pack_path, r.category, r.header?.compressed_sha256)) issues.push(issue("header.pack_path", "must_match_category_and_compressed_hash"));
  if (r.header?.deterministic_ordering !== "record_id_ordinal") issues.push(issue("header.deterministic_ordering", "must_be_record_id_ordinal"));
  if (!HASH_RE.test(stringOr(r.header?.raw_sha256, ""))) issues.push(issue("header.raw_sha256", "must_be_sha256"));
  if (!HASH_RE.test(stringOr(r.header?.compressed_sha256, ""))) issues.push(issue("header.compressed_sha256", "must_be_sha256"));
  if (!isPositiveInt(r.header?.record_count)) issues.push(issue("header.record_count", "must_be_positive_integer"));
  if (r.header_record?.record_count !== r.header?.record_count) issues.push(issue("header_record.record_count", "record_count_mismatch"));
  if (!isPositiveInt(r.header?.raw_size_bytes)) issues.push(issue("header.raw_size_bytes", "must_be_positive_integer"));
  if (!isPositiveInt(r.header?.compressed_size_bytes)) issues.push(issue("header.compressed_size_bytes", "must_be_positive_integer"));

  const records = Array.isArray(r.records) ? r.records : [];
  if (!Array.isArray(r.records) || records.length === 0) issues.push(issue("records", "must_be_non_empty_array"));
  if (records.length !== r.header?.record_count) issues.push(issue("header.record_count", "record_count_mismatch"));
  if (!isSorted(records.map((entry) => stringOr(entry?.record_id, "")))) issues.push(issue("records", "must_be_sorted_by_record_id"));
  const seen = new Set();
  records.forEach((entry, index) => validateRecord(entry, index, seen, issues));

  if (records.length > 0) {
    try {
      const expectedHeaderRecord = createPackHeaderRecord(r.created_at, r.category, records.length);
      const expected = createHeader(expectedHeaderRecord, records);
      if (canonicalJson(r.header_record) !== canonicalJson(expectedHeaderRecord)) issues.push(issue("header_record", "pack_header_mismatch"));
      if (r.header?.pack_path !== expected.pack_path) issues.push(issue("header.pack_path", "pack_path_mismatch"));
      if (r.header?.raw_sha256 !== expected.raw_sha256) issues.push(issue("header.raw_sha256", "raw_hash_mismatch"));
      if (r.header?.compressed_sha256 !== expected.compressed_sha256) issues.push(issue("header.compressed_sha256", "compressed_hash_mismatch"));
      if (r.header?.raw_size_bytes !== expected.raw_size_bytes) issues.push(issue("header.raw_size_bytes", "raw_size_mismatch"));
      if (r.header?.compressed_size_bytes !== expected.compressed_size_bytes) issues.push(issue("header.compressed_size_bytes", "compressed_size_mismatch"));
    } catch {
      issues.push(issue("records", "canonical_jsonl_unverifiable"));
    }
  }

  GUARD_KEYS.forEach((g) => { if (r.guards?.[g] !== true) issues.push(issue(`guards.${g}`, "must_be_true")); });
  if (!nonEmpty(r.provenance?.generated_by) || !nonEmpty(r.provenance?.task)) issues.push(issue("provenance", "required_generated_by_and_task"));
  return { ok: issues.length === 0, issues };
}

export function canonicalArchiveJsonl(packOrRecords) {
  const pack = asRecord(packOrRecords);
  if (pack && asRecord(pack.header_record) && Array.isArray(pack.records)) {
    return [pack.header_record, ...pack.records].map((record) => canonicalJson(record)).join("\n") + "\n";
  }
  return packOrRecords.map((record) => canonicalJson(record)).join("\n") + "\n";
}

function normalizeRecord(record) {
  const r = asRecord(record);
  if (!r) return record;
  const payload = r.payload === undefined ? {} : r.payload;
  const payloadJson = isJsonValue(payload) ? canonicalJson(payload) : "";
  return {
    record_id: stringOr(r.record_id, "").trim(),
    kind: presentOr(r.kind, "other"),
    source_ref: stringOr(r.source_ref, "").trim(),
    artifact_sha256: stringOr(r.artifact_sha256, ""),
    payload_sha256: presentOr(r.payload_sha256, payloadJson ? sha256(payloadJson) : ""),
    payload,
  };
}

function validateRecord(value, index, seen, issues) {
  const path = `records.${index}`;
  const r = asRecord(value);
  if (!r) {
    issues.push(issue(path, "must_be_object"));
    return;
  }
  checkAllowedKeys(r, RECORD_KEYS, path, issues);
  const recordId = stringOr(r.record_id, "");
  if (!nonEmpty(recordId)) issues.push(issue(`${path}.record_id`, "required"));
  if (seen.has(recordId)) issues.push(issue(`${path}.record_id`, "duplicate"));
  seen.add(recordId);
  if (!RECORD_KINDS.has(stringOr(r.kind, ""))) issues.push(issue(`${path}.kind`, "invalid"));
  if (!nonEmpty(r.source_ref)) issues.push(issue(`${path}.source_ref`, "required"));
  if (!HASH_RE.test(stringOr(r.artifact_sha256, ""))) issues.push(issue(`${path}.artifact_sha256`, "must_be_sha256"));
  if (!HASH_RE.test(stringOr(r.payload_sha256, ""))) issues.push(issue(`${path}.payload_sha256`, "must_be_sha256"));
  if (!isJsonValue(r.payload)) {
    issues.push(issue(`${path}.payload`, "must_be_json_value"));
    return;
  }
  const expectedPayloadHash = sha256(canonicalJson(r.payload));
  if (r.payload_sha256 !== expectedPayloadHash) issues.push(issue(`${path}.payload_sha256`, "payload_hash_mismatch"));
}

function createPackHeaderRecord(createdAt, category, recordCount) {
  return {
    record_type: "pack_header",
    pack_version: 1,
    schema_ref: ARCHIVE_PACK_SCHEMA_REF,
    category,
    created_at: createdAt,
    record_count: recordCount,
    deterministic_ordering: "record_id_ordinal",
  };
}

function createHeader(headerRecord, records) {
  const jsonl = canonicalArchiveJsonl({ header_record: headerRecord, records });
  const raw = Buffer.from(jsonl, "utf8");
  const compressed = zstdCompressSync(raw, { params: { [zlibConstants.ZSTD_c_compressionLevel]: ZSTD_LEVEL } });
  const compressedSha = sha256(compressed);
  return {
    pack_format: "jsonl.zst",
    compression: "zstd",
    compression_level: ZSTD_LEVEL,
    pack_path: `.forge/packs/${headerRecord.category}/${compressedSha.replace("sha256:", "")}.jsonl.zst`,
    record_count: records.length,
    raw_sha256: sha256(raw),
    compressed_sha256: compressedSha,
    raw_size_bytes: raw.length,
    compressed_size_bytes: compressed.length,
    deterministic_ordering: "record_id_ordinal",
  };
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function isSorted(values) {
  return values.every((value, index) => index === 0 || values[index - 1] <= value);
}

function isJsonValue(value) {
  if (value === null) return true;
  if (typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  const r = asRecord(value);
  return !!r && Object.values(r).every(isJsonValue);
}

function isPackPathForCategory(value, category, compressedSha) {
  const hash = stringOr(compressedSha, "").replace("sha256:", "");
  return value === `.forge/packs/${category}/${hash}.jsonl.zst`;
}
