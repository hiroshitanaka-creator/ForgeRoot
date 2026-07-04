import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const modulePath = join(tmpdir(), 'forgeroot-memory-working.mjs');
writeFileSync(modulePath, readFileSync(new URL('../src/working.ts', import.meta.url), 'utf8').replace(/: any/g, ''));
const { createWorkingMemoryUpdate, validateWorkingMemoryUpdate } = await import(modulePath);
const hash = 'sha256:' + 'a'.repeat(64);
function input(extra={}){ return { created_at:'2026-06-18T00:00:00.000Z', target:{mind_id:'mind'}, source:{task_id:'T030', artifact_sha256:hash, reason:'audited artifact'}, facts:[{id:'b', text:'B', confidence:0.8, source_ref:'artifact#b', tags:['z','a']},{id:'a', text:'A', confidence:1, source_ref:'artifact#a', tags:['x']}], retention:{ttl_days:7, keep_last_accepted:1, keep_last_rejected:1}, ...extra}; }
test('valid update',()=>{ const r=createWorkingMemoryUpdate(input()); assert.equal(r.ok,true); assert.equal(validateWorkingMemoryUpdate(r.update).ok,true); });
test('missing source refs rejected',()=>{ assert.equal(createWorkingMemoryUpdate(input({source:{task_id:'', artifact_sha256:'', reason:''}})).ok,false); });
test('max_items exceeded rejected',()=>{ const r=createWorkingMemoryUpdate(input({facts:[{id:'a',text:'A',confidence:1,source_ref:'s',tags:[]},{id:'b',text:'B',confidence:1,source_ref:'s',tags:[]}]}),{max_items:1}); assert.equal(r.ok,false); });
test('duplicate facts deduped',()=>{ const r=createWorkingMemoryUpdate(input({facts:[{id:'A',text:'1',confidence:1,source_ref:'s',tags:[]},{id:'a',text:'2',confidence:1,source_ref:'s',tags:[]}]})); assert.equal(r.ok,true); assert.equal(r.update.facts.length,1); });
test('deterministic ordering',()=>{ const r=createWorkingMemoryUpdate(input()); assert.deepEqual(r.update.facts.map(f=>f.id),['a','b']); assert.deepEqual(r.update.facts[1].tags,['a','z']); });
test('secret-like field rejected',()=>{ assert.equal(createWorkingMemoryUpdate(input({TOKEN:'x'})).ok,false); });
test('github token shaped secret rejected',()=>{ assert.equal(createWorkingMemoryUpdate(input({facts:[{id:'a',text:'ghp_'+'x'.repeat(36),confidence:1,source_ref:'s',tags:[]}]})).ok,false); });
test('direct .forge write not performed',()=>{ const r=createWorkingMemoryUpdate(input()); assert.equal(r.ok,true); assert.equal(r.update.approval.direct_write_allowed,false); assert.equal(r.update.guards.no_direct_forge_write,true); });
test('update_id does not collide across distinct facts',()=>{
  const a = createWorkingMemoryUpdate(input({facts:[{id:'a',text:'A',confidence:1,source_ref:'s',tags:[]}]}));
  const b = createWorkingMemoryUpdate(input({facts:[{id:'a',text:'A different long text value that shares a prefix',confidence:1,source_ref:'s',tags:[]}]}));
  assert.equal(a.ok,true); assert.equal(b.ok,true);
  assert.notEqual(a.update.update_id, b.update.update_id);
});
test('non-numeric confidence rejected instead of coerced to NaN',()=>{
  const r = createWorkingMemoryUpdate(input({facts:[{id:'a',text:'A',confidence:'not-a-number',source_ref:'s',tags:[]}]}));
  assert.equal(r.ok,false);
});
test('mixed-case tags use consistent ordering between create and validate',()=>{
  const r = createWorkingMemoryUpdate(input({facts:[{id:'a',text:'A',confidence:1,source_ref:'s',tags:['Z','a']}]}));
  assert.equal(r.ok,true);
  assert.equal(validateWorkingMemoryUpdate(r.update).ok,true);
});
test('unknown approval class rejected',()=>{
  const r = createWorkingMemoryUpdate(input({approval:{approval_class:'Z'}}));
  assert.equal(r.ok,false);
});
test('custom max_items is persisted for standalone re-validation',()=>{
  const facts = Array.from({length:60},(_,i)=>({id:`f${String(i).padStart(3,'0')}`,text:'x',confidence:1,source_ref:'s',tags:[]}));
  const r = createWorkingMemoryUpdate(input({facts}),{max_items:100});
  assert.equal(r.ok,true);
  assert.equal(r.update.max_items,100);
  assert.equal(validateWorkingMemoryUpdate(r.update).ok,true);
});
test('update_id is independent of source key insertion order and extra ignored fields',()=>{
  const a = createWorkingMemoryUpdate(input({source:{task_id:'T030',artifact_sha256:hash,reason:'audited artifact'}}));
  const b = createWorkingMemoryUpdate(input({source:{reason:'audited artifact',task_id:'T030',artifact_sha256:hash,ignored_extra:'noise'}}));
  assert.equal(a.ok,true); assert.equal(b.ok,true);
  assert.equal(a.update.update_id, b.update.update_id);
});
test('negative retention counts rejected',()=>{
  const r = createWorkingMemoryUpdate(input({retention:{ttl_days:7,keep_last_accepted:-5,keep_last_rejected:1}}));
  assert.equal(r.ok,false);
});
test('non-integer retention counts rejected',()=>{
  const r = createWorkingMemoryUpdate(input({retention:{ttl_days:7,keep_last_accepted:1.5,keep_last_rejected:1}}));
  assert.equal(r.ok,false);
});
test('negative source pr_number rejected',()=>{
  const r = createWorkingMemoryUpdate(input({source:{task_id:'T030',artifact_sha256:hash,reason:'audited artifact',pr_number:-1}}));
  assert.equal(r.ok,false);
});
test('null source pr_number is allowed',()=>{
  const r = createWorkingMemoryUpdate(input());
  assert.equal(r.ok,true);
  assert.equal(r.update.source.pr_number,null);
});
test('stripped provenance rejected on standalone validation',()=>{
  const r = createWorkingMemoryUpdate(input());
  assert.equal(r.ok,true);
  const stripped = { ...r.update, provenance: {} };
  assert.equal(validateWorkingMemoryUpdate(stripped).ok,false);
});
test('update_id differs across distinct targets for the same source/facts',()=>{
  const a = createWorkingMemoryUpdate(input({target:{mind_id:'forge://x/y/mind/root'}}));
  const b = createWorkingMemoryUpdate(input({target:{mind_id:'forge://x/y/mind/other'}}));
  assert.equal(a.ok,true); assert.equal(b.ok,true);
  assert.notEqual(a.update.update_id, b.update.update_id);
});
test('impossible calendar timestamp rejected',()=>{
  const r = createWorkingMemoryUpdate(input({created_at:'2026-13-99T99:99:99Z'}));
  assert.equal(r.ok,false);
});
test('leap day timestamp accepted, non-leap-year Feb 29 rejected',()=>{
  assert.equal(createWorkingMemoryUpdate(input({created_at:'2024-02-29T00:00:00.000Z'})).ok,true);
  assert.equal(createWorkingMemoryUpdate(input({created_at:'2026-02-29T00:00:00.000Z'})).ok,false);
});
test('non-secret fact mentioning "token" in ordinary text is allowed',()=>{
  const r = createWorkingMemoryUpdate(input({facts:[{id:'a',text:'uses token_source for transport auth',confidence:1,source_ref:'s',tags:[]}]}));
  assert.equal(r.ok,true);
});
test('ordinal tag ordering is used, not locale-sensitive collation',()=>{
  const r = createWorkingMemoryUpdate(input({facts:[{id:'a',text:'A',confidence:1,source_ref:'s',tags:['a','Z']}]}));
  assert.equal(r.ok,true);
  assert.deepEqual(r.update.facts[0].tags,['Z','a']);
});
