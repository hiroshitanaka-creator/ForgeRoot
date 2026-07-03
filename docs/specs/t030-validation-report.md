# T030 Validation Report

## Scope
Deterministic working memory update manifest creation and validation.

## Files changed
- `packages/memory/src/working.ts`
- `packages/memory/tests/working.test.mjs`
- `packages/memory/README.md`
- `packages/memory/package.json`
- `packages/memory/tsconfig.json`
- `packages/memory/src/index.ts`
- `docs/specs/working-memory-update.md`

## Acceptance coverage
Valid update, missing source refs, max items, duplicate dedupe, deterministic ordering, secret-like rejection, TTL metadata, no direct `.forge` write, no GitHub API, and no eval score update are covered.

## Commands run
| Command | Result | Reason if not run |
|---|---|---|
| `node --test --test-force-exit packages/memory/tests/*.test.mjs` | pass | |
| `node --test --test-force-exit packages/planner/tests/*.test.mjs` | pass | |
| `node --test --test-force-exit packages/executor/tests/*.test.mjs` | pass | |
| `node --test --test-force-exit packages/auditor/tests/*.test.mjs` | pass | |
| `node --test --test-force-exit packages/forge-demo/tests/run.test.mjs` | pass | |

## Results
All Node validation commands passed.

## Explicit non-goals preserved
No `.forge` direct mutation, GitHub API call, runtime DB authority, MemoryKeeper runtime, archive packer, retrieval, eval score, mutation engine, or federation.

## Remaining risks
The writer is intentionally manifest-only and does not persist memory; persistence belongs to later PR-reviewed tasks.

## Follow-up tasks
T032 archive packer; T033 semantic retrieval adapter; T036 merge outcome collector; T039 provenance writer.

## Post-review fixes (Codex review, 2026-07-03)

Codex flagged 6 issues on this package after rebase onto current main; all confirmed and fixed in `packages/memory/src/working.ts`:

| Finding | Fix |
|---|---|
| `update_id` truncated the encoded source JSON before facts/timestamp, so distinct updates could collide on the same id | `stableId` now folds the full JSON string through two combined 32-bit hashes instead of truncating a URI-encoded prefix |
| `Number(f.confidence)` on a missing/non-numeric value produced `NaN`, and `typeof NaN === "number"` let it pass validation | Confidence check now uses `Number.isFinite(...)` |
| `uniqueSorted` (used when creating tags) sorted with default UTF-16 order while `isSorted` (used when validating tags) used `localeCompare`, so some valid mixed-case tag sets were rejected right after creation | Both now use `localeCompare` |
| `approval.approval_class` accepted any string | Restricted to `A`/`B`/`C`/`D` |
| A custom `max_items` passed via `options` was enforced at creation time but never stored on the returned manifest, so a later standalone `validateWorkingMemoryUpdate(update)` call fell back to the default 50 and rejected valid larger batches | `max_items` is now persisted on the manifest and read back during validation |
| `SECRET_RE` only matched a few literal words and missed token-shaped secrets (`ghp_...`, `github_pat_...`, `AKIA...`, PEM private-key headers, `api_key` field name) | Extended the pattern to cover these shapes |

Regression tests were added for each case in `packages/memory/tests/working.test.mjs`. Re-verified: `node --test --test-force-exit packages/memory/tests/*.test.mjs` (24/24 pass across working+digest), `npx tsc -p packages/memory/tsconfig.json` (clean).
