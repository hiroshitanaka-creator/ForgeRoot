# .forge

`.forge` is the durable identity, policy, lineage, evaluation, and memory root for ForgeRoot.

Current bootstrap state:

- `mind.forge` seeds the root Forge Mind.
- `policies/constitution.forge` fixes the first non-negotiables and approval classes.
- `docs/specs/t003-validation-fixture.yaml` records the T003 minimum assertions.
- `docs/specs/forge-v1.md` defines the T004 `.forge` v1 source grammar, canonicalization rule, integrity rule, and pack reference shape.
- `schemas/forge-v1.schema.json` defines the T004 machine-readable schema for parsed `.forge` v1 documents.

Still intentionally deferred:

- deterministic parser implementation
- canonical hash computation kernel
- signature verification
- runtime loaders and replay logic
- pack compaction engine

Do not treat runtime caches or ad-hoc notes here as source of truth.
