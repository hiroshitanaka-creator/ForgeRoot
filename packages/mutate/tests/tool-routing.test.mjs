import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TOOL_ROUTING_CONTRACT,
  applyToolRoutingDryRun,
  applyToolRoutingPatchDryRun,
  runT047ToolRoutingDryRun,
  runToolRoutingDryRun,
  validateT047ToolRoutingDryRun,
  validateToolRoutingDryRun,
} from "../dist/index.js";

const NOW = "2026-07-04T00:00:00Z";

const AGENT_DOCUMENT = {
  kind: "agent",
  id: "forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha",
  title: "Planner Alpha",
  summary: "Deterministic bounded planner runtime.",
  identity: { role_name: "planner", species: "planner.alpha", persona: "conservative-scoper" },
  role: { mission: "Convert one accepted intake candidate into one bounded Plan Spec." },
  constitution: { approval_class: "B", mutable_paths: [".forge/agents/planner.alpha.forge"] },
  context_recipe: { static_slots: ["mind_summary"] },
  tools: [
    { namespace: "repo", name: "repo.read_tree", mode: "read", max_calls: 4, timeout_ms: 5000, approval: "none", fallback: null },
    { namespace: "repo", name: "repo.search_code", mode: "read", max_calls: 8, timeout_ms: 8000, approval: "none", fallback: "repo.read_tree" },
    { namespace: "gh", name: "gh.read_issue", mode: "read", max_calls: 2, timeout_ms: 5000, approval: "none", fallback: null },
  ],
  memory: { working_memory: { facts: [] }, semantic_digests: [], forget_rules: {} },
};

function baseInput(operations, content = AGENT_DOCUMENT) {
  return { now: NOW, target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content }, operations };
}

function route(namespace, name) {
  return { namespace, name };
}

function value(overrides = {}) {
  return { namespace: "repo", name: "repo.read_tree", mode: "read", max_calls: 4, timeout_ms: 5000, approval: "none", fallback: null, ...overrides };
}

