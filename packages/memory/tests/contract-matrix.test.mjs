// Table-driven negative-contract matrix for T030/T031 manifests.
// Derived from docs/specs/working-memory-update.md and episode-digest.md:
// every field is attacked with missing / wrong-type / boundary / hostile
// values, and tampered manifests are attacked with unknown keys per section.
// Every case must fail closed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { working, digest } from './load.mjs';

const { createWorkingMemoryUpdate, validateWorkingMemoryUpdate } = working;
const { createEpisodeDigest, validateEpisodeDigest } = digest;

const whash = 'sha256:' + 'a'.repeat(64);
const dhash = 'sha256:' + 'b'.repeat(64);

function wInput(extra = {}) {
  return {
    created_at: '2026-06-18T00:00:00.000Z',
    target: { mind_id: 'mind' },
    source: { task_id: 'T030', artifact_sha256: whash, reason: 'audited artifact' },
    facts: [{ id: 'a', text: 'A', confidence: 1, source_ref: 'artifact#a', tags: ['x'] }],
    retention: { ttl_days: 7, keep_last_accepted: 1, keep_last_rejected: 1 },
    ...extra,
  };
}
function dInput(extra = {}) {
  return {
    created_at: '2026-06-18T00:00:00.000Z',
    episode: { type: 'accepted', title: 'accepted episode', summary: 'Audited outcome.', reliability: 'high' },
    source: { repository: 'r', task_id: 'T031', artifact_sha256: dhash, pr_number: 1 },
    links: { related_plan_ids: ['p1'], related_audit_ids: [], related_pr_numbers: [1] },
    retention: { pack_candidate: false },
    ...extra,
  };
}
const wSource = (over) => ({ source: { task_id: 'T030', artifact_sha256: whash, reason: 'audited artifact', ...over } });
const dSource = (over) => ({ source: { repository: 'r', task_id: 'T031', artifact_sha256: dhash, pr_number: 1, ...over } });
const wFact = (over) => ({ facts: [{ id: 'a', text: 'A', confidence: 1, source_ref: 's', tags: [], ...over }] });

// --- sanity: the baselines themselves are valid -------------------------
test('matrix baselines are valid', () => {
  assert.equal(createWorkingMemoryUpdate(wInput()).ok, true);
  assert.equal(createEpisodeDigest(dInput()).ok, true);
});

