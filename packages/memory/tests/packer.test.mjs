import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, packer } from './load.mjs';

const { createEpisodeDigest } = digest;
const { canonicalArchiveJsonl, createArchivePack, packMemoryRecords, validateArchivePack } = packer;
const artifactHash = 'sha256:' + 'c'.repeat(64);

function episode(task = 'T031', summary = 'Audited memory episode.') {
  const result = createEpisodeDigest({
    created_at: '2026-06-18T00:00:00.000Z',
    episode: { type: 'accepted', title: `${task} episode`, summary, reliability: 'high' },
    source: { repository: 'hiroshitanaka-creator/ForgeRoot', task_id: task, artifact_sha256: artifactHash, pr_number: 21 },
    links: { related_plan_ids: ['plan-b', 'plan-a'], related_audit_ids: [], related_pr_numbers: [21] },
    retention: { pack_candidate: true },
  });
  assert.equal(result.ok, true);
  return result.digest;
}

function record(id, payload = episode()) {
  return {
    record_id: id,
    kind: 'episode_digest',
    source_ref: payload.digest_id,
    artifact_sha256: payload.source.artifact_sha256,
    payload,
  };
}

function input(extra = {}) {
  return {
    created_at: '2026-06-18T00:00:00.000Z',
    records: [record('episode-b', episode('T031', 'B episode.')), record('episode-a', episode('T031', 'A episode.'))],
    ...extra,
  };
}

test('creates a deterministic jsonl.zst archive pack manifest', () => {
  const result = createArchivePack(input());
  assert.equal(result.ok, true);
  assert.equal(validateArchivePack(result.pack).ok, true);
  assert.equal(result.pack.category, 'episodes');
  assert.equal(result.pack.header_record.record_type, 'pack_header');
  assert.equal(result.pack.header_record.record_count, 2);
  assert.equal(result.pack.header.pack_format, 'jsonl.zst');
  assert.equal(result.pack.header.compression, 'zstd');
  assert.equal(result.pack.header.compression_level, 7);
  assert.equal(result.pack.header.record_count, 2);
  assert.match(result.pack.header.pack_path, /^\.forge\/packs\/episodes\/[0-9a-f]{64}\.jsonl\.zst$/);
  assert.match(result.pack.header.raw_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.match(result.pack.header.compressed_sha256, /^sha256:[0-9a-f]{64}$/);
  assert.deepEqual(result.pack.records.map((entry) => entry.record_id), ['episode-a', 'episode-b']);
  const lines = canonicalArchiveJsonl(result.pack).trimEnd().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].record_type, 'pack_header');
  assert.deepEqual(lines.slice(1).map((entry) => entry.record_id), ['episode-a', 'episode-b']);
  assert.ok(canonicalArchiveJsonl(result.pack).endsWith('\n'));
});

test('same records produce the same pack identity and hashes regardless of input order', () => {
  const a = createArchivePack(input());
  const b = createArchivePack({
    created_at: '2026-06-18T00:00:00.000Z',
    records: [...input().records].reverse(),
  });
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  assert.equal(a.pack.pack_id, b.pack.pack_id);
  assert.equal(a.pack.header.raw_sha256, b.pack.header.raw_sha256);
  assert.equal(a.pack.header.compressed_sha256, b.pack.header.compressed_sha256);
});

test('packMemoryRecords matches the T041-2 registered API name', () => {
  const result = packMemoryRecords(input());
  assert.equal(result.ok, true);
  assert.equal(validateArchivePack(result.pack).ok, true);
});

test('rejects duplicate record ids instead of silently dropping records', () => {
  const result = createArchivePack({
    created_at: '2026-06-18T00:00:00.000Z',
    records: [record('episode-a'), record('episode-a', episode('T031', 'Other.'))],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === 'duplicate'));
});

