# .forge

`.forge` is the durable identity, policy, lineage, evaluation, and memory root for ForgeRoot.

Current bootstrap state:

- `mind.forge` seeds the root Forge Mind.
- `policies/constitution.forge` fixes the first non-negotiables and approval classes.
- `crates/forge-kernel/` now parses and hashes these `.forge` files deterministically.
- `docs/specs/t005-validation-report.md` records the expected canonical hashes for the current bootstrap files.

Do not treat runtime caches or ad-hoc notes as source of truth. Git and `.forge` remain authoritative.
