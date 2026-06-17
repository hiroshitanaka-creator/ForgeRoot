# Thread Handoff — After T029–T031 Memory Foundation

**Date:** 2026-06-17  
**Branch:** claude/forgeroot-phase2-memory-foundation-452n2t  
**PR title:** feat(memory): add Phase 2 memory foundation manifests

---

## What Was Completed in This Session

### T029 — Memory Partition Contract

- `docs/specs/memory-model.md` — four-layer memory model fully documented
- `.forge/policies/memory.forge` — six memory governance rules:
  - `memory-source-of-truth`
  - `curated-memory-update-requires-pr`
  - `source-refs-required`
  - `rejected-and-blocked-events-preserved`
  - `runtime-db-derived-only`
  - `memory-eval-separation`

### T030 — Working Memory Update Manifest

- `packages/memory/src/working.ts` — `createWorkingMemoryUpdate` + `validateWorkingMemoryUpdate`
- 22 test cases, all passing
- Deterministic fact deduplication, sorting, tag normalization
- Hard rejection of missing source refs, secret-like keys, max_items overflow

### T031 — Episode Digest Manifest

- `packages/memory/src/digest.ts` — `createEpisodeDigest` + `validateEpisodeDigest`
- 24 test cases, all passing
- All 7 episode types accepted as first-class memory events
- Summary cap (1200 chars), title cap (160 chars), related ID sorting enforced
- Secret-like keys and values rejected

---

## Test Results at Handoff

| Suite | Pass | Fail |
|---|---|---|
| `packages/memory` (T030 + T031) | 46 | 0 |
| `packages/planner` | 23 | 0 |
| `packages/executor` | 21 | 0 |
| `packages/auditor` | 32 | 0 |
| `packages/forge-demo` | 8 | 0 |
| `crates/forge-kernel` | 20 | 0 |
| **Total** | **150** | **0** |

---

## Unchanged and Verified Safe

| Path | Status |
|---|---|
| `.github/**` | Not modified |
| `.forge/mind.forge` | Not modified |
| `.forge/agents/**` | Not modified |
| `.forge/policies/constitution.forge` | Not modified |
| `packages/planner/**` | Not modified |
| `packages/executor/**` | Not modified |
| `packages/auditor/**` | Not modified |
| `packages/pr-composer/**` | Not modified |
| `packages/github-pr-adapter/**` | Not modified |
| `packages/approval-checkpoint/**` | Not modified |
| `packages/rate-governor/**` | Not modified |
| `packages/forge-demo/**` | Not modified |
| `schemas/forge-v1.schema.json` | Not modified |

---

## What Was Explicitly NOT Done

- MemoryKeeper agent implementation
- Eval score computation or fitness evaluation
- Self-evolution or autonomous federation
- Archive packer (T032)
- Semantic retrieval adapter (T033)
- Vector DB integration
- Runtime DB as memory source of truth
- Live GitHub API transport

---

## Recommended Next Tasks

These are the logical next steps after T029–T031. Do NOT begin self-evolution tasks until the memory/eval/provenance pipeline is complete.

### T032 — Episodic Archive Packer

Implement `packages/memory/src/packer.ts` (or a new `packages/episodic-packer` package). Reads `EpisodeDigest` objects flagged with `pack_candidate: true` and bundles them into deterministic pack files committed to git.

- Inputs: one or more `EpisodeDigest` manifests with `pack_candidate: true`
- Output: a deterministic pack artifact (JSON bundle + sha256)
- Constraint: does not delete episode heads from `.forge` inline memory until pack is confirmed committed

### T033 — Semantic Retrieval Adapter

Implement a read-only adapter that indexes `EpisodeDigest` and `WorkingMemoryFact` records for retrieval. The adapter reads from the canonical `.forge` memory surface; it does not write back.

- Inputs: episode digests and working memory updates (from git-committed records)
- Output: retrieval results (by tag, task_id, reliability, etc.)
- Constraint: vector index is derived state; adapter must never be treated as authoritative

### T036 — Merge Outcome Collector

Implement a pipeline stage that, after a PR is merged, collects the outcome (accepted/rejected/merged/reverted) and generates an `EpisodeDigest` with the PR number, commit SHA, and audit ID populated.

- Inputs: PR merge event or audit_result artifact
- Output: `EpisodeDigest` with `type: "accepted"` (or `"reverted"` if later reverted)
- Integration point with T030 working memory: triggers a working memory update on merge

### T039 — Provenance Writer

Implement a provenance writer that computes `artifact_sha256` for any artifact (plan spec, audit result, PR composition) and produces a provenance record linking the artifact to its source task and PR.

- Required before working memory updates can be fully automated (currently `artifact_sha256` must be supplied by the caller)
- Constraint: does not infer or guess artifact content; must have access to the actual artifact bytes

---

## Notes for the Next Thread

1. The `packages/memory` build artifact is in `packages/memory/dist/`. Run `npm run build` before running tests if source has changed.
2. The `policy_type: memory` in `.forge/policies/memory.forge` is an extension not yet in the `forge-v1.schema.json` enum. If `forge-kernel` enforces strict enum validation for `policy_type`, a schema update task is needed. Current tests pass because the kernel's shape validator does not yet enforce a fixed enum for `policy_type`.
3. `digest_id` uses timestamp + random — not content-addressed. If strict reproducibility is needed for digest IDs, T032 or T039 should add content-based addressing.
4. The `secrets` scanner in `digest.ts` checks both key names and string values. The scanner in `working.ts` checks only key names. This asymmetry is intentional (T031 spec says "no secret-like fields or values"; T030 spec says "no secret-like key names"). Verify this remains correct if the specs converge.
