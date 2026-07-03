# ForgeRoot Thread Handoff: after T046

Date: 2026-07-03 UTC

## Completed task

T046 — Prompt genome patcher foundation.

## What T046 added

- `packages/mutate` package scaffold.
- `packages/mutate/src/prompt-patch.ts` deterministic dry-run patcher:
  `applyPromptPatchDryRun` / `validatePromptPatchDryRun`.
- Tests for the allowlisted field surface, forbidden document/field
  rejection, malformed-operation rejection, determinism, and the always-false
  `dry_run` contract.
- `docs/specs/prompt-patch.md` and
  `docs/specs/t046-prompt-patcher-validation-report.md`.

## Boundary

T046 is dry-run and allowlist-scoped. It never writes files, calls GitHub
APIs, generates prompts, selects mutations, auto-merges, or touches identity,
constitution, tool-routing, evolution, score, or provenance fields, even on
an otherwise-valid target document.

## Recommended next target

T047 — Tool-routing mutator: bounded mutation of an agent's tool namespace,
`max_calls`, timeout, and approval requirements, following the same
allowlist-first, dry-run-only pattern established by T045 and T046, and
kept out of `packages/mutate/src/prompt-patch.ts`'s scope by design (prompt
patches cannot touch `tools`).
