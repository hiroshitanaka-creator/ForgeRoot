# TASK_PROGRESS

## Current phase

T071 - self-host bootstrap readiness manifest in `packages/forge-demo`, after
T070 distributed evolution demo (merged via PR #34) and the T070 Codex review
follow-up (PR #35).

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
- T036 collects explicit PR outcome metadata into deterministic outcome
  manifests without guessing missing merge results.
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
- T070 adds a lab-only distributed evolution demo in `packages/forge-demo` that
  runs the T069 topology through lineage, reputation, boundary, cross-repo PR
  composition, arena comparison, and federation reporting manifests without
  live federation or automatic adoption.

## Selected work

T070 - distributed evolution demo.

## Why this work

- T070 depends on T069 and is the bridge before T071 self-host bootstrap.
- The user requested implementation progress instead of more docs-only work.
- T070 remains lab-only and manifest-only; it does not approve production
  federation, live transport, automatic lineage adoption, or self-evolution.
- PR #34 must incorporate the T069 post-merge source-of-truth normalization
  that landed on `main` via PR #33 before it can be merged.

## Intended scope

- Add `packages/forge-demo/src/distributed-evolution.ts`.
- Export stable T070 aliases from `packages/forge-demo/src/index.ts`.
- Add behavioral tests in `packages/forge-demo/tests/distributed-evolution.test.mjs`.
- Keep T070 side-effect boundaries closed in runtime output and tests.
- Resolve README, progress, and interface-registry conflicts against the T069
  post-merge normalization without changing T070 runtime behavior.

## Verification plan

- Run `npm.cmd --prefix packages\network test`.
- Run `npm.cmd --prefix packages\reporting test`.
- Run `npm.cmd --prefix packages\forge-demo test`.
- Run `git diff --check`.
- Run `npm.cmd run validate:skills`.
- Run `npm.cmd test`.
- Run `npm.cmd run build`.
- Check whether `cargo` is available before Rust verification.

## Current status

- T036 implementation complete on main.
- Verification passed: `npm.cmd --prefix packages\eval test` (22/22).
- Verification passed: `npm.cmd --prefix packages\eval run build`.
- Verification passed: `npm.cmd run validate:skills`.
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
- PR #32 merged T069 into `main` at `2026-07-07T11:27:45Z`.
- T069 merge commit:
  `8d53a02f9f964364bf73bc2ef8fb7f58c3fe5c95`.
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
- T069 post-merge handoff normalization complete on `main`.
- Repo map and interface registry source-of-truth normalization complete for
  implemented surfaces through T069.
- README implementation summary normalization complete through T069.
- T070 implementation complete locally.
- Verification passed: `npm.cmd --prefix packages\forge-demo test` (16/16).
- Verification passed: `npm.cmd run build`.
- Verification passed: `npm.cmd test`.
- Verification passed: T070 tamper harness for every ready demo manifest leaf.
- Verification passed: T070 open-federation request blocks instead of weakening
  network boundary.
- T070 PR #34 merge-conflict resolution pulled in PR #33 changes from
  `origin/main`.
- Verification passed before conflict resolution: `git diff --check` with
  LF/CRLF warnings.
- Verification passed before conflict resolution: `npm.cmd run validate:skills`.
- Verification passed before conflict resolution: `npm.cmd test`.
- Verification passed before conflict resolution: `npm.cmd run build`.
- Verification failed locally before conflict resolution:
  `cargo test --workspace --locked` with
  `C:\Users\tanak\.cargo\bin\cargo.exe` and the default MSVC toolchain; the
  Windows linker `link.exe` is not available.
- Verification failed locally before conflict resolution:
  `cargo +stable-x86_64-pc-windows-gnu test
  --workspace --locked`; GNU binutils `dlltool.exe` is not available.
- Docs-only quality gate report added to
  `docs/ops/thread-handoff-after-t069.md`.
- Draft PR package added to `docs/ops/thread-handoff-after-t069.md`.
- PR #34 merged T070 into `main`.
- PR #35 (Codex review follow-up for T070) opened by the repository owner,
  independently re-verified (`npm test`, `npm run build`,
  `npm run validate:skills` all passed on this session's Linux environment),
  and moved from draft to ready for review with explicit user approval.

## T071 self-host bootstrap

- User explicitly approved a lab-only, manifest-only scope for T071 before
  implementation: no live self-modifying commits, no real PR creation
  against ForgeRoot itself, no automatic mutation execution, no
  workflow/policy changes, no live GitHub API calls.
- `packages/forge-demo/src/self-host-bootstrap.ts` adds
  `runSelfHostBootstrap`/`validateSelfHostBootstrap` (with stable
  `runT071SelfHostBootstrap`/`validateT071SelfHostBootstrap` aliases). It
  reuses the existing T028 `runEndToEndForgedPrDemo` chain as evidence that
  the forging loop can target ForgeRoot itself in dry-run, and requires an
  explicit `human_bootstrap_approval` object before reporting `ready`.
- `target_repository` is locked to `hiroshitanaka-creator/ForgeRoot` only;
  `self_host_mode` only accepts `"dry_run"` and rejects `"live"` even when
  approval is present. Self-host execution, workflow mutation, policy
  mutation, real PR creation, and merge/approval are hard-coded `false`
  invariants, re-verified on every validation call.
- Internal two-lens adversarial audit (architecture + P1-P6 adversarial
  passes) found and fixed two real issues before this was considered done:
  (1) `forge_demo_ref.status`/`demo_id` were not cross-checked against the
  embedded `chain.forgeDemoResult`, so a forged manifest could claim
  readiness while the embedded T028 chain was actually blocked; (2) nested
  objects (`request`, `approval`, `invariants`, `forge_demo_ref`, `chain`,
  and the top level) did not reject unknown/injected keys, so an attacker
  who could recompute the digest after adding an extra field would have
  passed validation. Both are now covered by dedicated tests.
- Verification passed: `npm --prefix packages/forge-demo test` (32/32,
  including a tamper-harness covering 2000+ leaf fields of the embedded T028
  chain).
- Verification passed: `npm test` (all 14 npm workspaces, 0 failures).
- Verification passed: `npm run build`.
- Verification passed: `npm run validate:skills`.
- Verification passed: `git diff --check` and `git diff --cached --check`.
- Verification passed: changed-file mojibake scan (no matches).
- Verification passed: side-effect API scan (no `fetch`/`fs`/`child_process`/
  `process.env` in the new file).
- Verification passed: canonical API name grep
  (`runSelfHostBootstrap`/`validateSelfHostBootstrap`/T071 aliases exported
  from `packages/forge-demo/src/index.ts` and `dist/index.js`).
- Verification not run: `cargo test --workspace --locked` - this session's
  environment blocks crates.io downloads through the network proxy
  (`CONNECT tunnel failed, response 403`), so the Rust workspace was never
  reached. This is an environment limitation, not a result of this change
  (no `crates/*` files were touched). CI should run this check.
