# T061 validation report

Task: T061 lineage export/import pack.

Implemented:

- Added `packages/network` as a workspace package.
- Added `exportLineagePack(input)` and `validateLineagePack(result)`.
- Added canonical T061 aliases:
  - `runT061LineagePackExport(input)`
  - `validateT061LineagePackExport(result)`
- Added digest-covered `treaty_scope` so read-back validation can enforce
  treaty scope without external context.
- Added blocked and invalid terminal handling that remains read-back-valid.
- Added table-style negative tests for hash, signature, schema, treaty scope,
  expired treaty, unknown treaty action, peer quarantine, digest tampering,
  record ordering, archive count mismatch, side effects, automatic adoption,
  and secret-shaped input.

Verification:

- `npm.cmd --prefix packages\network test`
  - Result: passed.
  - Coverage: 11/11 T061 package tests.
- `npm.cmd test`
  - Result: passed.
- `npm.cmd run build`
  - Result: passed.
- `npm.cmd run validate:skills`
  - Result: passed.
- `git diff --check`
  - Result: passed with LF/CRLF warning for `TASK_PROGRESS.md`.
- `git diff --check origin/main...HEAD`
  - Result: passed.
- Mojibake scan over changed files
  - Result: passed; no matches.
- `rg -n "exportLineagePack|T061" ...`
  - Result: passed; canonical API name is present in the blueprint and package
    exports.
- `where.exe cargo`
  - Result: `cargo` not found on PATH.

Internal audit repair:

- Fixed read-back validation asymmetry by adding `treaty_scope` to the manifest
  payload and validator.
- Fixed blocked terminal validation so blocked manifests are valid rejection
  evidence and preserve blocker codes in `reasons`.
- Fixed invalid terminal validation so invalid manifests use a structurally safe
  placeholder payload and carry sanitized `issues`.
- Added fail-closed validation for unknown treaty actions and expired treaties.

Not run:

- `cargo test --workspace --locked`; Cargo is not available on PATH in this
  Windows session.
