import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createRuntimeModeController,
  downgradeRuntimeMode,
  openSqliteRuntimeModeStore,
} from '../dist/runtime-mode.js';
import { createGitHubWebhookServer } from '../dist/server.js';
import { createMemoryWebhookHandoff } from '../dist/webhooks.js';

function runtime() {
  const store = openSqliteRuntimeModeStore(':memory:');
  return { store, controller: createRuntimeModeController(store) };
}

test('kill switch is a single operation that closes the mutating lane', () => {
  const { store, controller } = runtime();
  const enabled = controller.setMode({ mode: 'evolve', actor: 'test://operator', reason: 'enable mutating lane', now: new Date('2026-04-18T00:00:00.000Z') });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.snapshot.mutatingLaneOpen, true);
  assert.equal(controller.authorizeOperation('commit_patch').allowed, true);

  const halted = controller.activateKillSwitch({ actor: 'test://operator', reason: 'emergency stop', now: new Date('2026-04-18T00:00:01.000Z'), correlationId: 'kill-test-1' });
  assert.equal(halted.mode, 'halted');
  assert.equal(halted.killSwitchEngaged, true);
  assert.equal(halted.mutatingLaneOpen, false);
  assert.equal(halted.restoreRequiresHumanAck, true);
  assert.deepEqual(controller.authorizeOperation('commit_patch'), { allowed: false, mode: 'halted', operation: 'commit_patch', reason: 'kill_switch_engaged' });
  store.close();
});

test('quarantine and halted have different allowed operation envelopes', () => {
  const { store, controller } = runtime();
  controller.enterQuarantine({ actor: 'test://guard', reason: 'policy breach', now: new Date('2026-04-18T00:01:00.000Z') });
  assert.equal(controller.authorizeOperation('incident_report').allowed, true);
  assert.equal(controller.authorizeOperation('docs_only_incident_pr').allowed, true);
  assert.deepEqual(controller.authorizeOperation('network_sync'), { allowed: false, mode: 'quarantine', operation: 'network_sync', reason: 'quarantine_restriction' });

  controller.activateKillSwitch({ actor: 'test://operator', reason: 'hard stop', now: new Date('2026-04-18T00:02:00.000Z') });
  assert.deepEqual(controller.authorizeOperation('incident_report'), { allowed: false, mode: 'halted', operation: 'incident_report', reason: 'kill_switch_engaged' });
  assert.equal(controller.authorizeOperation('replay_diagnosis').allowed, true);
  store.close();
});

test('halted and quarantine cannot be restored without explicit human acknowledgement', () => {
  const { store, controller } = runtime();
  controller.activateKillSwitch({ actor: 'test://operator', reason: 'stop before restore test', now: new Date('2026-04-18T00:03:00.000Z') });
  const denied = controller.restoreMode({ mode: 'observe', actor: 'test://operator', reason: 'restore without ack', humanAck: false, now: new Date('2026-04-18T00:03:30.000Z') });
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'human_ack_required');
  assert.equal(denied.snapshot.mode, 'halted');

  const restored = controller.restoreMode({ mode: 'observe', actor: 'test://operator', reason: 'restore with ack', humanAck: true, now: new Date('2026-04-18T00:04:00.000Z') });
  assert.equal(restored.ok, true);
  assert.equal(restored.snapshot.mode, 'observe');
  assert.equal(restored.snapshot.killSwitchEngaged, false);
  store.close();
});

test('two 403 or 429 signals inside fifteen minutes downgrade mode', () => {
  const { store, controller } = runtime();
  const set = controller.setMode({ mode: 'evolve', actor: 'test://operator', reason: 'enable evolve before rate test', now: new Date('2026-04-18T00:10:00.000Z') });
  assert.equal(set.ok, true);
  assert.equal(set.snapshot.mode, 'evolve');
  assert.equal(downgradeRuntimeMode('evolve'), 'propose');

  const first = controller.recordRateLimitSignal({ statusCode: 403, source: 'github-rest', repositoryFullName: 'hiroshitanaka-creator/ForgeRoot', now: new Date('2026-04-18T00:11:00.000Z') });
  assert.equal(first.kind, 'recorded');
  assert.equal(first.countInWindow, 1);
  assert.equal(first.snapshot.mode, 'evolve');

  const second = controller.recordRateLimitSignal({ statusCode: 429, source: 'github-rest', repositoryFullName: 'hiroshitanaka-creator/ForgeRoot', now: new Date('2026-04-18T00:12:00.000Z') });
  assert.equal(second.kind, 'downgraded');
  assert.equal(second.fromMode, 'evolve');
  assert.equal(second.toMode, 'propose');
  assert.equal(second.snapshot.mode, 'propose');
  assert.equal(second.snapshot.mutatingLaneOpen, false);

  const third = controller.recordRateLimitSignal({ statusCode: 429, source: 'github-rest', repositoryFullName: 'hiroshitanaka-creator/ForgeRoot', now: new Date('2026-04-18T00:12:30.000Z') });
  assert.equal(third.kind, 'downgraded');
  assert.equal(third.fromMode, 'propose');
  assert.equal(third.toMode, 'observe');
  assert.equal(third.snapshot.mode, 'observe');
  store.close();
});

test('runtime mode state persists after reopening SQLite', async () => {
  const tmpdir = await mkdtemp(path.join(os.tmpdir(), 'forgeroot-t014-'));
  const databasePath = path.join(tmpdir, 'runtime-mode.sqlite');
  try {
    let store = openSqliteRuntimeModeStore(databasePath);
    let controller = createRuntimeModeController(store);
    controller.activateKillSwitch({ actor: 'test://operator', reason: 'persisted stop', now: new Date('2026-04-18T00:20:00.000Z') });
    store.close();

    store = openSqliteRuntimeModeStore(databasePath);
    controller = createRuntimeModeController(store);
    const snapshot = controller.getSnapshot();
    assert.equal(snapshot.mode, 'halted');
    assert.equal(snapshot.killSwitchEngaged, true);
    assert.equal(snapshot.mutatingLaneOpen, false);
    assert.equal(store.listEvents().some(event => event.eventType === 'kill_switch_engaged'), true);
    store.close();
  } finally {
    await rm(tmpdir, { recursive: true, force: true });
  }
});

test('HTTP kill switch endpoint requires admin token and halts mutating operations', async () => {
  const { store, controller } = runtime();
  const handoff = createMemoryWebhookHandoff();
  const server = createGitHubWebhookServer({ webhookSecret: 'local-secret', handoff, runtimeController: controller, adminToken: 'admin-secret' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');

  const unauthorized = await fetch(`http://127.0.0.1:${address.port}/api/forge/kill-switch`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason: 'missing token' }) });
  assert.equal(unauthorized.status, 401);

  const response = await fetch(`http://127.0.0.1:${address.port}/api/forge/kill-switch`, {
    method: 'POST',
    headers: { authorization: 'Bearer admin-secret', 'content-type': 'application/json' },
    body: JSON.stringify({ actor: 'test://operator', reason: 'http emergency stop' }),
  });
  assert.equal(response.status, 200);
  const json = await response.json();
  assert.equal(json.ok, true);
  assert.equal(json.killed, true);
  assert.equal(json.runtime.mode, 'halted');
  assert.equal(controller.authorizeOperation('open_pull_request').allowed, false);

  await new Promise(resolve => server.close(resolve));
  store.close();
});
