# `.forge` v1 fixtures

These fixtures make `.forge` parser, schema, and canonical hash behavior visible during Phase 0.

## Valid fixtures

| Fixture | Expected result | Reason |
|---|---|---|
| `valid/minimal-agent.forge` | pass | Contains common required fields and all `kind: agent` required sections. |

## Hash fixtures

| Fixture | Expected result | Reason |
|---|---|---|
| `hash/equivalent-comments-a.forge` | pass | Canonical source with comments. |
| `hash/equivalent-comments-b.forge` | pass | Same logical tree as fixture A, with reordered source fields and different comments. |

Both hash fixtures must produce:

```text
sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d
```

## Invalid fixtures

| Fixture | Expected result | Reason |
|---|---|---|
| `invalid/missing-revision.forge` | fail | Omits the common required `revision` ULID. |
| `invalid/duplicate-key.forge` | fail | Contains a duplicate mapping key. |
| `invalid/crlf-line-endings.forge` | fail | Uses CRLF line endings. |
| `invalid/tab-indentation.forge` | fail | Contains a tab character. |
| `invalid/anchor-alias.forge` | fail | Uses YAML anchor/alias syntax. |
| `invalid/bad-magic.forge` | fail | Does not start with `#!forge/v1`. |
| `invalid/flow-mapping.forge` | fail | Uses a non-empty flow-style mapping, conservatively rejected by the T005 kernel. |
