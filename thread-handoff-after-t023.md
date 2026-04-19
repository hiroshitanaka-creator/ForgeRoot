# T025 Validation Report — GitHub PR Adapter

Date: 2026-04-18 JST
Task: T025 GitHub PR adapter

## Scope implemented

T025 adds a deterministic adapter boundary between the T024 PR composition manifest and any trusted GitHub transport layer.

New files:

- `.forge/agents/github-pr-adapter.alpha.forge`
- `packages/github-pr-adapter/src/run.ts`
- `packages/github-pr-adapter/src/index.ts`
- `packages/github-pr-adapter/tests/run.test.mjs`
- `packages/github-pr-adapter/scripts/build.mjs`
- `packages/github-pr-adapter/package.json`
- `packages/github-pr-adapter/README.md`

Generated files:

- `packages/github-pr-adapter/dist/run.js`
- `packages/github-pr-adapter/dist/run.d.ts`
- `packages/github-pr-adapter/dist/index.js`
- `packages/github-pr-adapter/dist/index.d.ts`

Updated docs:

- `README.md`
- `.forge/README.md`
- `docs/README.md`
- `docs/github-app-permissions.md`

## Runtime contract

Primary API:

```ts
prepareGitHubPullRequest(input)
validateGitHubPullRequestCreationRequest(request)
GITHUB_PR_ADAPTER_CONTRACT
```

Alias exports:

```ts
prepareGithubPullRequest(input)
prepareGitHubPR(input)
prepareGithubPR(input)
validateGithubPullRequestCreationRequest(request)
validateGitHubPRCreationRequest(request)
validateGithubPRCreationRequest(request)
```

`prepareGitHubPullRequest` consumes one ready `PullRequestComposition` manifest and one GitHub App installation context. It emits at most one `GitHubPullRequestCreationRequest` manifest.

Runtime statuses:

- `ready`: request manifest is ready for later trusted transport.
- `blocked`: non-dry-run preparation lacks explicit runtime or rate-limit allowance.
- `invalid`: composition, installation context, or generated request is malformed or unsafe.

## GitHub request model

The request manifest contains:

- installation token request metadata for `POST /app/installations/{installation_id}/access_tokens`
- least-privilege token permission request for `pull_requests: write`
- primary PR creation metadata for `POST /repos/{owner}/{repo}/pulls`
- optional post-create request templates for labels and reviewer requests
- runtime gate state
- rate-limit gate state
- review/merge gate state
- no-secret, no-PAT, no-token-persistence guards

The adapter prepares metadata only. It intentionally does not include token material or perform live transport.

## Safety boundaries

T025 does not:

- call the GitHub API by itself
- create a pull request by itself
- merge a pull request
- approve a pull request
- persist installation tokens
- use PATs or user tokens
- edit files
- create branches or commits
- mutate workflows, policies, approval checkpoints, memory, evaluation state, or federation state

Non-dry-run request preparation is blocked unless explicit runtime and rate-limit gates authorize `open_pull_request`.

## Validation run

Commands were run from repo root.

```text
node packages/github-pr-adapter/scripts/build.mjs
node --check packages/github-pr-adapter/dist/run.js
node --check packages/github-pr-adapter/dist/index.js
node --test --test-force-exit packages/github-pr-adapter/tests/run.test.mjs
node --test --test-force-exit packages/pr-composer/tests/run.test.mjs
node --test --test-force-exit packages/auditor/tests/audit.test.mjs packages/auditor/tests/run.test.mjs
node --test --test-force-exit packages/executor/tests/sandbox.test.mjs packages/executor/tests/worktree.test.mjs
node --test --test-force-exit packages/planner/tests/intake.test.mjs packages/planner/tests/plan-schema.test.mjs packages/planner/tests/run.test.mjs
node --check packages/pr-composer/dist/run.js
node --check packages/auditor/dist/run.js
node --check packages/executor/dist/index.js
node --check packages/planner/dist/run.js
```

Results:

- GitHub PR adapter tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Auditor regression tests: 22 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Node syntax checks: pass

Detailed output is preserved in `ForgeRoot_T025_validation_output.txt` outside the repository artifact.

## Notes

T025 keeps live GitHub transport separate from request preparation. The next boundary should add an approval checkpoint before any trusted transport executes the prepared request against GitHub.
