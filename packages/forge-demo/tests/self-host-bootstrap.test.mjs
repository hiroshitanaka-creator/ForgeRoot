import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SELF_HOST_BOOTSTRAP_CONTRACT,
  SELF_HOST_BOOTSTRAP_SCHEMA_REF,
  SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY,
  runSelfHostBootstrap,
  runT071SelfHostBootstrap,
  validateSelfHostBootstrap,
  validateT071SelfHostBootstrap,
} from "../dist/index.js";

const NOW = "2026-07-09T00:00:00Z";
const APPROVAL = { approved: true, approver: "hiroshitanaka-creator", approved_at: NOW };

function readyBootstrap(overrides = {}) {
  const result = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL, ...overrides });
  assert.equal(result.status, "ready", JSON.stringify(result, null, 2));
  return result;
}

describe("T071 self-host bootstrap", () => {
  it("declares a lab-only manifest contract with self-host execution always disabled", () => {
    assert.equal(SELF_HOST_BOOTSTRAP_CONTRACT.deterministic, true);
    assert.equal(SELF_HOST_BOOTSTRAP_CONTRACT.labOnly, true);
    assert.equal(SELF_HOST_BOOTSTRAP_CONTRACT.manifestOnly, true);
    assert.ok(SELF_HOST_BOOTSTRAP_CONTRACT.consumes.includes("t028_e2e_forged_pr_demo_manifest"));
    assert.ok(SELF_HOST_BOOTSTRAP_CONTRACT.forbids.includes("self_host_live_mode"));
    assert.ok(SELF_HOST_BOOTSTRAP_CONTRACT.forbids.includes("self_host_execution"));
    assert.ok(SELF_HOST_BOOTSTRAP_CONTRACT.forbids.includes("workflow_mutation"));
    assert.ok(SELF_HOST_BOOTSTRAP_CONTRACT.forbids.includes("policy_mutation"));
    assert.ok(SELF_HOST_BOOTSTRAP_CONTRACT.forbids.includes("real_pull_request_creation"));
  });

  it("is ready when the target is ForgeRoot, mode is dry_run, approval is present, and the T028 chain is ready", () => {
    const first = readyBootstrap();
    const second = readyBootstrap();

    assert.deepEqual(second, first);
    assert.equal(first.schema_ref, SELF_HOST_BOOTSTRAP_SCHEMA_REF);
    assert.equal(first.decision, "self_host_bootstrap_ready");
    assert.equal(first.request.target_repository, SELF_HOST_BOOTSTRAP_TARGET_REPOSITORY);
    assert.equal(first.request.self_host_mode, "dry_run");
    assert.equal(first.approval.approved, true);
    assert.equal(first.approval.approver, "hiroshitanaka-creator");
    assert.equal(first.invariants.forge_demo_chain_ready, true);
    assert.equal(first.forge_demo_ref.status, "ready");
    assert.deepEqual(validateSelfHostBootstrap(first), { ok: true, issues: [] });
  });

  it("keeps every self-host side-effect boundary closed even when ready", () => {
    const result = readyBootstrap();

    assert.equal(result.invariants.self_host_target_locked, true);
    assert.equal(result.invariants.self_host_live_mode_disabled, true);
    assert.equal(result.invariants.self_host_execution_performed, false);
    assert.equal(result.invariants.workflow_mutation_performed, false);
    assert.equal(result.invariants.policy_mutation_performed, false);
    assert.equal(result.invariants.real_pull_request_created, false);
    assert.equal(result.invariants.merge_or_approval_executed, false);
    assert.equal(result.invariants.human_bootstrap_approval_required, true);
  });

  it("blocks instead of running when human bootstrap approval is missing", () => {
    const result = runSelfHostBootstrap({ now: NOW });

    assert.equal(result.status, "blocked", JSON.stringify(result, null, 2));
    assert.equal(result.decision, "self_host_bootstrap_blocked");
    assert.equal(result.approval.approved, false);
    assert.equal(result.approval.approver, null);
    assert.equal(result.approval.approved_at, null);
    assert.ok(result.reasons.includes("human_bootstrap_approval_required"));
    assert.deepEqual(validateSelfHostBootstrap(result), { ok: true, issues: [] });
  });

  it("blocks when approved is true but approver or approved_at is missing", () => {
    const missingApprover = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: { approved: true, approved_at: NOW } });
    const missingApprovedAt = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: { approved: true, approver: "someone" } });

    assert.equal(missingApprover.status, "blocked");
    assert.equal(missingApprover.approval.approved, false);
    assert.equal(missingApprovedAt.status, "blocked");
    assert.equal(missingApprovedAt.approval.approved, false);
    assert.deepEqual(validateSelfHostBootstrap(missingApprover), { ok: true, issues: [] });
    assert.deepEqual(validateSelfHostBootstrap(missingApprovedAt), { ok: true, issues: [] });
  });

  it("blocks when the underlying T028 forge demo chain is not ready", () => {
    const blockedForgeDemo = { ...readyBootstrap().chain.forgeDemoResult, status: "blocked", decision: "blocked_before_pr_transport" };
    const blocked = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL, forgeDemoResult: blockedForgeDemo });

    assert.equal(blocked.status, "blocked", JSON.stringify(blocked, null, 2));
    assert.ok(blocked.reasons.includes("forge_demo_chain_not_ready"));
    assert.equal(blocked.invariants.forge_demo_chain_ready, false);
    assert.deepEqual(validateSelfHostBootstrap(blocked), { ok: true, issues: [] });
  });

  it("rejects every target repository other than hiroshitanaka-creator/ForgeRoot", () => {
    const otherRepo = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL, target_repository: "hiroshitanaka-creator/some-other-repo" });
    const emptyRepo = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL, target_repository: "" });

    assert.equal(otherRepo.status, "invalid");
    assert.ok(otherRepo.reasons.includes("forbidden_target"));
    assert.equal(emptyRepo.status, "invalid");
    assert.ok(emptyRepo.reasons.includes("forbidden_target"));
  });

  it("rejects self_host_mode live even when approval is present", () => {
    const result = runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL, self_host_mode: "live" });

    assert.equal(result.status, "invalid", JSON.stringify(result, null, 2));
    assert.ok(result.reasons.includes("self_host_mode_not_allowed"));
  });

  it("fails closed for invalid timestamps", () => {
    const result = runSelfHostBootstrap({ now: "2026-02-30T00:00:00Z", human_bootstrap_approval: APPROVAL });

    assert.equal(result.status, "invalid");
    assert.ok(result.reasons.includes("invalid_timestamp"));
    assert.deepEqual(validateSelfHostBootstrap(result), { ok: true, issues: [] });
  });

  it("rejects tampering of every ready manifest leaf field", () => {
    const result = readyBootstrap();
    const paths = leafPaths(result);

    assert.ok(paths.length > 1000, "tamper harness should cover the full bootstrap manifest including the embedded T028 chain");
    for (const path of paths) {
      const tampered = structuredClone(result);
      mutateAt(tampered, path);
      const validation = validateSelfHostBootstrap(tampered);
      assert.equal(validation.ok, false, `tampered path unexpectedly validated: ${path.join(".")}`);
    }
  });

  it("rejects an unapproved envelope that still carries approver/approved_at (spoofed approval)", () => {
    const spoofed = readyBootstrap();
    spoofed.approval.approved = false;

    const validation = validateSelfHostBootstrap(spoofed);
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((entry) => entry.code === "approval_envelope_not_empty" || entry.code === "ready_requires_approval"));
  });

  it("rejects ready results whose forge_demo_ref status disagrees with forge_demo_chain_ready", () => {
    const mismatched = readyBootstrap();
    mismatched.forge_demo_ref.status = "blocked";

    const validation = validateSelfHostBootstrap(mismatched);
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((entry) => entry.code === "forge_demo_ref_mismatch"));
  });

  it("rejects a chain whose embedded T028 result does not itself validate", () => {
    const corrupted = readyBootstrap();
    corrupted.chain.forgeDemoResult = { ...corrupted.chain.forgeDemoResult, manifest_version: 999 };

    const validation = validateSelfHostBootstrap(corrupted);
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((entry) => entry.code === "invalid_forge_demo_result"));
  });

  it("rejects an injected extra field via an explicit unknown-key rule, not only via digest mismatch", () => {
    const forged = readyBootstrap();
    forged.request.malicious_field = "x";

    const validation = validateSelfHostBootstrap(forged);
    assert.equal(validation.ok, false);
    assert.ok(validation.issues.some((entry) => entry.code === "unknown_key" && entry.path === "request.malicious_field"));
  });

  it("rejects unknown keys injected at the top level, in approval, invariants, and forge_demo_ref", () => {
    const topLevel = readyBootstrap();
    topLevel.unexpected_top_level = true;
    assert.ok(validateSelfHostBootstrap(topLevel).issues.some((entry) => entry.code === "unknown_key" && entry.path === "result.unexpected_top_level"));

    const approvalForged = readyBootstrap();
    approvalForged.approval.unexpected = true;
    assert.ok(validateSelfHostBootstrap(approvalForged).issues.some((entry) => entry.code === "unknown_key" && entry.path === "approval.unexpected"));

    const invariantsForged = readyBootstrap();
    invariantsForged.invariants.unexpected = true;
    assert.ok(validateSelfHostBootstrap(invariantsForged).issues.some((entry) => entry.code === "unknown_key" && entry.path === "invariants.unexpected"));

    const refForged = readyBootstrap();
    refForged.forge_demo_ref.unexpected = true;
    assert.ok(validateSelfHostBootstrap(refForged).issues.some((entry) => entry.code === "unknown_key" && entry.path === "forge_demo_ref.unexpected"));
  });

  it("supports stable T071 aliases", () => {
    const result = runT071SelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL });

    assert.deepEqual(result, runSelfHostBootstrap({ now: NOW, human_bootstrap_approval: APPROVAL }));
    assert.deepEqual(validateT071SelfHostBootstrap(result), validateSelfHostBootstrap(result));
  });
});

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
