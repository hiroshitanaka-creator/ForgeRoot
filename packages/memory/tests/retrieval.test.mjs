import test from 'node:test';
import assert from 'node:assert/strict';
import { digest, packer, retrieval, working } from './load.mjs';

const { createEpisodeDigest } = digest;
const { createArchivePack } = packer;
const { retrieveMemoryContext, validateMemoryContext } = retrieval;
const { createWorkingMemoryUpdate } = working;
const hash = 'sha256:' + 'd'.repeat(64);
const createdAt = '2026-06-18T00:00:00.000Z';

function episode(task = 'T031', summary = 'Semantic retrieval preserves source refs.') {
  const result = createEpisodeDigest({
    created_at: createdAt,
    episode: { type: 'accepted', title: `${task} retrieval episode`, summary, reliability: 'high' },
    source: {
      repository: 'hiroshitanaka-creator/ForgeRoot',
      task_id: task,
      artifact_sha256: hash,
      pr_number: 23,
      outcome_ref: `${task.toLowerCase()}-outcome`,
    },
    links: { related_plan_ids: [], related_audit_ids: [], related_pr_numbers: [23] },
    retention: { pack_candidate: true },
  });
  assert.equal(result.ok, true);
  return result.digest;
}

function workingUpdate(text = 'Semantic retrieval should keep a fact source ref.') {
  const result = createWorkingMemoryUpdate({
    created_at: createdAt,
    source: { task_id: 'T030', artifact_sha256: hash, reason: 'audited source artifact' },
    facts: [{ id: 'retrieval-fact', text, confidence: 1, source_ref: 'working-artifact#fact', tags: ['memory'] }],
    retention: { ttl_days: 7, keep_last_accepted: 1, keep_last_rejected: 1 },
  });
  assert.equal(result.ok, true);
  return result.update;
}

function archivePack() {
  const result = createArchivePack({
    created_at: createdAt,
    records: [{
      record_id: 'archive-episode',
      kind: 'episode_digest',
      source_ref: 'archive-source-ref',
      artifact_sha256: hash,
      payload: episode('T032', 'Archive pack record is retrievable with source refs.'),
    }],
  });
  assert.equal(result.ok, true);
  return result.pack;
}

function semanticItem(id, summary, extra = {}) {
  return {
    kind: 'semantic_digest',
    id,
    source_ref: `semantic-source#${id}`,
    artifact_sha256: hash,
    title: id,
    summary,
    ...extra,
  };
}

