# T004 validation report

Task: `[P0][T004] forge v1 spec and schema`  
Date: 2026-04-18

## Scope checked

The T004 JSON Schema was checked against:

| Artifact | Expected | Result |
|---|---:|---:|
| `.forge/mind.forge` | pass | pass |
| `.forge/policies/constitution.forge` | pass | pass |
| `docs/specs/fixtures/forge-v1/valid/minimal-agent.forge` | pass | pass |
| `docs/specs/fixtures/forge-v1/invalid/missing-revision.forge` | fail | fail |

The invalid fixture fails because the common required field `revision` is absent.

## Validator assumptions

The validation run strips the `#!forge/v1` magic line before JSON Schema validation. It also treats RFC3339 timestamp scalars as strings, matching the `.forge` v1 YAML subset described in `docs/specs/forge-v1.md` rather than YAML 1.1 implicit timestamp conversion behavior.

Source-form checks such as duplicate key rejection, LF-only enforcement, NFC normalization, and anchor/alias rejection are specified in T004 and deferred to the T005 parser/kernel implementation.

## Boundary

This report demonstrates schema shape only. It does not claim that canonical hashes, signatures, attachment file existence, or Git-history monotonicity have been executed yet.
