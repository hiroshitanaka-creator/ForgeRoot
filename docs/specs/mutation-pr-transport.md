# T052 mutation PR transport request manifest

T052 defines a deterministic, dry-run-only bridge from the T051 mutation PR plan
manifest to the GitHub pull request transport surface.

## API

Package: `@forgeroot/mutate`

Exports:

- `runMutationPrTransport`
- `createMutationPrTransportRequest`
- `prepareMutationPrTransportRequest`
- `runT052MutationPrTransport`
- `validateMutationPrTransportResult`
- `validateMutationPrTransportRequest`
- `validateT052MutationPrTransport`
- `MUTATION_PR_TRANSPORT_CONTRACT`

## Input

`runMutationPrTransport(input)` accepts:

- `plan`: a T051 `MutationPrGeneratorResult`
- `repository`: optional `owner/repo`, overriding the T051 plan repository
- `installation_id`: optional positive GitHub App installation id for request
  routing metadata
- `dry_run`: optional boolean, which must not be `false`
- `now`: optional RFC3339 UTC timestamp

## Output

The result has one of three statuses:

- `transport_request_ready`: the T051 plan is ready and a dry-run request
  manifest was emitted.
- `blocked`: the T051 plan is valid but not ready, so no transport request is
  emitted.
- `invalid`: the input, repository, T051 plan, or transport manifest is unsafe or
  malformed.

Ready output includes:

- `primary_request` for `POST /repos/{owner}/{repo}/pulls`
- optional `post_create_requests` for labels and reviewers after a pull number
  exists
- `review_gate` requiring Class C human review before execution and merge
- `runtime_gate` with `live_transport_allowed: false`
- `guards` forbidding token requests, GitHub API calls, git pushes, branch
  creation, approval writes, mutation execution, default branch writes, and
  merge operations
- deterministic `request_id` and `request_digest`

Blocked and invalid output must not include `primary_request`,
`post_create_requests`, or repository endpoint metadata.

## Safety boundaries

T052 prepares request metadata only. It does not:

- request or persist tokens
- call GitHub APIs
- create branches
- push git refs
- write approval records
- execute mutations
- merge pull requests

Any future live transport stage must remain behind a separate phase gate and
explicit human approval.
