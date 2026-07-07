# Thread handoff after T062

Completed task: T062 cross-repo PR composer.

T062 adds `composeCrossRepoPr` and `validateCrossRepoPr` in
`packages/network/src/cross-pr.ts`.

Key behavior:

- Consumes a read-back-valid T061 lineage pack.
- Composes a draft peer-repo PR manifest with treaty, lineage, risk, and
  rollback evidence.
- Blocks non-ready lineage packs, inactive peers, target peer mismatches, and
  paths outside the peer allowlist.
- Rejects tampered T061 packs, unsafe branches, secret-shaped metadata, missing
  required body sections, body/evidence mismatches, and live side-effect flags.
- Does not call GitHub, create a PR, create a fork, approve, merge, create a
  treaty, or perform network transport.

Verification passed so far:

- `npm.cmd --prefix packages\network test` (20/20).
- `npm.cmd test`.
- `npm.cmd run build`.
- `npm.cmd run validate:skills`.
- `git diff --check` with LF/CRLF warnings.
- `git diff --check origin/main...HEAD`.

Not run:

- `cargo test --workspace --locked`; `cargo` is not available on PATH.

Recommended next task: T063 peer reputation scoring.
