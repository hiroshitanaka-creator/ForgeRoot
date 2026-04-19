# T005 validation report

Status: **seeded implementation report**
Task: `T005 canonical parser and hash kernel`

T005 adds `crates/forge-kernel/` as the first executable `.forge` v1 parser/hash kernel. The implementation follows the T004 contract: source-form validation first, parsed tree validation second, canonical byte serialization third, and SHA-256 hashing last.

## Implemented checks

| Layer | Implemented in T005 | Notes |
|---|---:|---|
| Magic line | yes | Requires exactly `#!forge/v1` followed by LF. |
| UTF-8 | yes | Non-UTF-8 bytes reject before parsing. |
| LF-only | yes | Any CR/CRLF rejects. |
| NFC | yes | Entire source must be Unicode NFC. |
| Tabs | yes | Any tab character rejects. |
| Anchors / aliases / merge keys | yes | Rejected before YAML parse. |
| Duplicate keys | yes | Block-style mapping duplicate detection. |
| Non-empty flow mappings | rejected | Conservative T005 boundary to avoid duplicate-key ambiguity. |
| Shape validation | yes | Common required fields and kind-specific required sections. |
| Canonical hash | yes | Includes magic line and applies integrity zero-hash/signature rules. |

## Expected conformance results

| Artifact | Expected result | Expected canonical hash / rejection |
|---|---:|---|
| `.forge/mind.forge` | pass | `sha256:3f2e4e4793194d00e1c73982e79591633349e3b47a64db7e01af464103b81702` |
| `.forge/policies/constitution.forge` | pass | `sha256:bc996728112cdf6793e815d5248cd77beff29c28869f9539423846f75f7adfec` |
| `valid/minimal-agent.forge` | pass | `sha256:c9479eb2f842c5d17157ce5557df0d7a1708952ccf8d247fdcb5968fa0c10275` |
| `hash/equivalent-comments-a.forge` | pass | `sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d` |
| `hash/equivalent-comments-b.forge` | pass | `sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d` |
| `invalid/missing-revision.forge` | fail | missing common required `revision` |
| `invalid/duplicate-key.forge` | fail | duplicate mapping key |
| `invalid/crlf-line-endings.forge` | fail | CR/CRLF line ending |
| `invalid/tab-indentation.forge` | fail | tab character |
| `invalid/anchor-alias.forge` | fail | YAML anchor/alias |
| `invalid/bad-magic.forge` | fail | missing magic line |
| `invalid/flow-mapping.forge` | fail | non-empty flow mapping rejected by T005 kernel boundary |

## Local verification command

```bash
cargo test -p forge-kernel
```

This environment does not include a Rust toolchain, so `cargo test` could not be executed here. The expected hashes in this report were generated with a small spec-matching reference canonicalizer to lock the fixture contract for the Rust tests.

## Deferred beyond T005

- Full JSON Schema Draft 2020-12 validation inside Rust.
- Event-level YAML duplicate detection for non-empty flow mappings.
- Signature verification.
- Attachment existence and attachment hash verification.
- Pack compaction, replay, evaluator, network, and UI behavior.
