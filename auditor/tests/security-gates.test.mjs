import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SECURITY_GATES_POLICY,
  DEFAULT_SECURITY_GATE_POLICY,
  SECURITY_GATES_CONTRACT,
  evaluateSecurityGate,
  runSecurityGate,
  validateSecurityGateDecision,
  validateSecurityGateInput,
  validateSecurityGateManifest,
  validateSecurityGatePolicy,
} from "../dist/index.js";

function fixture(path) {
  return JSON.parse(fs.readFileSync(new URL(`../../../docs/specs/fixtures/security-gates/${path}`, import.meta.url), "utf8"));
}

test("T041 contract remains manifest-only and forbids live GitHub/security-surface mutation", () => {
  assert.equal(SECURITY_GATES_CONTRACT.manifestOnly, true);
  assert.equal(SECURITY_GATES_CONTRACT.deterministic, true);
  assert.ok(SECURITY_GATES_CONTRACT.consumes.includes("sarif_like_artifact"));
  assert.ok(SECURITY_GATES_CONTRACT.produces.includes("security_gate_decision"));
  for (const forbidden of [
    "github_api_call",
    "github_code_scanning_upload",
    "branch_protection_mutation",
    "ruleset_mutation",
    "workflow_mutation",
    "dependency_review_live_api_integration",
    "pull_request_creation",
    "auto_merge",
    "self_evolution",
    "federation",
    "memory_or_evaluation_updates",
  ]) {
    assert.ok(SECURITY_GATES_CONTRACT.forbids.includes(forbidden), forbidden);
  }
});

test("default security gate policy validates and holds medium findings by default", () => {
  assert.deepEqual(validateSecurityGatePolicy(DEFAULT_SECURITY_GATES_POLICY), { ok: true, issues: [] });
  assert.deepEqual(validateSecurityGatePolicy(DEFAULT_SECURITY_GATE_POLICY), { ok: true, issues: [] });
  assert.equal(DEFAULT_SECURITY_GATES_POLICY.severity_actions.high, "block");
  assert.equal(DEFAULT_SECURITY_GATES_POLICY.severity_actions.medium, "hold");
});

test("blocks high severity SARIF-like findings before trusted transport", () => {
  const input = fixture("valid/high-block.json");
  const first = evaluateSecurityGate(input);
  const second = runSecurityGate(input);

  assert.equal(first.status, "blocked", JSON.stringify(first, null, 2));
  assert.equal(first.decision, "block");
  assert.deepEqual(second, first);
  assert.equal(first.manifest.schema_ref, "urn:forgeroot:security-gate-decision:v1");
  assert.equal(first.manifest.summary.max_severity, "high");
  assert.equal(first.manifest.summary.severity_counts.high, 1);
  assert.equal(first.manifest.summary.block_count, 1);
  assert.equal(first.manifest.approval_checkpoint.recommended_checkpoint_status, "block_transport_authorization");
  assert.equal(first.manifest.guards.no_github_api_call, true);
  assert.equal(first.manifest.guards.no_github_code_scanning_upload, true);
  assert.equal(first.manifest.guards.no_ruleset_mutation, true);
  assert.deepEqual(validateSecurityGateDecision(first.manifest), { ok: true, issues: [] });
  assert.deepEqual(validateSecurityGateManifest(first.manifest), { ok: true, issues: [] });
});

test("quarantines critical-equivalent source severities", () => {
  const result = evaluateSecurityGate(fixture("valid/critical-quarantine.json"));
  assert.equal(result.status, "quarantined", JSON.stringify(result, null, 2));
  assert.equal(result.decision, "quarantine");
  assert.equal(result.manifest.summary.quarantine_count, 1);
  assert.ok(result.manifest.finding_decisions[0].reasons.some((reason) => reason.includes("critical_source_severity")));
});

test("holds medium severity findings for approval policy instead of passing transport", () => {
  const result = evaluateSecurityGate(fixture("valid/medium-hold.json"));
  assert.equal(result.status, "held", JSON.stringify(result, null, 2));
  assert.equal(result.decision, "hold");
  assert.equal(result.manifest.summary.hold_count, 1);
  assert.equal(result.manifest.approval_checkpoint.recommended_checkpoint_status, "hold_for_human_review");
});