// --- working memory update: hostile create() inputs ---------------------
const workingCreateRejects = [
  ['non-object input', 'not-an-object'],
  ['array input', []],
  ['created_at numeric (silent now() rewrite is forbidden)', wInput({ created_at: 1234567890 })],
  ['created_at with timezone offset instead of Z', wInput({ created_at: '2026-06-18T00:00:00+00:00' })],
  ['created_at impossible calendar day', wInput({ created_at: '2026-04-31T00:00:00.000Z' })],
  ['created_at empty string', wInput({ created_at: '' })],
  ['max_items string (silent default rewrite is forbidden)', wInput({ max_items: '100' })],
  ['max_items zero', wInput({ max_items: 0 })],
  ['max_items negative', wInput({ max_items: -5 })],
  ['max_items NaN', wInput({ max_items: NaN })],
  ['source missing', wInput({ source: undefined })],
  ['source.task_id missing T prefix', wInput(wSource({ task_id: '030' }))],
  ['source.task_id empty', wInput(wSource({ task_id: '' }))],
  ['source.artifact_sha256 wrong scheme', wInput(wSource({ artifact_sha256: 'md5:' + 'a'.repeat(64) }))],
  ['source.artifact_sha256 short hex', wInput(wSource({ artifact_sha256: 'sha256:' + 'a'.repeat(63) }))],
  ['source.artifact_sha256 uppercase hex', wInput(wSource({ artifact_sha256: 'sha256:' + 'A'.repeat(64) }))],
  ['source.reason whitespace only', wInput(wSource({ reason: '   ' }))],
  ['source.pr_number zero', wInput(wSource({ pr_number: 0 }))],
  ['source.pr_number float', wInput(wSource({ pr_number: 1.5 }))],
  ['source.pr_number NaN', wInput(wSource({ pr_number: NaN }))],
  ['facts empty', wInput({ facts: [] })],
  ['facts not an array', wInput({ facts: 'nope' })],
  ['fact.id empty', wInput(wFact({ id: '' }))],
  ['fact.text empty', wInput(wFact({ text: '' }))],
  ['fact.source_ref empty', wInput(wFact({ source_ref: '' }))],
  ['fact.confidence missing', wInput({ facts: [{ id: 'a', text: 'A', source_ref: 's', tags: [] }] })],
  ['fact.confidence above 1', wInput(wFact({ confidence: 1.01 }))],
  ['fact.confidence below 0', wInput(wFact({ confidence: -0.01 }))],
  ['fact.confidence Infinity', wInput(wFact({ confidence: Infinity }))],
  ['retention.ttl_days zero', wInput({ retention: { ttl_days: 0, keep_last_accepted: 1, keep_last_rejected: 1 } })],
  ['retention.ttl_days string (silent default rewrite is forbidden)', wInput({ retention: { ttl_days: '7', keep_last_accepted: 1, keep_last_rejected: 1 } })],
  ['retention.keep_last_accepted negative', wInput({ retention: { ttl_days: 7, keep_last_accepted: -1, keep_last_rejected: 1 } })],
  ['retention.keep_last_rejected float', wInput({ retention: { ttl_days: 7, keep_last_accepted: 1, keep_last_rejected: 1.5 } })],
  ['approval.approval_class unknown', wInput({ approval: { approval_class: 'Z' } })],
  ['approval.approval_class lowercase', wInput({ approval: { approval_class: 'b' } })],
  ['custom update_id with wrong scheme', wInput({ update_id: 'https://evil.example/x' })],
  ['custom update_id with empty suffix', wInput({ update_id: 'forge-memory-update://' })],
  ['secret-like key at top level', wInput({ API_KEY: 'x' })],
  ['secret-like key spelled Api-Key', wInput({ 'Api-Key': 'x' })],
  ['secret-like key nested in source', wInput(wSource({ GITHUB_TOKEN: 'x' }))],
  ['github pat value deep in fact text', wInput(wFact({ text: 'leak github_pat_' + 'x'.repeat(24) }))],
  ['aws key value in reason', wInput(wSource({ reason: 'uses AKIA' + 'A'.repeat(16) }))],
  ['pem block in fact text', wInput(wFact({ text: '-----BEGIN RSA PRIVATE KEY-----' }))],
  // silent-coercion fabrications (Codex rounds 4-5 generalized)
  ['created_at omitted entirely (no wall-clock default)', (() => { const i = wInput(); delete i.created_at; return i; })()],
  ['fact.confidence null must not coerce to 0', wInput(wFact({ confidence: null }))],
  ['fact.confidence false must not coerce to 0', wInput(wFact({ confidence: false }))],
  ['fact.confidence empty string must not coerce to 0', wInput(wFact({ confidence: '' }))],
  ['fact.tags numeric entries must not be stringified', wInput(wFact({ tags: [1] }))],
  ['update_id numeric must not be replaced with generated id', wInput({ update_id: 123 })],
  ['approval.approval_class numeric must not default to B', wInput({ approval: { approval_class: 5 } })],
  ['target.mind_id numeric must not default to root mind', wInput({ target: { mind_id: 42 } })],
  ['source.plan_id numeric must not be silently nulled', wInput(wSource({ plan_id: 7 }))],
  ['retention.ttl_days Infinity rejected', wInput({ retention: { ttl_days: Infinity, keep_last_accepted: 1, keep_last_rejected: 1 } })],
];
for (const [name, input] of workingCreateRejects) {
  test(`working create rejects: ${name}`, () => {
    assert.equal(createWorkingMemoryUpdate(input).ok, false);
  });
}

