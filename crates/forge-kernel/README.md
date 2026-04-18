# forge-kernel

`forge-kernel` is the Phase 0 / T005 executable kernel for `.forge` v1 files.

It provides:

- strict source-form checks for the `#!forge/v1` envelope;
- UTF-8, LF, NFC, tab, anchor, alias, merge-key, and duplicate-key rejection;
- YAML parsing into a normalized JSON value tree;
- minimal v1 shape validation aligned with `schemas/forge-v1.schema.json`;
- deterministic canonical serialization;
- `sha256:<hex>` canonical hash calculation;
- integrity verification for `integrity.canonical_hash` when present.

## CLI

```bash
cargo run -p forge-kernel -- hash docs/specs/fixtures/forge-v1/valid/minimal-agent.forge
cargo run -p forge-kernel -- canonicalize docs/specs/fixtures/forge-v1/valid/minimal-agent.forge
cargo run -p forge-kernel -- verify .forge/mind.forge
```

## Library API

```rust
use forge_kernel::{parse_file, verify_integrity};

let doc = parse_file(".forge/mind.forge")?;
println!("{}", doc.canonical_hash);
verify_integrity(&doc.value)?;
```

## T005 boundary

This crate intentionally does not implement network, mutation, evaluator, UI, GitHub App, or pack compaction behavior.

For duplicate-key safety, the T005 scanner accepts block mappings plus empty inline maps (`{}`), and rejects non-empty flow-style mappings until the parser is upgraded to event-level duplicate detection. Empty arrays (`[]`) remain accepted and are used by canonical output.
