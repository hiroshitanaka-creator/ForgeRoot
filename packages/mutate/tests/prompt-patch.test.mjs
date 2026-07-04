import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  PROMPT_PATCH_CONTRACT,
  applyPromptPatchDryRun,
  runPromptPatchDryRun,
  runT046PromptPatchDryRun,
  validatePromptPatchDryRun,
  validateT046PromptPatchDryRun,
} from "../dist/index.js";

const NOW = "2026-06-22T00:00:00Z";

const AGENT_DOCUMENT = {
  kind: "agent",
  id: "forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha",
  title: "Planner Alpha",
  summary: "Deterministic bounded planner runtime.",
  identity: { role_name: "planner", species: "planner.alpha", persona: "conservative-scoper" },
  role: { mission: "Convert one accepted intake candidate into one bounded Plan Spec.", forbidden_actions: ["branch_creation"] },
  constitution: { approval_class: "B", mutable_paths: [".forge/agents/planner.alpha.forge"] },
  context_recipe: { static_slots: ["mind_summary"], compaction_policy: "deterministic-summary-then-bounded-path-hints" },
  memory: { working_memory: { facts: ["T017 planner runtime is deterministic."] }, semantic_digests: [], forget_rules: { working_memory_ttl_days: 14 } },
  tools: [{ namespace: "repo", name: "repo.read_tree" }],
};

function baseInput(operations) {
  return { now: NOW, target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: AGENT_DOCUMENT }, operations };
}

