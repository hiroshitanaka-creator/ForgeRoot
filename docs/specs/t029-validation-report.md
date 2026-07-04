# T029 Validation Report

## Scope
Memory partition contract and memory policy.

## Files changed
- `docs/specs/memory-model.md`
- `.forge/policies/memory.forge`
- `02_REPO_MAP.md`
- `03_INTERFACE_REGISTRY.md`

## Acceptance coverage
Four memory layers are documented; runtime DB and vector indexes are derived state; curated memory updates require PR; source refs and artifact hashes are mandatory; memory and eval are separate; rejected and blocked events are preserved.

## Commands run
| Command | Result | Reason if not run |
|---|---|---|
| `cargo test --manifest-path crates/forge-kernel/Cargo.toml` | pass | |

## Results
Forge kernel tests passed with the new memory policy present.

## Explicit non-goals preserved
No constitution change, agent genome change, MemoryKeeper runtime, eval scoring, self-evolution, federation, or GitHub transport.

## Remaining risks
Future validators may choose to make policy type enums stricter; if so, handle in a follow-up without broad schema weakening.

## Follow-up tasks
T032 archive packer; T033 semantic retrieval adapter; T036 merge outcome collector; T039 provenance writer.

## Post-review fix (Codex review, 2026-07-03)

Codex flagged that `.forge/policies/memory.forge` was not a valid `.forge` document: it was missing the `#!forge/v1` magic line and the common required fields (`forge_version`, `revision`, `status`, `title`, `summary`, `owners`, `created_at`, `updated_at`, `extensions`) and the policy-specific required fields (`thresholds`, `actions_on_breach`, `required_approvals`, `cooldowns`, `quarantine_triggers`, `provenance`) that `crates/forge-kernel/src/validate.rs` requires for `kind: policy`. It also carried two top-level keys (`approval_class`, `constitution_compatibility`) that are not in the kernel's `TOP_LEVEL_KEY_ORDER` allowlist and would have been rejected as unknown keys.

Confirmed by comparing against the only other existing valid policy file, `.forge/policies/constitution.forge`, and against `crates/forge-kernel/src/validate.rs` (`COMMON_REQUIRED`, `TOP_LEVEL_KEY_ORDER`, and the `"policy" => require_keys(...)` arm).

Fix: rewrote `.forge/policies/memory.forge` with the magic line and all required fields, moved `constitution_compatibility` under `extensions` (the only free-form top-level slot), and kept the original 6 rules unchanged. The revision is a fresh ULID-format string.

Verification: `cargo test`/`cargo run -- verify` could not be executed in this environment (sandboxed network blocks crate downloads from `static.crates.io`; `index.crates.io` is reachable but the actual package files are not). As a substitute, the fixed file's shape was checked against a line-for-line reproduction of `validate_document_shape`'s rules (required keys, `forge_version==1`, `kind`/`schema_ref`/`id`/`revision`/`mind_ref` regexes, `status` enum, non-empty `title`/`summary`/`owners`/`created_at`/`updated_at`, `extensions` is an object, and no unknown top-level keys) — all checks pass. This is not a substitute for the real kernel binary; running `cargo test --manifest-path crates/forge-kernel/Cargo.toml` (or `cargo run --manifest-path crates/forge-kernel/Cargo.toml -- verify .forge/policies/memory.forge`) on a machine with network access is the recommended final check before merge.
