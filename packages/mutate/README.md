# @forgeroot/mutate

Deterministic mutation-proposal package.

## T046 prompt genome patcher

`applyPromptPatchDryRun` consumes a canonical `.forge/agents/<species>.forge`
document reference plus an RFC6902-like list of `add` / `replace` / `remove`
operations, and produces a manifest-only dry-run diff:

- only an explicit allowlist of prompt/context-recipe fields can be targeted
  (`title`, `summary`, `identity.persona`, `role.mission`, `context_recipe.*`,
  `memory.working_memory.facts`, `memory.semantic_digests`, `memory.forget_rules`)
- any document outside `.forge/agents/<species>.forge` is rejected outright
- identity, species, constitution, tool-routing, evolution, scores, and
  provenance fields can never be patch targets, even on an allowed document
- patch application is a pure, deterministic diff over an in-memory clone
- before/after content digests are included for later shadow-eval comparison

This package does not write files, call GitHub APIs, generate prompts, select
mutations, or auto-merge. It is a foundation for T048 speciation and the
later T050 EvolutionGuard / T051 mutation PR generator stages.

## T047 tool-routing mutator

`applyToolRoutingDryRun` consumes a canonical `.forge/agents/<species>.forge`
document reference plus a list of `add` / `replace` / `remove` operations over
`tools[]` routes, and produces a manifest-only dry-run diff. The canonical T047
API alias `applyToolRoutingPatchDryRun` is exported for blueprint consumers:

- only the explicit namespace allowlist can be targeted
- fallback route names must use the same namespace allowlist
- `max_calls` must be a positive integer <= 8
- `timeout_ms` must be a positive integer <= 8000
- modes are restricted to `read` and `write_manifest`
- approval requirements can stay the same or become stricter, but cannot be
  weakened
- the final resulting `tools[]` route set cannot contain duplicate routes
- every valid tool-routing proposal carries a Class C review gate, and any
  permission expansion is called out in the diff and manifest reasons

T047 never mutates `.forge` files directly. It does not implement tools, create
MCP servers, expand external network permissions, weaken policies, call GitHub
APIs, or auto-merge.

## T048 speciation proposal

`createSpeciationProposal` consumes parent agent genome references, child role
drafts, rationale, approval metadata, and optional T046/T047 supporting
mutation refs. It produces a deterministic lineage proposal manifest:

- `split` requires one parent and at least two child drafts
- `merge` requires at least two parents and exactly one child draft
- parent documents must be canonical `.forge/agents/<species>.forge` agent
  content with evolution lineage metadata
- child paths, species, and `speciation_id` values must be unique and cannot
  silently replace a parent
- rationale and Class C approval metadata are required
- prompt-patch and tool-routing manifest refs can be recorded as supporting
  evidence without executing them

T048 never writes child genomes, replaces parent genomes, calls GitHub APIs, or
auto-merges. It is a review surface for later EvolutionGuard and lineage
threshold tasks.

## T049 N-version audit routing

`createNVersionAuditRouting` consumes one high-risk Class C mutation proposal
reference plus a bounded independent reviewer pool and routing policy. It
produces a deterministic manifest that assigns the proposal to N independent
review lanes before later EvolutionGuard code can accept or reject it:

- proposal refs must remain high-risk, Class C, and scoped to canonical
  `.forge/agents/<species>.forge` target paths
- reviewer routes require distinct `independence_key` values
- required audit focuses must be covered by selected reviewer routes
- conflicted reviewer candidates are excluded from accepted routes
- quorum metadata requires all routed reviews to be collected before
  EvolutionGuard handoff

T049 never notifies reviewers, starts audit jobs, writes files, calls GitHub
APIs, makes EvolutionGuard decisions, or auto-merges. It is a manifest-only
routing surface for T050 guard evaluation.

## T050 EvolutionGuard decision manifest

`runEvolutionGuard` consumes a high-risk Class C proposal ref, a T049 routing
manifest, and independent review evidence. It emits a deterministic
decision-only manifest:

- `evolution_guard_accept` is possible only when every routed review is present,
  approval quorum is met, and there are no rejecting reviews, hold reviews, or
  blocking findings
- `evolution_guard_reject` is produced for explicit reviewer rejection or any
  blocking/high/critical finding
- `evolution_guard_hold` is produced for missing routed reviews, reviewer hold
  requests, or unmet approval quorum
- proposal identity, routing identity, review route identity, routing digest,
  reviewed target paths, Class C gate metadata, side-effect flags, quorum, guard
  IDs, and guard digests are validated on read-back

T050 never executes mutations, writes `.forge` files, calls GitHub APIs, writes
approval records, or auto-merges. An accept decision only allows the later
mutation PR generation stage to proceed with a manifest; execution and merge
remain human-review gated.

## T051 mutation PR generator manifest

`runMutationPrGenerator` consumes a T050 EvolutionGuard decision manifest and
produces a deterministic draft PR plan manifest only when the guard accepted the
mutation:

- `pr_manifest_ready` is possible only for `evolution_guard_accept`
- `blocked` is produced for hold, reject, or otherwise non-accepted guards
- tampered guard manifests are invalidated through T050 read-back validation
- generated PR metadata is draft-only, uses safe `codex/*` head branches, and
  preserves Class C human review gates
- labels, reviewers, repository names, branch refs, target paths, plan IDs, and
  plan digests are validated on read-back

