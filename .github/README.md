# ForgeRoot

GitHub repository as a living Forge Mind.

ForgeRoot turns a repository into a self-improving, PR-native, evolvable intelligence. Agents do not merely work on the repo; their durable identity, policy, memory, lineage, and mutation history live in Git under `.forge/`.

## Core laws

1. Git is the source of truth.
2. No direct writes to the default branch.
3. Every behavior-changing mutation must be reviewable as a PR.
4. Humans set the constitution; agents optimize within it.
5. Federation is allowlisted before it is autonomous.

## Current bootstrap status

- Current completed task: `T005 canonical parser and hash kernel`
- Phase: `P0 / Forge Kernel`
- Implemented so far:
  - `T001` monorepo skeleton and `.forge` root
  - `T003` root `mind.forge` and constitution policy seed
  - `T004` `.forge` v1 specification and JSON Schema
  - `T005` Rust parser/hash kernel crate and conformance fixtures

## Current layout

```text
.forge/
  mind.forge
  policies/
    constitution.forge
crates/
  forge-kernel/
    src/
    tests/
docs/
  specs/
    forge-v1.md
    t003-validation-fixture.yaml
    t004-validation-report.md
    t005-validation-report.md
    fixtures/forge-v1/
schemas/
  forge-v1.schema.json
```

## T005 kernel

`crates/forge-kernel/` provides the first executable `.forge` v1 kernel:

- strict source-form validation;
- duplicate-key rejection;
- NFC and LF enforcement;
- comment-insensitive canonicalization;
- fixed top-level key ordering;
- `sha256:<hex>` canonical hash calculation;
- integrity verification for `integrity.canonical_hash` when present.

Expected local commands once Rust is installed:

```bash
cargo test -p forge-kernel
cargo run -p forge-kernel -- hash docs/specs/fixtures/forge-v1/valid/minimal-agent.forge
cargo run -p forge-kernel -- verify .forge/mind.forge
```

## Important boundaries

Still intentionally deferred:

- GitHub App manifest and runtime
- webhook ingest server
- event inbox / idempotency
- pack compaction
- replay engine
- evaluator and mutation runtime
- federation/network runtime
- browser extension and UI overlays

## Next tasks

- `T006` — minimum GitHub App manifest and permissions
- `T007` — webhook ingest with signature verification
- `T008` — event inbox and idempotency
- `T014` — runtime mode and kill switch
