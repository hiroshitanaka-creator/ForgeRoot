# T040 SARIF bridge

T040 defines a deterministic, manifest-only bridge from ForgeRoot audit or scan findings into a SARIF-compatible finding artifact.

The bridge is intentionally not a GitHub Code Scanning uploader. It produces a reviewable artifact that later security gates can consume.

## Scope

The bridge accepts already-observed evidence, such as Auditor findings, scan findings, or sandbox evidence summaries, and normalizes them into one SARIF-like artifact.

The bridge covers:

- severity normalization
- SARIF level normalization
- rule ID normalization
- safe repository-relative path normalization
- line and column normalization
- stable fingerprint generation
- deterministic result and rule ordering
- malformed finding rejection

## Out of scope

T040 does not perform:

- GitHub API calls
- GitHub Code Scanning upload
- `.github/workflows/*` creation or mutation
- branch protection or ruleset mutation
- security gate decisions
- memory or evaluation state updates
- federation or self-evolution behavior

## API

```ts
convertAuditFindingsToSarif(input, options?)
createSarifBridgeArtifact(input, options?)
convertFindingsToSarif(input, options?)
validateSarifBridgeInput(input, options?)
validateSarifLikeArtifact(artifact)
validateSarifBridgeArtifact(artifact)
normalizeSarifSeverity(value)
normalizeSarifPath(value, workspaceRoot?)
SARIF_BRIDGE_CONTRACT
```

`createSarifBridgeArtifact` and `convertFindingsToSarif` are compatibility aliases for `convertAuditFindingsToSarif`.

## Input contract

The input may be either an object with a `findings` array or a direct findings array.

```json
{
  "generated_at": "2026-04-19T00:00:00Z",
  "source": {
    "repository": "hiroshitanaka-creator/ForgeRoot",
    "task_id": "T040",
    "audit_id": "forge-audit://example",
    "plan_id": "forge-plan://example",
    "tool_name": "ForgeRoot Auditor",
    "source_artifact_sha256": null
  },
  "findings": [
    {
      "id": "AUD-0001",
      "severity": "error",
      "category": "scope",
      "message": "changed path touches immutable scope",
      "path": ".github/workflows/ci.yml",
      "line": 4,
      "column": 1
    }
  ]
}
```

Each finding must resolve to:

- a message
- a supported severity or level
- a rule ID, category, or code
- a safe repository-relative path
- positive integer line and column values, or omitted values that default to `1`

## Severity and SARIF level mapping

| Source values | Forge severity | SARIF level |
|---|---|---|
| `critical`, `high`, `error`, `fatal` | `high` | `error` |
| `medium`, `moderate`, `warning`, `warn` | `medium` | `warning` |
| `low`, `minor`, `info`, `informational`, `notice` | `low` | `note` |
| `note`, `none`, `pass`, `passed` | `note` | `note` |

Unsupported severity values are rejected. The bridge does not guess a severity.

## Path normalization

Paths are normalized to safe repository-relative URIs by:

- stripping an explicit `workspace_root` prefix when supplied by the input
- converting backslashes to slashes
- removing a leading `./`
- collapsing repeated slashes
- removing trailing slashes

The bridge rejects:

- absolute paths
- drive-letter paths
- URL or URI schemes
- home-relative paths beginning with `~`
- null bytes
- `.` or `..` path segments
- secret-looking path strings such as GitHub tokens or private key markers

The bridge also rejects input objects that contain secret-looking field names or values such as raw tokens. This prevents workspace path or credential leakage and ensures later gates compare stable repository paths.

## Fingerprints

Each SARIF-like result receives a `partialFingerprints.forgeRootFingerprint` value.

The fingerprint is a SHA-256 hash over a canonical JSON object containing:

- rule ID
- normalized path
- line
- column
- message
- Forge severity
- category

The same normalized finding always receives the same fingerprint.

## Output artifact

The bridge returns:

```json
{
  "status": "ready",
  "artifact": {
    "schema_ref": "urn:forgeroot:sarif-bridge:v1",
    "sarif_version": "2.1.0",
    "generated_at": "2026-04-19T00:00:00Z",
    "source": {},
    "runs": [
      {
        "tool": { "driver": { "name": "ForgeRoot Auditor", "rules": [] } },
        "results": []
      }
    ],
    "summary": {},
    "guards": {}
  },
  "issues": [],
  "reasons": ["sarif_bridge_ready"]
}
```

Invalid input returns `status: "invalid"` and no artifact.

## Boundary guards

Every generated artifact asserts that T040 did not perform live or policy-changing actions:

```json
{
  "no_github_code_scanning_upload": true,
  "no_github_api_call": true,
  "no_workflow_mutation": true,
  "no_policy_mutation": true,
  "no_ruleset_mutation": true,
  "no_branch_protection_mutation": true,
  "no_security_gate_decision": true,
  "no_memory_or_evaluation_update": true,
  "no_federation_or_self_evolution": true
}
```

## Determinism

The bridge sorts results by:

1. Forge severity rank, descending
2. rule ID
3. normalized path
4. start line
5. start column
6. message
7. source finding ID

Rules, summary rule IDs, and summary paths are also sorted.

## Fixtures

Valid fixtures are stored in:

```text
docs/specs/fixtures/sarif-bridge/valid/
```

Invalid fixtures are stored in:

```text
docs/specs/fixtures/sarif-bridge/invalid/
```
