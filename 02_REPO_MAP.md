# ForgeRoot Repository Map

This file is the canonical surface inventory of ForgeRoot. It is updated when the directory structure changes.

**Last updated:** 2026-06-17 (T041-3 Genome Integrity)

---

## Root

| Path | Kind | Notes |
|---|---|---|
| `.forge/` | genome directory | Agent, mind, and policy genome files |
| `apps/` | application packages | GitHub App and related runtimes |
| `crates/` | Rust crates | forge-kernel and CLI tooling |
| `docs/` | documentation | Specs, ops runbooks, fixtures |
| `packages/` | TypeScript packages | Agent runtime packages |
| `schemas/` | JSON Schema | Canonical `.forge` v1 schema |
| `.github/` | CI/CD | Workflows and actions — **immutable** |
| `Cargo.toml` | Rust workspace manifest | |
| `Cargo.lock` | Rust lock file | |
| `package.json` | Node workspace root | |
| `README.md` | Repository overview | Do not modify |
| `02_README.md` | Extended README | Do not modify |

---

## `.forge/` — Genome Directory

| Path | Kind | Species / Id |
|---|---|---|
| `.forge/mind.forge` | mind | `forge://…/mind/root` — **immutable** |
| `.forge/agents/planner.alpha.forge` | agent | `planner.alpha` |
| `.forge/agents/executor.alpha.forge` | agent | `executor.alpha` |
| `.forge/agents/auditor.alpha.forge` | agent | `auditor.alpha` |
| `.forge/agents/pr-composer.alpha.forge` | agent | `pr-composer.alpha` |
| `.forge/agents/github-pr-adapter.alpha.forge` | agent | `github-pr-adapter.alpha` |
| `.forge/agents/approval-checkpoint.alpha.forge` | agent | `approval-checkpoint.alpha` |
| `.forge/agents/rate-governor.alpha.forge` | agent | `rate-governor.alpha` |
| `.forge/policies/constitution.forge` | policy | `forge://…/policy/constitution` — **immutable** |
| `.forge/lineage/constitution.forge` | policy | Duplicate of policy constitution (quarantine candidate) |
| `.forge/network/` | network policy | **immutable** |

---

## `crates/` — Rust Crates

| Path | Purpose |
|---|---|
| `crates/forge-kernel/` | `.forge` v1 parser, canonical serializer, hash computation, shape validator |
| `crates/forge-kernel/src/canonical.rs` | Canonical key ordering and YAML serialization |
| `crates/forge-kernel/src/validate.rs` | Shape validation and path-aware consistency checks |
| `crates/forge-kernel/src/source.rs` | Source-form constraint enforcement (magic line, CRLF, tabs, etc.) |
| `crates/forge-kernel/src/hash.rs` | SHA-256 canonical hash computation |
| `crates/forge-kernel/src/parser.rs` | YAML parsing entry points |
| `crates/forge-kernel/tests/conformance.rs` | Integration conformance test suite |

---

## `packages/` — TypeScript Agent Runtime Packages

| Package | Agent |
|---|---|
| `packages/planner/` | planner.alpha |
| `packages/executor/` | executor.alpha |
| `packages/auditor/` | auditor.alpha |
| `packages/pr-composer/` | pr-composer.alpha |
| `packages/github-pr-adapter/` | github-pr-adapter.alpha |
| `packages/approval-checkpoint/` | approval-checkpoint.alpha |
| `packages/rate-governor/` | rate-governor.alpha |

---

## `docs/` — Documentation

| Path | Purpose |
|---|---|
| `docs/specs/` | Validation reports and interface specs |
| `docs/specs/fixtures/forge-v1/` | Test fixtures (valid and invalid `.forge` files) |
| `docs/specs/repo-integrity.md` | Repo surface integrity spec |
| `docs/ops/` | Operations runbooks and thread handoffs |
| `docs/ops/repo-hygiene-report.md` | Root surface hygiene findings |

---

## Root-level quarantine candidates (not deleted, not canonical)

| Path | Issue |
|---|---|
| `mind.forge` | Duplicate of `.forge/mind.forge`; content is identical |
| `minimal-agent.forge` | T007 validation report with wrong `.forge` extension |
| `missing-revision.forge` | T006 validation report with wrong `.forge` extension |
| `README (1).md` … `README (31).md` | Stale duplicate README copies |

---

## Phase 2 Memory Foundation Surface

| Path | Purpose |
|---|---|
| `packages/memory/` | T030/T031 deterministic memory manifest writer and validator package; no MemoryKeeper runtime, no GitHub transport, no `.forge` direct write |
| `packages/memory/src/working.ts` | Working memory update manifest creation and validation |
| `packages/memory/src/digest.ts` | Episode digest manifest creation and validation |
| `docs/specs/memory-model.md` | T029 memory partition contract |
| `.forge/policies/memory.forge` | Memory policy declaring source-of-truth, PR, source-ref, derived-state, and memory/eval separation rules |
