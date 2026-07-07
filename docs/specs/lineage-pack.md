# T061 lineage pack

T061 defines a deterministic lineage export/import pack manifest for
allowlisted Forge peers. It is a manifest boundary only. It does not perform
network transport, write files, call GitHub, push git refs, or adopt imported
lineage.

## Public API

- `exportLineagePack(input)`
- `validateLineagePack(result)`
- `runT061LineagePackExport(input)`
- `validateT061LineagePackExport(result)`

The implementation lives in `packages/network/src/lineage-pack.ts`.

## Input contract

The input must provide:

- `treaty`: active treaty metadata with:
  - `source_peer_id`
  - `target_peer_id`
  - `allowed_actions`
  - `allowed_lineage_roots`
  - `allowed_record_kinds`
  - optional `expires_at`
- `source_peer` and `target_peer`: active peer references.
- `archive_pack_ref`: a T032 archive pack reference with schema and hashes.
- `lineage_records`: lineage refs to include in the export pack.
- optional `signature_ref`: a signature reference, not a signing key.

The canonical allowed actions for T061 are:

- `lineage_export`
- `lineage_import_candidate`

Unknown actions fail closed.

## Output contract

A ready lineage pack includes:

- `treaty_ref`
- `treaty_scope`
- source and target peer refs
- archive pack hash refs
- sorted lineage records
- `export_payload_digest`
- `signature_ref`
- `import_candidate`
- dry-run and no-side-effect guards

`treaty_scope` is included in the digest-covered manifest so read-back
validation can re-check scope without trusting external context.

## Terminal states

- `lineage_pack_ready`: treaty, peer, archive hash, signature ref, and record
  scope are valid.
- `blocked`: input shape is valid, but treaty or peer scope blocks export.
  Blocked manifests are valid evidence and do not carry `issues`; blocker codes
  are preserved in `reasons`.
- `invalid`: input shape, hashes, signature ref, schema, timestamps, unknown
  actions, or secret-shaped material failed validation. Invalid manifests carry
  `issues` and remain structurally read-back-valid.

## Safety boundaries

T061 always keeps:

- `import_candidate.adoption_performed: false`
- `guards.no_network_transport: true`
- `guards.no_automatic_adoption: true`
- `guards.no_file_write: true`
- `guards.no_github_api_call: true`
- `guards.no_git_push: true`
- matching `dry_run` false side-effect flags

Import means candidate registration only. Adoption, cross-repo PR creation,
network dispatch, open federation, peer reputation scoring, and live transport
are out of scope.
