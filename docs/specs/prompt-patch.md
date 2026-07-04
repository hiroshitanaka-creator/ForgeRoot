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

## Allowed Target Document

Exactly one canonical agent genome file: `.forge/agents/<species>.forge`
(matching D-0001). `target.species` must match the `<species>` path segment.
`target.content` must also identify the same canonical agent with
`kind: "agent"`, the expected `id`, `identity.species`, and
`identity.role_name`.

Any other path, including `.forge/policies/**`, `.github/workflows/**`, and
`.forge/mind.forge`, is rejected before operations are inspected.

## Allowed Patch Fields

Only the following dot-paths may be targeted:

- `title`, `summary`
- `identity.persona`
- `role.mission`
- `context_recipe.static_slots`, `context_recipe.dynamic_slots`,
  `context_recipe.token_budget`, `context_recipe.compaction_policy`
- `memory.working_memory.facts`, `memory.semantic_digests`,
  `memory.forget_rules`

Everything else, including `identity.role_name`, `identity.species`, every
`constitution.*` field, `tools`, `evolution`, `scores`, `mutation_log`,
`provenance`, `role.forbidden_actions`, `role.inputs`, and `role.outputs`, is
outside the prompt-patch surface. Tool-routing changes belong to the T047
tool-routing mutator; identity, constitution, and provenance are never
mutation targets.

## Guarantees

- Deterministic: identical input always yields the same `patch_id`,
  `mutation_record.mutation_id`, `before_digest`, and `after_digest`.
- Value-sensitive IDs: operation values are part of both generated IDs, so
  patches that target the same field with different values cannot collide.
- Dry-run only: `applyPromptPatchDryRun` clones the target document in memory,
  applies operations to the clone, and never writes a file, calls a GitHub API,
  or auto-merges anything.
- Stable manifest: accepted operation values and diff values are cloned before
  being returned, so later caller mutation cannot alter the manifest.
- Fail closed: an unknown op, an out-of-allowlist path, a missing `value`, a
  duplicate target path, a document/species mismatch, non-canonical target
  content, or a `replace`/`remove` for a missing path rejects the whole patch
  with `status: "rejected"`.

## Output

`applyPromptPatchDryRun` returns a `prompt_patch_dry_run_manifest` with a
per-operation diff (`before` / `after`), a `mutation_record` shaped for the
`mutation_log` entries described in `schemas/forge-v1.schema.json`
(`class: "prompt_patch"`, `decision: "proposed"` for accepted dry runs and
`decision: "rejected"` for rejected inputs), and a `dry_run` block that is
always all-`false`.

## Out Of Scope

Prompt generation, mutation selection, automatic merge, and workflow or
permission mutation are out of scope for T046 and remain gated behind later
tasks (T048 speciation, T050 EvolutionGuard, T051 mutation PR generator).
