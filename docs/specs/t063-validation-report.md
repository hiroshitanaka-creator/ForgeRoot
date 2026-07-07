# T063 Validation Report

## Scope

T063 implements deterministic peer reputation scoring as an advisory,
manifest-only eval surface.

Changed implementation surfaces:

- `.forge/network/reputation.forge`
- `packages/eval/src/peer-reputation.ts`
- `packages/eval/src/index.ts`
- `packages/eval/package.json`
- `packages/eval/tests/peer-reputation.test.mjs`
- `docs/specs/peer-reputation.md`

## Acceptance Criteria

| Criterion | Result | Evidence |
|---|---|---|
| Repeated rejected peer proposals lower score | Passed | `packages/eval/tests/peer-reputation.test.mjs` checks one rejection score `40` and repeated rejection score `20`. |
| Policy breach can quarantine | Passed | Policy-breach test produces `recommended_action: quarantine` with no adoption or network writes. |
| Score deterministic and recalculable | Passed | Tests assert identical outputs for identical inputs and validate score/summary/digest read-back. |
| Reputation is auxiliary, not adoption source of truth | Passed | `adoption_authority` and `dry_run` guards require advisory-only behavior and reject tampering. |

## Verification Result

| Command | Result |
|---|---|
| `npm.cmd --prefix packages\eval test` | Passed |
| `npm.cmd test` | Passed |
| `npm.cmd run build` | Passed |
| `npm.cmd run validate:skills` | Passed |
| `git diff --check` | Passed with LF/CRLF warnings only |
| `git diff --check origin/main...HEAD` | Passed |
| changed-file mojibake scan | Passed; no matches |
| canonical API grep for `evaluatePeerReputation(input)` | Passed |
| `where.exe cargo` | Blocked; `cargo` was not found on PATH |
| `cargo test --workspace --locked` | Not run because `cargo` is unavailable in this Windows session |

## Quality Gate Report

Skill: forgeroot-pr-quality-gate via forgeroot-completion-engine

### G0 Design Rules

- Applied rules: R1, R2, R3, R4, R6, R7, R8.
- Shared validation core: `packages/eval/src/peer-reputation.ts`.
- Rebuild-and-compare validation covers summary, score, recommended action,
  digest, deterministic id, side-effect guards, and adoption authority.
- Canonical API name: `evaluatePeerReputation(input)`.

### G2 Adversarial Self-Review

| Pass | Target class | Round 1 | Repair | Final |
|---|---|---|---|---|
| P1 tamper | C1, C6 | Structural tamper coverage needed beyond scalar leaves | Added structural tamper tests and read-back checks | Passed |
| P2 fail-open | C2 | No allowlist drift after review | Unknown enums fail closed | Passed |
| P3 impossible values | C3 | Expired ready treaty needed semantic read-back | Added ready `expires_at` check | Passed |
| P4 replay | C4 | Not applicable; no multi-op replay | Not applicable | Passed |
| P5 coverage | C5, C9 | Nested unknown keys and missing resolved weights needed rejection | Added known-key and complete-weight checks | Passed |
| P6 boundary | C7, C8, C10 | Canonical alias and invalid terminal behavior checked | Tests cover aliases and fail-closed invalids | Passed |

### G3 Negative Tests

- Tamper harness: `packages/eval/tests/peer-reputation.test.mjs` mutates every
  ready-manifest leaf and asserts validation failure.
- Structural tamper: missing resolved weight, unsorted outcomes, nested unknown
  key, and expired ready treaty are rejected.
- Abnormal values: invalid timestamp, unknown enum, revoked peer, expired
  treaty, and secret-shaped material are covered.
- Adoption boundary: automatic adoption, network transport, public ranking, and
  GitHub API side effects remain false.

### G4 Mechanical Checks

- `npm.cmd --prefix packages\eval test`: passed.
- `npm.cmd test`: passed.
- `npm.cmd run build`: passed.
- `npm.cmd run validate:skills`: passed.
- `git diff --check`: passed with LF/CRLF warnings only.
- `git diff --check origin/main...HEAD`: passed.
- Mojibake scan: passed; no changed-file matches.
- `cargo test --workspace --locked`: not run because `cargo` is unavailable.

## Internal Audit Result

## Critical Architectural Flaws

None.

## State/Concurrency Risks

None. T063 is a pure, synchronous manifest scorer with no file writes, network
transport, external API calls, jobs, queues, or durable state mutation.

## Structural Debts

None remaining after repair. The validator now rejects scalar tamper,
structural tamper, unknown enums, nested unknown keys, missing resolved weights,
unsorted result arrays, expired ready treaties, and side-effect flags.

## Rollback

Remove the T063 files and exports:

- `.forge/network/reputation.forge`
- `packages/eval/src/peer-reputation.ts`
- `packages/eval/tests/peer-reputation.test.mjs`
- T063 exports in `packages/eval/src/index.ts`
- package version bump in `packages/eval/package.json`
- `docs/specs/peer-reputation.md`
- `docs/specs/t063-validation-report.md`
