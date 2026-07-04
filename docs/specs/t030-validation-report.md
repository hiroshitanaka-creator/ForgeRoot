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

## Second post-review round (Codex review, 2026-07-03, on the fix commit itself)

Codex re-reviewed the fix commit and flagged 6 more issues (4 shared with `digest.ts`, listed once here and once there); all confirmed and fixed:

| Finding | Fix |
|---|---|
| The new collision-safe `stableId` hashed the raw, caller-supplied `r.source` object instead of the normalized `source` the manifest actually emits, so two calls describing the same source with keys in a different order (or with an extra ignored field) produced different `update_id`s | `source` is now built once as a local variable and both the hash input and the emitted `update.source` reuse that same canonical object |
| `keep_last_accepted` / `keep_last_rejected` accepted negative or non-integer values with no validation | `validateWorkingMemoryUpdate` now requires non-negative integers for both fields; creation only supplies the default 10 when the field is entirely absent, so a bad value present in the input is preserved and rejected rather than silently replaced |
| `source.pr_number` accepted negative/non-integer values with no validation | Must now be `null` or a positive integer |
| `validateWorkingMemoryUpdate` never checked `provenance` at all, so a stripped or hand-authored `provenance: {}` still validated `ok: true` | Now requires non-empty `provenance.generated_by` and `provenance.task` |

Regression tests added: key-order/extra-field independence of `update_id`, negative/non-integer retention counts rejected, negative `source.pr_number` rejected, `null` `source.pr_number` still allowed, stripped `provenance` rejected. Re-verified: `node --test --test-force-exit packages/memory/tests/*.test.mjs` (35/35 pass across working+digest), adjacent `planner`/`executor`/`auditor`/`forge-demo` suites (84/84 pass, no regressions), `npx tsc -p packages/memory/tsconfig.json` (clean).

## Third post-review round (Codex review, 2026-07-04, on the second fix commit)

Codex flagged 4 more issues (2 shared with `digest.ts`); all confirmed and fixed:

| Finding | Fix |
|---|---|
| `isSorted`/`uniqueSorted` used `String.prototype.localeCompare` with no explicit locale, so fact-tag ordering (and therefore `stableId`'s input) could differ across hosts with different default ICU locales | Both now use plain codepoint (`<`/`>`) comparison, which is locale-independent per the ECMA-262 spec, matching the approach already used in `digest.ts` |
| `UTC_RE` only checked digit positions/shape, so calendar-impossible timestamps like `2026-13-99T99:99:99Z` were accepted | Replaced with `isValidRfc3339Utc`, which captures the numeric fields and range-checks month/day (via `Date.UTC(year, month, 0)` day-count, which correctly handles leap years)/hour/minute/second |
| `SECRET_RE`'s bare `TOKEN` alternative matched the substring anywhere in any string value, so ordinary facts merely mentioning something like "token_source" were rejected as secret-like | Split into `SECRET_FIELD_RE` (broad word match, applied only to field **names**) and `SECRET_VALUE_RE` (shaped-secret patterns only, applied to string **values**) |
| `update_id` was derived from `source`/`facts`/`created_at` only, ignoring `target`, so two updates for different `target.mind_id` with the same source/facts/timestamp collided on the same id | `target` is now included in the `stableId` input |

Regression tests added: `update_id` differs across distinct targets, impossible calendar timestamp rejected, real leap-day accepted vs. non-leap-year Feb 29 rejected, ordinary text mentioning "token" no longer rejected, tag ordering is ordinal not locale-collated. Re-verified: `node --test --test-force-exit packages/memory/tests/*.test.mjs` (43/43 pass across working+digest), adjacent `planner`/`executor`/`auditor`/`forge-demo` suites (84/84 pass, no regressions), `npx tsc -p packages/memory/tsconfig.json` (clean).