test('retrieves bounded source-backed context from memory artifact shapes', () => {
  const result = retrieveMemoryContext({
    created_at: createdAt,
    query: 'semantic retrieval source refs',
    token_budget: 500,
    items: [
      episode('T031', 'Semantic retrieval keeps source refs for episode digests.'),
      workingUpdate(),
      archivePack(),
      semanticItem('semantic-pattern', 'Semantic patterns must preserve source refs.'),
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(validateMemoryContext(result.context).ok, true);
  assert.equal(result.context.retrieval_status, 'ok');
  assert.equal(result.context.budget.candidate_count, 4);
  assert.equal(result.context.budget.selected_count, 4);
  assert.ok(result.context.items.some((entry) => entry.kind === 'episode_digest' && entry.source_ref === 't031-outcome'));
  assert.ok(result.context.items.some((entry) => entry.kind === 'working_memory_fact' && entry.source_ref === 'working-artifact#fact'));
  assert.ok(result.context.items.some((entry) => entry.kind === 'archive_record' && entry.source_ref === 'archive-source-ref'));
  assert.ok(result.context.items.every((entry) => entry.artifact_sha256 === hash));
  assert.equal(result.context.guards.no_vector_db_authority, true);
  assert.equal(result.context.guards.vector_index_is_derived, true);
});

test('deterministically trims by token budget and stable item ordering', () => {
  const a = semanticItem('a', 'semantic');
  const b = semanticItem('b', 'semantic '.repeat(40));
  const c = semanticItem('c', 'unrelated');
  const first = retrieveMemoryContext({ created_at: createdAt, query: 'semantic', token_budget: 3, items: [b, c, a] });
  const second = retrieveMemoryContext({ created_at: createdAt, query: 'semantic', token_budget: 3, items: [c, a, b] });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.context.retrieval_status, 'truncated');
  assert.equal(first.context.budget.truncated, true);
  assert.deepEqual(first.context.items.map((entry) => entry.item_id), ['semantic_digest:a']);
  assert.deepEqual(first.context.items.map((entry) => entry.item_id), second.context.items.map((entry) => entry.item_id));
  assert.equal(first.context.context_id, second.context.context_id);
});

test('missing memory returns empty context without guessing items', () => {
  const result = retrieveMemoryContext({ created_at: createdAt, query: 'missing memory', token_budget: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.context.retrieval_status, 'empty');
  assert.deepEqual(result.context.items, []);
  assert.equal(result.context.budget.candidate_count, 0);
  assert.equal(result.context.budget.selected_count, 0);
  assert.equal(result.context.guards.no_missing_memory_guessing, true);
});

test('rejects source-less candidates before budget trimming can hide them', () => {
  const result = retrieveMemoryContext({
    created_at: createdAt,
    query: 'semantic',
    token_budget: 1,
    items: [semanticItem('bad', 'semantic', { source_ref: '' })],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.path.endsWith('source_ref')));
});

test('rejects empty archive pack candidates instead of treating them as missing memory', () => {
  const result = retrieveMemoryContext({
    created_at: createdAt,
    query: 'archive',
    token_budget: 10,
    items: [{ schema_ref: 'urn:forgeroot:archive-pack:v1', records: [] }],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.path.endsWith('source_ref')));
});

test('rejects vector index authority instead of treating it as source truth', () => {
  assert.equal(retrieveMemoryContext({ created_at: createdAt, query: 'semantic', token_budget: 10, vector_index_authority: true }).ok, false);
  const result = retrieveMemoryContext({
    created_at: createdAt,
    query: 'semantic',
    token_budget: 10,
    items: [semanticItem('bad-vector', 'semantic', { source_kind: 'vector_index' })],
  });
  assert.equal(result.ok, false);
  assert.ok(result.issues.some((entry) => entry.code === 'required' || entry.code === 'must_be_sha256'));
});

test('rejects wrong-typed request values and secret-shaped input', () => {
  assert.equal(retrieveMemoryContext({ created_at: createdAt, query: 'semantic', token_budget: '10', items: [] }).ok, false);
  assert.equal(retrieveMemoryContext({ created_at: createdAt, query: 'semantic', token_budget: 10, items: 'not-array' }).ok, false);
  assert.equal(retrieveMemoryContext({ created_at: createdAt, query: 'ghp_' + 'x'.repeat(36), token_budget: 10, items: [] }).ok, false);
});

test('standalone validation catches tampered context manifests', () => {
  const result = retrieveMemoryContext({
    created_at: createdAt,
    query: 'semantic retrieval',
    token_budget: 100,
    items: [semanticItem('a', 'semantic retrieval'), semanticItem('b', 'semantic retrieval source refs')],
  });
  assert.equal(result.ok, true);
  const missingSource = structuredClone(result.context);
  missingSource.items[0].source_ref = '';
  assert.equal(validateMemoryContext(missingSource).ok, false);
  const badBudget = structuredClone(result.context);
  badBudget.budget.used_tokens += 1;
  assert.equal(validateMemoryContext(badBudget).ok, false);
  const badGuard = structuredClone(result.context);
  badGuard.guards.no_memory_mutation = false;
  assert.equal(validateMemoryContext(badGuard).ok, false);
  const reordered = structuredClone(result.context);
  reordered.items.reverse();
  assert.equal(validateMemoryContext(reordered).ok, false);
});
