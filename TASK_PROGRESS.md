# TASK_PROGRESS

## Current phase

T069 - three-repo forge-net testnet complete locally.

## Initial assessment summary

- T029 defines the memory partition and source-of-truth policy.
- T030 implements deterministic working memory update manifests.
- T031 implements deterministic episode digest manifests.
- T032 consumes source-backed memory records and emits deterministic archive
  pack manifests with canonical JSONL, zstd hashes, and pack boundaries.
- T033 consumes supplied source-backed memory artifacts and emits bounded
  retrieval context manifests that preserve source refs within a token budget.
- T034 defines manifest-only eval suite validation, benchmark task fixture
  schema, separated grader definitions, risk class, and shadow-only boundaries.
- T049-T060 provide dry-run mutation transport, rollout, handoff, and completion
  bundle gates.
- T061 adds deterministic lineage export/import pack manifests for allowlisted
  peers, with read-back treaty scope validation and import candidate
  registration only.
- T062 adds deterministic cross-repo PR composition manifests from ready T061
  lineage packs, with treaty, lineage, risk, rollback, peer action, and allowed
  path evidence.
- T063 adds deterministic advisory peer reputation scoring from proposal
  outcomes, policy compliance, and adoption outcomes, without automatic
  adoption, public ranking, or network transport.
- T064 adds deterministic manifest-only gossip sync scheduling with runtime
  mode gating, peer quarantine exclusion, cooldown handling, rate-window
  limits, and no workflow or network side effects.
- T067 adds deterministic manifest-only network boundary decisions for
  treaty-gated peer actions, unknown peer quarantine, import candidate-only
  handling, and open federation denial.
- T068 adds deterministic Markdown/JSON federation observability reports for
  peer, treaty, lineage, reputation, and boundary summaries without becoming
  source-of-truth state.

## Selected work

T069 - three-repo forge-net testnet.

## Why this work

- T069 depends on T057-T068.
- T069 is class C / high-risk federation topology work.
- AGENTS.md requires explicit approval before touching federation topology,
  treaty-link, or network-boundary surfaces for this high-risk task.

## Intended scope

- Add `labs/forge-net/topology.yml`.
- Add `labs/forge-net/README.md`.
- Add `docs/ops/t069-three-repo-testnet.md`.
- Add `docs/specs/t069-validation-report.md`.

## Verification plan

- Run `npm.cmd test`.
- Run `npm.cmd run build`.
- Run `npm.cmd run validate:skills`.
- Run `git diff --check`.
- Run `cargo test --workspace --locked` when Rust is available.

## Current status

- T061 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\network test` (11/11).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warning for
  `TASK_PROGRESS.md`.
- Local Rust verification is blocked because `cargo` is not installed or not on
  PATH in this Windows session.
- Internal audit repaired read-back validation asymmetry for treaty scope,
  blocked terminal validation, invalid terminal validation, expired treaty
  handling, and unknown action fail-closed handling.
- T062 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\network test` (20/20).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Internal audit repaired T062 body/evidence read-back validation so treaty,
  lineage, risk, and rollback evidence cannot drift from the manifest fields.
- T063 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\eval test` (20/20).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Verification passed: changed-file mojibake scan.
- Verification passed: canonical API grep for `evaluatePeerReputation(input)`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Internal audit repaired T063 structural validator gaps for sorted result
  arrays, complete resolved weights, nested unknown keys, and expired ready
  treaty refs.
- T064 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\network test` (28/28).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Verification passed: changed-file mojibake scan.
- Verification passed: canonical API grep for `scheduleGossipSync(input)`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Internal audit repaired T064 fail-closed timestamp handling and resolved
  nullable field coverage for rate boundary and peer snapshots.
- T065 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\eval test` (30/30).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Verification passed: changed-file mojibake scan.
- Verification passed: canonical API grep for `compareArenaCandidates(input)`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Internal audit repaired T065 resolved-threshold typing, score-margin test
  expectations, and shared score-policy risk-penalty object exposure.
- Final T065 implementation audit found no remaining architectural,
  state/concurrency, or structural issues.
- T066 implementation complete locally.
- Verification passed: JSON parse for
  `docs/ops/examples/t066-cross-repo-proposal.json`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Verification passed: changed-file mojibake scan.
- Verification passed: safety-boundary scan for forbidden true side-effect
  flags.
- `npm.cmd test`, `npm.cmd run build`, and `cargo test --workspace --locked`
  were not run for T066 because it is docs-only plus one JSON example artifact.
- Final T066 implementation audit found no remaining architectural,
  state/concurrency, or structural issues.
- T067 implementation complete locally.
- User explicitly approved high-risk `.forge/policies/**` and
  federation/network boundary changes before implementation.
- Verification passed: `npm.cmd --prefix packages\network test` (38/38).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Verification passed: changed-file mojibake scan.
- Verification passed: T067 runtime side-effect flag scan.
- Verification passed: canonical API grep for `enforceNetworkBoundary(input)`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Final T067 implementation audit found no remaining architectural,
  state/concurrency, or structural issues.
- T068 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\reporting test` (8/8).
- Verification passed: `npm.cmd test`.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `git diff --check origin/main...HEAD`.
- Verification passed: changed-file mojibake scan.
- Verification passed: T068 runtime side-effect flag scan.
- Verification passed: canonical API grep for `renderFederationReport(input)`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Final T068 implementation audit found no remaining architectural,
  state/concurrency, or structural issues.
- T069 user approval received for class C / high-risk federation topology,
  treaty-link, and network-boundary work.
- T069 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\network test` (38/38).
- Verification passed: `npm.cmd --prefix packages\reporting test` (8/8).
- Verification passed: T069 topology safety-boundary scan.
- Verification passed: T069 changed-file trailing whitespace scan.
- Verification passed: T069 changed-file ASCII scan.
- Verification passed: `npm.cmd run validate:skills`.
- Verification passed: `git diff --check` with LF/CRLF warnings.
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd test`.
- Local Rust verification remains blocked because `cargo` is not installed or
  not on PATH in this Windows session.
- Final T069 implementation audit found no remaining architectural,
  state/concurrency, or structural issues.