describe("T047 tool-routing mutator", () => {
  it("declares a dry-run-only Class C tool-routing contract", () => {
    assert.equal(TOOL_ROUTING_CONTRACT.dryRunOnly, true);
    assert.equal(TOOL_ROUTING_CONTRACT.deterministic, true);
    assert.ok(TOOL_ROUTING_CONTRACT.validates.includes("allowed_tool_namespace"));
    assert.ok(TOOL_ROUTING_CONTRACT.validates.includes("bounded_max_calls"));
    assert.ok(TOOL_ROUTING_CONTRACT.forbids.includes("external_network_permission_expansion"));
    assert.ok(TOOL_ROUTING_CONTRACT.forbids.includes("approval_requirement_weakening"));
  });

  it("produces a deterministic diff summary and escalates permission expansion", () => {
    const operation = {
      op: "replace",
      route: route("repo", "repo.read_tree"),
      value: value({ max_calls: 6, approval: "human" }),
    };
    const result = applyToolRoutingDryRun(baseInput([operation]));

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "tool_routing_dry_run_ready");
    assert.equal(result.review_gate.approval_class, "C");
    assert.equal(result.review_gate.escalation_required, true);
    assert.equal(result.review_gate.human_review_required_before_execution, true);
    assert.ok(result.reasons.includes("tool_permission_expansion"));
    assert.equal(result.diff.length, 1);
    assert.equal(result.diff[0].permission_expansion, true);
    assert.equal(result.diff[0].summary, "replace repo:repo.read_tree (max_calls 4->6, approval none->human); permission expansion escalated");
    assert.notEqual(result.before_digest, result.after_digest);
    assert.deepEqual(validateToolRoutingDryRun(result), { ok: true, issues: [] });

    const replay = applyToolRoutingDryRun(baseInput([operation]));
    assert.equal(replay.patch_id, result.patch_id);
    assert.equal(replay.after_digest, result.after_digest);
    assert.deepEqual(replay.diff, result.diff);
  });

  it("allows bounded route additions only as Class C proposals", () => {
    const result = applyToolRoutingDryRun(baseInput([
      { op: "add", route: route("repo", "repo.inspect_diff"), value: value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 4000, approval: "human" }) },
    ]));

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    assert.equal(result.mutation_record.class, "tool_routing");
    assert.equal(result.mutation_record.approval_class, "C");
    assert.equal(result.mutation_record.decision, "proposed");
    assert.equal(result.diff[0].before, null);
    assert.equal(result.diff[0].after.name, "repo.inspect_diff");
    assert.equal(result.diff[0].permission_expansion, true);
    assert.equal(result.dry_run.file_written, false);
    assert.equal(result.dry_run.github_api_called, false);
    assert.equal(result.dry_run.auto_merged, false);
    assert.equal(result.dry_run.external_network_permission_expanded, false);
  });

  it("supports route removal without claiming permission expansion", () => {
    const result = applyToolRoutingDryRun(baseInput([{ op: "remove", route: route("gh", "gh.read_issue") }]));

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    assert.equal(result.diff[0].before.name, "gh.read_issue");
    assert.equal(result.diff[0].after, null);
    assert.equal(result.diff[0].permission_expansion, false);
    assert.deepEqual(validateToolRoutingDryRun(result), { ok: true, issues: [] });
  });

  it("rejects forbidden namespaces", () => {
    const result = applyToolRoutingDryRun(baseInput([
      { op: "add", route: route("browser", "browser.open"), value: value({ namespace: "browser", name: "browser.open", mode: "read", max_calls: 1, timeout_ms: 1000, approval: "human" }) },
    ]));

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "blocked_by_forbidden_target");
    assert.equal(result.mutation_record.decision, "rejected");
    assert.ok(result.reasons.includes("forbidden_tool_namespace"));
    assert.deepEqual(validateToolRoutingDryRun(result), { ok: true, issues: [] });
  });

  it("rejects max_calls and timeout budget overruns", () => {
    const overCalls = applyToolRoutingDryRun(baseInput([
      { op: "add", route: route("repo", "repo.inspect_diff"), value: value({ name: "repo.inspect_diff", max_calls: 9, timeout_ms: 4000, approval: "human" }) },
    ]));
    assert.equal(overCalls.status, "rejected");
    assert.ok(overCalls.reasons.includes("max_calls_budget_exceeded"));

    const overTimeout = applyToolRoutingDryRun(baseInput([
      { op: "add", route: route("repo", "repo.inspect_diff"), value: value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 8001, approval: "human" }) },
    ]));
    assert.equal(overTimeout.status, "rejected");
    assert.ok(overTimeout.reasons.includes("timeout_budget_exceeded"));
  });

  it("rejects duplicate resulting routes across multi-operation patches", () => {
    const result = applyToolRoutingDryRun(baseInput([
      { op: "replace", route: route("repo", "repo.read_tree"), value: value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 4000, approval: "human" }) },
      { op: "add", route: route("repo", "repo.inspect_diff"), value: value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 4000, approval: "human" }) },
    ]));

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.ok(result.reasons.includes("duplicate_resulting_tool_route"));
    assert.deepEqual(validateToolRoutingDryRun(result), { ok: true, issues: [] });
  });

  it("rejects fallback routes outside the namespace allowlist", () => {
    const result = applyToolRoutingDryRun(baseInput([
      { op: "add", route: route("repo", "repo.inspect_diff"), value: value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 4000, approval: "human", fallback: "browser.open" }) },
    ]));

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "invalid_tool_routing_input");
    assert.ok(result.reasons.includes("forbidden_fallback_namespace"));
    assert.deepEqual(validateToolRoutingDryRun(result), { ok: true, issues: [] });
  });

  it("rejects approval weakening and external-network modes", () => {
    const content = {
      ...AGENT_DOCUMENT,
      tools: [{ namespace: "repo", name: "repo.inspect_diff", mode: "read", max_calls: 2, timeout_ms: 4000, approval: "human", fallback: null }],
    };
    const weakened = applyToolRoutingDryRun(baseInput([
      { op: "replace", route: route("repo", "repo.inspect_diff"), value: value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 4000, approval: "none" }) },
    ], content));
    assert.equal(weakened.status, "rejected");
    assert.ok(weakened.reasons.includes("approval_requirement_weakening"));

    const network = applyToolRoutingDryRun(baseInput([
      { op: "add", route: route("repo", "repo.remote_fetch"), value: value({ name: "repo.remote_fetch", mode: "network", max_calls: 1, timeout_ms: 1000, approval: "code_owner" }) },
    ]));
    assert.equal(network.status, "rejected");
    assert.equal(network.decision, "blocked_by_forbidden_target");
    assert.ok(network.reasons.includes("external_network_mode_forbidden"));
  });

  it("rejects malformed envelopes, missing routes, and duplicate route targets", () => {
    const cases = [
      { name: "null input", input: null, reason: "input_must_be_object" },
      { name: "non-array operations", input: { target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: AGENT_DOCUMENT }, operations: null }, reason: "operations_must_be_array" },
      { name: "missing route", input: baseInput([{ op: "replace", route: route("repo", "repo.missing"), value: value({ name: "repo.missing" }) }]), reason: "missing_tool_route" },
      { name: "duplicate op route", input: baseInput([
        { op: "remove", route: route("gh", "gh.read_issue") },
        { op: "remove", route: route("gh", "gh.read_issue") },
      ]), reason: "duplicate_tool_route_target" },
      { name: "policy target", input: { now: NOW, target: { path: ".forge/policies/constitution.forge", species: "constitution", content: {} }, operations: [] }, reason: "forbidden_document_path" },
    ];

    for (const { name, input, reason } of cases) {
      let result;
      assert.doesNotThrow(() => { result = applyToolRoutingDryRun(input); }, name);
      assert.equal(result.status, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validateToolRoutingDryRun(result), { ok: true, issues: [] }, name);
    }
  });

  it("rejects non-canonical target content identity", () => {
    const result = applyToolRoutingDryRun(baseInput([
      { op: "remove", route: route("gh", "gh.read_issue") },
    ], { ...AGENT_DOCUMENT, identity: { ...AGENT_DOCUMENT.identity, species: "auditor.alpha" } }));

    assert.equal(result.status, "rejected");
    assert.ok(result.reasons.includes("target_content_species_mismatch"));
  });

  it("clones operation values before returning the dry-run manifest", () => {
    const toolValue = value({ name: "repo.inspect_diff", max_calls: 2, timeout_ms: 4000, approval: "human" });
    const result = applyToolRoutingDryRun(baseInput([{ op: "add", route: route("repo", "repo.inspect_diff"), value: toolValue }]));

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    toolValue.max_calls = 8;
    toolValue.fallback = "repo.search_code";

    assert.equal(result.operations[0].value.max_calls, 2);
    assert.equal(result.operations[0].value.fallback, null);
    assert.equal(result.diff[0].after.max_calls, 2);
    assert.equal(result.diff[0].after.fallback, null);
  });

  it("rejects tampered human-review gates during validation", () => {
    const result = applyToolRoutingDryRun(baseInput([{ op: "remove", route: route("gh", "gh.read_issue") }]));
    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));

    const withoutExecutionGate = {
      ...result,
      review_gate: { ...result.review_gate, human_review_required_before_execution: false },
    };
    assert.equal(validateToolRoutingDryRun(withoutExecutionGate).ok, false);
    assert.ok(validateToolRoutingDryRun(withoutExecutionGate).issues.some((entry) => entry.code === "human_review_before_execution_required"));

    const withoutMergeGate = {
      ...result,
      review_gate: { ...result.review_gate, human_review_required_before_merge: false },
    };
    assert.equal(validateToolRoutingDryRun(withoutMergeGate).ok, false);
    assert.ok(validateToolRoutingDryRun(withoutMergeGate).issues.some((entry) => entry.code === "human_review_before_merge_required"));
  });

  it("supports stable aliases", () => {
    for (const fn of [applyToolRoutingPatchDryRun, runToolRoutingDryRun, runT047ToolRoutingDryRun]) {
      const result = fn(baseInput([{ op: "remove", route: route("gh", "gh.read_issue") }]));
      assert.equal(result.status, "dry_run_valid");
      assert.deepEqual(validateT047ToolRoutingDryRun(result), { ok: true, issues: [] });
    }
  });
});
