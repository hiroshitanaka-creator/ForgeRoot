# ForgeRoot

GitHub repository as a living Forge Mind.

This repository is currently seeded through **Phase 0 / T004**.
T001 created the monorepo skeleton, T003 seeded the root mind and constitution, and T004 now fixes the first `.forge` v1 specification and JSON Schema contract.

## Start here

- `00_ForgeRoot_blueprint_設計書.md` — master blueprint
- `01_単語や命名規則.md` — naming and identity rules
- `02_README.md` — public-facing README source draft
- `03_issue.md` — initial bounded issue drafts
- `docs/specs/forge-v1.md` — normative `.forge` v1 specification seed
- `schemas/forge-v1.schema.json` — Draft 2020-12 JSON Schema for parsed `.forge` v1 documents

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
    forge-v1.md
    fixtures/forge-v1/
    t003-validation-fixture.yaml
    t004-validation-report.md
  rfcs/
  ops/
schemas/
  forge-v1.schema.json
```

## Seed status

- Current task completed: `T004`
- Scope completed here:
  - `.forge` v1 source grammar
  - required common top-level fields
  - kind-specific required sections
  - canonicalization rule
  - integrity rule
  - pack reference shape
  - schema definition file
  - valid and invalid validation fixtures
- Intentionally not implemented here:
  - canonical parser implementation
  - actual canonical hash computation
  - signature verification
  - pack compaction engine
  - replay engine
  - GitHub App runtime implementation
  - workflow implementation

## Validation fixtures

T004 adds:

- `docs/specs/fixtures/forge-v1/valid/minimal-agent.forge`
- `docs/specs/fixtures/forge-v1/invalid/missing-revision.forge`
- `docs/specs/t004-validation-report.md`

The valid fixture demonstrates the required shape for `kind: agent`.
The invalid fixture intentionally omits `revision` and must fail the schema.

## Next tasks

- `T005` — canonical parser and hash kernel
- `T006` — minimum GitHub App manifest and permissions
- `T007` — webhook ingest with signature verification
- `T008` — event inbox and idempotency
- `T014` — runtime mode and kill switch

## Notes

- `.forge/` is the durable identity root.
- `.forge/mind.forge` and `.forge/policies/constitution.forge` are bootstrap documents seeded by T003 and schema-checked by T004.
- `.github/workflows/` remains intentionally empty until workflow tasks explicitly define trusted and untrusted execution boundaries.
- Runtime caches, external databases, and generated views are not source of truth.
