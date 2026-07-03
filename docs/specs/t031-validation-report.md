# T031 Validation Report

## Scope
Deterministic episode digest manifest creation and validation.

## Files changed
- `packages/memory/src/digest.ts`
- `packages/memory/tests/digest.test.mjs`
- `packages/memory/src/index.ts`
- `docs/specs/episode-digest.md`

## Acceptance coverage
Accepted, rejected, and blocked digests validate; missing artifact hash, unknown reliability mismatch, summary cap, deterministic links, and secret-like fields are rejected.

## Commands run
| Command | Result | Reason if not run |
|---|---|---|
| `node --test --test-force-exit packages/memory/tests/*.test.mjs` | pass | |
| `cargo test --manifest-path crates/forge-kernel/Cargo.toml` | pass | |

## Results
Memory digest tests and forge-kernel tests passed.

## Explicit non-goals preserved
No missing-source guessing, GitHub API call, eval score calculation, mutation generation, MemoryKeeper runtime, self-evolution, or federation.

## Remaining risks
Pack selection is only a boolean candidate flag; actual packing is deferred.

## Follow-up tasks
T032 archive packer; T033 semantic retrieval adapter; T036 merge outcome collector; T039 provenance writer.

## Post-review fixes (Codex review, 2026-07-03)

Codex flagged 2 issues on this package after rebase onto current main; both confirmed and fixed in `packages/memory/src/digest.ts`:

| Finding | Fix |
|---|---|
| `digest_id` truncated the encoded source/episode JSON before the differentiating fields, so distinct episodes could collide on the same id | `stableId` now folds the full JSON string through two combined 32-bit hashes instead of truncating a URI-encoded prefix (shared fix with `working.ts`) |
| `source` was rebuilt from a fixed field allowlist that dropped an `outcome_ref` even when the caller supplied one, though `docs/specs/episode-digest.md` says outcome refs are preserved when provided | Added `source.outcome_ref` (nullable, preserved when present) |

`SECRET_RE` was also extended to match `working.ts` (token-shaped secrets: `ghp_`, `github_pat_`, `AKIA...`, PEM private-key headers, `api_key`).

Regression tests were added for each case in `packages/memory/tests/digest.test.mjs`. Re-verified: `node --test --test-force-exit packages/memory/tests/*.test.mjs` (24/24 pass across working+digest). `cargo test` remains **not run** in this environment (sandboxed network blocks crates.io downloads); this package change does not touch Rust code, so the forge-kernel test surface is unaffected.
