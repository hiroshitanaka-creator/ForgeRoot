# `.forge` v1 fixtures

These fixtures are used by T004 to make the schema behavior visible before the canonical parser and hash kernel exist.

Expected results after stripping the `#!forge/v1` magic line and parsing the remaining YAML:

| Fixture | Expected result | Reason |
|---|---|---|
| `valid/minimal-agent.forge` | pass | Contains common required fields and all `kind: agent` required sections. |
| `invalid/missing-revision.forge` | fail | Omits the common required `revision` ULID. |

The source-form checks for UTF-8, LF, NFC, duplicate keys, anchors, and aliases are specified in `docs/specs/forge-v1.md` and are implemented later by the T005 parser/kernel.
