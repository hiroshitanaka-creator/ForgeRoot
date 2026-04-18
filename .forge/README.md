# .forge

`.forge` is the durable identity, policy, lineage, evaluation, and memory root for ForgeRoot.

Current bootstrap state:

- `mind.forge` seeds the root Forge Mind.
- `policies/constitution.forge` fixes the first non-negotiables and approval classes.
- `docs/specs/t003-validation-fixture.yaml` records the minimum assertions that later schema and parser work should validate.

Still intentionally deferred:

- `.forge` v1 schema and validation engine
- deterministic canonical hashing
- runtime loaders and replay logic

Do not treat runtime caches or ad-hoc notes here as source of truth.
