# T046 Prompt Genome Patcher Validation Report

Date: 2026-07-03 UTC

## Scope

T046 adds `packages/mutate/src/prompt-patch.ts`, a deterministic dry-run
harness that turns an RFC6902-like operation list into a reviewable diff over
one canonical `.forge/agents/<species>.forge` document, scoped to an explicit
allowlist of prompt/context-recipe fields.

## Safety boundary

The patcher is manifest-only. It does not write files, call GitHub APIs,
generate prompts, select mutations, auto-merge, or mutate policy, workflow,
identity, constitution, tool-routing, evolution, score, or provenance fields.

## Acceptance checks

- The contract declares consumed/produced manifests and forbidden side
  effects (`policy_document_target`, `identity_or_species_target`,
  `live_file_write`, `github_api_call`, `automatic_merge`, among others).
- Only `.forge/agents/<species>.forge` documents can be patch targets; any
  other path is rejected with `forbidden_document_path` before operations
  are inspected.
- Only the fixed prompt/context-recipe field allowlist can be targeted;
  identity, constitution, tools, evolution, scores, and provenance fields are
  rejected with `path_not_in_allowed_prompt_fields`.
- Structurally invalid request envelopes (non-object input, missing target,
  non-array operations, non-object content, malformed operation entries, and
  invalid timestamps) are rejected as manifests instead of throwing.
- Malformed operations (unknown `op`, missing `value` on add/replace,
  duplicate target paths, empty operation lists, species/path mismatches)
  are rejected before any diff is produced.
- A valid patch produces a deterministic `patch_id`, before/after content
  digests, and a per-operation diff without mutating the caller's input.
- Rejected patches carry `mutation_record.decision: "rejected"` so downstream
  consumers cannot mistake an invalid patch for a proposed mutation.
- `validatePromptPatchDryRun` confirms every `dry_run` flag stays `false` on
  both accepted and rejected results.

## Verification

- `npm --prefix packages/mutate test` — 9/9 passing.
