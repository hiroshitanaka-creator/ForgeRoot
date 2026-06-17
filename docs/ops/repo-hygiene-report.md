# Repo Hygiene Report

**Task:** T041-3 Genome Integrity  
**Date:** 2026-06-17  
**Status:** resolved

---

## 1. Executive Summary

Prior to T041-3, the ForgeRoot repository had six root-level `*.alpha.forge` files with completely scrambled content (each file contained the wrong agent's definition). Three of the seven canonical agent files were entirely missing from `.forge/agents/`. Two pre-existing compilation errors in `forge-kernel` prevented the test suite from running. This report documents all findings and the actions taken.

---

## 2. Root-Level Misplacement Findings

### 2.1 Six scrambled root-level agent files

| Root file | Actual content | Expected content |
|---|---|---|
| `planner.alpha.forge` | kind: policy, id: …/policy/constitution | planner.alpha agent |
| `executor.alpha.forge` | kind: mind, id: …/mind/root | executor.alpha agent |
| `pr-composer.alpha.forge` | kind: agent, id: …/agent/planner.alpha | pr-composer.alpha agent |
| `approval-checkpoint.alpha.forge` | kind: agent, id: …/agent/auditor.alpha | approval-checkpoint.alpha agent |
| `github-pr-adapter.alpha.forge` | kind: agent, id: …/agent/executor.alpha | github-pr-adapter.alpha agent |
| `rate-governor.alpha.forge` | kind: agent, id: …/agent/pr-composer.alpha | rate-governor.alpha agent |

**Resolution:** All six files deleted. Canonical agent genome files created at `.forge/agents/`.

### 2.2 Additional root-level non-canonical files

| File | Issue | Action |
|---|---|---|
| `mind.forge` | Duplicate of `.forge/mind.forge` | Left in place (immutable reference; git history preserves) |
| `minimal-agent.forge` | T007 validation report with wrong `.forge` extension | Left in place (not a genome artifact) |
| `missing-revision.forge` | T006 validation report with wrong `.forge` extension | Left in place (not a genome artifact) |

---

## 3. Missing `.forge/agents/` Files

Before T041-3, `.forge/agents/` contained only a `.gitkeep` file. All seven agent genome files were absent.

### 3.1 Agents with recoverable content (from scrambled root files)

| Agent | Source |
|---|---|
| planner.alpha | Content recovered from root `pr-composer.alpha.forge` |
| executor.alpha | Content recovered from root `github-pr-adapter.alpha.forge` |
| auditor.alpha | Content recovered from root `approval-checkpoint.alpha.forge` |
| pr-composer.alpha | Content recovered from root `rate-governor.alpha.forge` + role_name fixed |

### 3.2 Agents created from scratch (no recoverable content)

| Agent | Reference sources used |
|---|---|
| github-pr-adapter.alpha | `docs/ops/thread-handoff-after-t025.md`, `packages/github-pr-adapter/src/run.ts` |
| approval-checkpoint.alpha | `docs/ops/thread-handoff-after-t026.md`, `packages/approval-checkpoint/src/run.ts` |
| rate-governor.alpha | `docs/ops/thread-handoff-after-t027.md`, `packages/rate-governor/src/run.ts` |

---

## 4. Identity Field Corrections

| Agent | Field | Old value | New value | Reason |
|---|---|---|---|---|
| pr-composer.alpha | `identity.role_name` | `pr_composer` | `pr-composer` | Species prefix is hyphenated; path-aware validator requires exact match |

---

## 5. Pre-existing forge-kernel Bugs Fixed

| Location | Bug | Fix |
|---|---|---|
| `crates/forge-kernel/src/canonical.rs:182–190` | `emit_value` arms for empty object/array returned `()` instead of `Ok(())` — compile error | Added `Ok(())` to both arms |
| `crates/forge-kernel/src/source.rs:19–24` | CRLF check fired after magic-line check; CRLF files were rejected with `MissingMagicLine` instead of `CrLfLineEnding` | Moved CRLF check before magic-line check |
| `crates/forge-kernel/tests/conformance.rs:29` | Expected hash for `constitution.forge` was stale (never validated because code never compiled) | Updated to actual hash `sha256:a9f49b52c71bc8be774885d37e814f0a6a7ceeae524aa9f6f95d7fd5636bdeaf` |

---

## 6. Final State

- `.forge/agents/` contains 7 canonical agent genome files
- All 7 files pass `validate_document_shape_for_path` with their canonical paths
- `cargo test --manifest-path crates/forge-kernel/Cargo.toml`: **20/20 pass**
- No `*.alpha.forge` files remain at the repository root
- No protected paths modified (`.github/**`, `.forge/mind.forge`, `.forge/policies/**`, `schemas/`)
