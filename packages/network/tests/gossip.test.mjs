import test from 'node:test';
import assert from 'node:assert/strict';
import { network } from './load.mjs';

const {
  GOSSIP_SYNC_CONTRACT,
  GOSSIP_SYNC_SCHEMA_REF,
  runT064GossipSyncCadence,
  scheduleGossipSync,
  validateGossipSync,
  validateT064GossipSyncCadence,
} = network;

const NOW = '2026-07-06T00:00:00Z';

function peer(peer_id, extra = {}) {
  return {
    peer_id,
    repository_full_name: `example/${peer_id}`,
    status: 'active',
    treaty_id: 'root-peer-treaty',
    treaty_status: 'active',
    reputation_score: 62,
    reputation_action: 'observe',
    last_sync_at: null,
    cooldown_until: null,
    ...extra,
  };
}

function input(extra = {}) {
  return {
    now: extra.now ?? NOW,
    runtime: { mode: 'federate', allowed: true, kill_switch_engaged: false, ...(extra.runtime ?? {}) },
    peer_registry: {
      registry_id: 'root-peers',
      peers: extra.peers ?? [
        peer('peer-alpha'),
        peer('peer-beta', { status: 'quarantined' }),
        peer('peer-gamma', { reputation_action: 'quarantine', reputation_score: 24 }),
      ],
      ...(extra.peer_registry ?? {}),
    },
    rate_boundary: {
      base_interval_seconds: 900,
      jitter_max_seconds: 60,
      max_peers_per_sync: 2,
      max_syncs_per_window: 5,
      current_window_sync_count: 0,
      window_reset_at: '2026-07-06T01:00:00Z',
      global_cooldown_until: null,
      ...(extra.rate_boundary ?? {}),
    },
  };
}

test('declares a manifest-only gossip sync contract', () => {
  assert.equal(GOSSIP_SYNC_CONTRACT.deterministic, true);
  assert.equal(GOSSIP_SYNC_CONTRACT.manifestOnly, true);
  assert.equal(GOSSIP_SYNC_CONTRACT.scheduleOnly, true);
  assert.ok(GOSSIP_SYNC_CONTRACT.validates.includes('runtime_mode'));
  assert.ok(GOSSIP_SYNC_CONTRACT.validates.includes('deterministic_jitter'));
  assert.ok(GOSSIP_SYNC_CONTRACT.forbids.includes('workflow_mutation'));
  assert.ok(GOSSIP_SYNC_CONTRACT.forbids.includes('live_network_transport'));
  assert.ok(GOSSIP_SYNC_CONTRACT.forbids.includes('cross_repo_pr_creation'));
});

test('schedules active peers deterministically without network or workflow side effects', () => {
  const first = scheduleGossipSync(input());
  const second = scheduleGossipSync(input());

  assert.deepEqual(second, first);
  assert.equal(first.status, 'gossip_sync_ready', JSON.stringify(first, null, 2));
  assert.equal(first.schema_ref, GOSSIP_SYNC_SCHEMA_REF);
  assert.equal(first.sync_plan.scheduled_count, 1);
  assert.equal(first.sync_plan.skipped_count, 2);
  assert.equal(first.sync_plan.peer_decisions.find((entry) => entry.peer_id === 'peer-alpha').decision, 'schedule');
  assert.equal(first.sync_plan.peer_decisions.find((entry) => entry.peer_id === 'peer-beta').reason, 'peer_quarantined');
  assert.equal(first.sync_plan.peer_decisions.find((entry) => entry.peer_id === 'peer-gamma').reason, 'reputation_quarantine');
  assert.equal(first.dry_run.network_transport_performed, false);
  assert.equal(first.dry_run.workflow_mutated, false);
  assert.equal(first.dry_run.cross_repo_pr_created, false);
  assert.deepEqual(validateGossipSync(first), { ok: true, issues: [] });
});

test('blocks sync when runtime mode is not federate', () => {
  const result = scheduleGossipSync(input({ runtime: { mode: 'observe' } }));

  assert.equal(result.status, 'blocked', JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'gossip_sync_blocked');
  assert.ok(result.reasons.includes('runtime_mode_not_federate'));
  assert.equal(result.sync_plan.scheduled_count, 0);
  assert.ok(result.sync_plan.peer_decisions.every((entry) => entry.decision === 'skip'));
  assert.deepEqual(validateGossipSync(result), { ok: true, issues: [] });
});