// --- working memory update: tampered manifest validation ----------------
function tamperedUpdate(mutate) {
  const r = createWorkingMemoryUpdate(wInput());
  assert.equal(r.ok, true);
  const u = structuredClone(r.update);
  mutate(u);
  return u;
}
const workingTamperRejects = [
  ['unknown top-level key', (u) => { u.injected = 1; }],
  ['unknown key in target', (u) => { u.target.injected = 1; }],
  ['unknown key in source', (u) => { u.source.injected = 1; }],
  ['unknown key in a fact', (u) => { u.facts[0].injected = 1; }],
  ['unknown key in retention', (u) => { u.retention.injected = 1; }],
  ['unknown key in approval', (u) => { u.approval.injected = 1; }],
  ['unknown key in guards', (u) => { u.guards.injected = true; }],
  ['unknown key in provenance', (u) => { u.provenance.injected = 'x'; }],
  ['smuggled eval score field', (u) => { u.eval_score = 100; }],
  ['target.mind_id emptied', (u) => { u.target.mind_id = ''; }],
  ['target.repository empty string instead of null', (u) => { u.target.repository = ''; }],
  ['source.plan_id numeric', (u) => { u.source.plan_id = 5; }],
  ['guard flipped to false', (u) => { u.guards.no_github_api_call = false; }],
  ['direct write re-enabled', (u) => { u.approval.direct_write_allowed = true; }],
  ['provenance stripped', (u) => { u.provenance = {}; }],
  ['update_id reduced to bare scheme', (u) => { u.update_id = 'forge-memory-update://'; }],
  ['facts reordered against sort contract', (u) => { u.facts = [{ ...u.facts[0], id: 'z' }, { ...u.facts[0], id: 'a' }]; }],
];
for (const [name, mutate] of workingTamperRejects) {
  test(`working validate rejects tampered manifest: ${name}`, () => {
    assert.equal(validateWorkingMemoryUpdate(tamperedUpdate(mutate)).ok, false);
  });
}

// --- episode digest: hostile create() inputs ----------------------------
const digestCreateRejects = [
  ['non-object input', 42],
  ['created_at numeric (silent now() rewrite is forbidden)', dInput({ created_at: 1234567890 })],
  ['created_at with offset instead of Z', dInput({ created_at: '2026-06-18T00:00:00+09:00' })],
  ['episode.type invalid', dInput({ episode: { type: 'merged', title: 't', summary: 's', reliability: 'high' } })],
  ['episode.reliability invalid', dInput({ episode: { type: 'accepted', title: 't', summary: 's', reliability: 'certain' } })],
  ['unknown type with non-unknown reliability', dInput({ episode: { type: 'unknown', title: 't', summary: 's', reliability: 'low' } })],
  ['episode.title empty', dInput({ episode: { type: 'accepted', title: '', summary: 's', reliability: 'high' } })],
  ['episode.title over 160 chars', dInput({ episode: { type: 'accepted', title: 'x'.repeat(161), summary: 's', reliability: 'high' } })],
  ['episode.summary over 1200 chars', dInput({ episode: { type: 'accepted', title: 't', summary: 'x'.repeat(1201), reliability: 'high' } })],
  ['episode.summary whitespace only', dInput({ episode: { type: 'accepted', title: 't', summary: '   ', reliability: 'high' } })],
  ['source.task_id missing', dInput({ source: { artifact_sha256: dhash } })],
  ['source.artifact_sha256 invalid', dInput(dSource({ artifact_sha256: 'sha256:xyz' }))],
  ['source.pr_number zero', dInput(dSource({ pr_number: 0 }))],
  ['source.pr_number float', dInput(dSource({ pr_number: 2.5 }))],
  ['links.related_pr_numbers NaN', dInput({ links: { related_plan_ids: [], related_audit_ids: [], related_pr_numbers: [NaN] } })],
  ['links.related_pr_numbers Infinity', dInput({ links: { related_plan_ids: [], related_audit_ids: [], related_pr_numbers: [Infinity] } })],
  ['links.related_pr_numbers negative', dInput({ links: { related_plan_ids: [], related_audit_ids: [], related_pr_numbers: [-2] } })],
  ['links.related_pr_numbers float', dInput({ links: { related_plan_ids: [], related_audit_ids: [], related_pr_numbers: [1.5] } })],
  ['retention.pack_candidate string (silent boolean coercion is forbidden)', dInput({ retention: { pack_candidate: 'yes' } })],
  ['custom digest_id with wrong scheme', dInput({ digest_id: 'urn:evil' })],
  ['custom digest_id with empty suffix', dInput({ digest_id: 'forge-episode-digest://' })],
  ['secret-like key at top level', dInput({ CREDENTIAL: 'x' })],
  ['secret-like key nested in links', dInput({ links: { related_plan_ids: [], related_audit_ids: [], related_pr_numbers: [], ACCESS_TOKEN: 'x' } })],
  ['github token value in summary', dInput({ episode: { type: 'accepted', title: 't', summary: 'gho_' + 'y'.repeat(24), reliability: 'high' } })],
  // silent-coercion fabrications (Codex rounds 4-5 generalized)
  ['created_at omitted entirely (no wall-clock default)', (() => { const i = dInput(); delete i.created_at; return i; })()],
  ['episode.type numeric must not default to unknown', dInput({ episode: { type: 5, title: 't', summary: 's' } })],
  ['episode.reliability numeric must not default to unknown', dInput({ episode: { type: 'accepted', title: 't', summary: 's', reliability: 5 } })],
  ['digest_id numeric must not be replaced with generated id', dInput({ digest_id: 123 })],
  ['source.repository numeric must not be silently nulled', dInput(dSource({ repository: 9 }))],
  ['source.commit_sha boolean must not be silently nulled', dInput(dSource({ commit_sha: true }))],
  ['links.related_plan_ids numeric entries must not be stringified', dInput({ links: { related_plan_ids: [1], related_audit_ids: [], related_pr_numbers: [] } })],
];
for (const [name, input] of digestCreateRejects) {
  test(`digest create rejects: ${name}`, () => {
    assert.equal(createEpisodeDigest(input).ok, false);
  });
}

