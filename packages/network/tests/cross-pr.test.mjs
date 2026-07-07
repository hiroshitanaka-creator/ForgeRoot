import test from 'node:test';
import assert from 'node:assert/strict';
import { network } from './load.mjs';

const {
  ARCHIVE_PACK_SCHEMA_REF,
  CROSS_REPO_PR_SCHEMA_REF,
  composeCrossRepoPr,
  exportLineagePack,
  runT062CrossRepoPrComposer,
  validateCrossRepoPr,
  validateT062CrossRepoPrComposer,
} = network;

const hashA = 'sha256:' + 'a'.repeat(64);
const hashB = 'sha256:' + 'b'.repeat(64);
const hashC = 'sha256:' + 'c'.repeat(64);
const lineageRoot = 'forge-lineage://root/speciation/t048';

function lineagePack(extra = {}) {
  const result = exportLineagePack({
    now: '2026-07-06T00:00:00Z',
    treaty: {
      treaty_id: 'root-peer-treaty',
      status: 'active',
      source_peer_id: 'root-forge',
      target_peer_id: 'peer-forge',
      allowed_actions: ['lineage_import_candidate', 'lineage_export'],
      allowed_lineage_roots: [lineageRoot],
      allowed_record_kinds: ['archive_pack', 'lineage_handoff', 'mutation'],
      expires_at: '2026-12-31T00:00:00Z',
    },
    source_peer: { peer_id: 'root-forge', repository_full_name: 'hiroshitanaka-creator/ForgeRoot', status: 'active' },
    target_peer: { peer_id: 'peer-forge', repository_full_name: 'example/PeerForge', status: 'active' },
    archive_pack_ref: {
      schema_ref: ARCHIVE_PACK_SCHEMA_REF,
      pack_id: 'forge-archive-pack://lineage/t061/root-pack',
      raw_sha256: hashA,
      compressed_sha256: hashC,
      record_count: 1,
    },
    lineage_records: [{
      record_id: 'handoff-a',
      lineage_root: lineageRoot,
      kind: 'archive_pack',
      schema_ref: 'urn:forgeroot:archive-pack:v1',
      source_ref: 'forge://lineage/handoff-a',
      artifact_sha256: hashA,
      payload_sha256: hashB,
    }],
  });
  assert.equal(result.status, 'lineage_pack_ready', JSON.stringify(result, null, 2));
  return { ...result, ...extra };
}

function blockedLineagePack() {
  const result = exportLineagePack({
    now: '2026-07-06T00:00:00Z',
    treaty: {
      treaty_id: 'root-peer-treaty',
      status: 'active',
      source_peer_id: 'root-forge',
      target_peer_id: 'peer-forge',
      allowed_actions: ['lineage_import_candidate', 'lineage_export'],
      allowed_lineage_roots: [lineageRoot],
      allowed_record_kinds: ['archive_pack'],
      expires_at: '2026-12-31T00:00:00Z',
    },
    source_peer: { peer_id: 'root-forge', repository_full_name: 'hiroshitanaka-creator/ForgeRoot', status: 'active' },
    target_peer: { peer_id: 'peer-forge', repository_full_name: 'example/PeerForge', status: 'active' },
    archive_pack_ref: {
      schema_ref: ARCHIVE_PACK_SCHEMA_REF,
      pack_id: 'forge-archive-pack://lineage/t061/root-pack',
      raw_sha256: hashA,
      compressed_sha256: hashC,
      record_count: 1,
    },
    lineage_records: [{
      record_id: 'handoff-a',
      lineage_root: 'forge-lineage://other/root',
      kind: 'archive_pack',
      schema_ref: 'urn:forgeroot:archive-pack:v1',
      source_ref: 'forge://lineage/handoff-a',
      artifact_sha256: hashA,
      payload_sha256: hashB,
    }],
  });
  assert.equal(result.status, 'blocked', JSON.stringify(result, null, 2));
  return result;
}

function input(extra = {}) {
  return {
    now: '2026-07-06T00:00:00Z',
    lineage_pack: extra.lineage_pack ?? lineagePack(),
    peer: {
      peer_id: 'peer-forge',
      repository_full_name: 'example/PeerForge',
      status: 'active',
      allowed_actions: ['cross_repo_pr'],
      allowed_paths: ['docs/', 'packages/plugin/'],
      ...(extra.peer ?? {}),
    },
    proposal: {
      title: 'share lineage pack with peer',
      summary: 'Send a bounded lineage proposal to the peer repository.',
      head_branch: 'forge/t062-lineage-proposal',
      base_branch: 'main',
      changed_paths: ['docs/lineage-proposal.md'],
      risk: 'critical',
      rollback: 'Close the draft PR manifest and ignore the lineage candidate.',
      labels: ['lineage'],
      ...(extra.proposal ?? {}),
    },
  };
}

