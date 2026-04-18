# ForgeRoot

GitHub repository as a living Forge Mind.

This repository is currently seeded with the **Phase 0 / T001-T003 bootstrap**.
At this stage, the repo includes the monorepo skeleton plus the initial `mind.forge` and `constitution.forge`, while schema, parser, hashing, and runtime implementation remain intentionally out of scope.

## Start here

- `00_ForgeRoot_blueprint_設計書.md` — master blueprint
- `01_単語や命名規則.md` — naming and identity rules
- `02_README.md` — public-facing README source draft
- `03_issue.md` — initial bounded issue drafts

`README.md` is the GitHub entrypoint.
The numbered documents remain the ordered design documents for the bootstrap phase.

## Current layout

```text
.forge/
  mind.forge
  agents/
  policies/
    constitution.forge
  evals/
  lineage/
  network/
  packs/
.github/
  workflows/
apps/
  github-app/
  cli/
  browser-extension/
crates/
packages/
labs/
docs/
  specs/
  rfcs/
  ops/
```

## Seed status

- Current bootstrap span: `T001` + `T003`
- Scope completed here:
  - monorepo skeleton and `.forge` root
  - initial `mind.forge`
  - initial `constitution.forge`
  - minimal validation fixture for future schema work
- Intentionally not implemented here:
  - `.forge` schema implementation
  - deterministic parser and canonical hash kernel
  - GitHub App runtime implementation
  - workflow implementation

## Next tasks

- `T004` — `.forge` v1 spec and schema
- `T005` — canonical parser and hash kernel
- `T006` — minimum GitHub App manifest and permissions
- `T007` — webhook ingest with signature verification
- `T008` — event inbox and idempotency
- `T014` — runtime mode and kill switch

## Notes

- `.forge/mind.forge` and `.forge/policies/constitution.forge` now fix the initial non-negotiables, repo modes, and approval classes.
- Hashes, signatures, and canonical validation are intentionally deferred to `T004` and `T005`.
- `.github/workflows/` remains intentionally empty at this stage.
