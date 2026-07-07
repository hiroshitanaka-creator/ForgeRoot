import test from 'node:test';
import assert from 'node:assert/strict';
import { network } from './load.mjs';

const {
  NETWORK_BOUNDARY_CONTRACT,
  NETWORK_BOUNDARY_SCHEMA_REF,
  enforceNetworkBoundary,
  runT067NetworkSandboxPolicy,
  validateNetworkBoundary,
  validateT067NetworkSandboxPolicy,
} = network;

const NOW = '2026-07-07T00:00:00Z';

function input(extra = {}) {
  const request = extra.request ?? {};
  return {
    now: extra.now ?? NOW,
    boundary_id: 'root-network-boundary',
    runtime: {
      mode: 'federate',
      allowed: true,
      kill_switch_engaged: false,
      open_federation_requested: false,
      ...(extra.runtime ?? {}),
    },
    peer: {
      peer_id: 'peer-alpha',
      repository_full_name: 'example/peer-alpha',
      status: 'active',
      registry_known: true,
      ...(extra.peer ?? {}),
    },
    treaty: {
      treaty_id: 'root-peer-treaty',
      status: 'active',
      source_peer_id: 'root-peer',
      target_peer_id: 'peer-alpha',
      allowed_actions: extra.allowed_actions ?? ['lineage_export', 'lineage_import_candidate'],
      expires_at: null,
      ...(extra.treaty ?? {}),
    },
    request: {
      action: request.action ?? 'lineage_import_candidate',
      source_peer_id: request.source_peer_id ?? 'root-peer',
      target_peer_id: request.target_peer_id ?? 'peer-alpha',
      lineage_ref: request.lineage_ref ?? 'forge-lineage://root/t067',
      proposal_ref: request.proposal_ref ?? null,
      evidence_digest: request.evidence_digest ?? `sha256:${'1'.repeat(64)}`,
      imported_lineage_adoption_requested: request.imported_lineage_adoption_requested ?? false,
      network_transport_requested: request.network_transport_requested ?? false,
    },
    reputation: {
      score: 72,
      recommended_action: 'observe',
      ...(extra.reputation ?? {}),
    },
    ...(extra.top ?? {}),
  };
}

test('declares a manifest-only network boundary contract', () => {
  assert.equal(NETWORK_BOUNDARY_CONTRACT.deterministic, true);
  assert.equal(NETWORK_BOUNDARY_CONTRACT.manifestOnly, true);
  assert.equal(NETWORK_BOUNDARY_CONTRACT.boundaryOnly, true);
  assert.ok(NETWORK_BOUNDARY_CONTRACT.validates.includes('treaty_action_allowlist'));
  assert.ok(NETWORK_BOUNDARY_CONTRACT.validates.includes('open_federation_default'));
  assert.ok(NETWORK_BOUNDARY_CONTRACT.forbids.includes('live_network_transport'));
  assert.ok(NETWORK_BOUNDARY_CONTRACT.forbids.includes('automatic_lineage_adoption'));
  assert.ok(NETWORK_BOUNDARY_CONTRACT.forbids.includes('open_federation_default'));
});

test('allows a treaty-scoped peer action without transport or adoption', () => {
  const first = enforceNetworkBoundary(input());
  const second = enforceNetworkBoundary(input());

  assert.deepEqual(second, first);
  assert.equal(first.schema_ref, NETWORK_BOUNDARY_SCHEMA_REF);
  assert.equal(first.status, 'allowed', JSON.stringify(first, null, 2));
  assert.equal(first.decision, 'boundary_allowed');
  assert.equal(first.boundary_summary.action_allowed_by_treaty, true);
  assert.equal(first.boundary_summary.open_federation_default, false);
  assert.equal(first.boundary_summary.adoption_allowed, false);
  assert.equal(first.dry_run.network_transport_performed, false);
  assert.equal(first.dry_run.lineage_adoption_performed, false);
  assert.equal(first.dry_run.open_federation_enabled, false);
  assert.deepEqual(validateNetworkBoundary(first), { ok: true, issues: [] });
});

test('rejects a treaty-outside action', () => {
  const result = enforceNetworkBoundary(input({ request: { action: 'cross_repo_pr' } }));

  assert.equal(result.status, 'rejected', JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'boundary_rejected');
  assert.equal(result.boundary_summary.breach_handling, 'reject');
  assert.ok(result.reasons.includes('action_not_allowed_by_treaty'));
  assert.deepEqual(validateNetworkBoundary(result), { ok: true, issues: [] });
});

