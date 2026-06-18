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
test('direct .forge write not performed',()=>{ const r=createWorkingMemoryUpdate(input()); assert.equal(r.ok,true); assert.equal(r.update.approval.direct_write_allowed,false); assert.equal(r.update.guards.no_direct_forge_write,true); });
