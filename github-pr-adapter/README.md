# @forgeroot/github-pr-adapter

T025 adds the deterministic GitHub PR adapter boundary for the first ForgeRoot forging loop.

The package consumes:

- one T024 `PullRequestComposition` manifest
- one GitHub App installation context
- optional runtime and rate-limit gates for non-dry-run transport

It produces one bounded `GitHubPullRequestCreationRequest` manifest for a later trusted transport layer.

## Boundary

The adapter prepares and validates GitHub REST request metadata only. It does not call GitHub, create a pull request by itself, merge, approve, edit files, create commits, change workflow/policy files, update memory/evaluation state, or perform federation behavior.

Primary API:

```ts
prepareGitHubPullRequest(input)
validateGitHubPullRequestCreationRequest(request)
GITHUB_PR_ADAPTER_CONTRACT
```

Aliases are exported for naming ergonomics:

```ts
prepareGithubPullRequest(input)
prepareGitHubPR(input)
prepareGithubPR(input)
validateGithubPullRequestCreationRequest(request)
validateGitHubPRCreationRequest(request)
validateGithubPRCreationRequest(request)
```

Runtime statuses:

- `ready` — one GitHub App PR creation request manifest is ready for a trusted transport layer.
- `blocked` — a non-dry-run request lacks explicit runtime or rate-limit allowance.
- `invalid` — the composition, installation context, or generated request is malformed or unsafe.

## Local development

```bash
cd packages/github-pr-adapter
npm run build
node --test --test-force-exit tests/*.test.mjs
```
