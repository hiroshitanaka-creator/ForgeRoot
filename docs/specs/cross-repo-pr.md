# T062 cross-repo PR composer

T062 converts a ready T061 lineage pack into a deterministic cross-repo PR
composition manifest for an allowlisted peer repository.

It is composition-only. It does not call GitHub, create a pull request, create
a fork, approve, merge, create a treaty, or perform network transport.

## Public API

- `composeCrossRepoPr(input)`
- `validateCrossRepoPr(result)`
- `runT062CrossRepoPrComposer(input)`
- `validateT062CrossRepoPrComposer(result)`

The implementation lives in `packages/network/src/cross-pr.ts`.

## Input contract

The input must provide:

- `lineage_pack`: a read-back-valid T061 lineage pack.
- `peer`: the target peer policy:
  - `peer_id`
  - `repository_full_name`
  - `status`
  - `allowed_actions`
  - `allowed_paths`
- `proposal`:
  - title, summary, head and base branches
  - changed paths
  - risk
  - rollback text
  - optional labels

The peer action required by T062 is `cross_repo_pr`.

## Output contract

A ready T062 manifest includes:

- `peer_ref`
- `lineage_pack_ref`
- `allowed_path_summary`
- draft PR metadata and body
- `review_gate`
- `evidence`
- no-side-effect guards and dry-run flags

The PR body must include these sections:

- `## Treaty evidence`
- `## Lineage evidence`
- `## Risk`
- `## Rollback`

Read-back validation also checks that those sections reference the same treaty,
lineage pack, risk, and rollback values as the manifest fields.

## Terminal states

- `cross_repo_pr_ready`: ready T061 pack, active peer, allowed action, allowed
  paths, required body sections, and no-side-effect guards all pass.
- `blocked`: structurally valid input cannot compose because the lineage pack is
  not ready, peer is not active, action is not allowed, peer identity does not
  match the T061 target peer, or paths are outside the peer allowlist.
- `invalid`: malformed input, tampered T061 pack, unsafe branches, invalid
  schema, secret-shaped material, or guard/digest failures.

## Safety boundaries

T062 always keeps:

- `pull_request.draft: true`
- `pull_request.maintainer_can_modify: false`
- `review_gate.approval_class: "C"`
- `review_gate.human_review_required_before_merge: true`
- `guards.no_github_api_call: true`
- `guards.no_pull_request_creation: true`
- `guards.no_fork_creation: true`
- `guards.no_merge_operation: true`
- `guards.no_auto_approval: true`
- `guards.no_treaty_creation: true`
- `guards.no_open_federation: true`

The manifest is evidence for a later trusted transport step; it is not itself
transport authority.
