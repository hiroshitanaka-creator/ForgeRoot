# Thread handoff after T061

Completed task: T061 lineage export/import pack.

T061 adds `packages/network` with `exportLineagePack` and
`validateLineagePack` in `packages/network/src/lineage-pack.ts`.

Key behavior:

- Exports deterministic lineage pack manifests from active treaty, peer,
  archive pack, lineage record, and signature references.
- Blocks treaty scope violations and quarantined peers without performing
  network transport.
- Rejects invalid hashes, signatures, schemas, unknown treaty actions, expired
  treaties, secret-shaped material, side-effect flags, and automatic adoption.
- Keeps import as candidate registration only.

Verification passed so far:

- `npm.cmd --prefix packages\network test` (11/11).
- `npm.cmd test`.
- `npm.cmd run build`.
- `npm.cmd run validate:skills`.
- `git diff --check` with LF/CRLF warning for `TASK_PROGRESS.md`.

Not run:

- `cargo test --workspace --locked`; `cargo` is not available on PATH in this
  Windows session.

Recommended next task: T062 cross-repo PR composer, depending on the T061
lineage pack manifest plus treaty and peer evidence.
