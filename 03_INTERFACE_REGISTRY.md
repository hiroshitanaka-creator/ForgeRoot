# ForgeRoot Interface Registry

This file is the canonical registry of inter-agent data contracts in ForgeRoot. It is the source of truth for what each agent produces and consumes.

**Last updated:** 2026-06-17 (T029–T033 Memory Foundation)

---

## Pipeline Overview

```
Issue / Trigger
  → planner.alpha       (produces: plan_spec)
  → executor.alpha      (produces: sandbox_execution_request, sandbox_observed_output)
  → auditor.alpha       (produces: audit_result, pr_composition_gate_decision)
  → pr-composer.alpha   (produces: pull_request_composition, pull_request_body)
  → github-pr-adapter.alpha  (produces: github_pull_request_creation_request)
  → approval-checkpoint.alpha (produces: trusted_transport_authorization)
  → rate-governor.alpha  (produces: rate_governor_dispatch_decision)
  → [trusted transport worker — not yet implemented]
```

---

## Artifact Contracts

### `plan_spec`

**Produced by:** planner.alpha  
**Consumed by:** executor.alpha, auditor.alpha, pr-composer.alpha

Fields: task_id, title, scope, mutable_paths, immutable_paths, acceptance_criteria, approval_class, risk_class

---

### `branch_worktree_plan`

**Produced by:** planner.alpha  
**Consumed by:** executor.alpha, auditor.alpha, pr-composer.alpha

Fields: branch_name, base_ref, worktree_path

---

### `sandbox_execution_request`

**Produced by:** executor.alpha  
**Consumed by:** auditor.alpha, pr-composer.alpha

Fields: commands_run, files_changed, test_results_summary, exit_codes

---

### `sandbox_observed_output`

**Produced by:** executor.alpha  
**Consumed by:** auditor.alpha, pr-composer.alpha

Fields: stdout_digest, stderr_digest, changed_paths, test_pass_count, test_fail_count

---

### `audit_result`

**Produced by:** auditor.alpha  
**Consumed by:** pr-composer.alpha

Fields: verdict (pass | fail | inconclusive), evidence_summary, allow_pr_composition (bool), risk_assessment, policy_checks

---

### `pr_composition_gate_decision`

**Produced by:** auditor.alpha  
**Consumed by:** pr-composer.alpha (gate)

Fields: allowed (bool), reason

---

### `pull_request_composition`

**Produced by:** pr-composer.alpha  
**Consumed by:** github-pr-adapter.alpha

Fields: title, body, head_branch, base_branch, labels, draft (bool), approval_class, provenance_summary

---

### `pull_request_body`

**Produced by:** pr-composer.alpha  
**Consumed by:** github-pr-adapter.alpha (embedded in composition)

Markdown string: reviewer summary, audit gate summary, provenance, approval class, risk, scope.

---

### `github_pull_request_creation_request`

**Produced by:** github-pr-adapter.alpha  
**Consumed by:** approval-checkpoint.alpha

Fields: owner, repo, title, body, head, base, labels, draft, installation_id, token_source (must be `github_app_installation`)

---

### `trusted_transport_authorization`

**Produced by:** approval-checkpoint.alpha  
**Consumed by:** rate-governor.alpha

Fields: decision (authorized | held | quarantined | invalidated), approval_class, human_approver (nullable), checkpoint_id, issued_at

---

### `rate_governor_dispatch_decision`

**Produced by:** rate-governor.alpha  
**Consumed by:** [trusted transport worker]

Fields: action (dispatch | queue | block | cooldown), dispatch_at (timestamp), retry_after (nullable), lane_id, checkpoint_id

---

## Safety Invariants

- Every pipeline execution produces exactly one `pull_request_composition` (one_task_one_pr).
- `github_pull_request_creation_request.token_source` must always be `github_app_installation`.
- `trusted_transport_authorization.decision == authorized` requires non-self human approval for class B, C, D surfaces.
- `rate_governor_dispatch_decision.action != dispatch` if `retry_after` is set.
- No agent in the pipeline performs live GitHub API transport. Only the downstream trusted transport worker (not yet implemented) may do so.

---

## packages/memory

**Phase 2 Memory Foundation — T029–T033**

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| `createWorkingMemoryUpdate(input, options?)` | T030 | source refs (task_id, artifact_sha256, reason) + facts array | `WorkingMemoryUpdate` manifest | `.forge` direct write; GitHub API; eval score |
| `validateWorkingMemoryUpdate(update)` | T030 | `WorkingMemoryUpdate` manifest | `{ ok, issues? }` validation result | guessed source refs; secret-like keys |
| `createEpisodeDigest(input, options?)` | T031 | PR/audit/outcome refs + episode metadata | `EpisodeDigest` manifest | source-less digest; guessed source refs |
| `validateEpisodeDigest(digest)` | T031 | `EpisodeDigest` manifest | `{ ok, issues? }` validation result | missing source guessing; preserve_rejected:false |
| `createMemoryArchivePack(input, options?)` | T032 | source refs + records array | `MemoryArchivePack` manifest with `raw_jsonl_sha256` | live zstd compression; GitHub API; destructive delete |
| `validateMemoryArchivePack(pack)` | T032 | `MemoryArchivePack` manifest | `{ ok, issues? }` validation result | secret/destructive keys; `compression_performed:true` |
| `verifyMemoryArchivePack(pack, records)` | T032 | pack manifest + raw record refs | `{ ok, verified_count?, issues? }` | tamper tolerance; missing record tolerance |
| `createMemoryRetrievalRequest(input, options?)` | T033 | query text + intent + optional token_budget | `MemoryRetrievalRequest` | negative budget; secret keys |
| `retrieveMemoryContext(input, options?)` | T033 | query + candidates + optional missing_memory | `MemoryRetrievalResult` with ranked items | vector DB; embedding providers; memory mutation |
| `validateMemoryRetrievalResult(value)` | T033 | `MemoryRetrievalResult` manifest | `{ ok, issues? }` validation result | vector_index_used:true; invented missing_memory values |

### Memory Invariants

- `working_memory_update.approval.direct_write_allowed` is always `false`
- `working_memory_update.approval.update_requires_pr` is always `true`
- `episode_digest.retention.preserve_rejected` is always `true`
- `episode_digest.retention.preserve_blocked` is always `true`
- All manifest types carry `guards.no_eval_score_update: true` and `guards.no_github_api_call: true`
- `memory_archive_pack.pack.compression_performed` is always `false`
- `memory_archive_pack.guards.no_destructive_delete` is always `true`
- `memory_retrieval_result.derived_indexes.*` are all always `false`
- Runtime DB and vector index are derived state — `.forge` + PR is the authoritative memory surface
- Missing `source.task_id` or `source.artifact_sha256` always causes rejection
- Retrieved items are never mutated, synthesized, or invented
