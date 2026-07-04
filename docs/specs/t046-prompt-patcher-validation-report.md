# T046 Prompt Genome Patcher Validation Report

Date: 2026-07-04 UTC

## Scope

T046 adds `packages/mutate/src/prompt-patch.ts`, a deterministic dry-run
harness that turns an RFC6902-like operation list into a reviewable diff over
one canonical `.forge/agents/<species>.forge` document, scoped to an explicit
allowlist of prompt/context-recipe fields.

## Safety Boundary

The patcher is manifest-only. It does not write files, call GitHub APIs,
generate prompts, select mutations, auto-merge, or mutate policy, workflow,
identity, constitution, tool-routing, evolution, score, or provenance fields.

## Acceptance Checks

- The contract declares consumed/produced manifests and forbidden side
  effects (`policy_document_target`, `identity_or_species_target`,
  `live_file_write`, `github_api_call`, `automatic_merge`, among others).
- Only `.forge/agents/<species>.forge` documents can be patch targets; any
  other path is rejected with `forbidden_document_path` before operations are
  inspected.
- The target content must be the canonical agent identity for the target path:
  `kind: "agent"`, expected `id`, matching `identity.species`, and matching
  `identity.role_name`.
- Only the fixed prompt/context-recipe field allowlist can be targeted;
  identity, constitution, tools, evolution, scores, and provenance fields are
  rejected with `path_not_in_allowed_prompt_fields`.
- Structurally invalid request envelopes (non-object input, missing target,
  non-array operations, non-object content, malformed operation entries, and
  invalid timestamps) are rejected as manifests instead of throwing.
- Malformed operations (unknown `op`, missing `value` on add/replace,
  duplicate target paths, empty operation lists, species/path mismatches,
  non-canonical target content, and replace/remove operations for missing
  target paths) are rejected before any diff is produced.
- A valid patch produces deterministic, value-sensitive `patch_id` and
  `mutation_record.mutation_id` values, before/after content digests, and a
  per-operation diff without mutating the caller's input.
- Accepted operation values and diff values are cloned before returning the
  manifest, so caller mutation after the dry run cannot alter audit output.
- Rejected patches carry `mutation_record.decision: "rejected"` so downstream
  consumers cannot mistake an invalid patch for a proposed mutation.
- `validatePromptPatchDryRun` confirms every `dry_run` flag stays `false` on
  both accepted and rejected results.

## Verification

- `npm.cmd --prefix packages\mutate test` - 13/13 passing.
