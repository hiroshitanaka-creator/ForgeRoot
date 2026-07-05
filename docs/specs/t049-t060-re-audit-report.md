# T049-T060 re-audit report

Date: 2026-07-06

Scope:

- T049 N-version audit routing
- T050 EvolutionGuard decision manifest
- T051 mutation PR generator
- T052 mutation PR transport request bridge
- T053 transport readiness ledger
- T054 approval receipt verifier
- T055 transport execution plan
- T056 execution artifact receipt
- T057 rollout gate checklist
- T058 post-transport audit plan
- T059 lineage handoff pack
- T060 completion bundle

Findings and repair:

- Fixed T060 invalid-result read-back validation. The completion bundle secret
  detector treated the word `secret` inside the diagnostic reason
  `label_contains_secret_material` as secret material. The detector now matches
  token/private-key shapes instead of diagnostic words, and the unsafe-label
  test validates the invalid result itself.

High-risk surfaces reviewed:

- `.github/workflows/test.yml` keeps `permissions: contents: read` and runs
  `npm test` plus `cargo test --workspace --locked`.
- `.forge/policies/constitution.forge` already requires elevated review for
  policy and workflow paths, forbids default-branch writes, and forbids
  self-approval on high-risk changes.
- `.forge/policies/memory.forge` keeps curated memory updates PR-gated and
  direct `.forge` writes disabled.
- No workflow, permission, `.forge/policies`, branch-protection, app-permission,
  merge, or approve changes were required for T049-T060.

Verification:

- `npm.cmd --prefix packages\mutate test`
  - Result: passed, 102/102.
- `npm.cmd test`
  - Result: passed.
- `git diff --check`
  - Result: passed with LF/CRLF warnings only.
- `where.exe cargo`
  - Result: `cargo` not found on PATH.

Residual risk:

- `cargo test --workspace --locked` still needs a machine with Cargo on PATH.
- GitHub publication depends on a valid `gh` authentication token.
