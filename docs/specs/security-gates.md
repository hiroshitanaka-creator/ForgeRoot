# T041 Security Gates

## Status

T041 defines ForgeRoot's first security gate decision surface. It is deterministic and manifest-only: it consumes a T040 SARIF-like artifact and emits a reviewable gate decision before any trusted PR transport.

T041 is not a GitHub Code Scanning upload implementation, not a dependency-review live API integration, not a GitHub Rulesets integration, and not a branch protection configurator.

## Inputs

A T041 security gate input may contain:

- `sarif_artifact` or `sarif`: a T040 SARIF-like artifact with schema `urn:forgeroot:sarif-bridge:v1`.
- `policy`: optional deterministic policy override for tests and fixtures.
- `runtime`, `runtime_gate`: optional runtime mode summary.
- `rate`, `rate_gate`, `rate_limit`: optional rate-governor summary.
- `approval`, `approval_checkpoint`: optional approval class and risk summary.
- `now`: optional RFC3339 UTC timestamp.

Runtime, rate, and approval values are summaries only. T041 does not invoke the approval checkpoint, rate governor, GitHub App transport, GitHub Code Scanning, branch protection, or ruleset APIs.

## Decision model

The output decision is one of:

| Decision | Status | Transport meaning |
|---|---|---|
| `pass` | `passed` | Security gate found no blocking finding. Merge is still not approved by T041. |
| `hold` | `held` | Transport must wait for human/security review. |
| `block` | `blocked` | Transport must not proceed until the input or scope is corrected. |
| `quarantine` | `quarantined` | The candidate is isolated for governance review. |
| `invalid` | `invalid` | The input did not validate; no gate manifest is emitted. |

Decision precedence is:

```text
quarantine > block > hold > pass
```

## Default policy

The default policy is mirrored by `.forge/policies/security-gates.forge`.

```text
high   -> block
medium -> hold
low    -> pass
note   -> pass
```

Critical-equivalent source severities are stricter than ordinary high findings and quarantine the candidate:

```text
critical
fatal
security_critical
```

Denied rule IDs quarantine by default. Immutable governance paths quarantine even if the SARIF finding is low severity:

```text
.github/workflows/**
.github/actions/**
.forge/mind.forge
.forge/policies/**
.forge/network/**
apps/github-app/app-manifest.json
```

Low or note findings in docs/tests may pass when no denied rule, critical-equivalent source severity, runtime stop, rate stop, or immutable path violation is present.

## Output manifest

`evaluateSecurityGate(input)` returns an object with `status`, `decision`, `manifest`, and `gate` / `gateDecision` aliases.

The manifest uses:

```text
schema_ref: urn:forgeroot:security-gate-decision:v1
decision_id: forge-security-gate://<deterministic-id>
```

It includes:

- decision and reasons
- SARIF artifact hash
- policy summary
- runtime and rate summaries
- approval checkpoint handoff summary
- finding decisions
- boundary decisions
- severity, decision, affected-path, denied-rule, and immutable-path summaries
- guards proving no live mutation occurred

## Guard contract

T041 must keep all of these true:

```text
no_github_api_call
no_github_code_scanning_upload
no_branch_protection_mutation
no_ruleset_mutation
no_workflow_mutation
no_policy_mutation_in_runtime
no_dependency_review_live_api_integration
no_pull_request_creation
no_merge_operation
no_auto_merge
no_memory_or_evaluation_update
no_federation_or_self_evolution
```

## Public API

```ts
evaluateSecurityGate(input, options?)
runSecurityGate(input, options?)
evaluateSecurityGates(input, options?)
createSecurityGateDecision(input, options?)
createSecurityGateManifest(input, options?)
validateSecurityGateInput(input, options?)
validateSecurityGatePolicy(policy?)
validateSecurityGateDecision(decision)
validateSecurityGateManifest(decision)
defaultSecurityGatePolicy()
```

Compatibility constants are also exported:

```ts
SECURITY_GATES_CONTRACT
SECURITY_GATE_CONTRACT
DEFAULT_SECURITY_GATES_POLICY
DEFAULT_SECURITY_GATE_POLICY
```

## Boundaries

T041 does not:

- call GitHub APIs
- upload SARIF to GitHub Code Scanning
- create, update, or enforce branch protection
- create, update, or enforce rulesets
- call dependency review APIs
- create PRs
- approve or merge PRs
- update memory or evaluation state
- perform federation
- perform self-evolution

## Fixtures

Valid fixtures live under:

```text
docs/specs/fixtures/security-gates/valid/*.json
```

Invalid fixtures live under:

```text
docs/specs/fixtures/security-gates/invalid/*.json
```

These fixtures cover high block, critical quarantine, medium hold, low docs-only pass, denied-rule quarantine, immutable-path quarantine, runtime quarantine, malformed SARIF rejection, secret-like input rejection, and invalid policy rejection.
