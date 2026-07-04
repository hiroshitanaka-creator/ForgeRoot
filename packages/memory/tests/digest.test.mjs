import test from 'node:test';
import assert from 'node:assert/strict';
import { digest as mod } from './load.mjs';
const { createEpisodeDigest, validateEpisodeDigest } = mod;
const hash='sha256:'+'b'.repeat(64);
function input(type='accepted', extra={}){ return { created_at:'2026-06-18T00:00:00.000Z', episode:{type,title:`${type} episode`,summary:'Audited outcome.',reliability:type==='unknown'?'unknown':'high'}, source:{repository:'r',task_id:'T031',artifact_sha256:hash,pr_number:1}, links:{related_plan_ids:['p2','p1'],related_audit_ids:['a2','a1'],related_pr_numbers:[2,1]}, retention:{pack_candidate:false}, ...extra}; }
test('valid accepted digest',()=>{ const r=createEpisodeDigest(input('accepted')); assert.equal(r.ok,true); assert.equal(validateEpisodeDigest(r.digest).ok,true); });
test('valid rejected digest',()=>{ assert.equal(createEpisodeDigest(input('rejected')).ok,true); });
test('valid blocked digest',()=>{ assert.equal(createEpisodeDigest(input('blocked')).ok,true); });
test('missing artifact hash rejected',()=>{ assert.equal(createEpisodeDigest(input('accepted',{source:{task_id:'T031',artifact_sha256:''}})).ok,false); });
test('unknown type requires unknown reliability',()=>{ assert.equal(createEpisodeDigest(input('unknown',{episode:{type:'unknown',title:'u',summary:'u',reliability:'high'}})).ok,false); });
test('summary length cap',()=>{ assert.equal(createEpisodeDigest(input('accepted',{episode:{type:'accepted',title:'t',summary:'x'.repeat(1201),reliability:'high'}})).ok,false); });
test('deterministic ordering',()=>{ const r=createEpisodeDigest(input('accepted')); assert.deepEqual(r.digest.links.related_plan_ids,['p1','p2']); assert.deepEqual(r.digest.links.related_pr_numbers,[1,2]); });
test('secret-like field rejected',()=>{ assert.equal(createEpisodeDigest(input('accepted',{PRIVATE_KEY:'x'})).ok,false); });
test('github token shaped secret rejected',()=>{ assert.equal(createEpisodeDigest(input('accepted',{episode:{type:'accepted',title:'t',summary:'ghp_'+'x'.repeat(36),reliability:'high'}})).ok,false); });
test('digest_id does not collide across distinct episodes',()=>{
  const a = createEpisodeDigest(input('accepted',{episode:{type:'accepted',title:'t',summary:'short summary A',reliability:'high'}}));
  const b = createEpisodeDigest(input('accepted',{episode:{type:'accepted',title:'t',summary:'a much longer summary that still shares the same prefix B',reliability:'high'}}));
  assert.equal(a.ok,true); assert.equal(b.ok,true);
  assert.notEqual(a.digest.digest_id, b.digest.digest_id);
});
test('outcome_ref is preserved when provided',()=>{
  const r = createEpisodeDigest(input('accepted',{source:{repository:'r',task_id:'T031',artifact_sha256:hash,pr_number:1,outcome_ref:'outcome-123'}}));
  assert.equal(r.ok,true);
  assert.equal(r.digest.source.outcome_ref,'outcome-123');
});
test('digest_id is independent of source/episode key insertion order',()=>{
  const a = createEpisodeDigest(input('accepted'));
  const b = createEpisodeDigest(input('accepted',{source:{task_id:'T031',artifact_sha256:hash,pr_number:1,repository:'r'}}));
  assert.equal(a.ok,true); assert.equal(b.ok,true);
  assert.equal(a.digest.digest_id, b.digest.digest_id);
});
test('non-finite related pr numbers rejected',()=>{
  const r = createEpisodeDigest(input('accepted',{links:{related_plan_ids:[],related_audit_ids:[],related_pr_numbers:[NaN]}}));
  assert.equal(r.ok,false);
});
test('negative related pr numbers rejected',()=>{
  const r = createEpisodeDigest(input('accepted',{links:{related_plan_ids:[],related_audit_ids:[],related_pr_numbers:[-1]}}));
  assert.equal(r.ok,false);
});
test('negative source pr_number rejected',()=>{
  const r = createEpisodeDigest(input('accepted',{source:{repository:'r',task_id:'T031',artifact_sha256:hash,pr_number:-1}}));
  assert.equal(r.ok,false);
});
test('stripped provenance rejected on standalone validation',()=>{
  const r = createEpisodeDigest(input('accepted'));
  assert.equal(r.ok,true);
  const stripped = { ...r.digest, provenance: {} };
  assert.equal(validateEpisodeDigest(stripped).ok,false);
});
test('digest_id differs across distinct links for the same source/episode',()=>{
  const a = createEpisodeDigest(input('accepted',{links:{related_plan_ids:['p1'],related_audit_ids:[],related_pr_numbers:[]}}));
  const b = createEpisodeDigest(input('accepted',{links:{related_plan_ids:['p2'],related_audit_ids:[],related_pr_numbers:[]}}));
  assert.equal(a.ok,true); assert.equal(b.ok,true);
  assert.notEqual(a.digest.digest_id, b.digest.digest_id);
});
test('impossible calendar timestamp rejected',()=>{
  const r = createEpisodeDigest(input('accepted',{created_at:'2026-13-99T99:99:99Z'}));
  assert.equal(r.ok,false);
});
test('non-secret episode summary mentioning "token" in ordinary text is allowed',()=>{
  const r = createEpisodeDigest(input('accepted',{episode:{type:'accepted',title:'t',summary:'uses token_source for transport auth',reliability:'high'}}));
  assert.equal(r.ok,true);
});
