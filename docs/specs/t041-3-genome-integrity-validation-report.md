# T041-3 Genome Integrity Validation Report

**Task:** T041-3 — ForgeRoot Phase 1.5: Genome Integrity, Repo Hygiene, and Phase 2 Readiness Foundation  
**Date:** 2026-06-17  
**Status:** PASSED

---

## 1. Acceptance Criteria

| # | Criterion | Status |
|---|---|---|
| 6.1 | All 7 `.forge/agents/*.forge` files exist with correct kind/id/species/role_name | PASS |
| 6.2 | `cargo test --manifest-path crates/forge-kernel/Cargo.toml` exits 0 | PASS |
| 6.3 | No root-level `*.alpha.forge` files remain | PASS |
| 6.4 | Protected paths unchanged (`.github/**`, `.forge/mind.forge`, `.forge/policies/**`, `schemas/`) | PASS |

---

## 2. Agent Genome Validation

### 2.1 All 7 canonical agent files

```
.forge/agents/planner.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha
  identity.species: planner.alpha
  identity.role_name: planner
  revision: 01KQ3Y7M000000000000000000
  seed_task: T017

.forge/agents/executor.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/executor.alpha
  identity.species: executor.alpha
  identity.role_name: executor
  revision: 01KQ3Y7N000000000000000000
  seed_task: T019

.forge/agents/auditor.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/auditor.alpha
  identity.species: auditor.alpha
  identity.role_name: auditor
  revision: 01KQ3Y7P000000000000000000
  seed_task: T023

.forge/agents/pr-composer.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/pr-composer.alpha
  identity.species: pr-composer.alpha
  identity.role_name: pr-composer
  revision: 01KQ3Y7Q000000000000000000
  seed_task: T024

.forge/agents/github-pr-adapter.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/github-pr-adapter.alpha
  identity.species: github-pr-adapter.alpha
  identity.role_name: github-pr-adapter
  revision: 01KQ3Y7R000000000000000000
  seed_task: T025

.forge/agents/approval-checkpoint.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/approval-checkpoint.alpha
  identity.species: approval-checkpoint.alpha
  identity.role_name: approval-checkpoint
  revision: 01KQ3Y7S000000000000000000
  seed_task: T026

.forge/agents/rate-governor.alpha.forge
  kind: agent
  id: forge://hiroshitanaka-creator/ForgeRoot/agent/rate-governor.alpha
  identity.species: rate-governor.alpha
  identity.role_name: rate-governor
  revision: 01KQ3Y7T000000000000000000
  seed_task: T027
```

### 2.2 Path-aware validation results

All 7 files pass `validate_document_shape_for_path(&doc.value, Some(canonical_path))` where `canonical_path` is the file's actual location in `.forge/agents/`.

---

## 3. forge-kernel Test Results

```
cargo test --manifest-path crates/forge-kernel/Cargo.toml

running 20 tests
test bad_magic_is_rejected ... ok
test anchors_and_aliases_are_rejected ... ok
test duplicate_keys_are_rejected ... ok
test integrity_absent_returns_external_hash ... ok
test existing_t004_valid_fixture_hash_is_stable ... ok
test invalid_shape_missing_revision_is_rejected ... ok
test comments_and_source_order_do_not_change_hash ... ok
test non_empty_flow_mappings_are_rejected_until_duplicate_detection_is_event_based ... ok
test integrity_hash_and_signatures_are_normalized_for_hashing ... ok
test path_aware_species_mismatch_at_executor_path_is_rejected ... ok
test path_aware_agent_at_mind_path_is_rejected ... ok
test path_aware_valid_agent_at_canonical_agents_path ... ok
test path_aware_valid_canonical_executor_agent ... ok
test path_aware_valid_mind_at_mind_path ... ok
test path_aware_wrong_kind_at_agents_path_fails ... ok
test path_none_skips_path_consistency_check ... ok
test path_aware_valid_policy_at_policies_path ... ok
test tabs_are_rejected ... ok
test crlf_is_rejected ... ok
test t003_bootstrap_files_are_parseable ... ok

test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out
```

---

## 4. New Fixtures Created

| Path | Purpose |
|---|---|
| `docs/specs/fixtures/forge-v1/valid/canonical-executor-agent.forge` | Valid executor agent for path-aware tests |
| `docs/specs/fixtures/forge-v1/invalid/agent-species-mismatch.forge` | Agent with species/id mismatch for rejection tests |

---

## 5. Changes to forge-kernel

### 5.1 New public API

```rust
// crates/forge-kernel/src/validate.rs
pub fn validate_document_shape_for_path(
    value: &Value,
    path: Option<&Path>,
) -> Result<()>
```

Exported from `forge_kernel` crate root.

### 5.2 Bug fixes

| File | Fix |
|---|---|
| `src/canonical.rs` | Added `Ok(())` to empty-object and empty-array arms of `emit_value` |
| `src/source.rs` | Moved CRLF check before magic-line check so CRLF files get `CrLfLineEnding` error |
| `tests/conformance.rs` | Updated stale constitution hash constant |

---

## 6. Protected Path Audit

The following files were **not modified**:

```
.github/                    — unchanged
.forge/mind.forge           — unchanged (canonical_hash: sha256:3f2e4e...)
.forge/policies/**          — unchanged (constitution: sha256:a9f49b...)
.forge/network/**           — unchanged
apps/github-app/app-manifest.json — unchanged
schemas/forge-v1.schema.json      — unchanged
README.md, 02_README.md, 03_issue.md — unchanged
00_ForgeRoot_blueprint_設計書.md    — unchanged
```

---

## 7. Root Surface Before / After

| Before | After |
|---|---|
| 6 scrambled `*.alpha.forge` at root | 0 `*.alpha.forge` at root |
| 0 files in `.forge/agents/` (only `.gitkeep`) | 7 canonical agent genome files |
| `forge-kernel` did not compile | 20/20 tests pass |
| `validate_document_shape_for_path` did not exist | Function exported and tested |
