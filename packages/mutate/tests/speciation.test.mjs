import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SPECIATION_CONTRACT,
  createSpeciationProposal,
  runSpeciationProposal,
  runT048SpeciationProposal,
  validateSpeciationProposal,
  validateT048SpeciationProposal,
} from "../dist/index.js";

const NOW = "2026-07-04T00:00:00Z";

const PLANNER_PARENT = {
  kind: "agent",
  id: "forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha",
  title: "Planner Alpha",
  summary: "Deterministic bounded planner runtime.",
  identity: { role_name: "planner", species: "planner.alpha", persona: "conservative-scoper" },
  role: { mission: "Convert one accepted intake candidate into one bounded Plan Spec." },
  constitution: { approval_class: "B", mutable_paths: [".forge/agents/planner.alpha.forge"] },
  context_recipe: { static_slots: ["mind_summary"] },
  tools: [{ namespace: "repo", name: "repo.read_tree" }],
  evolution: { generation: 2, speciation_id: "sp_planner_alpha", parents: [], events: [] },
};

const REVIEWER_PARENT = {
  ...PLANNER_PARENT,
  id: "forge://hiroshitanaka-creator/ForgeRoot/agent/reviewer.alpha",
  title: "Reviewer Alpha",
  summary: "Bounded reviewer runtime.",
  identity: { role_name: "reviewer", species: "reviewer.alpha", persona: "risk-focused-reviewer" },
  constitution: { approval_class: "B", mutable_paths: [".forge/agents/reviewer.alpha.forge"] },
  evolution: { generation: 1, speciation_id: "sp_reviewer_alpha", parents: [], events: [] },
};

function parent(content = PLANNER_PARENT, overrides = {}) {
  const species = content.identity.species;
  return { path: `.forge/agents/${species}.forge`, species, content, ...overrides };
}

function child(overrides = {}) {
  return {
    path: ".forge/agents/planner.scoper.forge",
    species: "planner.scoper",
    role_name: "planner",
    title: "Planner Scoper",
    summary: "Planner child focused on bounded task scoping.",
    speciation_id: "sp_planner_scoper",
    rationale: "Separate scoping from scheduling so later guard code can evaluate lineage explicitly.",
    prompt_patch_ref: "prompt-patch-11111111",
    tool_routing_patch_ref: "tool-routing-patch-22222222",
    ...overrides,
  };
}

function rationale(overrides = {}) {
  return {
    summary: "Split planner responsibilities into explicit child roles.",
    expected_benefits: ["clearer role boundaries"],
    risks: ["lineage complexity increases"],
    ...overrides,
  };
}

function approval(overrides = {}) {
  return {
    requested_by: "human://hiroshitanaka-creator",
    approval_class: "C",
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
    ...overrides,
  };
}

function splitInput(overrides = {}) {
  return {
    now: NOW,
    mode: "split",
    parents: [parent()],
    children: [
      child(),
      child({
        path: ".forge/agents/planner.scheduler.forge",
        species: "planner.scheduler",
        title: "Planner Scheduler",
        summary: "Planner child focused on task sequencing.",
        speciation_id: "sp_planner_scheduler",
        rationale: "Keep sequencing separate from scoping.",
      }),
    ],
    rationale: rationale(),
    approval: approval(),
    supporting_mutations: [
      { type: "prompt_patch", mutation_id: "mut-11111111", target_path: ".forge/agents/planner.scoper.forge" },
      { type: "tool_routing", mutation_id: "mut-22222222", target_path: ".forge/agents/planner.scheduler.forge" },
    ],
    ...overrides,
  };
}

