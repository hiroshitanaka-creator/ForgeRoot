# TASK_PROGRESS

## Current phase
T046 — Prompt genome patcher foundation (allowlisted, dry-run prompt/context-recipe mutation surface).

## Initial assessment summary
- T045 eval shadow-run harness foundation was already committed on `main`.
- The T045 handoff recommends T046 as the next target, gated on the canonical
  task source confirming scope and keeping mutation output non-live.
- The blueprint's original T046 (`03_issue_続き`) defines a prompt genome
  patcher: an RFC6902-like patch over allowed `.forge/agents/*.forge` prompt
  fields, with policy/workflow/permission fields explicitly out of scope.
  That scope is implementable now without waiting on the blueprint's original
  T043/T044 (mutation taxonomy / mutation budget), because this repo's actual
  T043–T045 thread already delivered an equivalent foundation (eval suite,
  eval result, and shadow-run manifests) that a later mutation-budget/taxonomy
  package can compose with.

## Selected work
Implement T046 — Prompt genome patcher foundation.

## Why this work
- It advances the Evolution loop (`Evaluate -> Mutate -> Shadow Eval ->
  Evolution PR`) while preserving every existing safety boundary.
- It gives T047 (tool-routing mutator) and T048 (speciation) a concrete,
  narrow precedent for allowlist-first, dry-run-only mutation packages.
- It avoids prompt generation, mutation selection, automatic merge, live file
  writes, GitHub API calls, and any policy/workflow/identity/constitution
  mutation surface.

## Intended scope
- Add a `packages/mutate` TypeScript package.
- Implement `applyPromptPatchDryRun` and `validatePromptPatchDryRun` in
  `src/prompt-patch.ts`.
- Restrict patch targets to canonical `.forge/agents/<species>.forge`
  documents and an explicit prompt/context-recipe field allowlist.
- Reject any patch touching identity, species, constitution, tool-routing,
  evolution, scores, mutation_log, or provenance fields.
- Add tests, a spec doc, a validation report, and a handoff doc.

## Verification plan
- Run `npm --prefix packages/mutate test`.

## Current status
- T046 implementation complete.
- Verification passed: `npm --prefix packages/mutate test` (9/9).
- Ready for commit and PR record.
