# ForgeRoot Decision Log

This file records significant architectural and process decisions made during ForgeRoot development. Each entry captures what was decided, why, and what was rejected.

---

## D-0001 — Canonical agent genome location is `.forge/agents/<species>.forge`

**Date:** 2026-06-17  
**Task:** T041-3 Genome Integrity  
**Status:** accepted

**Decision:** All agent `.forge` identity files are stored exclusively at `.forge/agents/<species>.forge`. Root-level `*.alpha.forge` files are quarantine candidates and must not be treated as canonical.

**Rationale:** During T017–T027 agent seeding, six root-level `*.alpha.forge` files accumulated with scrambled/incorrect content. The canonical layout aligns with the `forge://…/agent/<species>` URI scheme and allows path-aware validation to enforce species↔id↔role_name consistency.

**Rejected alternatives:**
- Storing agent files at the repo root: rejected because root is for human-facing documentation, not genome artifacts.
- Flattening all `.forge/` kinds into a single directory: rejected because it prevents kind-based path enforcement.

---

## D-0002 — Path-aware validation is additive; `validate_document_shape_for_path` wraps base validator

**Date:** 2026-06-17  
**Task:** T041-3 Genome Integrity  
**Status:** accepted

**Decision:** `validate_document_shape_for_path(value, path)` calls `validate_document_shape(value)` first, then applies path-location consistency checks. Passing `None` as path is identical to calling the base validator.

**Rationale:** Keeps the base validator reusable for content-only validation (e.g., round-trip tests, in-memory construction). Path checks are layered on top without duplicating base logic.

**Rejected alternatives:**
- Single unified validator that always requires a path: rejected because many callers (hash fixtures, unit tests) don't have a meaningful path.

---

## D-0003 — `identity.role_name` must equal the species prefix (segment before first `.`)

**Date:** 2026-06-17  
**Task:** T041-3 Genome Integrity  
**Status:** accepted

**Decision:** For species `foo-bar.alpha`, `role_name` must be `foo-bar` (hyphenated, exact match to the prefix before `.alpha`). Underscore variants (e.g., `foo_bar`) are rejected.

**Rationale:** Species URIs use hyphens; `role_name` is used as a logical identifier in authorization and dispatch tables. Allowing both hyphen and underscore forms would create ambiguous lookups. The `pr-composer.alpha.forge` file had `role_name: pr_composer` (underscore) which was corrected during T041-3.

**Rejected alternatives:**
- Normalizing underscores to hyphens at read time: rejected because it silently hides malformed identity definitions.

---

## D-0004 — Root-level `*.alpha.forge` files are deleted, not archived

**Date:** 2026-06-17  
**Task:** T041-3 Genome Integrity  
**Status:** accepted

**Decision:** The six root-level `*.alpha.forge` files (planner, executor, auditor, pr-composer, github-pr-adapter, rate-governor) were deleted. Their correct canonical content already exists in `.forge/agents/`. The scrambled content they contained has no archival value.

**Rationale:** Keeping misplaced files creates confusion about the canonical genome source. Git history preserves them for forensic purposes if needed.

**Rejected alternatives:**
- Moving them to a `_quarantine/` directory: rejected because quarantine directories were not established in policy and the content was provably wrong (wrong kind, wrong id).

---

## D-0005 — Pre-existing `canonical.rs` compilation errors fixed as part of T041-3

**Date:** 2026-06-17  
**Task:** T041-3 Genome Integrity  
**Status:** accepted

**Decision:** Two type errors in `emit_value` (`canonical.rs:182–190`) were fixed by adding missing `Ok(())` returns. One ordering bug in `source.rs` (CRLF check fired after magic-line check) was corrected. One stale hash constant in `conformance.rs` was updated to match the actual constitution file.

**Rationale:** These were latent bugs introduced before T041-3. The code never compiled cleanly, so the bugs were masked. Fixing them is required for `cargo test` to pass, which is an acceptance criterion for T041-3.

**Rejected alternatives:**
- Leaving the compilation errors and marking tests as `#[ignore]`: rejected because the task explicitly requires `cargo test` to pass.
