# @forgeroot/mutate

Deterministic mutation-proposal package.

## T046 prompt genome patcher

`applyPromptPatchDryRun` consumes a canonical `.forge/agents/<species>.forge`
document reference plus an RFC6902-like list of `add` / `replace` / `remove`
operations, and produces a manifest-only dry-run diff:

- only an explicit allowlist of prompt/context-recipe fields can be targeted
  (`title`, `summary`, `identity.persona`, `role.mission`, `context_recipe.*`,
  `memory.working_memory.facts`, `memory.semantic_digests`, `memory.forget_rules`)
- any document outside `.forge/agents/<species>.forge` is rejected outright
- identity, species, constitution, tool-routing, evolution, scores, and
  provenance fields can never be patch targets, even on an allowed document
- patch application is a pure, deterministic diff over an in-memory clone
- before/after content digests are included for later shadow-eval comparison

This package does not write files, call GitHub APIs, generate prompts, select
mutations, or auto-merge. It is a foundation for T048 speciation and the
later T050 EvolutionGuard / T051 mutation PR generator stages.
