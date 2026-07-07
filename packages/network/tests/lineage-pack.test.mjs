import test from 'node:test';
import assert from 'node:assert/strict';
import { network } from './load.mjs';

const {
  ARCHIVE_PACK_SCHEMA_REF,
  LINEAGE_PACK_SCHEMA_REF,
  exportLineagePack,
  runT061LineagePackExport,
  validateLineagePack,
  validateT061LineagePackExport,
} = network;

const hashA = 'sha256:' + 'a'.repeat(64);
const hashB = 'sha256:' + 'b'.repeat(64);
const hashC = 'sha256:' + 'c'.repeat(64);
const lineageRoot = 'forge-lineage://root/speciation/t048';

function treaty(extra = {}) {
  return {
    treaty_id: 'root-peer-treaty',
    status: 'active',
    source_peer_id: 'root-forge',
    target_peer_id: 'peer-forge',
    allowed_actions: ['lineage_import_candidate', 'lineage_export'],
    allowed_lineage_roots: [lineageRoot],
    allowed_record_kinds: ['archive_pack', 'lineage_handoff', 'mutation'],
    expires_at: '2026-12-31T00:00:00Z',
    ...extra,
  };
}

function record(recordId, extra = {}) {
  return {
    record_id: recordId,
    lineage_root: lineageRoot,
    kind: 'lineage_handoff',
    schema_ref: 'urn:forgeroot:lineage-handoff-pack:v1',
    source_ref: `forge://lineage/${recordId}`,
    artifact_sha256: hashA,
    payload_sha256: hashB,
    ...extra,
  };
}

function input(extra = {}) {
  return {
    now: '2026-07-06T00:00:00Z',
    treaty: treaty(extra.treaty ?? {}),
    source_peer: { peer_id: 'root-forge', repository_full_name: 'hiroshitanaka-creator/ForgeRoot', status: 'active', ...(extra.source_peer ?? {}) },
    target_peer: { peer_id: 'peer-forge', repository_full_name: 'example/PeerForge', status: 'active', ...(extra.target_peer ?? {}) },
    archive_pack_ref: {
      schema_ref: ARCHIVE_PACK_SCHEMA_REF,
      pack_id: 'forge-archive-pack://lineage/t061/root-pack',
      raw_sha256: hashA,
      compressed_sha256: hashC,
      record_count: 2,
      ...(extra.archive_pack_ref ?? {}),
    },
    lineage_records: extra.lineage_records ?? [record('handoff-b'), record('handoff-a', { kind: 'archive_pack', schema_ref: 'urn:forgeroot:archive-pack:v1' })],
    ...(extra.signature_ref === undefined ? {} : { signature_ref: extra.signature_ref }),
  };
}

test('exports deterministic lineage pack and registers import candidate only', () => {
  const first = exportLineagePack(input());
  const second = exportLineagePack(input({ lineage_records: [...input().lineage_records].reverse() }));

  assert.equal(first.status, 'lineage_pack_ready');
  assert.equal(first.decision, 'lineage_pack_ready');
  assert.equal(first.schema_ref, LINEAGE_PACK_SCHEMA_REF);
  assert.equal(validateLineagePack(first).ok, true);
  assert.equal(first.lineage_pack_id, second.lineage_pack_id);
  assert.deepEqual(first.records.map((entry) => entry.record_id), ['handoff-a', 'handoff-b']);
  assert.equal(first.import_candidate.registration_status, 'candidate_registered');
  assert.equal(first.import_candidate.adoption_performed, false);
  assert.equal(first.dry_run.network_transport_performed, false);
  assert.equal(first.guards.no_automatic_adoption, true);
});

test('canonical T061 aliases are exported', () => {
  const result = runT061LineagePackExport(input());
  assert.equal(result.status, 'lineage_pack_ready');
  assert.equal(validateT061LineagePackExport(result).ok, true);
});

test('blocks treaty scope violations without exporting outside allowlist', () => {
  const result = exportLineagePack(input({ lineage_records: [record('handoff-a', { lineage_root: 'forge-lineage://other/root' })], archive_pack_ref: { record_count: 1 } }));
  assert.equal(result.status, 'blocked');
  assert.equal(result.decision, 'lineage_pack_blocked');
  assert.equal(validateLineagePack(result).ok, true);
  assert.equal(result.import_candidate.registration_status, 'blocked');
  assert.equal(result.import_candidate.adoption_performed, false);
  assert.ok(result.reasons.includes('lineage_root_out_of_scope'));
  assert.equal(result.issues, undefined);
});

