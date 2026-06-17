# T029 Validation Report — Memory Partition Contract

**Task:** T029  
**Date:** 2026-06-17  
**Branch:** claude/forgeroot-phase2-memory-foundation-452n2t

---

## Scope

T029 establishes the four-layer memory model contract for ForgeRoot Phase 2. It covers:

- Definition of Working Memory, Episodic Heads, Episodic Packs, and Semantic Digests
- Source-of-truth rules (`.forge` + PR is authoritative)
- Derived-state declaration for runtime DB and vector index
- Curated memory update requirements (PR mandatory)
- Source ref obligations (task_id, artifact_sha256 required)
- Memory/eval separation
- Rejection and blocking of memory events as preserved first-class records
- Memory policy in `.forge/policies/memory.forge`

---

## Files Changed

| File | Status | Notes |
|---|---|---|
| `docs/specs/memory-model.md` | Created | T029 memory model document |
| `.forge/policies/memory.forge` | Created | Six memory governance rules |
| `docs/specs/working-memory-update.md` | Created | T030 spec (cross-task artifact) |
| `docs/specs/episode-digest.md` | Created | T031 spec (cross-task artifact) |
| `docs/specs/t029-validation-report.md` | Created | This file |
| `02_REPO_MAP.md` | Updated | packages/memory added |
| `03_INTERFACE_REGISTRY.md` | Updated | memory API surface added |

---

## Acceptance Coverage

| Criterion | Status | Evidence |
|---|---|---|
| Four memory layers defined | PASS | `docs/specs/memory-model.md` §Four Memory Layers |
| Working Memory documented | PASS | Layer table with role, approval class, retention |
| Episodic Heads documented | PASS | Layer table with preserve_rejected/blocked |
| Episodic Packs documented | PASS | Layer table noting T032 dependency |
| Semantic Digests documented | PASS | Layer table noting T033 dependency |
| Runtime DB is derived state | PASS | `docs/specs/memory-model.md` §Runtime DB... |
| Vector index is derived state | PASS | Same section |
| Curated memory update via PR | PASS | §Direct Write Prohibition + policy rule |
| Source refs mandatory | PASS | §Source Refs and Artifact Hashes |
| Memory/eval separation | PASS | §Relationship to Eval and Provenance |
| Rejected events preserved | PASS | Episodic Heads table + policy rule |
| Blocked events preserved | PASS | Same |
| `.forge/policies/memory.forge` created | PASS | Six rules covering all model invariants |
| Constitution unchanged | PASS | `.forge/policies/constitution.forge` not modified |
| Agent genomes unchanged | PASS | `.forge/agents/**` not modified |
| `.forge/mind.forge` unchanged | PASS | Not modified |

---

## Commands Run

| Command | Result | Reason if not run |
|---|---|---|
| `node --test --test-force-exit packages/memory/tests/*.test.mjs` | 46 pass, 0 fail | Run after T030/T031 implementation |
| `node --test --test-force-exit packages/planner/tests/*.test.mjs` | 23 pass, 0 fail | Regression check |
| `node --test --test-force-exit packages/executor/tests/*.test.mjs` | 21 pass, 0 fail | Regression check |
| `node --test --test-force-exit packages/auditor/tests/*.test.mjs` | 32 pass, 0 fail | Regression check |
| `node --test --test-force-exit packages/forge-demo/tests/run.test.mjs` | 8 pass, 0 fail | Regression check |
| `cargo test --manifest-path crates/forge-kernel/Cargo.toml` | 20 pass, 0 fail | Regression check |

---

## Explicit Non-goals Preserved

- MemoryKeeper agent not implemented
- Semantic retrieval not implemented
- Archive packer not implemented
- Eval score computation not implemented
- Self-evolution not enabled
- Federation not configured
- No live GitHub API calls made

---

## Remaining Risks

- `.forge/policies/memory.forge` uses `policy_type: memory` which is an extension of the policy enum. If `forge-kernel` strictly validates `policy_type` against a fixed allowlist, this file may fail schema validation. All existing tests pass, suggesting the current validator accepts the new policy_type. A follow-up (T041-type task) should formally extend the schema enum if needed.
- Episodic Packs (T032) and Semantic Digests (T033) are documented but not yet implemented. Their boundaries are defined but not enforced at the code level.

---

## Follow-up Tasks

- T032 — Episodic archive packer
- T033 — Semantic retrieval adapter
- T036 — Merge outcome collector
- T039 — Provenance writer
