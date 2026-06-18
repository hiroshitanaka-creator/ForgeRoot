import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const modulePath = join(tmpdir(), 'forgeroot-memory-digest.mjs');
writeFileSync(modulePath, readFileSync(new URL('../src/digest.ts', import.meta.url), 'utf8').replace(/: any/g, ''));
const { createEpisodeDigest, validateEpisodeDigest } = await import(modulePath);
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