describe("T048 speciation proposal", () => {
  it("declares a deterministic dry-run-only speciation contract", () => {
    assert.equal(SPECIATION_CONTRACT.dryRunOnly, true);
    assert.equal(SPECIATION_CONTRACT.deterministic, true);
    assert.ok(SPECIATION_CONTRACT.validates.includes("lineage_metadata"));
    assert.ok(SPECIATION_CONTRACT.validates.includes("class_c_approval_metadata"));
    assert.ok(SPECIATION_CONTRACT.forbids.includes("silent_replacement"));
    assert.ok(SPECIATION_CONTRACT.forbids.includes("live_agent_file_write"));
  });

  it("creates a deterministic Class C split lineage proposal", () => {
    const input = splitInput();
    const result = createSpeciationProposal(input);

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "speciation_proposal_ready");
    assert.equal(result.mode, "split");
    assert.equal(result.parents.length, 1);
    assert.equal(result.children.length, 2);
    assert.equal(result.lineage_events[0].type, "role_split_proposed");
    assert.deepEqual(result.lineage_events[0].parent_species, ["planner.alpha"]);
    assert.deepEqual(result.lineage_events[0].child_species, ["planner.scoper", "planner.scheduler"]);
    assert.equal(result.review_gate.approval_class, "C");
    assert.equal(result.review_gate.human_review_required_before_execution, true);
    assert.equal(result.dry_run.file_written, false);
    assert.equal(result.dry_run.child_genomes_written, false);
    assert.equal(result.dry_run.parent_genomes_replaced, false);
    assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] });

    const replay = createSpeciationProposal(input);
    assert.equal(replay.proposal_id, result.proposal_id);
    assert.equal(replay.proposal_digest, result.proposal_digest);
    assert.deepEqual(replay.lineage_events, result.lineage_events);

    const changedChildTitle = createSpeciationProposal(splitInput({
      children: [
        child({ title: "Planner Scoper Variant" }),
        child({
          path: ".forge/agents/planner.scheduler.forge",
          species: "planner.scheduler",
          title: "Planner Scheduler",
          summary: "Planner child focused on task sequencing.",
          speciation_id: "sp_planner_scheduler",
          rationale: "Keep sequencing separate from scoping.",
        }),
      ],
    }));
    assert.equal(changedChildTitle.status, "dry_run_valid", JSON.stringify(changedChildTitle, null, 2));
    assert.notEqual(changedChildTitle.proposal_digest, result.proposal_digest);
  });

  it("creates a merge proposal without replacing parent genomes", () => {
    const result = createSpeciationProposal(splitInput({
      mode: "merge",
      parents: [parent(), parent(REVIEWER_PARENT)],
      children: [
        child({
          path: ".forge/agents/planner-reviewer.bridge.forge",
          species: "planner-reviewer.bridge",
          role_name: "planner-reviewer",
          title: "Planner Reviewer Bridge",
          summary: "Merged bridge role for planning and review handoff evaluation.",
          speciation_id: "sp_planner_reviewer_bridge",
          rationale: "Propose one bridge child while preserving both parents for review.",
        }),
      ],
      rationale: rationale({ summary: "Merge planner and reviewer handoff behavior into one explicit bridge proposal." }),
      supporting_mutations: [
        { type: "prompt_patch", mutation_id: "mut-33333333", target_path: ".forge/agents/planner-reviewer.bridge.forge" },
      ],
    }));

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    assert.equal(result.mode, "merge");
    assert.equal(result.lineage_events[0].type, "role_merge_proposed");
    assert.deepEqual(result.lineage_events[0].parent_species, ["planner.alpha", "reviewer.alpha"]);
    assert.equal(result.children[0].species, "planner-reviewer.bridge");
    assert.equal(result.dry_run.parent_genomes_replaced, false);
    assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] });
  });

  it("rejects invalid split and merge cardinality", () => {
    const cases = [
      { name: "split without exactly one parent", input: splitInput({ parents: [parent(), parent(REVIEWER_PARENT)] }), reason: "split_requires_one_parent" },
      { name: "split without multiple children", input: splitInput({ children: [child()] }), reason: "split_requires_multiple_children" },
      { name: "merge without multiple parents", input: splitInput({ mode: "merge", parents: [parent()], children: [child()] }), reason: "merge_requires_multiple_parents" },
      { name: "merge without one child", input: splitInput({ mode: "merge", parents: [parent(), parent(REVIEWER_PARENT)] }), reason: "merge_requires_one_child" },
    ];

    for (const { name, input, reason } of cases) {
      const result = createSpeciationProposal(input);
      assert.equal(result.status, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] }, name);
    }
  });

  it("rejects silent replacement of parent paths, species, or speciation IDs", () => {
    const result = createSpeciationProposal(splitInput({
      children: [
        child({
          path: ".forge/agents/planner.alpha.forge",
          species: "planner.alpha",
          title: "Planner Alpha Replacement",
          speciation_id: "sp_planner_alpha",
        }),
        child({
          path: ".forge/agents/planner.scheduler.forge",
          species: "planner.scheduler",
          title: "Planner Scheduler",
          speciation_id: "sp_planner_scheduler",
        }),
      ],
    }));

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "blocked_by_forbidden_target");
    assert.ok(result.reasons.includes("silent_replacement_forbidden"));
    assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] });
  });

  it("rejects child IDs that already appear in parent ancestry", () => {
    const result = createSpeciationProposal(splitInput({
      parents: [parent({
        ...PLANNER_PARENT,
        evolution: {
          ...PLANNER_PARENT.evolution,
          parents: [{ speciation_id: "sp_planner_scoper" }],
        },
      })],
    }));

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.ok(result.reasons.includes("lineage_cycle_forbidden"));
    assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] });
  });

  it("rejects parent lineage self-cycles before proposing lineage", () => {
    const result = createSpeciationProposal(splitInput({
      parents: [parent({
        ...PLANNER_PARENT,
        evolution: {
          ...PLANNER_PARENT.evolution,
          parents: [{ speciation_id: "sp_planner_alpha" }],
        },
      })],
    }));

    assert.equal(result.status, "rejected", JSON.stringify(result, null, 2));
    assert.ok(result.reasons.includes("lineage_cycle_forbidden"));
    assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] });
  });

  it("rejects forbidden targets and non-canonical parent identity", () => {
    const forbiddenChild = createSpeciationProposal(splitInput({
      children: [
        child({ path: ".forge/policies/constitution.forge", species: "constitution.root" }),
        child({ path: ".forge/agents/planner.scheduler.forge", species: "planner.scheduler", speciation_id: "sp_planner_scheduler" }),
      ],
    }));
    assert.equal(forbiddenChild.status, "rejected");
    assert.equal(forbiddenChild.decision, "blocked_by_forbidden_target");
    assert.ok(forbiddenChild.reasons.includes("forbidden_document_path"));

    const invalidTimestampForbiddenChild = createSpeciationProposal(splitInput({
      now: "2026-99-99T99:99:99Z",
      children: [
        child({ path: ".forge/policies/constitution.forge", species: "constitution.root" }),
        child({ path: ".forge/agents/planner.scheduler.forge", species: "planner.scheduler", speciation_id: "sp_planner_scheduler" }),
      ],
    }));
    assert.equal(invalidTimestampForbiddenChild.status, "rejected");
    assert.equal(invalidTimestampForbiddenChild.decision, "blocked_by_forbidden_target");
    assert.ok(invalidTimestampForbiddenChild.reasons.includes("now_must_be_rfc3339_utc"));
    assert.ok(invalidTimestampForbiddenChild.reasons.includes("forbidden_document_path"));

    const wrongParent = createSpeciationProposal(splitInput({
      parents: [parent(
        { ...PLANNER_PARENT, identity: { ...PLANNER_PARENT.identity, species: "auditor.alpha" } },
        { path: ".forge/agents/planner.alpha.forge", species: "planner.alpha" },
      )],
    }));
    assert.equal(wrongParent.status, "rejected");
    assert.ok(wrongParent.reasons.includes("target_content_species_mismatch"));
  });

  it("rejects malformed envelopes, rationale, approval, and supporting mutations", () => {
    const cases = [
      { name: "null input", input: null, reason: "input_must_be_object" },
      { name: "non-array parents", input: { ...splitInput(), parents: null }, reason: "parents_must_be_array" },
      { name: "missing rationale benefits", input: splitInput({ rationale: rationale({ expected_benefits: [] }) }), reason: "missing_expected_benefits" },
      { name: "impossible timestamp", input: splitInput({ now: "2026-99-99T99:99:99Z" }), reason: "now_must_be_rfc3339_utc" },
      { name: "non-Class-C approval", input: splitInput({ approval: approval({ approval_class: "B" }) }), reason: "class_c_approval_required" },
      { name: "missing merge gate", input: splitInput({ approval: approval({ human_review_required_before_merge: false }) }), reason: "approval_merge_gate_required" },
      { name: "bad supporting mutation", input: splitInput({ supporting_mutations: [{ type: "unknown", mutation_id: "bad", target_path: ".forge/agents/planner.scoper.forge" }] }), reason: "invalid_supporting_mutation_type" },
      { name: "out-of-scope supporting mutation", input: splitInput({ supporting_mutations: [{ type: "prompt_patch", mutation_id: "mut-44444444", target_path: ".forge/policies/constitution.forge" }] }), reason: "supporting_mutation_target_out_of_scope" },
    ];

    for (const { name, input, reason } of cases) {
      let result;
      assert.doesNotThrow(() => { result = createSpeciationProposal(input); }, name);
      assert.equal(result.status, "rejected", name);
      assert.ok(result.reasons.includes(reason), `${name} -> ${JSON.stringify(result.reasons)}`);
      assert.deepEqual(validateSpeciationProposal(result), { ok: true, issues: [] }, name);
    }
  });

  it("clones proposal metadata before returning the manifest", () => {
    const draftChild = child();
    const input = splitInput({
      children: [
        draftChild,
        child({ path: ".forge/agents/planner.scheduler.forge", species: "planner.scheduler", title: "Planner Scheduler", speciation_id: "sp_planner_scheduler" }),
      ],
    });
    const result = createSpeciationProposal(input);

    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));
    draftChild.title = "Mutated After Dry Run";
    input.rationale.expected_benefits.push("mutated after dry run");
    input.supporting_mutations[0].mutation_id = "mut-aaaaaaaa";

    assert.equal(result.children[0].title, "Planner Scoper");
    assert.deepEqual(result.rationale.expected_benefits, ["clearer role boundaries"]);
    assert.equal(result.supporting_mutations[0].mutation_id, "mut-11111111");
  });

  it("rejects tampered Class C gates and dry-run side effects during validation", () => {
    const result = createSpeciationProposal(splitInput());
    assert.equal(result.status, "dry_run_valid", JSON.stringify(result, null, 2));

    const withoutReviewGate = {
      ...result,
      review_gate: { ...result.review_gate, human_review_required_before_merge: false },
    };
    assert.equal(validateSpeciationProposal(withoutReviewGate).ok, false);
    assert.ok(validateSpeciationProposal(withoutReviewGate).issues.some((entry) => entry.code === "human_review_before_merge_required"));

    const missingReviewGate = {
      ...result,
      review_gate: null,
    };
    assert.doesNotThrow(() => validateSpeciationProposal(missingReviewGate));
    assert.equal(validateSpeciationProposal(missingReviewGate).ok, false);
    assert.ok(validateSpeciationProposal(missingReviewGate).issues.some((entry) => entry.code === "review_gate_required"));

    const downgradedReviewGate = {
      ...result,
      review_gate: { ...result.review_gate, risk: "medium", reasons: [] },
    };
    const downgradedReviewGateValidation = validateSpeciationProposal(downgradedReviewGate);
    assert.equal(downgradedReviewGateValidation.ok, false);
    assert.ok(downgradedReviewGateValidation.issues.some((entry) => entry.code === "high_risk_required"));
    assert.ok(downgradedReviewGateValidation.issues.some((entry) => entry.code === "review_gate_reasons_mismatch"));

    const withoutApprovalGate = {
      ...result,
      approval: { ...result.approval, human_review_required_before_execution: false },
    };
    assert.equal(validateSpeciationProposal(withoutApprovalGate).ok, false);
    assert.ok(validateSpeciationProposal(withoutApprovalGate).issues.some((entry) => entry.code === "approval_execution_gate_required"));

    const withFileWrite = {
      ...result,
      dry_run: { ...result.dry_run, child_genomes_written: true },
    };
    assert.equal(validateSpeciationProposal(withFileWrite).ok, false);
    assert.ok(validateSpeciationProposal(withFileWrite).issues.some((entry) => entry.code === "child_genome_write_forbidden"));

    const withSilentReplacement = {
      ...result,
      children: [
        { ...result.children[0], path: result.parents[0].path },
        result.children[1],
      ],
    };
    assert.equal(validateSpeciationProposal(withSilentReplacement).ok, false);
    assert.ok(validateSpeciationProposal(withSilentReplacement).issues.some((entry) => entry.code === "silent_replacement_forbidden"));

    const withPolicyTarget = {
      ...result,
      children: [
        { ...result.children[0], path: ".forge/policies/constitution.forge", species: "constitution.root" },
        result.children[1],
      ],
      mutation_record: {
        ...result.mutation_record,
        target_paths: [result.parents[0].path, ".forge/policies/constitution.forge", result.children[1].path],
      },
    };
    assert.equal(validateSpeciationProposal(withPolicyTarget).ok, false);
    assert.ok(validateSpeciationProposal(withPolicyTarget).issues.some((entry) => entry.code === "forbidden_document_path"));

    const withTamperedLineage = {
      ...result,
      lineage_events: [
        { ...result.lineage_events[0], child_species: ["auditor.alpha", "planner.scheduler"] },
      ],
    };
    assert.equal(validateSpeciationProposal(withTamperedLineage).ok, false);
    assert.ok(validateSpeciationProposal(withTamperedLineage).issues.some((entry) => entry.code === "lineage_child_species_mismatch"));

    const withStaleDigest = {
      ...result,
      children: [
        { ...result.children[0], summary: "Tampered child summary after digest generation." },
        result.children[1],
      ],
    };
    assert.equal(validateSpeciationProposal(withStaleDigest).ok, false);
    assert.ok(validateSpeciationProposal(withStaleDigest).issues.some((entry) => entry.code === "proposal_digest_mismatch"));

    const withImpossibleCreatedAt = {
      ...result,
      created_at: "2026-99-99T99:99:99Z",
    };
    assert.equal(validateSpeciationProposal(withImpossibleCreatedAt).ok, false);
    assert.ok(validateSpeciationProposal(withImpossibleCreatedAt).issues.some((entry) => entry.code === "invalid_created_at"));

    const withUnknownStatus = {
      ...result,
      status: "superseded",
    };
    assert.equal(validateSpeciationProposal(withUnknownStatus).ok, false);
    assert.ok(validateSpeciationProposal(withUnknownStatus).issues.some((entry) => entry.code === "invalid_status"));

    const withAcceptedPayloadDowngradedToRejected = {
      ...result,
      status: "rejected",
    };
    assert.equal(validateSpeciationProposal(withAcceptedPayloadDowngradedToRejected).ok, false);
    assert.ok(validateSpeciationProposal(withAcceptedPayloadDowngradedToRejected).issues.some((entry) => entry.code === "invalid_rejected_mutation_record_decision"));
    assert.ok(validateSpeciationProposal(withAcceptedPayloadDowngradedToRejected).issues.some((entry) => entry.code === "rejected_lineage_events_forbidden"));

    const withTamperedIds = {
      ...result,
      proposal_id: "speciation-proposal-deadbeef",
      mutation_record: { ...result.mutation_record, mutation_id: "mut-deadbeef" },
    };
    const tamperedIdValidation = validateSpeciationProposal(withTamperedIds);
    assert.equal(tamperedIdValidation.ok, false);
    assert.ok(tamperedIdValidation.issues.some((entry) => entry.code === "proposal_id_mismatch"));
    assert.ok(tamperedIdValidation.issues.some((entry) => entry.code === "mutation_id_mismatch"));

    const withExecutablePatchRef = {
      ...result,
      mutation_record: {
        ...result.mutation_record,
        patch_format: "unified-diff",
        patch_ref: "patches/speciation.diff",
      },
    };
    const executablePatchValidation = validateSpeciationProposal(withExecutablePatchRef);
    assert.equal(executablePatchValidation.ok, false);
    assert.ok(executablePatchValidation.issues.some((entry) => entry.code === "invalid_patch_format"));
    assert.ok(executablePatchValidation.issues.some((entry) => entry.code === "patch_ref_forbidden"));

    const rejected = createSpeciationProposal(splitInput({
      children: [
        child({ path: ".forge/policies/constitution.forge", species: "constitution.root" }),
        child({ path: ".forge/agents/planner.scheduler.forge", species: "planner.scheduler", speciation_id: "sp_planner_scheduler" }),
      ],
    }));
    assert.equal(rejected.status, "rejected", JSON.stringify(rejected, null, 2));
    const rejectedWithUnknownDecision = {
      ...rejected,
      decision: "approved",
    };
    const rejectedDecisionValidation = validateSpeciationProposal(rejectedWithUnknownDecision);
    assert.equal(rejectedDecisionValidation.ok, false);
    assert.ok(rejectedDecisionValidation.issues.some((entry) => entry.code === "invalid_rejected_decision"));
  });

  it("supports stable aliases", () => {
    for (const fn of [runSpeciationProposal, runT048SpeciationProposal]) {
      const result = fn(splitInput());
      assert.equal(result.status, "dry_run_valid");
      assert.deepEqual(validateT048SpeciationProposal(result), { ok: true, issues: [] });
    }
  });
});
