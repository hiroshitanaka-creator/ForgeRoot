# ForgeRoot Interface Registry

This file is the canonical registry of inter-agent data contracts in ForgeRoot. It is the source of truth for what each agent produces and consumes.

**Last updated:** 2026-07-07 (T069 post-merge source-of-truth normalization)

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

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| createWorkingMemoryUpdate(input) | T030 | source refs + facts | working memory update manifest | .forge direct write |
| validateWorkingMemoryUpdate(update) | T030 | update manifest | validation result | guessed source refs |
| createEpisodeDigest(input) | T031 | PR/audit/outcome refs | episode digest | source-less digest |
| validateEpisodeDigest(digest) | T031 | digest manifest | validation result | missing source guessing |
| createArchivePack(input) / packMemoryRecords(input) | T032 | source-backed memory records | archive pack manifest + canonical JSONL | external storage authority |
| validateArchivePack(pack) | T032 | archive pack manifest | validation result | record-count/hash drift |
| retrieveMemoryContext(input) | T033 | memory artifacts + token budget | bounded retrieval context manifest | vector DB authority |
| validateMemoryContext(context) | T033 | retrieval context manifest | validation result | source-ref loss |

### Memory foundation invariants

- `packages/memory` produces deterministic artifacts only.
- Runtime DBs and vector indexes remain derived state, not memory source of truth.
- The package does not call GitHub APIs, write `.forge`, implement MemoryKeeper, calculate eval scores, or generate mutations.

---

## packages/eval

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| validateEvalSuite(input) | T034 | eval suite manifest | validation result | live grader execution |
| collectMergeOutcome(input) / collectPrOutcome(input) | T036 | explicit PR/outcome evidence | merge outcome manifest | guessed merge result |
| runEvalShadowRun(input) | T045 | eval suite/result manifests | shadow-run manifest | authoritative score write |
| evaluatePeerReputation(input) | T063 | peer proposal/policy/adoption outcomes | advisory reputation manifest | automatic adoption |
| compareArenaCandidates(input) | T065 | candidate set + scoring evidence | arena comparison manifest | automatic winner adoption |

### Eval invariants

- `packages/eval` does not make scores authoritative unless a later approved task promotes them.
- Reputation and arena outputs remain advisory and deterministic.
- The package does not call GitHub APIs or perform live self-evolution.

---

## packages/auditor

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| runAuditor(input) | T023 | plan/worktree/sandbox evidence | audit result + PR-composition gate | command execution |
| validateAuditResult(result) | T023 | audit result | validation result | PR composition without gate |
| convertAuditFindingsToSarif(input) | T040 | audit findings | SARIF-like artifact | GitHub upload |
| validateSarifLikeArtifact(artifact) | T040 | SARIF-like artifact | validation result | secret/path drift |

### Auditor invariants

- Auditor outputs are evidence and gates only.
- The package does not execute commands, call GitHub APIs, upload Code Scanning results, approve, merge, update memory, or federate.

---

## packages/mutate

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| applyPromptPatchDryRun(input) | T046 | prompt patch request | dry-run diff manifest | policy/identity mutation |
| applyToolRoutingPatchDryRun(input) | T047 | tool-routing patch request | dry-run diff manifest | permission expansion without approval |
| createSpeciationProposal(input) | T048 | parent/child lineage input | speciation proposal manifest | silent replacement |
| routeNVersionAudit(input) | T049 | mutation proposal | audit routing manifest | self-approval |
| evaluateEvolutionGuard(input) | T050 | proposal + routed reviews | EvolutionGuard decision manifest | mutation execution |
| createMutationPrManifest(input) | T051 | accepted guard decision | mutation PR manifest | live PR creation |
| createMutationPrTransportRequest(input) | T052 | mutation PR manifest | transport request manifest | GitHub transport |
| createTransportReadinessLedger(input) | T053 | transport readiness evidence | readiness ledger manifest | unapproved promotion |
| createApprovalReceiptVerification(input) | T054 | approval receipt evidence | verification manifest | approval record write |
| createTransportExecutionPlan(input) | T055 | approved transport evidence | execution plan manifest | execution |
| createExecutionArtifactReceipt(input) | T056 | execution artifact evidence | receipt manifest | artifact fabrication |
| createRolloutGateChecklist(input) | T057 | rollout evidence | rollout gate checklist | rollout execution |
| createPostTransportAuditPlan(input) | T058 | post-transport evidence | audit plan manifest | audit job execution |
| createLineageHandoffPack(input) | T059 | lineage handoff evidence | handoff pack manifest | federation transport |
| createCompletionBundle(input) | T060 | completion evidence | completion bundle manifest | final-state overclaim |

### Mutation invariants

- `packages/mutate` remains manifest-only.
- It does not execute mutations, push branches, create PRs, call GitHub APIs, write approvals, or self-approve high-risk changes.

---

## packages/network

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| exportLineagePack(input) | T061 | lineage refs + treaty scope | lineage pack manifest | treatyless export |
| composeCrossRepoPr(input) | T062 | peer proposal + treaty evidence | cross-repo PR composition manifest | live PR creation |
| scheduleGossipSync(input) | T064 | peer registry + cadence state | gossip sync schedule manifest | network transport |
| enforceNetworkBoundary(input) | T067 | peer action + treaty/runtime evidence | boundary decision manifest | treaty bypass |

### Network invariants

- `packages/network` defines deterministic federation manifests and boundary decisions only.
- It does not perform network transport, open federation, production treaty creation, GitHub transport, or automatic lineage adoption.

---

## packages/reporting

| API | Task | Input | Output | Forbidden |
|---|---:|---|---|---|
| renderFederationReport(input) | T068 | peer/treaty/lineage/reputation/boundary state | Markdown/JSON federation report manifest | source-of-truth replacement |
| validateFederationReport(report) | T068 | federation report manifest | validation result | derived report drift |

### Reporting invariants

- Reports are derived artifacts only.
- Reporting does not replace peer registry, treaty, reputation, boundary, memory, or policy source-of-truth state.
