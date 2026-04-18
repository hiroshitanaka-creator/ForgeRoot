import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import {
  classifyGitHubWebhookDelivery,
  computeGitHubSignature,
  createMemoryWebhookHandoff,
  isAllowedWebhookAction,
  isAllowedWebhookEvent,
  verifyGitHubWebhookSignature,
  verifyAndNormalizeGitHubWebhook,
} from '../dist/webhooks.js';
import { createGitHubWebhookServer } from '../dist/server.js';

const secret = 't007-local-secret';
const nowIso = '2026-04-18T00:00:00.000Z';

function body(payload) {
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function signature(rawBody) {
  return `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

function headers(rawBody, eventName = 'issues', deliveryId = '7a8513a2-t007-4c29-a9f1-6e98c84fdd42') {
  return {
    'x-github-event': eventName,
    'x-github-delivery': deliveryId,
    'x-github-hook-id': '1234567',
    'x-hub-signature-256': signature(rawBody),
    'user-agent': 'GitHub-Hookshot/t007',
    'content-type': 'application/json',
  };
}

test('computes and verifies GitHub sha256 webhook signatures', () => {
  const rawBody = body({ action: 'opened' });
  const expected = signature(rawBody);
  assert.equal(computeGitHubSignature(secret, rawBody), expected);
  assert.equal(verifyGitHubWebhookSignature(secret, rawBody, expected), true);
  assert.equal(verifyGitHubWebhookSignature(secret, rawBody, expected.replace(/.$/, '0')), false);
  assert.equal(verifyGitHubWebhookSignature(secret, rawBody, 'sha1=abc'), false);
});

test('classifies allowed events into accepted handoff envelopes', () => {
  const rawBody = body({
    action: 'opened',
    repository: { full_name: 'hiroshitanaka-creator/ForgeRoot' },
    installation: { id: 42 },
    sender: { login: 'octocat' },
  });

  const decision = classifyGitHubWebhookDelivery({
    headers: headers(rawBody),
    rawBody,
    secret,
    receivedAt: nowIso,
  });

  assert.equal(decision.outcome, 'accepted');
  assert.equal(decision.delivery.deliveryId, '7a8513a2-t007-4c29-a9f1-6e98c84fdd42');
  assert.equal(decision.delivery.eventName, 'issues');
  assert.equal(decision.delivery.action, 'opened');
  assert.equal(decision.delivery.repositoryFullName, 'hiroshitanaka-creator/ForgeRoot');
  assert.equal(decision.delivery.installationId, 42);
  assert.equal(decision.delivery.senderLogin, 'octocat');
  assert.equal(decision.delivery.rawBodySha256, `sha256:${createHash('sha256').update(rawBody).digest('hex')}`);
});

test('rejects invalid signatures before JSON payload trust', () => {
  const rawBody = body({ action: 'opened' });
  const badHeaders = headers(rawBody);
  badHeaders['x-hub-signature-256'] = 'sha256=' + '0'.repeat(64);
  const result = verifyAndNormalizeGitHubWebhook(badHeaders, rawBody, { secret });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.equal(result.code, 'invalid_signature');
});

test('acknowledges but does not enqueue events outside the allowlist', () => {
  const rawBody = body({ action: 'created' });
  const decision = classifyGitHubWebhookDelivery({
    headers: headers(rawBody, 'repository_dispatch'),
    rawBody,
    secret,
    receivedAt: nowIso,
  });
  assert.equal(decision.outcome, 'ignored');
  assert.equal(decision.reason, 'event_not_allowed');
});

test('acknowledges but does not enqueue actions outside the action allowlist', () => {
  const rawBody = body({ action: 'assigned' });
  const decision = classifyGitHubWebhookDelivery({
    headers: headers(rawBody, 'issues'),
    rawBody,
    secret,
    receivedAt: nowIso,
  });
  assert.equal(decision.outcome, 'ignored');
  assert.equal(decision.reason, 'action_not_allowed');
});

test('event and action policy matches the T006 shortlist', () => {
  assert.equal(isAllowedWebhookEvent('issues'), true);
  assert.equal(isAllowedWebhookEvent('workflow_job'), false);
  assert.equal(isAllowedWebhookAction('issues', 'opened'), true);
  assert.equal(isAllowedWebhookAction('issues', 'deleted'), false);
  assert.equal(isAllowedWebhookAction('push', null), true);
  assert.equal(isAllowedWebhookAction('fork', null), true);
});

test('server returns 202 and passes delivery ID to async handoff', async () => {
  const handoff = createMemoryWebhookHandoff();
  const server = createGitHubWebhookServer({ webhookSecret: secret, handoff });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');

  const rawBody = body({
    action: 'created',
    repository: { full_name: 'hiroshitanaka-creator/ForgeRoot' },
    installation: { id: 43 },
    sender: { login: 'octocat' },
  });

  const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/github`, {
    method: 'POST',
    headers: headers(rawBody, 'issue_comment', 'delivery-server-ok'),
    body: rawBody,
  });

  assert.equal(response.status, 202);
  const json = await response.json();
  assert.equal(json.accepted, true);
  assert.equal(json.delivery_id, 'delivery-server-ok');

  await new Promise(resolve => setImmediate(resolve));
  assert.equal(handoff.size(), 1);
  assert.equal(handoff.deliveries[0].deliveryId, 'delivery-server-ok');

  await new Promise(resolve => server.close(resolve));
});

test('server returns 401 for bad signatures and does not hand off', async () => {
  const handoff = createMemoryWebhookHandoff();
  const server = createGitHubWebhookServer({ webhookSecret: secret, handoff });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.equal(typeof address, 'object');

  const rawBody = body({ action: 'created' });
  const badHeaders = headers(rawBody, 'issue_comment', 'delivery-server-bad-signature');
  badHeaders['x-hub-signature-256'] = 'sha256=' + 'f'.repeat(64);

  const response = await fetch(`http://127.0.0.1:${address.port}/webhooks/github`, {
    method: 'POST',
    headers: badHeaders,
    body: rawBody,
  });

  assert.equal(response.status, 401);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(handoff.size(), 0);

  await new Promise(resolve => server.close(resolve));
});

