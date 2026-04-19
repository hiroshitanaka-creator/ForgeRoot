# @forgeroot/auditor

T023 adds the deterministic Auditor runtime for the first ForgeRoot forging loop.

The package consumes:

- one Plan Spec
- one T018 branch/worktree manifest
- one T019 sandbox execution request
- one sandbox observed output / evidence summary

It produces one bounded `AuditResultReport` with a PR-composition gate decision.

## Boundary

The auditor is independent from the executor. It validates evidence that already exists; it does not execute commands, edit files, create branches, create commits, compose PRs, mutate GitHub, update memory, or approve merges.

Primary API:

```ts
runAuditor(input)
validatePlanSpecForAudit(plan)
validateBranchWorktreePlanForAudit(worktreePlan)
validateSandboxExecutionRequestForAudit(request)
validateAuditResult(report)
```

Runtime statuses:

- `passed` — evidence and acceptance criteria pass; PR composition may proceed later.
- `failed` — evidence exists but violates scope, artifact, command, or acceptance checks.
- `blocked` — required evidence is missing.
- `invalid` — the supplied Plan Spec / worktree / sandbox request chain is malformed or inconsistent.

## Local development

```bash
cd packages/auditor
npm run build
node --test --test-force-exit tests/*.test.mjs
```