test('composes a deterministic cross-repo PR manifest without live GitHub behavior', () => {
  const result = composeCrossRepoPr(input());

  assert.equal(result.status, 'cross_repo_pr_ready', JSON.stringify(result, null, 2));
  assert.equal(result.schema_ref, CROSS_REPO_PR_SCHEMA_REF);
  assert.equal(validateCrossRepoPr(result).ok, true);
  assert.equal(result.pull_request.target_repository, 'example/PeerForge');
  assert.equal(result.pull_request.draft, true);
  assert.equal(result.pull_request.maintainer_can_modify, false);
  assert.ok(result.pull_request.body.includes('## Treaty evidence'));
  assert.ok(result.pull_request.body.includes('## Lineage evidence'));
  assert.ok(result.pull_request.body.includes('## Risk'));
  assert.ok(result.pull_request.body.includes('## Rollback'));
  assert.equal(result.guards.no_github_api_call, true);
  assert.equal(result.guards.no_pull_request_creation, true);
  assert.equal(result.dry_run.github_api_called, false);
});

test('canonical T062 aliases are exported', () => {
  const result = runT062CrossRepoPrComposer(input());
  assert.equal(result.status, 'cross_repo_pr_ready');
  assert.equal(validateT062CrossRepoPrComposer(result).ok, true);
});

test('blocks peers that do not allow cross-repo PR composition', () => {
  const result = composeCrossRepoPr(input({ peer: { allowed_actions: ['lineage_export'] } }));
  assert.equal(result.status, 'invalid');
  assert.ok(result.issues.some((entry) => entry.code === 'invalid_allowed_action'));
});

test('blocks proposal paths outside peer allowlist without creating PR output', () => {
  const result = composeCrossRepoPr(input({ proposal: { changed_paths: ['.github/workflows/test.yml'] } }));
  assert.equal(result.status, 'blocked');
  assert.equal(validateCrossRepoPr(result).ok, true);
  assert.ok(result.reasons.includes('path_not_allowed'));
  assert.equal(result.dry_run.pull_request_created, false);
});

test('blocks non-ready lineage packs and rejects tampered T061 packs', () => {
  const blocked = composeCrossRepoPr(input({ lineage_pack: blockedLineagePack() }));
  const tampered = composeCrossRepoPr(input({ lineage_pack: { ...lineagePack(), lineage_pack_digest: 'sha-fnv1a-00000000' } }));

  assert.equal(blocked.status, 'blocked');
  assert.ok(blocked.reasons.includes('t061_lineage_pack_not_ready'));
  assert.equal(tampered.status, 'invalid');
  assert.ok(tampered.issues.some((entry) => entry.code === 'invalid_t061_lineage_pack' || entry.code === 'digest_mismatch'));
});

test('read-back validation catches missing required body sections', () => {
  const result = composeCrossRepoPr(input());
  const tampered = { ...result, pull_request: { ...result.pull_request, body: result.pull_request.body.replace('## Rollback', '## Recovery') } };
  const validation = validateCrossRepoPr(tampered);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.code === 'required_body_section_missing'));
});

test('read-back validation catches mismatched treaty, lineage, risk, and rollback evidence', () => {
  const result = composeCrossRepoPr(input());
  const tampered = {
    ...result,
    evidence: { ...result.evidence, lineage: 'lineage_pack:other-pack', risk: 'low' },
    pull_request: {
      ...result.pull_request,
      body: result.pull_request.body
        .replace(result.lineage_pack_ref.lineage_pack_id, 'other-pack')
        .replace(result.evidence.rollback, 'No rollback needed.'),
    },
  };
  const validation = validateCrossRepoPr(tampered);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.code === 'lineage_evidence_mismatch'));
  assert.ok(validation.issues.some((entry) => entry.code === 'risk_evidence_mismatch'));
  assert.ok(validation.issues.some((entry) => entry.code === 'body_lineage_evidence_missing'));
  assert.ok(validation.issues.some((entry) => entry.code === 'body_rollback_evidence_missing'));
});

test('read-back validation rejects live GitHub, fork, merge, or approval side effects', () => {
  const result = composeCrossRepoPr(input());
  const tampered = {
    ...result,
    guards: { ...result.guards, no_github_api_call: false, no_merge_operation: false },
    dry_run: { ...result.dry_run, github_api_called: true, merge_performed: true },
  };
  const validation = validateCrossRepoPr(tampered);

  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((entry) => entry.code === 'guard_required'));
  assert.ok(validation.issues.some((entry) => entry.code === 'side_effect_forbidden'));
});

test('rejects unsafe target branches and secret-shaped metadata', () => {
  const badBranch = composeCrossRepoPr(input({ proposal: { head_branch: 'main' } }));
  const secret = composeCrossRepoPr(input({ proposal: { title: 'github_pat_' + 'x'.repeat(24) } }));

  assert.equal(badBranch.status, 'invalid');
  assert.ok(badBranch.issues.some((entry) => entry.code === 'invalid_head_branch'));
  assert.equal(secret.status, 'invalid');
  assert.ok(secret.issues.some((entry) => entry.code === 'secret_material_forbidden'));
});
