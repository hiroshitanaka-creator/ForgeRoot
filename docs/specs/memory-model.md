# Memory Model

**Task:** T029  
**Status:** Implemented  
**Last updated:** 2026-06-17

---

## Purpose

Define the four-layer memory model for ForgeRoot Phase 2. This document establishes:

- What each memory layer is and what it holds
- Which layer is the source of truth
- How each layer is updated and approved
- What the boundaries between `.forge` inline memory and pack memory are
- Why runtime DB and vector index are derived state, not source of truth

---

## Non-goals

This document does NOT cover:

- MemoryKeeper agent implementation
- Semantic retrieval or vector indexing
- Archive packer implementation
- Eval score computation or fitness evaluation
- Self-evolution or autonomous federation
- Live GitHub API transport

---

## Source of Truth Rule

**The `.forge` genome and reviewable pull requests are the authoritative memory surface.**

Any runtime database, in-process cache, or vector index is a **reconstructible derivative**. If a runtime store is lost or corrupted, it must be rebuildable from `.forge` files and git history. No derivative store may override or supersede what is recorded in the canonical memory surface.

Curated memory updates that change the canonical memory surface **must move through a pull request**. There is no exception to this rule for Phase 2.

---

## Four Memory Layers

### Working Memory

| Attribute | Value |
|---|---|
| Role | Short-term, high-churn fact accumulation for the active session or task |
| Source of truth | `.forge` inline memory (via PR) |
| Update method | `createWorkingMemoryUpdate` → manifest → PR review |
| Approval class | B (normal code change) |
| Retention | Configurable TTL (default 90 days); keep_last_accepted/rejected controls |
| Source refs | `task_id`, `artifact_sha256`, `reason` all required |
| .forge boundary | Inline working facts committed to `.forge` memory surface via PR |
| Derived state | Runtime DB may cache working memory for read performance; it is not authoritative |

Working memory holds task-scoped facts: observations, decisions, intermediate conclusions. It is the most volatile layer. Facts expire based on TTL and keep-last settings. Deduplication is deterministic (first-occurrence wins, normalized by id). Ordering is stable-sorted by id.

### Episodic Heads

| Attribute | Value |
|---|---|
| Role | Canonical heads of episodic event records; one per completed task/PR outcome |
| Source of truth | `.forge` episodic layer (via PR) |
| Update method | `createEpisodeDigest` → manifest → PR review |
| Approval class | B |
| Retention | `preserve_rejected: true`, `preserve_blocked: true` (negative outcomes mandatory) |
| Source refs | `task_id`, `artifact_sha256` required; PR/audit/commit optional but encouraged |
| .forge boundary | Head records committed inline; packs stored separately (T032) |
| Derived state | Vector index may index episode summaries for retrieval; it is not authoritative |

Episodic heads record what happened: accepted tasks, rejected proposals, blocked inputs, quarantined artifacts, failed executions, and reverted changes. All outcome types are first-class memory events. Selective erasure of negative outcomes is prohibited.

### Episodic Packs

| Attribute | Value |
|---|---|
| Role | Compressed, archivable bundles of episodic heads for long-term retention |
| Source of truth | Pack files committed to git (via PR) |
| Update method | Archive packer (T032, not yet implemented) |
| Approval class | B |
| Retention | Permanent unless explicitly pruned via PR |
| Source refs | Inherited from packed episode heads |
| .forge boundary | Packs are separate artifacts from inline `.forge` memory |
| Derived state | Pack index may be cached at runtime; packs themselves are authoritative |

Episodic packs are the answer to the question: "what did ForgeRoot know and do across many tasks?" They are not yet implemented (see T032). The boundary between inline episodic heads and packs is: heads are active (recent, frequently read), packs are archived (older, read infrequently). The `pack_candidate` field on an EpisodeDigest signals readiness for packing.

### Semantic Digests

| Attribute | Value |
|---|---|
| Role | Distilled, high-confidence knowledge claims extracted from episodic memory |
| Source of truth | `.forge` semantic layer (via PR) |
| Update method | Semantic retrieval adapter (T033, not yet implemented) |
| Approval class | B or C depending on scope |
| Retention | Stable until superseded by newer distillation |
| Source refs | Must trace back to one or more episodic heads |
| .forge boundary | Semantic claims committed inline; sourced from episodes |
| Derived state | Vector embeddings are derived from semantic digests; digests are authoritative |

Semantic digests are the "what ForgeRoot knows" layer — stable facts extracted from patterns across episodic memory. They are not yet implemented (see T033). Unlike working memory (volatile) and episodic heads (append-only event log), semantic digests are meant to be the stable knowledge base that survives task churn.

---

## Runtime DB and Vector Index are Derived State

This is a non-negotiable invariant:

> **A runtime database or vector index is a cache, not a truth store.**

Rationale:

1. **Reconstructibility**: If the runtime DB is lost, ForgeRoot must be able to rebuild agent memory from `.forge` files and git history without data loss.
2. **Auditability**: Every memory update must have a PR-tracked provenance chain. Runtime DB writes are not auditable as PRs.
3. **Conflict resolution**: When a conflict exists between the runtime DB and the `.forge` canonical surface, `.forge` wins.
4. **Self-evolution guard**: Allowing runtime DB to be authoritative would create a path for agents to mutate their own memory without human review.

---

## Memory Update Approval Classes

| Class | When to use |
|---|---|
| A | Documentation-only memory changes, test fixtures |
| B | Working memory updates, episode digests, semantic digest additions |
| C | Memory policy changes, schema changes to memory manifests |
| D | (not used for memory — reserved for branch protection and federation) |

All Phase 2 memory updates default to class B (requires one human approval, auto-PR allowed).

---

## Direct Write Prohibition

No agent may write directly to the `.forge` memory surface at runtime. The `guards.no_direct_forge_write: true` field in every memory manifest records this invariant. Violations are a breach of the `curated-memory-update-requires-pr` policy rule.

---

## Source Refs and Artifact Hashes

Every memory manifest — working update or episode digest — must carry:

- `source.task_id` — starts with `T`, identifies the originating task
- `source.artifact_sha256` — `sha256:<64 hex>` of the source artifact being recorded
- `source.reason` (working memory) — human-readable reason for the update

Missing source refs are a hard validation failure. The manifest writer (`createWorkingMemoryUpdate`, `createEpisodeDigest`) rejects inputs without these fields. Missing source refs must not be guessed or inferred.

---

## Relationship to Eval and Provenance

Memory and evaluation are **separate concerns**:

- Memory records **what happened** (facts, episodes, outcomes).
- Eval records **how good** a proposal was (fitness scores, acceptance rates).
- Provenance records **where things came from** (source artifact lineage).

Memory manifests must not contain eval scores. Eval pipelines may consume memory as input, but they must not write eval results back into memory manifests. This separation preserves the integrity of the episodic record and prevents circular feedback loops.

---

## T029 Acceptance Criteria

- [x] Four memory layers defined with roles, update methods, approval classes, and retention rules
- [x] Source-of-truth rule stated: `.forge` + PR is authoritative
- [x] Runtime DB / vector index explicitly labeled as derived state
- [x] Curated memory update via PR is explicit and mandatory
- [x] Direct write prohibition documented
- [x] Source refs (task_id, artifact_sha256) documented as mandatory
- [x] Memory and eval separation documented
- [x] Rejected / blocked episodes documented as preserved first-class events
- [x] `.forge/policies/memory.forge` created with six rules covering all the above