test("passes docs-only low severity findings without guessing missing scores", () => {
  const result = evaluateSecurityGate(fixture("valid/low-docs-pass.json"));
  assert.equal(result.status, "passed", JSON.stringify(result, null, 2));
  assert.equal(result.decision, "pass");
  assert.equal(result.manifest.summary.pass_count, 1);
  assert.equal(result.manifest.summary.affected_paths[0], "docs/specs/security-gates.md");
  assert.equal(result.manifest.finding_decisions[0].path_class, "low_risk_docs_or_tests");
  assert.equal(result.manifest.approval_checkpoint.recommended_checkpoint_status, "continue_to_approval_checkpoint");
});

test("quarantines denied rule IDs even when severity is low", () => {
  const result = evaluateSecurityGate(fixture("valid/denied-rule-quarantine.json"));
  assert.equal(result.status, "quarantined", JSON.stringify(result, null, 2));
  assert.equal(result.decision, "quarantine");
  assert.ok(result.manifest.finding_decisions[0].reasons.some((reason) => reason.includes("denied_rule_id")));
});

test("connects immutable path violations to quarantine", () => {
  const result = evaluateSecurityGate(fixture("valid/immutable-path-quarantine.json"));
  assert.equal(result.status, "quarantined", JSON.stringify(result, null, 2));
  assert.equal(result.decision, "quarantine");
  assert.deepEqual(result.manifest.summary.immutable_path_violations, [".forge/policies/runtime-mode.forge"]);
});

test("connects runtime and rate boundaries as summaries only", () => {
  const runtimeResult = evaluateSecurityGate(fixture("valid/runtime-quarantine.json"));
  assert.equal(runtimeResult.status, "quarantined", JSON.stringify(runtimeResult, null, 2));
  assert.equal(runtimeResult.manifest.boundary_decisions.some((item) => item.code === "kill_switch_engaged"), true);
  assert.equal(runtimeResult.manifest.boundary_decisions.some((item) => item.code === "runtime_quarantine_or_halted"), true);

  const input = fixture("valid/low-docs-pass.json");
  const rateResult = evaluateSecurityGate({ ...input, rate_gate: { status: "delayed", cooldown_active: true, retry_after_seconds: 60 } });
  assert.equal(rateResult.status, "held", JSON.stringify(rateResult, null, 2));
  assert.equal(rateResult.manifest.boundary_decisions.some((item) => item.code === "rate_governor_delay_or_cooldown"), true);
});

test("security gate output is deterministic for equivalent input", () => {
  const input = fixture("valid/high-block.json");
  const first = evaluateSecurityGate(input);
  const second = evaluateSecurityGate(structuredClone(input));
  assert.equal(first.status, "blocked");
  assert.deepEqual(first.manifest, second.manifest);
});

test("rejects malformed SARIF-like artifacts, secret input, and invalid policy", () => {
  for (const name of ["invalid/missing-sarif-artifact.json", "invalid/tampered-sarif-artifact.json", "invalid/bad-policy-action.json", "invalid/secret-field.json"]) {
    const result = evaluateSecurityGate(fixture(name));
    assert.equal(result.status, "invalid", name + JSON.stringify(result, null, 2));
    assert.equal(result.manifest, null);
    assert.equal(validateSecurityGateInput(fixture(name)).ok, false);
  }
});

test("security-gates.forge has the required Forge policy surface", () => {
  const source = fs.readFileSync(new URL("../../../.forge/policies/security-gates.forge", import.meta.url), "utf8");
  assert.ok(source.startsWith("#!forge/v1\n"));
  assert.equal(source.includes("\t"), false);
  assert.ok(source.includes("schema_ref: urn:forgeroot:forge:policy:v1"));
  assert.ok(source.includes("kind: policy"));
  assert.ok(source.includes("policy_type: security-gates"));
  assert.ok(source.includes("sarif-high-blocks-transport"));
  assert.ok(source.includes("no-live-github-mutation"));
  assert.ok(source.includes("github_api_call: false"));
});

test("tampered decision guards fail validation", () => {
  const result = evaluateSecurityGate(fixture("valid/low-docs-pass.json"));
  const tampered = structuredClone(result.manifest);
  tampered.guards.no_github_api_call = false;
  const validation = validateSecurityGateDecision(tampered);
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.some((item) => item.path === "/manifest/guards/no_github_api_call"));
});
