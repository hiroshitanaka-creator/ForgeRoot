# @forgeroot/auditor

The auditor package contains the deterministic audit-side safety surface for the first ForgeRoot forging loop.

Implemented task surfaces:

- T023 independent Auditor runtime
- T040 SARIF-like finding bridge
- T041 manifest-only security gates

## T023 Auditor runtime

The T023 runtime consumes:

- one Plan Spec
- one T018 branch/worktree manifest
- one T019 sandbox execution request
- one sandbox observed output / evidence summary

It produces one bounded `AuditResultReport` with a PR-composition gate decision. It can also normalize audit findings into T040 SARIF-like artifacts and evaluate T041 security gate decisions from those artifacts.

Primary API:

```ts
runAuditor(input)
validatePlanSpecForAudit(plan)
validateBranchWorktreePlanForAudit(worktreePlan)
validateSandboxExecutionRequestForAudit(request)
validateAuditResult(report)
convertAuditFindingsToSarif(input)
evaluateSecurityGate(input)
validateSecurityGateDecision(decision)
```

Runtime statuses:

- `passed` — evidence and acceptance criteria pass; PR composition may proceed later.
- `failed` — evidence exists but violates scope, artifact, command, or acceptance checks.
- `blocked` — required evidence is missing.
- `invalid` — the supplied Plan Spec / worktree / sandbox request chain is malformed or inconsistent.

## T040 SARIF bridge

The T040 bridge converts internal audit / scan / sandbox evidence findings into deterministic SARIF-like artifacts.

Primary API:

```ts
convertAuditFindingsToSarif(input, options?)
createSarifBridgeArtifact(input, options?)
validateSarifBridgeInput(input, options?)
validateSarifBridgeArtifact(artifact)
```

The bridge does not upload to GitHub Code Scanning and does not make security gate decisions.

## T041 security gates

The T041 gate consumes a T040 SARIF-like artifact and emits a deterministic `security_gate_decision` manifest with an approval-checkpoint handoff summary.

Primary API:

```ts
evaluateSecurityGate(input, options?)
runSecurityGate(input, options?)
validateSecurityGateInput(input, options?)
validateSecurityGatePolicy(policy?)
validateSecurityGateDecision(manifest)
```

Gate decisions:

- `pass`
- `hold`
- `block`
- `quarantine`
- `invalid`

Boundary:

The auditor package validates existing evidence and emits reviewable manifests only. It does not execute commands, edit files, create branches, create commits, compose PRs, call GitHub APIs, upload SARIF, mutate branch protection or rulesets, update memory/evaluation state, approve, merge, self-evolve, or federate.

## Local development

```bash
cd packages/auditor
npm run build
node --test --test-force-exit tests/*.test.mjs
```
