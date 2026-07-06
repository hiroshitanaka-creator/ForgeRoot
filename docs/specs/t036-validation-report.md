# T036 Merge Outcome Collector Validation Report

Date: 2026-07-06 UTC

## Scope

T036 adds `collectMergeOutcome(input)` to `@forgeroot/eval`. The collector
normalizes explicit PR metadata, review outcome, CI outcome, revert linkage,
quarantine evidence, stale evidence, task refs, and commit trailer refs into a
deterministic outcome manifest.

## Deliverables

- `packages/eval/src/outcomes.ts` - merge outcome collector and validator.
- `packages/eval/tests/outcomes.test.mjs` - behavior tests.
- `docs/specs/t036-validation-report.md` - this report.

## Safety Boundary

T036 does not poll GitHub APIs, guess missing outcomes, calculate scores, write
memory, perform rollbacks, mutate workflows or policies, federate, or
self-evolve.

## Acceptance Checks

- Merged, rejected, stale, reverted, and quarantined outcomes are distinguishable.
- Source PR metadata, task refs, and commit trailer refs are required.
- Missing explicit outcome evidence produces `unknown` instead of an inferred
  outcome.
- Collector guards assert no GitHub API calls, no outcome guessing, no score
  calculation, no memory writes, and no auto rollback.

## Verification

- `npm.cmd --prefix packages\eval test` - passed, 22 tests.
- `npm.cmd --prefix packages\eval run build` - passed.
- `npm.cmd run validate:skills` - passed.
- `npm.cmd test` - passed.
- `npm.cmd run build` - passed.
- `git diff --check` - passed.
- `cargo test --workspace --locked` - local command unavailable because `cargo`
  is not installed or not on PATH in this Windows session. Rust verification is
  deferred to GitHub Actions.

## Review hardening sweep (2026-07-06, PR #26 findings)

All 8 Codex review findings were repaired as a single sweep following the
finding taxonomy in `.claude/skills/forgeroot-pr-quality-gate/`:

- Revert outcomes now require completed revert evidence: a revert commit sha
  or a closed and merged revert PR (`revert_evidence_incomplete`).
- PR metadata is cross-checked: merged requires closed state, `merged_at`,
  and `merge_commit_sha`; unmerged PRs must not carry merge metadata; open
  PRs must not carry `closed_at`; closed PRs must record it.
- `outcome_id` is now a canonical hash of the entire manifest content, so
  distinct outcomes and evidence produce distinct ids, and any single-field
  tamper changes the recomputed id.
- Commit trailers are cross-checked against the collected task and PR
  (`trailer_task_mismatch`, `trailer_pr_mismatch`, `commit_trailers_unrelated`).
- Review rejection evidence requires `reviewed_commit_sha` to match the source
  PR `head_sha` (`review_head_mismatch`); stale review evidence no longer
  resolves to `rejected`.
- PR `url` must reference the same repository and number
  (`url_reference_mismatch`).
- CI evidence must be internally consistent: `passed` requires all required
  checks passed and no failed names; `failed` requires failed check names.
- `validateMergeOutcomeManifest` is now symmetric with the collector: it
  fails closed on malformed manifests, re-runs the full nested input
  validation, recomputes the evidence resolution and `outcome_id`, and
  rejects tampered or forged manifests (same-class sweep of the PR #15
  validate-asymmetry finding).
- Timestamps are validated semantically (RFC3339 shape plus real-date
  round-trip), rejecting impossible values such as `2026-99-99T99:99:99Z`
  (same-class sweep of the PR #15 timestamp finding).

Horizontal sweep note: the same-class audit was bounded to the declared T036
mutable paths (`packages/eval/src/outcomes.ts` and its tests). Sibling
validators (`packages/eval/src/shadow-run.ts`, `packages/eval/src/eval-suite.ts`,
`packages/mutate/*`) were not modified; auditing them for the same
validate-asymmetry class is recorded as a follow-up task candidate.

### Hardening verification

- `npm --prefix packages/eval test` - passed, 35 tests (13 added: findings
  sweep, fail-closed, impossible timestamps, tamper harness with 40+
  single-field mutations, unknown-key injection, evidence reordering).
