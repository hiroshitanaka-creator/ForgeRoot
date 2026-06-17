# ForgeRoot Interface Registry

This file is the canonical registry of inter-agent data contracts in ForgeRoot. It is the source of truth for what each agent produces and consumes.

**Last updated:** 2026-06-17 (T041-3 Genome Integrity)

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