test('quarantines unknown peer input', () => {
  const result = enforceNetworkBoundary(input({
    peer: { status: 'unknown', registry_known: false },
    reputation: { score: 50, recommended_action: 'observe' },
  }));

  assert.equal(result.status, 'quarantined', JSON.stringify(result, null, 2));
  assert.equal(result.decision, 'boundary_quarantined');
  assert.equal(result.boundary_summary.peer_known, false);
  assert.equal(result.boundary_summary.quarantine_required, true);
  assert.ok(result.reasons.includes('unknown_peer_quarantined'));
  assert.deepEqual(validateNetworkBoundary(result), { ok: true, issues: [] });
});

test('rejects imported lineage adoption while keeping the import candidate dry-run only', () => {
  const result = enforceNetworkBoundary(input({ request: { imported_lineage_adoption_requested: true } }));

  assert.equal(result.status, 'rejected', JSON.stringify(result, null, 2));
  assert.ok(result.reasons.includes('imported_lineage_adoption_forbidden'));
  assert.equal(result.boundary_summary.adoption_allowed, false);
  assert.equal(result.boundary_summary.import_candidate_only, true);
  assert.equal(result.dry_run.lineage_adoption_performed, false);
  assert.deepEqual(validateNetworkBoundary(result), { ok: true, issues: [] });
});

test('quarantines open federation requests and never makes federation open by default', () => {
  const result = enforceNetworkBoundary(input({ runtime: { open_federation_requested: true } }));

  assert.equal(result.status, 'quarantined', JSON.stringify(result, null, 2));
  assert.ok(result.reasons.includes('open_federation_forbidden'));
  assert.equal(result.boundary_summary.open_federation_default, false);
  assert.equal(result.dry_run.open_federation_enabled, false);
  assert.deepEqual(validateNetworkBoundary(result), { ok: true, issues: [] });
});

test('fails closed for unknown enums, invalid timestamps, and secret-shaped material', () => {
  const unknownAction = enforceNetworkBoundary(input({ request: { action: 'external_crawl' } }));
  const invalidTime = enforceNetworkBoundary(input({ now: '2026-02-31T00:00:00Z' }));
  const secretLike = enforceNetworkBoundary(input({ peer: { repository_full_name: 'owner/github_pat_' + 'x'.repeat(24) } }));

  assert.equal(unknownAction.status, 'invalid');
  assert.ok(unknownAction.reasons.includes('invalid_action'));
  assert.equal(invalidTime.status, 'invalid');
  assert.ok(invalidTime.reasons.includes('invalid_timestamp'));
  assert.equal(secretLike.status, 'invalid');
  assert.ok(secretLike.reasons.includes('secret_material_forbidden'));
  assert.deepEqual(validateNetworkBoundary(unknownAction), { ok: true, issues: [] });
  assert.deepEqual(validateNetworkBoundary(invalidTime), { ok: true, issues: [] });
  assert.deepEqual(validateNetworkBoundary(secretLike), { ok: true, issues: [] });
});

test('rejects tampering of every allowed manifest leaf field', () => {
  const result = enforceNetworkBoundary(input());
  const paths = leafPaths(result);

  assert.ok(paths.length > 50, 'tamper harness should cover the full manifest');
  for (const path of paths) {
    const tampered = structuredClone(result);
    mutateAt(tampered, path);
    const validation = validateNetworkBoundary(tampered);
    assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join('.')}`);
  }
});

test('rejects structural tampering that could bypass scalar mutation checks', () => {
  const unsortedActions = enforceNetworkBoundary(input({ allowed_actions: ['lineage_import_candidate', 'lineage_export'] }));
  unsortedActions.inputs.treaty.allowed_actions = ['lineage_import_candidate', 'lineage_export'];
  assertIssue(validateNetworkBoundary(unsortedActions), 'entries_not_sorted');

  const missingRequestKey = enforceNetworkBoundary(input());
  delete missingRequestKey.inputs.request.lineage_ref;
  assertIssue(validateNetworkBoundary(missingRequestKey), 'missing_request_key');

  const unknownNestedKey = enforceNetworkBoundary(input());
  unknownNestedKey.boundary_summary.extra = true;
  assertIssue(validateNetworkBoundary(unknownNestedKey), 'unknown_key');

  const weakenedOpenFederation = enforceNetworkBoundary(input());
  weakenedOpenFederation.boundary_summary.open_federation_default = true;
  assertIssue(validateNetworkBoundary(weakenedOpenFederation), 'open_federation_forbidden');
});

test('supports stable T067 aliases', () => {
  const result = runT067NetworkSandboxPolicy(input());

  assert.deepEqual(result, enforceNetworkBoundary(input()));
  assert.deepEqual(validateT067NetworkSandboxPolicy(result), validateNetworkBoundary(result));
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