test('delays sync for peer cooldown and exhausted rate slots', () => {
  const cooldown = scheduleGossipSync(input({ peers: [peer('peer-alpha', { cooldown_until: '2026-07-06T00:45:00Z' })] }));
  const rateCap = scheduleGossipSync(input({ peers: [peer('peer-alpha')], rate_boundary: { current_window_sync_count: 5 } }));

  assert.equal(cooldown.status, 'delayed', JSON.stringify(cooldown, null, 2));
  assert.equal(cooldown.sync_plan.delayed_count, 1);
  assert.equal(cooldown.sync_plan.peer_decisions[0].reason, 'peer_cooldown_active');
  assert.equal(cooldown.sync_plan.next_sync_at, '2026-07-06T00:45:00Z');
  assert.equal(rateCap.status, 'delayed', JSON.stringify(rateCap, null, 2));
  assert.equal(rateCap.sync_plan.peer_decisions[0].reason, 'rate_slot_unavailable');
  assert.equal(rateCap.sync_plan.next_sync_at, '2026-07-06T01:00:00Z');
  assert.deepEqual(validateGossipSync(cooldown), { ok: true, issues: [] });
  assert.deepEqual(validateGossipSync(rateCap), { ok: true, issues: [] });
});

test('fails closed for unknown enums, invalid timestamps, and secret-shaped material', () => {
  const unknownStatus = scheduleGossipSync(input({ peers: [peer('peer-alpha', { status: 'unknown' })] }));
  const invalidTime = scheduleGossipSync(input({ now: '2026-02-31T00:00:00Z' }));
  const secretLike = scheduleGossipSync(input({ peers: [peer('peer-alpha', { repository_full_name: 'owner/github_pat_' + 'x'.repeat(24) })] }));

  assert.equal(unknownStatus.status, 'invalid');
  assert.ok(unknownStatus.reasons.includes('invalid_peer_status'));
  assert.equal(invalidTime.status, 'invalid');
  assert.ok(invalidTime.reasons.includes('invalid_timestamp'));
  assert.equal(secretLike.status, 'invalid');
  assert.ok(secretLike.reasons.includes('secret_material_forbidden'));
  assert.deepEqual(validateGossipSync(unknownStatus), { ok: true, issues: [] });
  assert.deepEqual(validateGossipSync(invalidTime), { ok: true, issues: [] });
  assert.deepEqual(validateGossipSync(secretLike), { ok: true, issues: [] });
});

test('rejects tampering of every ready manifest leaf field', () => {
  const result = scheduleGossipSync(input());
  const paths = leafPaths(result);

  assert.ok(paths.length > 40, 'tamper harness should cover the full manifest');
  for (const path of paths) {
    const tampered = structuredClone(result);
    mutateAt(tampered, path);
    const validation = validateGossipSync(tampered);
    assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join('.')}`);
  }
});

test('rejects structural tampering that could bypass scalar mutation checks', () => {
  const unsortedPeers = scheduleGossipSync(input({ peers: [peer('peer-alpha'), peer('peer-delta')] }));
  unsortedPeers.inputs.peer_registry.peers.reverse();
  assertIssue(validateGossipSync(unsortedPeers), 'entries_not_sorted');

  const missingRateKey = scheduleGossipSync(input());
  delete missingRateKey.inputs.rate_boundary.max_syncs_per_window;
  assertIssue(validateGossipSync(missingRateKey), 'missing_rate_boundary_key');

  const missingNullableRateKey = scheduleGossipSync(input());
  delete missingNullableRateKey.inputs.rate_boundary.global_cooldown_until;
  assertIssue(validateGossipSync(missingNullableRateKey), 'missing_rate_boundary_key');

  const missingPeerKey = scheduleGossipSync(input());
  delete missingPeerKey.inputs.peer_registry.peers[0].cooldown_until;
  assertIssue(validateGossipSync(missingPeerKey), 'missing_peer_key');

  const unknownNestedKey = scheduleGossipSync(input());
  unknownNestedKey.sync_plan.extra = true;
  assertIssue(validateGossipSync(unknownNestedKey), 'unknown_key');
});

test('supports stable T064 aliases', () => {
  const result = runT064GossipSyncCadence(input());

  assert.deepEqual(result, scheduleGossipSync(input()));
  assert.deepEqual(validateT064GossipSyncCadence(result), validateGossipSync(result));
});

function leafPaths(value, base = []) {
  if (value === null || typeof value !== 'object') return [base];
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafPaths(entry, [...base, index]));
  return Object.keys(value).flatMap((key) => leafPaths(value[key], [...base, key]));
}

function mutateAt(target, path) {
  let cursor = target;
  for (const segment of path.slice(0, -1)) cursor = cursor[segment];
  const leaf = path.at(-1);
  const current = cursor[leaf];
  if (typeof current === 'string') cursor[leaf] = `${current}-tampered`;
  else if (typeof current === 'number') cursor[leaf] = current + 1;
  else if (typeof current === 'boolean') cursor[leaf] = !current;
  else if (current === null) cursor[leaf] = 'tampered';
  else cursor[leaf] = 'tampered';
}

function assertIssue(validation, code) {
  assert.equal(validation.ok, false, `expected validation to fail with ${code}`);
  assert.ok(validation.issues.some((entry) => entry.code === code), JSON.stringify(validation.issues, null, 2));
}
