import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  SARIF_BRIDGE_CONTRACT,
  convertAuditFindingsToSarif,
  convertFindingsToSarif,
  createSarifBridgeArtifact,
  validateSarifBridgeArtifact,
  validateSarifBridgeInput,
  validateSarifLikeArtifact,
} from "../dist/index.js";

const NOW = "2026-04-18T00:00:00Z";

function fixture(path) {
  return JSON.parse(fs.readFileSync(new URL(`../../../docs/specs/fixtures/sarif-bridge/${path}`, import.meta.url), "utf8"));
}

test("T040 contract remains manifest-only and forbids live GitHub/security-surface mutation", () => {
  assert.equal(SARIF_BRIDGE_CONTRACT.manifestOnly, true);
  assert.equal(SARIF_BRIDGE_CONTRACT.deterministic, true);
  for (const forbidden of [
    "github_api_call",
    "github_code_scanning_upload",
    "workflow_mutation",
    "policy_mutation",
    "ruleset_mutation",
    "memory_or_evaluation_updates",
    "network_or_federation_behavior",
    "self_evolution",
  ]) {
    assert.ok(SARIF_BRIDGE_CONTRACT.forbids.includes(forbidden), forbidden);
  }
});

test("converts audit findings to a deterministic SARIF-like artifact", () => {
  const input = fixture("valid/audit-findings.json");
  const first = convertAuditFindingsToSarif(input);
  const second = convertAuditFindingsToSarif({ ...input, findings: [...input.findings].reverse() });

  assert.equal(first.status, "ready", JSON.stringify(first, null, 2));
  assert.equal(second.status, "ready", JSON.stringify(second, null, 2));
  assert.deepEqual(first.artifact.runs[0].results, second.artifact.runs[0].results);
  assert.equal(first.artifact.schema_ref, "urn:forgeroot:sarif-bridge:v1");
  assert.equal(first.artifact.sarif_version, "2.1.0");
  assert.equal(first.artifact.summary.result_count, 2);
  assert.equal(first.artifact.summary.severity_counts.high, 1);
  assert.equal(first.artifact.summary.severity_counts.note, 1);
  assert.match(first.artifact.runs[0].results[0].partialFingerprints.forgeRootFingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(validateSarifBridgeArtifact(first.artifact), { ok: true, issues: [] });
  assert.deepEqual(validateSarifLikeArtifact(first.artifact), { ok: true, issues: [] });
  assert.equal(first.artifact.guards.no_github_api_call, true);
  assert.equal(first.artifact.guards.no_github_code_scanning_upload, true);
});

test("maps ForgeRoot severities to SARIF levels", () => {
  const findings = [
    { id: "critical", severity: "critical", category: "security", message: "critical finding", path: "a.js" },
    { id: "medium", severity: "medium", category: "security", message: "medium finding", path: "b.js" },
    { id: "low", severity: "low", category: "security", message: "low finding", path: "c.js" },
    { id: "note", severity: "note", category: "security", message: "note finding", path: "d.js" },
  ];
  const result = convertAuditFindingsToSarif({ now: NOW, findings });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  const byPath = new Map(result.artifact.runs[0].results.map((item) => [item.locations[0].physicalLocation.artifactLocation.uri, item]));
  assert.equal(byPath.get("a.js").properties.forge_severity, "high");
  assert.equal(byPath.get("a.js").level, "error");
  assert.equal(byPath.get("b.js").properties.forge_severity, "medium");
  assert.equal(byPath.get("b.js").level, "warning");
  assert.equal(byPath.get("c.js").properties.forge_severity, "low");
  assert.equal(byPath.get("c.js").level, "note");
  assert.equal(byPath.get("d.js").properties.forge_severity, "note");
  assert.equal(byPath.get("d.js").level, "note");
});

test("normalizes workspace-root absolute paths into relative artifact URIs", () => {
  const input = fixture("valid/workspace-root-finding.json");
  const result = convertAuditFindingsToSarif(input);
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  assert.equal(result.artifact.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "packages/auditor/src/sarif.ts");
});

test("rejects malformed findings instead of emitting partial SARIF", () => {
  const result = convertAuditFindingsToSarif({
    now: NOW,
    findings: [
      { id: "bad-line", severity: "high", category: "scope", message: "line is invalid", path: "packages/auditor/src/sarif.ts", line: 0 },
      { id: "bad-path", severity: "medium", category: "scope", message: "path is invalid", path: "../escape.ts" },
    ],
  });
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.some((item) => item.code === "positive_integer"));
  assert.ok(result.issues.some((item) => item.code === "safe_relative_path"));
  assert.equal(result.artifact, null);
});

test("rejects absolute paths unless a workspace root explicitly bounds them", () => {
  const input = fixture("invalid/absolute-path.json");
  const validation = validateSarifBridgeInput(input);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.code === "safe_relative_path"));
});

test("rejects secret-bearing fields and secret-looking values", () => {
  const input = fixture("invalid/secret-field.json");
  const result = convertAuditFindingsToSarif(input);
  assert.equal(result.status, "invalid");
  assert.ok(result.issues.some((item) => item.code === "secret_like_field"));
  assert.ok(result.issues.some((item) => item.code === "secret_like_value"));
});

test("accepts auditResult.findings and preserves audit source metadata", () => {
  const result = createSarifBridgeArtifact({
    now: NOW,
    auditResult: {
      audit_id: "forge-audit://abc",
      source: { repository: "hiroshitanaka-creator/ForgeRoot", issue_number: 40, candidate_id: "T040", title: "SARIF bridge" },
      findings: [
        { id: "scope", severity: "error", category: "scope", message: "immutable scope changed", path: ".forge/policies/runtime-mode.forge", line: 2, column: 1 },
      ],
    },
  });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  assert.equal(result.artifact.source.audit_id, "forge-audit://abc");
  assert.equal(result.artifact.source.repository, "hiroshitanaka-creator/ForgeRoot");
  assert.equal(result.artifact.source.issue_number, 40);
  assert.equal(result.artifact.source.task_id, "T040");
});

test("alias exports route to the same deterministic converter", () => {
  const input = { now: NOW, findings: [{ severity: "warning", category: "x", message: "warning finding", path: "x.ts", ruleId: "x.rule" }] };
  assert.deepEqual(convertFindingsToSarif(input), convertAuditFindingsToSarif(input));
});

test("artifact validation catches tampered SARIF locations", () => {
  const result = convertAuditFindingsToSarif({ now: NOW, findings: [{ severity: "high", category: "x", message: "bad", path: "safe.ts" }] });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  const tampered = structuredClone(result.artifact);
  tampered.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri = "/tmp/leaked/safe.ts";
  const validation = validateSarifBridgeArtifact(tampered);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.code === "safe_relative_path"));
});
