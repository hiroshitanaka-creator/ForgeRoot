# T046 Prompt Genome Patch

## Purpose

A prompt patch expresses a proposed mutation to an agent's prompt / context
recipe as a reviewable, RFC6902-like operation list, so that prompt mutation
can be diffed and audited before it is ever proposed as an evolution PR.

## Shape

```ts
interface PromptPatchOperation {
  op: "add" | "replace" | "remove";
  path: string;   // dot-separated, must be in the allowed field list
  value?: unknown; // required for add/replace, ignored for remove
}

interface PromptPatchInput {
  now?: string;
  target: { path: string; species: string; content: Record<string, unknown> };
  operations: PromptPatchOperation[];
}
```

## Allowed target document

Exactly one canonical agent genome file: `.forge/agents/<species>.forge`
(matching D-0001). `target.species` must match the `<species>` path segment.
Any other path — including `.forge/policies/**`, `.github/workflows/**`, and
`.forge/mind.forge` — is rejected before operations are inspected.

## Allowed patch fields

Only the following dot-paths may be targeted:

- `title`, `summary`
- `identity.persona`
- `role.mission`
- `context_recipe.static_slots`, `context_recipe.dynamic_slots`,
  `context_recipe.token_budget`, `context_recipe.compaction_policy`
- `memory.working_memory.facts`, `memory.semantic_digests`,
  `memory.forget_rules`

Everything else — `identity.role_name`, `identity.species`, every
`constitution.*` field, `tools`, `evolution`, `scores`, `mutation_log`,
`provenance`, `role.forbidden_actions`, `role.inputs`, `role.outputs` — is
outside the prompt-patch surface. Tool-routing changes belong to the T047
tool-routing mutator; identity, constitution, and provenance are never
mutation targets.

## Guarantees

- Deterministic: identical input always yields the same `patch_id`,
  `before_digest`, and `after_digest`.
- Dry-run only: `applyPromptPatchDryRun` clones the target document in
  memory, applies operations to the clone, and never writes a file, calls a
  GitHub API, or auto-merges anything.
- Fail closed: an unknown op, an out-of-allowlist path, a missing `value`,
  a duplicate target path, or a document/species mismatch rejects the whole
  patch with `status: "rejected"`.

## Output

`applyPromptPatchDryRun` returns a `prompt_patch_dry_run_manifest` with a
per-operation diff (`before` / `after`), a `mutation_record` shaped for the
`mutation_log` entries described in `schemas/forge-v1.schema.json`
(`class: "prompt_patch"`, `decision: "proposed"` for accepted dry runs and
`decision: "rejected"` for rejected inputs), and a `dry_run` block that is
always all-`false`.

## Out of scope

Prompt generation, mutation selection, automatic merge, and workflow or
permission mutation are out of scope for T046 and remain gated behind later
tasks (T048 speciation, T050 EvolutionGuard, T051 mutation PR generator).