test('standalone validation catches tampered header counts and hashes', () => {
  const result = createArchivePack(input());
  assert.equal(result.ok, true);
  const badCount = { ...result.pack, header: { ...result.pack.header, record_count: 99 } };
  const badRawHash = { ...result.pack, header: { ...result.pack.header, raw_sha256: 'sha256:' + '0'.repeat(64) } };
  const badCompressedHash = { ...result.pack, header: { ...result.pack.header, compressed_sha256: 'sha256:' + '1'.repeat(64) } };
  assert.equal(validateArchivePack(badCount).ok, false);
  assert.ok(validateArchivePack(badCount).issues.some((entry) => entry.code === 'record_count_mismatch'));
  assert.equal(validateArchivePack(badRawHash).ok, false);
  assert.ok(validateArchivePack(badRawHash).issues.some((entry) => entry.code === 'raw_hash_mismatch'));
  assert.equal(validateArchivePack(badCompressedHash).ok, false);
  assert.ok(validateArchivePack(badCompressedHash).issues.some((entry) => entry.code === 'compressed_hash_mismatch'));
});

test('standalone validation catches tampered pack header and pack path', () => {
  const result = createArchivePack(input());
  assert.equal(result.ok, true);
  const badHeaderRecord = { ...result.pack, header_record: { ...result.pack.header_record, record_type: 'episode_digest' } };
  const badPackPath = { ...result.pack, header: { ...result.pack.header, pack_path: '.forge/packs/episodes/wrong.jsonl.zst' } };
  assert.equal(validateArchivePack(badHeaderRecord).ok, false);
  assert.ok(validateArchivePack(badHeaderRecord).issues.some((entry) => entry.code === 'must_equal_pack_header'));
  assert.equal(validateArchivePack(badPackPath).ok, false);
  assert.ok(validateArchivePack(badPackPath).issues.some((entry) => entry.code === 'must_match_category_and_compressed_hash' || entry.code === 'pack_path_mismatch'));
});

test('standalone validation catches payload hash mismatch even if the pack hash is recalculated', () => {
  const result = createArchivePack(input());
  assert.equal(result.ok, true);
  const tampered = {
    ...result.pack,
    records: result.pack.records.map((entry, index) => index === 0 ? { ...entry, payload_sha256: 'sha256:' + '2'.repeat(64) } : entry),
  };
  assert.equal(validateArchivePack(tampered).ok, false);
  assert.ok(validateArchivePack(tampered).issues.some((entry) => entry.code === 'payload_hash_mismatch'));
});

test('rejects missing source refs and artifact hashes', () => {
  const result = createArchivePack({
    created_at: '2026-06-18T00:00:00.000Z',
    records: [{ record_id: 'episode-a', kind: 'episode_digest', source_ref: '', artifact_sha256: '', payload: episode() }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.path.endsWith('source_ref')));
  assert.ok(result.issues.some((entry) => entry.path.endsWith('artifact_sha256')));
});

test('rejects invalid pack categories instead of silently defaulting them', () => {
  const result = createArchivePack(input({ category: 'bad/path' }));
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.path === 'category' && entry.code === 'must_be_pack_category'));
});

test('rejects secret-shaped payload values before building a pack', () => {
  const payload = { ...episode(), token: 'github_pat_' + 'x'.repeat(24) };
  const result = createArchivePack({
    created_at: '2026-06-18T00:00:00.000Z',
    records: [record('episode-a', payload)],
  });
  assert.equal(result.ok, false);
});

test('preserves manifest-only archive guards', () => {
  const result = createArchivePack(input());
  assert.equal(result.ok, true);
  assert.equal(result.pack.guards.no_external_storage_authority, true);
  assert.equal(result.pack.guards.no_direct_forge_write, true);
  assert.equal(result.pack.guards.no_runtime_db_authority, true);
  assert.equal(result.pack.guards.no_github_api_call, true);
  const weakened = { ...result.pack, guards: { ...result.pack.guards, no_external_storage_authority: false } };
  assert.equal(validateArchivePack(weakened).ok, false);
});

test('rejects empty records and impossible timestamps', () => {
  assert.equal(createArchivePack({ created_at: '2026-06-18T00:00:00.000Z', records: [] }).ok, false);
  assert.equal(createArchivePack({ created_at: '2026-02-29T00:00:00.000Z', records: [record('episode-a')] }).ok, false);
});
