import test from 'node:test';
import assert from 'node:assert/strict';
import { reporting } from './load.mjs';

const {
  FEDERATION_REPORT_CONTRACT,
  FEDERATION_REPORT_SCHEMA_REF,
  renderFederationReport,
  runT068FederationObservability,
  validateFederationReport,
  validateT068FederationObservability,
} = reporting;

const NOW = '2026-07-07T00:00:00Z';

function input(extra = {}) {
  return {
    now: extra.now ?? NOW,
    report_id: 'root-federation-report',
    source_refs: {
      peer_registry_ref: 'forge://hiroshitanaka-creator/ForgeRoot/peer-registry/root',
      reputation_ref: 'forge://hiroshitanaka-creator/ForgeRoot/reputation/t063',
      boundary_policy_ref: 'forge://hiroshitanaka-creator/ForgeRoot/policy/network-boundary',
      treaty_refs: ['forge://hiroshitanaka-creator/ForgeRoot/treaty/root-peer-alpha', 'forge://hiroshitanaka-creator/ForgeRoot/treaty/root-peer-beta'],
      lineage_refs: ['forge-lineage://root/alpha', 'forge-lineage://root/beta'],
      ...(extra.source_refs ?? {}),
    },
    peers: extra.peers ?? [
      peer('peer-alpha', { status: 'active', reputation: { score: 78, recommended_action: 'observe' } }),
      peer('peer-beta', { status: 'quarantined', treaty: { status: 'suspended' }, reputation: { score: 22, recommended_action: 'quarantine' } }),
      peer('peer-gamma', { status: 'revoked', treaty: { status: 'revoked' }, reputation: { score: 10, recommended_action: 'revocation_review' } }),
    ],
    lineage_exchanges: extra.lineage_exchanges ?? [
      lineage('alpha-export', 'peer-alpha', 'export', 'exported', 'network-boundary-aaaaaaaa'),
      lineage('beta-import', 'peer-beta', 'import', 'candidate_registered', 'network-boundary-bbbbbbbb'),
    ],
    boundary_decisions: extra.boundary_decisions ?? [
      boundary('network-boundary-aaaaaaaa', 'peer-alpha', 'allowed', 'lineage_export', ['network_boundary_allowed']),
      boundary('network-boundary-bbbbbbbb', 'peer-beta', 'quarantined', 'lineage_import_candidate', ['unknown_peer_quarantined']),
    ],
    ...(extra.top ?? {}),
  };
}

function peer(peer_id, extra = {}) {
  const treaty = extra.treaty ?? {};
  const reputation = extra.reputation ?? {};
  return {
    peer_id,
    repository_full_name: `example/${peer_id}`,
    status: extra.status ?? 'active',
    treaty: {
      treaty_id: `root-${peer_id}`,
      status: treaty.status ?? 'active',
      allowed_actions: treaty.allowed_actions ?? ['lineage_export', 'lineage_import_candidate'],
      expires_at: treaty.expires_at ?? null,
    },
    reputation: {
      score: reputation.score ?? 50,
      recommended_action: reputation.recommended_action ?? 'observe',
    },
    last_interaction_at: extra.last_interaction_at ?? null,
  };
}

function lineage(exchange_id, peer_id, direction, status, boundary_decision_id) {
  return {
    exchange_id,
    peer_id,
    direction,
    lineage_ref: `forge-lineage://root/${peer_id}`,
    pack_id: `forge-archive-pack://${exchange_id}`,
    status,
    boundary_decision_id,
    adoption_performed: false,
    occurred_at: NOW,
  };
}

function boundary(boundary_decision_id, peer_id, status, action, reasons) {
  return {
    boundary_decision_id,
    peer_id,
    status,
    decision: status === 'allowed' ? 'boundary_allowed' : status === 'quarantined' ? 'boundary_quarantined' : 'boundary_rejected',
    action,
    reasons,
  };
}

test('declares a deterministic report-only federation observability contract', () => {
  assert.equal(FEDERATION_REPORT_CONTRACT.deterministic, true);
  assert.equal(FEDERATION_REPORT_CONTRACT.manifestOnly, true);
  assert.equal(FEDERATION_REPORT_CONTRACT.reportOnly, true);
  assert.ok(FEDERATION_REPORT_CONTRACT.validates.includes('peer_status_visibility'));
  assert.ok(FEDERATION_REPORT_CONTRACT.validates.includes('lineage_traceability'));
  assert.ok(FEDERATION_REPORT_CONTRACT.forbids.includes('source_of_truth_replacement'));
  assert.ok(FEDERATION_REPORT_CONTRACT.forbids.includes('automatic_treaty_change'));
});

