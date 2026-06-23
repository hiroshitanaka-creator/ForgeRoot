# Memory Model

## Purpose
Define ForgeRoot's minimum Phase 2 memory partition contract before any MemoryKeeper runtime exists.

## Non-goals
No semantic retrieval, archive packer, evaluator, federation, self-evolution, live GitHub mutation, runtime DB authority, or direct `.forge` memory write is introduced.

## Source of truth rule
`.forge` is the genome and curated memory surface. A curated memory update must move through PR review before it can become source truth. Runtime DBs, caches, and vector indexes are derived state only and may be rebuilt from repository artifacts.

## Four memory layers

### Working Memory
Role: short-lived current facts for active planning. Source-of-truth: only accepted repository artifacts after PR. Update method: `working_memory_update` manifest, then PR. Approval class: B by default, C when broader policy impact exists. Retention/TTL: explicit `ttl_days` and keep-last metadata. Source refs: task id, artifact hash, reason, and fact refs mandatory. Boundary: small inline `.forge` candidates only; bulk history belongs in packs.

### Episodic Heads
Role: compact heads for accepted, rejected, blocked, quarantined, failed, reverted, and unknown outcomes. Source-of-truth: PR-accepted digest artifacts. Update method: `episode_digest` manifest, then PR. Approval class: B. Retention/TTL: preserve rejected and blocked events; pack candidates may later move to packs. Source refs: task, PR/audit/outcome, and artifact hash mandatory. Boundary: head metadata may be inline; full bodies move to packs.

### Episodic Packs
Role: larger archive records for old or bulky episodes. Source-of-truth: pack files committed through PR. Update method: future T032 packer only. Approval class: B or C. Retention/TTL: long-lived unless policy expires. Source refs: mandatory hashes back to source artifacts. Boundary: pack memory is not inline `.forge` working memory.

### Semantic Digests
Role: curated abstractions distilled from source-backed episodes. Source-of-truth: committed digest artifacts, not embeddings. Update method: future digest curation PR. Approval class: C when it affects behavior. Retention/TTL: explicit policy per digest. Source refs: mandatory backreferences to source episodes and hashes. Boundary: vector index rows are derived from semantic digests, never authoritative.

## Runtime DB and vector index are derived state
Runtime DB is not source of truth. Vector index is not source of truth. Both are disposable projections of repository state.

## Memory update approval classes
Class A may cover documentation-only low-risk references, B covers ordinary memory manifests, C covers behavior-shaping memory policy or broad digests, and D is reserved for critical governance. Approval never bypasses PR for curated memory.

## Direct write prohibition
Agents and runtimes must not directly mutate `.forge` memory. They may produce manifests for review.

## Source refs and artifact hashes
Source refs are mandatory. Missing task ids, artifact hashes, or outcome refs must be rejected rather than guessed.

## Relationship to eval and provenance
Memory and eval are separate. Memory preserves events and provenance; it does not calculate eval scores. Provenance links memory to source artifacts.

## T029 acceptance criteria
Four layers are separated; runtime DB and vector DB are explicitly derived; curated memory update via PR is explicit; rejected and blocked events are preserved; source refs are mandatory.
