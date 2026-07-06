# packages

Shared TypeScript packages live here.

Current packages:

- `memory/` now includes T032 deterministic archive pack manifests after T030
  working memory updates and T031 episode digests.
- `mutate/` now includes T060 dry-run completion bundles after lineage handoff packs.

- `planner/` — planner-side primitives. T015 adds deterministic issue intake classification and normalized task candidate output.
- `eval/` — deterministic evaluation package. T045 adds a manifest-only shadow-run harness for eval suite/result references.
- `mutate/` — deterministic mutation-proposal package. T046 adds an allowlisted, dry-run-only prompt genome patcher for `.forge/agents/<species>.forge` documents.
