import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DISTRIBUTED_EVOLUTION_DEMO_CONTRACT,
  DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF,
  runDistributedEvolutionDemo,
  runT070DistributedEvolutionDemo,
  validateDistributedEvolutionDemo,
  validateT070DistributedEvolutionDemo,
} from "../dist/index.js";

const NOW = "2026-07-07T00:00:00Z";

function readyDemo(overrides = {}) {
  const result = runDistributedEvolutionDemo({ now: NOW, ...overrides });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  return result;
}

describe("T070 distributed evolution demo", () => {
  it("declares a lab-only manifest contract without live federation or self-evolution authority", () => {
    assert.equal(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.deterministic, true);
    assert.equal(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.labOnly, true);
    assert.equal(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.manifestOnly, true);
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.consumes.includes("t069_forge_net_topology"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.consumes.includes("t067_network_boundary"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.produces.includes("lab_only_distributed_evolution_chain"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.forbids.includes("open_federation"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.forbids.includes("live_network_transport"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.forbids.includes("github_api_call"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.forbids.includes("automatic_lineage_adoption"));
    assert.ok(DISTRIBUTED_EVOLUTION_DEMO_CONTRACT.forbids.includes("authoritative_reputation_write"));
  });

  it("runs the T069 lab route through lineage, boundary, cross-repo, arena, and report manifests", () => {
    const first = readyDemo();
    const second = readyDemo();

    assert.deepEqual(second, first);
    assert.equal(first.schema_ref, DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF);
    assert.equal(first.decision, "distributed_evolution_demo_ready");
    assert.deepEqual(first.steps.map((entry) => entry.name), [
      "lineage_pack",
      "peer_reputation",
      "network_boundary",
      "cross_repo_pr",
      "arena",
      "federation_report",
    ]);
    assert.equal(first.summary.route_id, "lib-api-stability-to-app");
    assert.equal(first.summary.source_peer_id, "forge-lab-lib");
    assert.equal(first.summary.target_peer_id, "forge-lab-app");
    assert.equal(first.chain.lineagePack.status, "lineage_pack_ready");
    assert.equal(first.chain.networkBoundary.status, "allowed");
    assert.equal(first.chain.crossRepoPr.status, "cross_repo_pr_ready");
    assert.equal(first.chain.arenaComparison.status, "arena_ready");
    assert.equal(first.chain.federationReport.status, "federation_report_ready");
    assert.equal(first.summary.arena_winner_candidate_id, "candidate-peer-evolution-11111111");
    assert.equal(first.invariants.all_read_back_validations_passed, true);
    assert.deepEqual(validateDistributedEvolutionDemo(first), { ok: true, issues: [] });
  });

  it("keeps every side-effect boundary closed in the generated chain", () => {
    const result = readyDemo();

    assert.equal(result.invariants.open_federation_enabled, false);
    assert.equal(result.invariants.live_network_transport_performed, false);
    assert.equal(result.invariants.github_api_called, false);
    assert.equal(result.invariants.github_pr_created, false);
    assert.equal(result.invariants.lineage_adoption_performed, false);
    assert.equal(result.invariants.policy_mutation_performed, false);
    assert.equal(result.invariants.authoritative_reputation_written, false);
    assert.equal(result.invariants.automatic_merge_performed, false);
    assert.equal(result.chain.lineagePack.dry_run.network_transport_performed, false);
    assert.equal(result.chain.lineagePack.import_candidate.adoption_performed, false);
    assert.equal(result.chain.networkBoundary.dry_run.open_federation_enabled, false);
    assert.equal(result.chain.crossRepoPr.dry_run.github_api_called, false);
    assert.equal(result.chain.crossRepoPr.dry_run.pull_request_created, false);
    assert.equal(result.chain.arenaComparison.dry_run.automatic_merge_performed, false);
    assert.equal(result.chain.federationReport.report_context.source_of_truth, false);
  });

  it("blocks open federation requests instead of weakening the boundary", () => {
    const result = runDistributedEvolutionDemo({ now: NOW, open_federation_requested: true });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "distributed_evolution_demo_blocked");
    assert.equal(result.chain.networkBoundary.status, "quarantined");
    assert.ok(result.chain.networkBoundary.reasons.includes("open_federation_forbidden"));
    assert.equal(result.chain.networkBoundary.dry_run.open_federation_enabled, false);
    assert.ok(result.reasons.includes("network_boundary_not_allowed"));
    assert.deepEqual(validateDistributedEvolutionDemo(result), { ok: true, issues: [] });
  });

  it("fails closed for invalid topology and invalid timestamps", () => {
    const invalidTopology = runDistributedEvolutionDemo({
      now: NOW,
      topology: { ...topology(), safety_boundaries: { ...topology().safety_boundaries, open_federation_enabled: true } },
    });
    const invalidTime = runDistributedEvolutionDemo({ now: "2026-02-31T00:00:00Z" });

    assert.equal(invalidTopology.status, "invalid");
    assert.ok(invalidTopology.reasons.includes("open_federation_forbidden"));
    assert.equal(invalidTime.status, "invalid");
    assert.ok(invalidTime.reasons.includes("invalid_timestamp"));
    assert.deepEqual(validateDistributedEvolutionDemo(invalidTopology), { ok: true, issues: [] });
    assert.deepEqual(validateDistributedEvolutionDemo(invalidTime), { ok: true, issues: [] });
  });

  it("rejects tampering of every ready manifest leaf field", () => {
    const result = readyDemo();
    const paths = leafPaths(result);

    assert.ok(paths.length > 200, "tamper harness should cover the full distributed evolution manifest");
    for (const path of paths) {
      const tampered = structuredClone(result);
      mutateAt(tampered, path);
      const validation = validateDistributedEvolutionDemo(tampered);
      assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join(".")}`);
    }
  });

  it("recomputes validation summary from chain manifests", () => {
    const summaryTampered = readyDemo();
    summaryTampered.validation_summary.lineage_pack = false;
    summaryTampered.invariants.all_read_back_validations_passed = false;

    const summaryValidation = validateDistributedEvolutionDemo(summaryTampered);
    assert.equal(summaryValidation.ok, false);
    assert.ok(summaryValidation.issues.some((entry) => entry.code === "validation_summary_mismatch"));
    assert.ok(summaryValidation.issues.some((entry) => entry.code === "ready_validation_required"));

    const chainTampered = readyDemo();
    delete chainTampered.chain.lineagePack;
    chainTampered.validation_summary.lineage_pack = false;
    chainTampered.invariants.all_read_back_validations_passed = false;

    const chainValidation = validateDistributedEvolutionDemo(chainTampered);
    assert.equal(chainValidation.ok, false);
    assert.ok(chainValidation.issues.some((entry) => entry.code === "chain_manifest_required"));
  });

  it("supports stable T070 aliases", () => {
    const result = runT070DistributedEvolutionDemo({ now: NOW });

    assert.deepEqual(result, runDistributedEvolutionDemo({ now: NOW }));
    assert.deepEqual(validateT070DistributedEvolutionDemo(result), validateDistributedEvolutionDemo(result));
  });
});

function topology() {
  return {
    schema_ref: "urn:forgeroot:forge-net-topology:v1",
    manifest_version: 1,
    topology_id: "t069-three-repo-forge-net-testnet",
    scope: "lab_only",
    source_of_truth: false,
    repositories: [
      { peer_id: "forge-lab-lib", repository_full_name: "forgeroot-labs/forge-lab-lib", status: "active", registry_known: true },
      { peer_id: "forge-lab-app", repository_full_name: "forgeroot-labs/forge-lab-app", status: "active", registry_known: true },
    ],
    treaty_links: [{
      treaty_id: "t069-lib-app-cccccccc",
      status: "active",
      source_peer_id: "forge-lab-lib",
      target_peer_id: "forge-lab-app",
      allowed_actions: ["lineage_export", "lineage_import_candidate", "cross_repo_pr"],
      expires_at: "2026-08-07T00:00:00Z",
    }],
    lineage_routes: [{
      route_id: "lib-api-stability-to-app",
      source_peer_id: "forge-lab-lib",
      target_peer_id: "forge-lab-app",
      treaty_id: "t069-lib-app-cccccccc",
    }],
    safety_boundaries: {
      lab_only: true,
      open_federation_enabled: false,
      network_transport_performed: false,
      github_api_called: false,
      github_pr_created: false,
      git_push_performed: false,
      policy_mutation_performed: false,
      lineage_adoption_performed: false,
    },
  };
}

function leafPaths(value, base = []) {
  if (value === null || typeof value !== "object") return [base];
  if (Array.isArray(value)) return value.flatMap((entry, index) => leafPaths(entry, [...base, index]));
  return Object.keys(value).flatMap((key) => leafPaths(value[key], [...base, key]));
}

function mutateAt(target, path) {
  let cursor = target;
  for (const segment of path.slice(0, -1)) cursor = cursor[segment];
  const leaf = path.at(-1);
  const current = cursor[leaf];
  if (typeof current === "string") cursor[leaf] = `${current}-tampered`;
  else if (typeof current === "number") cursor[leaf] = current + 1;
  else if (typeof current === "boolean") cursor[leaf] = !current;
  else if (current === null) cursor[leaf] = "tampered";
  else cursor[leaf] = "tampered";
}
