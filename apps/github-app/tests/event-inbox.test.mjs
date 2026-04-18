import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  createEventInboxHandoff,
  openSqliteEventInbox,
} from '../dist/event-inbox.js';

const receivedAt = '2026-04-18T00:00:00.000Z';

function sha256Json(payload) {
  return `sha256:${createHash('sha256').update(Buffer.from(JSON.stringify(payload), 'utf8')).digest('hex')}`;
}

function delivery(deliveryId = 'delivery-t008-1', payload = { action: 'opened' }) {
  return {
    deliveryId,
    eventName: 'issues',
    action: typeof payload.action === 'string' ? payload.action : null,
    receivedAt,
    hookId: '1234567',
    installationId: 42,
    repositoryFullName: 'hiroshitanaka-creator/ForgeRoot',
    senderLogin: 'octocat',
    rawBodySha256: sha256Json(payload),
    payload,
  };
}

test('SQLite event inbox persists one row per delivery GUID and dedupes redeliveries', () => {
  const inbox = openSqliteEventInbox(':memory:');
  const event = delivery();

  const inserted = inbox.enqueue(event, new Date('2026-04-18T00:00:01.000Z'));
  assert.equal(inserted.kind, 'inserted');
  assert.equal(inserted.record.status, 'received');
  assert.equal(inserted.record.duplicateCount, 0);

  const duplicate = inbox.enqueue(event, new Date('2026-04-18T00:00:02.000Z'));
  assert.equal(duplicate.kind, 'duplicate');
  assert.equal(duplicate.record.duplicateCount, 1);
  assert.equal(inbox.list().length, 1);

  const changedPayload = { action: 'opened', changed: true };
  const conflict = inbox.enqueue(delivery(event.deliveryId, changedPayload), new Date('2026-04-18T00:00:03.000Z'));
  assert.equal(conflict.kind, 'conflict');
  assert.equal(conflict.reason, 'delivery_id_hash_mismatch');
  assert.equal(conflict.record.lastError, 'delivery_id_hash_mismatch');
  assert.equal(inbox.list().length, 1);

  inbox.close();
});

test('inbox handoff forwards only first-seen deliveries to downstream processing', async () => {
  const inbox = openSqliteEventInbox(':memory:');
  const downstreamDeliveries = [];
  const handoff = createEventInboxHandoff(inbox, {
    downstream: {
      enqueue(event) {
        downstreamDeliveries.push(event.deliveryId);
      },
    },
  });
  const event = delivery('delivery-t008-handoff');

  await handoff.enqueue(event);
  await handoff.enqueue(event);

  assert.deepEqual(downstreamDeliveries, ['delivery-t008-handoff']);
  assert.equal(inbox.get('delivery-t008-handoff').duplicateCount, 1);

  inbox.close();
});

test('status transitions distinguish retryable failures from terminal and processed events', () => {
  const inbox = openSqliteEventInbox(':memory:');
  const event = delivery('delivery-t008-status');
  inbox.enqueue(event, new Date('2026-04-18T00:01:00.000Z'));

  const firstClaim = inbox.claimNextForProcessing({
    workerId: 'worker-a',
    leaseMs: 30_000,
    now: new Date('2026-04-18T00:01:01.000Z'),
  });
  assert.equal(firstClaim.deliveryId, event.deliveryId);
  assert.equal(firstClaim.status, 'processing');
  assert.equal(firstClaim.attempts, 1);
  assert.equal(firstClaim.lockedBy, 'worker-a');

  const retryable = inbox.markFailed(event.deliveryId, {
    retryable: true,
    error: new Error('planner queue unavailable'),
    nextAttemptAt: new Date('2026-04-18T00:02:00.000Z'),
    now: new Date('2026-04-18T00:01:10.000Z'),
  });
  assert.equal(retryable.status, 'failed_retryable');
  assert.equal(retryable.nextAttemptAt, '2026-04-18T00:02:00.000Z');
  assert.match(retryable.lastError, /planner queue unavailable/);

  const tooEarly = inbox.claimNextForProcessing({
    workerId: 'worker-b',
    now: new Date('2026-04-18T00:01:59.000Z'),
  });
  assert.equal(tooEarly, null);

  const secondClaim = inbox.claimNextForProcessing({
    workerId: 'worker-b',
    now: new Date('2026-04-18T00:02:00.000Z'),
  });
  assert.equal(secondClaim.deliveryId, event.deliveryId);
  assert.equal(secondClaim.status, 'processing');
  assert.equal(secondClaim.attempts, 2);
  assert.equal(secondClaim.lockedBy, 'worker-b');

  const processed = inbox.markProcessed(event.deliveryId, new Date('2026-04-18T00:02:03.000Z'));
  assert.equal(processed.status, 'processed');
  assert.equal(processed.lockedBy, null);
  assert.equal(processed.nextAttemptAt, null);

  const terminalEvent = delivery('delivery-t008-terminal');
  inbox.enqueue(terminalEvent);
  inbox.claimNextForProcessing({ workerId: 'worker-c', now: new Date('2026-04-18T00:03:00.000Z') });
  const terminal = inbox.markFailed(terminalEvent.deliveryId, {
    retryable: false,
    error: 'policy rejected event permanently',
    now: new Date('2026-04-18T00:03:01.000Z'),
  });
  assert.equal(terminal.status, 'failed_terminal');
  assert.equal(terminal.nextAttemptAt, null);
  assert.equal(inbox.list({ status: 'failed_retryable' }).length, 0);
  assert.equal(inbox.list({ status: 'failed_terminal' }).length, 1);

  inbox.close();
});

test('event inbox survives process restart by reopening the SQLite database file', async () => {
  const tmpdir = await mkdtemp(path.join(os.tmpdir(), 'forgeroot-t008-'));
  const databasePath = path.join(tmpdir, 'event-inbox.sqlite');

  try {
    let inbox = openSqliteEventInbox(databasePath);
    inbox.enqueue(delivery('delivery-t008-persist'));
    inbox.close();

    inbox = openSqliteEventInbox(databasePath);
    const record = inbox.get('delivery-t008-persist');
    assert.equal(record.deliveryId, 'delivery-t008-persist');
    assert.equal(record.status, 'received');
    assert.equal(record.repositoryFullName, 'hiroshitanaka-creator/ForgeRoot');
    inbox.close();
  } finally {
    await rm(tmpdir, { recursive: true, force: true });
  }
});
