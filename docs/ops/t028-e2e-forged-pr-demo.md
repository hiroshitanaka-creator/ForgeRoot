# T028 end-to-end forged PR demo

Date: 2026-04-18 JST
Status: implemented as a deterministic manifest-only demo harness

## Goal

T028 demonstrates the first Phase 1 forging loop as a single deterministic manifest chain from one `forge:auto` issue-like input to one rate-governed trusted transport dispatch manifest.

The demo proves wiring, scope preservation, and reviewability. It does not perform live GitHub transport and does not create a real pull request.

## Chain

```text
issue-like input
  -> Planner runtime
  -> branch/worktree manager
  -> executor sandbox request harness
  -> Auditor runtime
  -> PR composer
  -> GitHub PR adapter
  -> approval checkpoint
  -> rate governor queue
```

## Primary API

```ts
runEndToEndForgedPrDemo(input)
validateEndToEndForgedPrDemo(result)
E2E_FORGED_PR_DEMO_CONTRACT
```

Compatibility aliases:

```ts
runForgeDemo(input)
runEndToEndDemo(input)
runE2EForgedPrDemo(input)
runT028Demo(input)
validateForgeDemo(result)
validateE2EForgedPrDemo(result)
validateT028Demo(result)
```

## Default demo input

When no input is provided, the harness normalizes a single issue-like record:

```text
repository: hiroshitanaka-creator/ForgeRoot
issue:      28
labels:     forge:auto, docs, phase:P1, class:A, risk:low
scope:      one bounded documentation note
```

The issue is intentionally Class A / low risk so the approval checkpoint can authorize transport without extra human approval records while still preserving merge-time human review gates.

## Output

A ready demo result contains:

- one Plan Spec
- one branch/worktree manifest
- one sandbox execution request
- one simulated sandbox observed output
- one independent audit result
- one PR composition manifest
- one GitHub PR creation request manifest
- one trusted transport authorization manifest
- one rate-governed dispatch manifest

The manifest also records invariant flags:

- `one_task_one_pr: true`
- `source_issue_count: 1`
- `no_default_branch_write: true`
- PR body contains risk summary
- PR body contains acceptance criteria
- approval gate preserved
- live GitHub transport not performed
- real pull request not created
- merge / approval not executed
- memory / evaluation not updated
- federation not performed

## Safety boundary

T028 is a demo harness. It may validate the deterministic chain, but it must not:

- call GitHub APIs
- create a real pull request
- approve or merge
- execute commands
- edit files as part of the harness
- persist token material
- bypass rate governance
- mutate workflows or policies
- update memory or evaluation state
- perform federation or self-evolution

## Failure and delay cases

The demo preserves the stop points from the underlying runtimes:

- missing `forge:auto` label stops at Planner
- mutable-path violation stops before Auditor
- failed audit stops before PR composition
- missing Class B/C human approval stops at approval checkpoint
- exhausted content-create or PR-create budget returns delayed before transport
- halted / quarantine runtime returns quarantined before transport

## Example ready summary

```json
{
  "status": "ready",
  "decision": "demo_chain_ready",
  "summary": {
    "source_issue": "https://github.com/hiroshitanaka-creator/ForgeRoot/issues/28",
    "repository": "hiroshitanaka-creator/ForgeRoot",
    "approval_class": "A",
    "risk": "low",
    "rate_governor_status": "queued"
  },
  "invariants": {
    "one_task_one_pr": true,
    "source_issue_count": 1,
    "no_default_branch_write": true,
    "live_github_transport_performed": false,
    "real_pull_request_created": false
  }
}
```

## Out of scope

The next trusted transport worker is still intentionally absent. T028 stops at the rate governor dispatch manifest.
