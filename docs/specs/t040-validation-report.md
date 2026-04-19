# T040 validation report — SARIF bridge

Date: 2026-04-19 JST

## Scope

T040 adds a deterministic, manifest-only SARIF bridge inside `packages/auditor`.

The bridge converts internal Auditor / scan / sandbox evidence findings into a SARIF-compatible finding artifact for later security gates. It does not upload to GitHub Code Scanning, call GitHub APIs, mutate workflows, mutate policies, mutate rulesets, update memory/evaluation state, or perform federation/self-evolution behavior.

## Added artifacts

Implemented paths:

- `docs/specs/sarif-bridge.md`
- `packages/auditor/src/sarif.ts`
- `packages/auditor/tests/sarif.test.mjs`
- `docs/specs/fixtures/sarif-bridge/valid/audit-findings.json`
- `docs/specs/fixtures/sarif-bridge/valid/workspace-root-finding.json`
- `docs/specs/fixtures/sarif-bridge/valid/basic-audit-findings.json`
- `docs/specs/fixtures/sarif-bridge/invalid/absolute-path.json`
- `docs/specs/fixtures/sarif-bridge/invalid/secret-field.json`
- `docs/specs/fixtures/sarif-bridge/invalid/unknown-severity.json`
- `docs/specs/t040-validation-report.md`

Updated support paths:

- `packages/auditor/src/index.ts`
- `packages/auditor/scripts/build.mjs`
- `packages/auditor/package.json`
- `packages/auditor/dist/index.js`
- `packages/auditor/dist/index.d.ts`
- `packages/auditor/dist/sarif.js`
- `packages/auditor/dist/sarif.d.ts`

## API surface

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

Compatibility aliases:

```ts
createSarifBridgeArtifact(input, options?)
convertFindingsToSarif(input, options?)
normalizeFindingsToSarif(input, options?)
normalizeAuditFindingsToSarif(input, options?)
validateSarifBridgeArtifact(artifact)
validateSarifArtifact(artifact)
validateSarifFindingsArtifact(artifact)
```

## Contract

The T040 bridge consumes already-observed findings and emits one SARIF-like artifact with:

- `schema_ref: urn:forgeroot:sarif-bridge:v1`
- `sarif_version: 2.1.0`
- one deterministic `runs[0]` entry
- normalized tool rules
- normalized results
- stable SHA-256 `partialFingerprints.forgeRootFingerprint`
- summary counts for severity, level, rule IDs, and paths
- boundary guards proving the bridge did not perform live or policy-changing actions

## Acceptance coverage

| Requirement | Coverage |
|---|---|
| Same input produces same SARIF-like artifact | `sarif.test.mjs` compares normal and reversed input ordering and expects identical artifacts. |
| Severity mapping is documented | `docs/specs/sarif-bridge.md` defines high / medium / low / note mappings. |
| Severity mapping is tested | `normalizeSarifSeverity` tests cover critical/high/error, warning, info, none, and unknown rejection. |
| File path normalization is stable | `normalizeSarifPath` tests cover backslash conversion, leading `./`, repeated slash collapse, and workspace-root stripping through fixture coverage. |
| Unsafe path leakage is rejected | Tests and invalid fixtures reject absolute paths, drive-letter paths, URI schemes, `..` traversal, and secret-looking paths. |
| Rule ID is stable | Missing `ruleId` can derive from `category` / `code`; normalized IDs are deterministic and tested. |
| Fingerprint is stable | Fingerprints use SHA-256 over canonical normalized finding fields and are tested. |
| Malformed input is rejected | Tests cover missing message, unknown severity, unsafe path, top-level secret-like field, and invalid fixtures. |
| GitHub API is not called | Contract and artifact guards assert `no_github_api_call` and `no_github_code_scanning_upload`. |
| Workflow / policy / ruleset mutation is not performed | Contract and artifact guards assert no workflow, policy, ruleset, or branch protection mutation. |
| Security gate decision is not performed | Contract and artifact guards assert `no_security_gate_decision`; T041 remains responsible for gate decisions. |

## Commands run

```bash
node packages/auditor/scripts/build.mjs
node --check packages/auditor/dist/sarif.js
node --check packages/auditor/dist/index.js
node --check packages/auditor/dist/run.js
node --test --test-force-exit packages/auditor/tests/*.test.mjs
node --test --test-force-exit packages/rate-governor/tests/run.test.mjs
node --test --test-force-exit packages/approval-checkpoint/tests/run.test.mjs
node --test --test-force-exit packages/github-pr-adapter/tests/run.test.mjs
node --test --test-force-exit packages/pr-composer/tests/run.test.mjs
node --test --test-force-exit packages/executor/tests/*.test.mjs
node --test --test-force-exit packages/planner/tests/*.test.mjs
node --test --test-force-exit packages/forge-demo/tests/run.test.mjs
node --check packages/forge-demo/dist/run.js
node --check packages/rate-governor/dist/run.js
node --check packages/approval-checkpoint/dist/run.js
node --check packages/github-pr-adapter/dist/run.js
node --check packages/pr-composer/dist/run.js
node --check packages/executor/dist/index.js
node --check packages/planner/dist/run.js
```

## Result summary

- Auditor build script: pass
- Auditor tests including T040 SARIF bridge: 32 pass / 0 fail
  - T040 SARIF bridge tests: 10 pass / 0 fail
- Rate governor regression tests: 10 pass / 0 fail
- Approval checkpoint regression tests: 10 pass / 0 fail
- GitHub PR adapter regression tests: 10 pass / 0 fail
- PR composer regression tests: 8 pass / 0 fail
- Executor regression tests: 21 pass / 0 fail
- Planner regression tests: 23 pass / 0 fail
- Forge demo regression tests: 8 pass / 0 fail
- Node syntax checks: pass

## Boundary confirmation

T040 did not add:

- GitHub Code Scanning upload
- live GitHub API transport
- real PR creation
- merge or approval execution
- `.github/workflows/*` mutation
- branch protection or ruleset mutation
- security gate decision logic
- memory/evaluation state updates
- federation behavior
- self-evolution behavior