// --- episode digest: tampered manifest validation -----------------------
function tamperedDigest(mutate) {
  const r = createEpisodeDigest(dInput());
  assert.equal(r.ok, true);
  const d = structuredClone(r.digest);
  mutate(d);
  return d;
}
const digestTamperRejects = [
  ['unknown top-level key', (d) => { d.injected = 1; }],
  ['unknown key in episode', (d) => { d.episode.injected = 1; }],
  ['unknown key in source', (d) => { d.source.injected = 1; }],
  ['unknown key in links', (d) => { d.links.injected = []; }],
  ['unknown key in retention', (d) => { d.retention.injected = true; }],
  ['unknown key in guards', (d) => { d.guards.injected = true; }],
  ['unknown key in provenance', (d) => { d.provenance.injected = 'x'; }],
  ['smuggled score field', (d) => { d.fitness_score = 0.9; }],
  ['preserve_rejected flipped', (d) => { d.retention.preserve_rejected = false; }],
  ['preserve_blocked flipped', (d) => { d.retention.preserve_blocked = false; }],
  ['pack_candidate replaced with string', (d) => { d.retention.pack_candidate = 'yes'; }],
  ['guard flipped to false', (d) => { d.guards.no_mutation_generation = false; }],
  ['provenance stripped', (d) => { d.provenance = {}; }],
  ['source.commit_sha empty string instead of null', (d) => { d.source.commit_sha = ''; }],
  ['source.outcome_ref numeric', (d) => { d.source.outcome_ref = 7; }],
  ['digest_id reduced to bare scheme', (d) => { d.digest_id = 'forge-episode-digest://'; }],
  ['links unsorted', (d) => { d.links.related_plan_ids = ['p2', 'p1']; }],
  ['links duplicated', (d) => { d.links.related_pr_numbers = [1, 1]; }],
];
for (const [name, mutate] of digestTamperRejects) {
  test(`digest validate rejects tampered manifest: ${name}`, () => {
    assert.equal(validateEpisodeDigest(tamperedDigest(mutate)).ok, false);
  });
}

// --- determinism invariants under the hardened contract -----------------
test('working: same input twice yields identical manifests', () => {
  const a = createWorkingMemoryUpdate(wInput());
  const b = createWorkingMemoryUpdate(wInput());
  assert.deepEqual(a, b);
});
test('digest: same input twice yields identical manifests', () => {
  const a = createEpisodeDigest(dInput());
  const b = createEpisodeDigest(dInput());
  assert.deepEqual(a, b);
});
test('working: create-then-validate round trip stays valid', () => {
  const r = createWorkingMemoryUpdate(wInput());
  assert.equal(validateWorkingMemoryUpdate(structuredClone(r.update)).ok, true);
});
test('digest: create-then-validate round trip stays valid after JSON serialization', () => {
  const r = createEpisodeDigest(dInput());
  assert.equal(validateEpisodeDigest(JSON.parse(JSON.stringify(r.digest))).ok, true);
});