test('rejects invalid hash, signature, and archive schema inputs', () => {
  const result = exportLineagePack(input({
    archive_pack_ref: { schema_ref: 'urn:forgeroot:wrong:v1', raw_sha256: 'sha256:not-a-hash' },
    signature_ref: { algorithm: 'sha256-ref', signer_peer_id: 'root-forge', signed_payload_digest: 'bad', signature_digest: 'bad' },
  }));

  assert.equal(result.status, 'invalid');
  assert.equal(validateLineagePack(result).ok, true);
  assert.ok(result.issues.some((entry) => entry.code === 'invalid_archive_schema'));
  assert.ok(result.issues.some((entry) => entry.code === 'invalid_raw_sha256'));
  assert.ok(result.issues.some((entry) => entry.code === 'invalid_signed_payload_digest'));
  assert.ok(result.issues.some((entry) => entry.code === 'invalid_signature_digest'));
});

test('rejects unknown or quarantined peers before ready export', () => {
  const result = exportLineagePack(input({ target_peer: { peer_id: 'peer-forge', status: 'quarantined' } }));
  assert.equal(result.status, 'blocked');
  assert.equal(validateLineagePack(result).ok, true);
  assert.ok(result.reasons.includes('target_peer_not_active'));
});

test('read-back validation catches tampered digest and signature linkage', () => {
  const result = exportLineagePack(input());
  assert.equal(result.status, 'lineage_pack_ready');

  const badDigest = { ...result, export_payload_digest: 'sha-fnv1a-00000000' };
  const badSignature = { ...result, signature_ref: { ...result.signature_ref, signed_payload_digest: 'sha-fnv1a-00000000' } };

  assert.equal(validateLineagePack(badDigest).ok, false);
  assert.ok(validateLineagePack(badDigest).issues.some((entry) => entry.code === 'export_payload_digest_mismatch' || entry.code === 'digest_mismatch'));
  assert.equal(validateLineagePack(badSignature).ok, false);
  assert.ok(validateLineagePack(badSignature).issues.some((entry) => entry.code === 'signature_payload_mismatch' || entry.code === 'digest_mismatch'));
});

test('read-back validation catches unsorted records and archive count mismatch', () => {
  const result = exportLineagePack(input());
  const tampered = {
    ...result,
    records: [...result.records].reverse(),
    archive_pack_ref: { ...result.archive_pack_ref, record_count: 99 },
  };
  const validation = validateLineagePack(tampered);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.code === 'records_not_sorted'));
  assert.ok(validation.issues.some((entry) => entry.code === 'record_count_mismatch'));
});

test('read-back validation catches treaty scope and ready-status tampering', () => {
  const result = exportLineagePack(input());
  const scopeTampered = {
    ...result,
    treaty_scope: { ...result.treaty_scope, allowed_lineage_roots: [] },
  };
  const statusTampered = {
    ...result,
    treaty_ref: { ...result.treaty_ref, treaty_status: 'revoked' },
    source_peer: { ...result.source_peer, status: 'quarantined' },
  };

  const scopeValidation = validateLineagePack(scopeTampered);
  const statusValidation = validateLineagePack(statusTampered);
  assert.equal(scopeValidation.ok, false);
  assert.ok(scopeValidation.issues.some((entry) => entry.code === 'non_empty_array_required' || entry.code === 'lineage_root_out_of_scope'));
  assert.equal(statusValidation.ok, false);
  assert.ok(statusValidation.issues.some((entry) => entry.code === 'ready_treaty_must_be_active'));
  assert.ok(statusValidation.issues.some((entry) => entry.code === 'ready_source_peer_must_be_active'));
});

test('rejects expired treaties and unknown treaty actions fail closed', () => {
  const expired = exportLineagePack(input({ treaty: { expires_at: '2026-01-01T00:00:00Z' } }));
  const unknownAction = exportLineagePack(input({ treaty: { allowed_actions: ['lineage_export', 'lineage_import_candidate', 'open_federation'] } }));

  assert.equal(expired.status, 'blocked');
  assert.equal(validateLineagePack(expired).ok, true);
  assert.ok(expired.reasons.includes('treaty_expired'));
  assert.equal(unknownAction.status, 'invalid');
  assert.equal(validateLineagePack(unknownAction).ok, true);
  assert.ok(unknownAction.issues.some((entry) => entry.code === 'invalid_allowed_action'));
});

test('read-back validation rejects side effects and automatic adoption', () => {
  const result = exportLineagePack(input());
  const tampered = {
    ...result,
    import_candidate: { ...result.import_candidate, adoption_performed: true },
    guards: { ...result.guards, no_network_transport: false },
    dry_run: { ...result.dry_run, network_transport_performed: true },
  };
  const validation = validateLineagePack(tampered);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.code === 'automatic_adoption_forbidden'));
  assert.ok(validation.issues.some((entry) => entry.code === 'guard_required'));
  assert.ok(validation.issues.some((entry) => entry.code === 'side_effect_forbidden'));
});

test('rejects secret-shaped material instead of echoing it as ready metadata', () => {
  const result = exportLineagePack(input({ source_peer: { repository_full_name: 'owner/github_pat_' + 'x'.repeat(24) } }));
  assert.equal(result.status, 'invalid');
  assert.ok(result.issues.some((entry) => entry.code === 'secret_material_forbidden'));
});