describe("T046 prompt genome patcher", () => {
  it("declares an allowlisted, dry-run-only contract", () => {
    assert.equal(PROMPT_PATCH_CONTRACT.dryRunOnly, true);
    assert.equal(PROMPT_PATCH_CONTRACT.deterministic, true);
    assert.ok(PROMPT_PATCH_CONTRACT.forbids.includes("policy_document_target"));
    assert.ok(PROMPT_PATCH_CONTRACT.forbids.includes("identity_or_species_target"));
    assert.ok(PROMPT_PATCH_CONTRACT.forbids.includes("live_file_write"));
  });

  it("produces a deterministic dry-run diff for allowed prompt/context-recipe fields", () => {
    const result = applyPromptPatchDryRun(baseInput([
      { op: "replace", path: "role.mission", value: "Convert one accepted intake candidate into one bounded Plan Spec, deterministically." },
      { op: "add", path: "context_recipe.dynamic_slots", value: ["source_issue_or_event"] },
    ]));

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "prompt_patch_dry_run_ready");
    assert.equal(result.diff.length, 2);
    assert.equal(result.diff[0].before, AGENT_DOCUMENT.role.mission);
    assert.notEqual(result.before_digest, result.after_digest);
    assert.deepEqual(validatePromptPatchDryRun(result), { ok: true, issues: [] });

    const replay = applyPromptPatchDryRun(baseInput([
      { op: "replace", path: "role.mission", value: "Convert one accepted intake candidate into one bounded Plan Spec, deterministically." },
      { op: "add", path: "context_recipe.dynamic_slots", value: ["source_issue_or_event"] },
    ]));
    assert.equal(replay.patch_id, result.patch_id);
    assert.equal(replay.after_digest, result.after_digest);
  });

  it("includes canonicalized patch values in generated IDs", () => {
    const first = applyPromptPatchDryRun(baseInput([{ op: "replace", path: "title", value: "Planner Alpha A" }]));
    const second = applyPromptPatchDryRun(baseInput([{ op: "replace", path: "title", value: "Planner Alpha B" }]));

    assert.equal(first.status, "dry_run_valid");
    assert.equal(second.status, "dry_run_valid");
    assert.notEqual(first.patch_id, second.patch_id);
    assert.notEqual(first.mutation_record.mutation_id, second.mutation_record.mutation_id);
    assert.notEqual(first.after_digest, second.after_digest);
  });

  it("rejects patches targeting anything outside .forge/agents/<species>.forge", () => {
    const result = applyPromptPatchDryRun({
      now: NOW,
      target: { path: ".forge/policies/constitution.forge", species: "constitution", content: {} },
      operations: [{ op: "replace", path: "title", value: "tampered" }],
    });

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "blocked_by_forbidden_target");
    assert.equal(result.mutation_record.decision, "rejected");
    assert.ok(result.reasons.includes("forbidden_document_path"));
    assert.deepEqual(validatePromptPatchDryRun(result), { ok: true, issues: [] });
  });

  it("rejects patches targeting identity, constitution, or tool-routing fields", () => {
    for (const path of ["identity.role_name", "identity.species", "constitution.approval_class", "constitution.mutable_paths", "tools", "role.forbidden_actions"]) {
      const result = applyPromptPatchDryRun(baseInput([{ op: "replace", path, value: "anything" }]));
      assert.equal(result.status, "rejected", `${path} should be rejected`);
      assert.equal(result.decision, "blocked_by_forbidden_target");
      assert.ok(result.reasons.includes("path_not_in_allowed_prompt_fields"), `${path} -> ${JSON.stringify(result.reasons)}`);
    }
  });

  it("rejects malformed operations", () => {
    const badOp = applyPromptPatchDryRun(baseInput([{ op: "move", path: "role.mission", value: "x" }]));
    assert.equal(badOp.decision, "invalid_prompt_patch_input");
    assert.ok(badOp.reasons.includes("invalid_op_type"));

    const missingValue = applyPromptPatchDryRun(baseInput([{ op: "add", path: "role.mission" }]));
    assert.ok(missingValue.reasons.includes("missing_patch_value"));

    const duplicate = applyPromptPatchDryRun(baseInput([
      { op: "replace", path: "role.mission", value: "a" },
      { op: "replace", path: "role.mission", value: "b" },
    ]));
    assert.ok(duplicate.reasons.includes("duplicate_patch_target_path"));

    const empty = applyPromptPatchDryRun(baseInput([]));
    assert.ok(empty.reasons.includes("empty_operations"));
  });

  it("rejects structurally invalid request envelopes instead of throwing", () => {
    const cases = [
      { name: "null input", input: null, reason: "input_must_be_object" },
      { name: "empty input", input: {}, reason: "target_must_be_object" },
      { name: "non-object target", input: { target: null, operations: [] }, reason: "target_must_be_object" },
      { name: "non-array operations", input: { target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: AGENT_DOCUMENT }, operations: null }, reason: "operations_must_be_array" },
      { name: "non-object content", input: { target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: null }, operations: [] }, reason: "target_content_must_be_object" },
      { name: "non-object operation", input: { target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: AGENT_DOCUMENT }, operations: [null] }, reason: "operation_must_be_object" },
      { name: "non-string timestamp", input: { now: 1, target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: AGENT_DOCUMENT }, operations: [] }, reason: "now_must_be_string" },
      { name: "invalid timestamp", input: { now: "not-a-date", target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content: AGENT_DOCUMENT }, operations: [] }, reason: "now_must_be_rfc3339_utc" },
    ];

    for (const { name, input, reason } of cases) {
      let result;
      assert.doesNotThrow(() => { result = applyPromptPatchDryRun(input); }, name);
      assert.equal(result.status, "rejected", name);
      assert.equal(result.decision, "invalid_prompt_patch_input", name);
      assert.equal(result.mutation_record.decision, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validatePromptPatchDryRun(result), { ok: true, issues: [] }, name);
    }
  });

  it("rejects a species/path mismatch", () => {
    const result = applyPromptPatchDryRun({
      now: NOW,
      target: { path: ".forge/agents/planner.alpha.forge", species: "auditor.alpha", content: AGENT_DOCUMENT },
      operations: [{ op: "replace", path: "title", value: "x" }],
    });
    assert.ok(result.reasons.includes("species_path_mismatch"));
  });

  it("rejects non-canonical target content identity", () => {
    const cases = [
      { name: "non-agent kind", content: { ...AGENT_DOCUMENT, kind: "policy" }, reason: "target_content_kind_must_be_agent" },
      { name: "wrong id", content: { ...AGENT_DOCUMENT, id: "forge://hiroshitanaka-creator/ForgeRoot/agent/auditor.alpha" }, reason: "target_content_id_mismatch" },
      { name: "wrong identity species", content: { ...AGENT_DOCUMENT, identity: { ...AGENT_DOCUMENT.identity, species: "auditor.alpha" } }, reason: "target_content_species_mismatch" },
      { name: "wrong role name", content: { ...AGENT_DOCUMENT, identity: { ...AGENT_DOCUMENT.identity, role_name: "auditor" } }, reason: "target_content_role_name_mismatch" },
      { name: "missing identity", content: { ...AGENT_DOCUMENT, identity: null }, reason: "target_content_identity_must_be_object" },
    ];

    for (const { name, content, reason } of cases) {
      const result = applyPromptPatchDryRun({
        now: NOW,
        target: { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha", content },
        operations: [{ op: "replace", path: "title", value: "x" }],
      });
      assert.equal(result.status, "rejected", name);
      assert.equal(result.mutation_record.decision, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
    }
  });

  it("rejects replace and remove operations for missing target paths", () => {
    for (const op of ["replace", "remove"]) {
      const result = applyPromptPatchDryRun(baseInput([{ op, path: "context_recipe.dynamic_slots", value: ["late_slot"] }]));
      assert.equal(result.status, "rejected", op);
      assert.equal(result.mutation_record.decision, "rejected", op);
      assert.ok(result.reasons.includes("missing_patch_target_path"), `${op} -> ${JSON.stringify(result.reasons)}`);
    }
  });

  it("never claims file writes, GitHub calls, or auto-merge", () => {
    const result = applyPromptPatchDryRun(baseInput([{ op: "replace", path: "title", value: "Planner Alpha (patched)" }]));
    assert.deepEqual(result.dry_run, { file_written: false, github_api_called: false, auto_merged: false, policy_or_workflow_targeted: false });
    assert.equal(result.mutation_record.class, "prompt_patch");
    assert.equal(result.mutation_record.decision, "proposed");
    assert.equal(result.mutation_record.patch_ref, null);
  });

  it("clones operation values before returning the dry-run manifest", () => {
    const value = ["source_issue_or_event", { nested: ["initial"] }];
    const request = baseInput([{ op: "add", path: "context_recipe.dynamic_slots", value }]);
    const result = applyPromptPatchDryRun(request);

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    value[0] = "mutated_after_dry_run";
    value[1].nested.push("mutated_after_dry_run");

    assert.deepEqual(result.operations[0].value, ["source_issue_or_event", { nested: ["initial"] }]);
    assert.deepEqual(result.diff[0].after, ["source_issue_or_event", { nested: ["initial"] }]);
  });

  it("supports stable aliases", () => {
    for (const fn of [runPromptPatchDryRun, runT046PromptPatchDryRun]) {
      const result = fn(baseInput([{ op: "replace", path: "summary", value: "updated" }]));
      assert.equal(result.status, "dry_run_valid");
      assert.deepEqual(validateT046PromptPatchDryRun(result), { ok: true, issues: [] });
    }
  });
});
