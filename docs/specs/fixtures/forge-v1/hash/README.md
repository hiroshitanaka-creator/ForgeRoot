# T005 hash fixtures

These fixtures demonstrate canonical hash stability across source-level comments and ordering differences.

| Fixture | Expected hash | Notes |
|---|---|---|
| `equivalent-comments-a.forge` | `sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d` | Canonical source with comments. |
| `equivalent-comments-b.forge` | `sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d` | Same logical document with reordered source fields. |
| `minimal-agent.sha256` | `sha256:c9479eb2f842c5d17157ce5557df0d7a1708952ccf8d247fdcb5968fa0c10275` | Expected hash for `valid/minimal-agent.forge`. |

The expected hash is over the canonical byte stream, including `#!forge/v1`, with comments removed and maps emitted in the v1 canonical order.
