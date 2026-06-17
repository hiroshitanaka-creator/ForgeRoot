# T031 Validation Report — Episode Digest Manifest

**Task:** T031  
**Date:** 2026-06-17  
**Branch:** claude/forgeroot-phase2-memory-foundation-452n2t

---

## Scope

T031 implements the deterministic episode digest manifest writer and validator. This includes:

- `createEpisodeDigest(input, options?)` — builds an `EpisodeDigest` from source refs and episode metadata
- `validateEpisodeDigest(value)` — validates an existing digest against the full schema

All seven episode outcome types are first-class: `accepted`, `rejected`, `blocked`, `quarantined`, `failed`, `reverted`, `unknown`.

---

## Files Changed

| File | Status | Notes |
|---|---|---|
| `packages/memory/src/digest.ts` | Created | Core implementation |
| `packages/memory/src/index.ts` | Created | Re-exports (shared with T030) |
| `packages/memory/tests/digest.test.mjs` | Created | 24 test cases |
| `docs/specs/episode-digest.md` | Created | Spec document |
| `docs/specs/t031-validation-report.md` | Created | This file |

---

## Acceptance Coverage

| Criterion | Status | Evidence |
|---|---|---|
| `packages/memory/src/digest.ts` exists | PASS | File created |
| `createEpisodeDigest` exported | PASS | `src/index.ts` re-exports |
| `validateEpisodeDigest` exported | PASS | `src/index.ts` re-exports |
| Valid accepted digest accepted | PASS | test: "create: valid accepted digest produces ok result" |
| Valid rejected digest accepted | PASS | test: "create: valid rejected digest is accepted as first-class memory event" |
| Valid blocked digest accepted | PASS | test: "create: valid blocked digest is accepted as first-class memory event" |
| quarantined/failed/reverted valid | PASS | test: "create: quarantined, failed, reverted episode types are valid" |
| Missing artifact_sha256 rejected | PASS | test: "create: missing artifact_sha256 is rejected" |
| Missing task_id rejected | PASS | test: "create: missing task_id is rejected" |
| unknown type requires unknown reliability | PASS | test: "create: episode type unknown requires reliability unknown" |
| unknown type + unknown reliability valid | PASS | test: "create: unknown type with unknown reliability is valid" |
| Summary cap 1200 chars | PASS | test: "create: summary exceeding 1200 chars is rejected" |
| Summary at exactly 1200 accepted | PASS | test: "create: summary at exactly 1200 chars is accepted" |
| Title cap 160 chars | PASS | test: "create: title exceeding 160 chars is rejected" |
| Related IDs sorted and deduped | PASS | test: "create: related IDs in links are sorted and deduplicated" |
| Secret-like key rejected | PASS | test: "create: secret-like key in input is rejected" |
| Secret-like value rejected | PASS | test: "create: secret-like value in input is rejected" |
| preserve_rejected always true | PASS | test: "validate: preserve_rejected:false fails" |
| preserve_blocked always true | PASS | retention object always sets both |
| source refs required | PASS | `guards.source_refs_required: true` enforced |
| no_missing_source_guessing | PASS | `guards.no_missing_source_guessing: true` enforced |
| no eval score | PASS | `guards.no_eval_score_update: true` enforced |
| no GitHub API call | PASS | Implementation has no network calls |

### Validation-specific

| Criterion | Status | Evidence |
|---|---|---|
| Valid accepted digest passes | PASS | test: "validate: valid accepted digest passes" |
| Valid rejected digest passes | PASS | test: "validate: valid rejected digest passes" |
| Valid blocked digest passes | PASS | test: "validate: valid blocked digest passes" |
| Wrong manifest_version fails | PASS | test: "validate: wrong manifest_version fails" |
| Missing artifact_sha256 fails | PASS | test: "validate: missing artifact_sha256 fails" |
| preserve_rejected:false fails | PASS | test: "validate: preserve_rejected:false fails" |
| Unsorted related_plan_ids fails | PASS | test: "validate: unsorted related_plan_ids fails" |
| unknown with non-unknown reliability fails | PASS | test: "validate: type unknown with non-unknown reliability fails" |
| Secret-like key in digest fails | PASS | test: "validate: secret-like key in digest object fails" |

---

## Commands Run

| Command | Result | Reason if not run |
|---|---|---|
| `npm run build` (packages/memory) | Pass — no TypeScript errors | Build step before tests |
| `node --test --test-force-exit packages/memory/tests/*.test.mjs` | 46 pass, 0 fail | Full test suite (T030 + T031) |
| `node --test --test-force-exit packages/planner/tests/*.test.mjs` | 23 pass, 0 fail | Regression |
| `node --test --test-force-exit packages/executor/tests/*.test.mjs` | 21 pass, 0 fail | Regression |
| `node --test --test-force-exit packages/auditor/tests/*.test.mjs` | 32 pass, 0 fail | Regression |
| `node --test --test-force-exit packages/forge-demo/tests/run.test.mjs` | 8 pass, 0 fail | Regression |
| `cargo test --manifest-path crates/forge-kernel/Cargo.toml` | 20 pass, 0 fail | Regression |

---

## Explicit Non-goals Preserved

- Does not write to `.forge` directly
- Does not call GitHub APIs
- Does not implement MemoryKeeper agent
- Does not compute eval scores
- Does not generate code mutations
- Does not implement semantic retrieval
- Does not implement archive packing
- Does not enable self-evolution
- Does not infer or guess missing source refs

---

## Remaining Risks

- `commit_sha` and `audit_id` in the source block are optional. Future tasks may require one of these for certain episode types (e.g., `reverted` should probably carry a `commit_sha`).
- `pack_candidate` is a boolean flag but there is no packer to read it yet. The T032 archive packer must consume this flag.
- The `digest_id` is currently generated with timestamp + random component, which means two calls with identical inputs at the same millisecond could theoretically produce different IDs. If strict content-addressing is required, a future task should add a sha256 of canonical digest content as the ID.

---

## Follow-up Tasks

- T032 — Episodic archive packer (reads `pack_candidate`)
- T033 — Semantic retrieval adapter
- T036 — Merge outcome collector (populates `pr_number`, `commit_sha`)
- T039 — Provenance writer (generates `artifact_sha256`)
