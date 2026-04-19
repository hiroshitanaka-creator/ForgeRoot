# @forgeroot/pr-composer

T024 adds the deterministic PR composer for the first ForgeRoot forging loop.

The package consumes:

- one Plan Spec
- one T018 branch/worktree manifest
- one T019 sandbox execution request
- one sandbox observed output
- one T023 passed audit result

It produces one bounded `PullRequestComposition` manifest with a PR title, body, labels, reviewers, check summary, risk summary, acceptance summary, artifact summary, and provenance.

## Boundary

The composer is composition-only. It does not call GitHub, create a pull request, approve, merge, edit files, update memory/evaluation state, or perform federation behavior. A later GitHub adapter must consume the manifest before any actual mutation happens.

Primary API:

```ts
composePullRequest(input)
validatePullRequestComposition(composition)
PR_COMPOSER_CONTRACT
```

Aliases are also exported for adapter ergonomics:

```ts
composePr(input)
composePR(input)
validatePrComposition(composition)
validatePRComposition(composition)
```

Runtime statuses:

- `ready` — one reviewable PR composition manifest is ready for a later GitHub adapter.
- `blocked` — the audit result did not pass or did not allow PR composition.
- `invalid` — the plan/worktree/sandbox/audit chain is malformed or inconsistent.

## Local development

```bash
cd packages/pr-composer
npm run build
node --test --test-force-exit tests/*.test.mjs
```