test('renders peer, treaty, lineage, reputation, and boundary state as derived Markdown and JSON reports', () => {
  const first = renderFederationReport(input());
  const second = renderFederationReport(input());

  assert.deepEqual(second, first);
  assert.equal(first.schema_ref, FEDERATION_REPORT_SCHEMA_REF);
  assert.equal(first.status, 'federation_report_ready', JSON.stringify(first, null, 2));
  assert.equal(first.report_context.source_of_truth, false);
  assert.equal(first.report_context.treaty_replacement, false);
  assert.equal(first.summary.peer_count, 3);
  assert.equal(first.summary.peers_by_status.quarantined, 1);
  assert.equal(first.summary.peers_by_status.revoked, 1);
  assert.equal(first.summary.lineage.import_count, 1);
  assert.equal(first.summary.lineage.export_count, 1);
  assert.equal(first.summary.lineage.adopted_count, 0);
  assert.ok(first.markdown_report.includes('peer-beta'));
  assert.ok(first.markdown_report.includes('quarantined'));
  assert.ok(first.markdown_report.includes('peer-gamma'));
  assert.ok(first.markdown_report.includes('revoked'));
  assert.deepEqual(validateFederationReport(first), { ok: true, issues: [] });
});

test('keeps revoked and quarantined peers visible instead of hiding risky peers', () => {
  const result = renderFederationReport(input());
  const beta = result.peer_reports.find((entry) => entry.peer_id === 'peer-beta');
  const gamma = result.peer_reports.find((entry) => entry.peer_id === 'peer-gamma');

  assert.ok(beta.visible_risk_flags.includes('peer_quarantined'));
  assert.ok(beta.visible_risk_flags.includes('reputation_quarantine'));
  assert.ok(gamma.visible_risk_flags.includes('peer_revoked'));
  assert.ok(gamma.visible_risk_flags.includes('reputation_revocation_review'));
  assert.deepEqual(validateFederationReport(result), { ok: true, issues: [] });
});

test('rejects lineage adoption authority and unknown references', () => {
  const adopted = renderFederationReport(input({ lineage_exchanges: [lineage('alpha-import', 'peer-alpha', 'import', 'candidate_registered', 'network-boundary-aaaaaaaa')] }));
  const unknownPeer = renderFederationReport(input({ lineage_exchanges: [lineage('missing-import', 'peer-missing', 'import', 'candidate_registered', null)] }));

  adopted.inputs.lineage_exchanges[0].adoption_performed = true;
  assertIssue(validateFederationReport(adopted), 'adoption_authority_forbidden');
  assert.equal(unknownPeer.status, 'invalid');
  assert.ok(unknownPeer.reasons.includes('unknown_peer_ref'));
  assert.deepEqual(validateFederationReport(unknownPeer), { ok: true, issues: [] });
});

test('fails closed for invalid timestamps, unknown enums, and secret-shaped material', () => {
  const invalidTime = renderFederationReport(input({ now: '2026-02-31T00:00:00Z' }));
  const unknownStatus = renderFederationReport(input({ peers: [peer('peer-alpha', { status: 'missing-from-registry' })] }));
  const secretLike = renderFederationReport(input({ source_refs: { peer_registry_ref: 'forge://github_pat_' + 'x'.repeat(24) } }));

  assert.equal(invalidTime.status, 'invalid');
  assert.ok(invalidTime.reasons.includes('invalid_timestamp'));
  assert.equal(unknownStatus.status, 'invalid');
  assert.ok(unknownStatus.reasons.includes('invalid_peer_status'));
  assert.equal(secretLike.status, 'invalid');
  assert.ok(secretLike.reasons.includes('secret_material_forbidden'));
  assert.deepEqual(validateFederationReport(invalidTime), { ok: true, issues: [] });
  assert.deepEqual(validateFederationReport(unknownStatus), { ok: true, issues: [] });
  assert.deepEqual(validateFederationReport(secretLike), { ok: true, issues: [] });
});

test('rejects tampering of every ready manifest leaf field', () => {
  const result = renderFederationReport(input());
  const paths = leafPaths(result);

  assert.ok(paths.length > 80, 'tamper harness should cover the full report manifest');
  for (const path of paths) {
    const tampered = structuredClone(result);
    mutateAt(tampered, path);
    const validation = validateFederationReport(tampered);
    assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join('.')}`);
  }
});

test('rejects structural tampering not covered by scalar leaf edits', () => {
  const unsortedPeers = renderFederationReport(input());
  unsortedPeers.inputs.peers.reverse();
  assertIssue(validateFederationReport(unsortedPeers), 'entries_not_sorted');

  const sourceOfTruth = renderFederationReport(input());
  sourceOfTruth.report_context.source_of_truth = true;
  assertIssue(validateFederationReport(sourceOfTruth), 'source_of_truth_boundary_required');

  const unknownNestedKey = renderFederationReport(input());
  unknownNestedKey.inputs.source_refs.extra = true;
  assertIssue(validateFederationReport(unknownNestedKey), 'unknown_key');
});

test('supports stable T068 aliases', () => {
  const result = runT068FederationObservability(input());

  assert.deepEqual(result, renderFederationReport(input()));
  assert.deepEqual(validateT068FederationObservability(result), validateFederationReport(result));
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