T051 never creates branches, pushes commits, calls GitHub APIs, writes files,
writes approval records, executes mutations, or merges. It prepares only the
manifest needed by a later transport/composition stage.

## T052 mutation PR transport request manifest

`runMutationPrTransport` consumes a ready T051 mutation PR plan and produces a
deterministic dry-run transport request manifest for the GitHub pull request
creation surface:

- ready output requires a valid T051 `pr_manifest_ready` result
- blocked output is produced for non-ready T051 plans and carries no request
  metadata
- invalid output is produced for tampered T051 manifests, unsafe repository
  names, disabled dry-run mode, bad installation IDs, or secret-like material
- the primary request is limited to `POST /repos/{owner}/{repo}/pulls`
- optional follow-up request templates are limited to PR labels and reviewer
  request metadata after a pull number exists
- head branches must remain safe non-default refs and PRs must remain draft

T052 does not request or persist tokens, call GitHub APIs, create branches, push
git refs, write approval records, execute mutations, or merge PRs. It prepares a
reviewable dry-run request manifest only.

## T053 transport readiness ledger

`runTransportReadinessLedger` consumes a T052 dry-run transport request manifest
and emits a deterministic readiness replay ledger:

- T052 read-back validation must pass before checks are evaluated
- ready output requires every required check to pass
- blocked output records failed, pending, or missing required checks without
  producing live transport instructions
- invalid output records malformed input, tampered T052 manifests, duplicate
  checks, unsafe check IDs, or token-like material
- built-in checks cover T052 readiness, dry-run mode, Class C human review
  gates, PR endpoint safety, token suppression, git/merge suppression, approval
  write suppression, mutation execution suppression, and GitHub API suppression

T053 is a ledger-only replay surface. It does not write files, request tokens,
call GitHub APIs, create branches, push refs, write approval records, execute
mutations, or merge PRs.

## T054 approval receipt verifier

`runApprovalReceiptVerifier` consumes a T053 readiness ledger and explicit human
approval receipt manifests. It emits a deterministic verification manifest:

- approved output requires a valid ready T053 ledger and enough scoped
  `approve` receipts
- blocked output records missing approvals, `reject` receipts, `hold` receipts,
  disallowed approvers, or non-ready ledgers
- invalid output records malformed ledgers, malformed policies, duplicate
  receipts, scope/digest mismatches, malformed receipt fields, or token-like
  material in receipt statements
- receipt scope must match the ledger ID, ledger digest, request ID, request
  digest, and plan ID
- approver allowlists and required approval counts are enforced deterministically

T054 verifies receipts only. It does not write approval records, request tokens,
call GitHub APIs, create branches, push refs, execute mutations, write files, or
merge PRs.

## T055 transport execution plan

`runTransportExecutionPlan` consumes a T054 approval verification manifest and a
T052 transport request manifest. It emits a deterministic dry-run execution plan:

- ready output requires T054 `approved` status and T052
  `transport_request_ready` status
- approval request IDs, request digests, and plan IDs must match
- blocked output is used for valid but unapproved/non-ready inputs
- invalid output is used for tampered T054/T052 manifests or scope mismatches
- every operation step is marked `planned_not_executed` and
  `requires_future_live_approval`
- read-back validation rejects executed steps, merge endpoints, live transport
  authorization, guard weakening, side effects, and stale digests

T055 is execution-plan-only. It does not request tokens, call GitHub APIs, create
branches, push refs, write approval records, execute mutations, write files, or
merge PRs.

## T056 execution artifact receipt

`runExecutionArtifactReceipt` consumes a T055 transport execution plan and emits
a deterministic dry-run artifact receipt:

- ready output requires a valid T055 `execution_plan_ready` manifest
- artifact data summarizes unexecuted step counts, action counts, and step digest
- `write_target` is always `null`
- blocked output is reserved for valid non-ready plans
- invalid output records malformed labels, tampered T055 manifests, unsafe
  artifact metadata, write targets, side effects, guard weakening, or stale
  digests

T056 does not persist artifacts, write files, request tokens, call GitHub APIs,
create branches, push refs, execute mutations, or merge PRs.

## T057-T059 completion gates

`runRolloutGateChecklist`, `runPostTransportAuditPlan`, and
`runLineageHandoffPack` close the dry-run transport chain with deterministic
handoff manifests:

- T057 consumes a T056 artifact receipt and verifies required rollout gates
- T058 consumes a T057 ready checklist and emits unexecuted audit-plan steps
- T059 consumes a T058 ready audit plan and emits a non-persisted lineage handoff
  pack
- blocked outputs propagate failed gates or non-ready upstream manifests without
  side effects
- invalid outputs catch tampered upstream digests and read-back inconsistencies

T057-T059 do not persist handoff artifacts, write files, request tokens, call
GitHub APIs, create branches, push refs, execute mutations, or merge PRs.

## T060 completion bundle

`runCompletionBundle` consumes a T059 lineage handoff pack and emits a
deterministic completion bundle manifest:

- ready output requires a valid T059 `handoff_pack_ready` manifest
- blocked output propagates valid non-ready handoff packs
- invalid output catches tampered T059 digests, unsafe labels, persistence,
  write targets, side effects, guard weakening, or stale bundle digests
- bundle entries summarize T059 handoff entry kinds without persisting the
  bundle or assigning a write target

T060 does not persist bundles, write files, request tokens, call GitHub APIs,
create branches, push refs, execute mutations, or merge PRs.
