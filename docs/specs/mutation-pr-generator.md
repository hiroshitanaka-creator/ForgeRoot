# T051 Mutation PR Generator Manifest

## Purpose

The mutation PR generator consumes a T050 EvolutionGuard decision manifest and
produces a deterministic draft pull-request plan manifest only when the guard
accepted the mutation.

The canonical package API is `runMutationPrGenerator(input)`.

## Input Shape

```ts
interface MutationPrGeneratorInput {
  now?: string;
  guard: EvolutionGuardDecisionResult;
  repository?: string;
  base_branch?: string;
  head_branch?: string;
  title?: string;
  body_notes?: string[];
  labels?: string[];
  reviewers?: string[];
}
```

## Decision Rules

- Invalid input emits `invalid_mutation_pr_input`.
- Tampered or unreadable T050 guard manifests emit `invalid_mutation_pr_input`.
- Valid but non-accepted guards emit `mutation_pr_blocked_by_guard`.
- Accepted guards with safe PR metadata emit `mutation_pr_manifest_ready`.

## Output Guarantees

A ready manifest includes:

- deterministic `plan_id`
- deterministic `plan_digest`
- guard reference and proposal metadata
- draft PR title/body/head/base metadata
- safe `codex/*` head branch
- canonical proposal target paths
- Class C human review gate
- side-effect guards and dry-run flags

Read-back validation rejects default-branch head refs, unsafe labels or
reviewers, stale plan IDs, stale plan digests, guard weakening, side-effect
flags, terminal results carrying PR metadata, and non-canonical target paths.

## Safety Boundary

T051 is manifest-only. It never creates branches, pushes commits, calls GitHub
APIs, writes files, writes approval records, executes mutations, approves,
merges, or auto-merges.

## Out Of Scope

Live GitHub transport, branch creation, commit generation, file mutation,
approval checkpoint writes, reviewer notification, mutation execution, merge,
workflow mutation, policy mutation, and branch protection changes are outside
T051.
