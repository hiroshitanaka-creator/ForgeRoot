import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(new URL(relativePath, import.meta.url), "utf8"));
}

const fixture = readJson("../../../docs/specs/fixtures/task-source/t029-t039-canonical.json");
const readiness = readJson("../../../docs/specs/fixtures/task-source/t042-readiness.json");

const completedPriorTasks = new Set([
  "T004",
  "T005",
  "T023",
  "T024",
  "T026",
  "T028",
]);

function numericTaskId(taskId) {
  const match = /^T(\d{3})$/.exec(taskId);
  return match ? Number(match[1]) : null;
}

test("T041-2 canonicalizes exactly the T029-T039 task-source gap", () => {
  assert.equal(fixture.schema_ref, "urn:forgeroot:task-source:t029-t039:v1");
  assert.equal(fixture.generated_by_task, "T041-2");
  const ids = fixture.tasks.map((task) => task.task_id);
  assert.deepEqual(ids, ["T029", "T030", "T031", "T032", "T033", "T034", "T035", "T036", "T037", "T038", "T039"]);
  assert.equal(new Set(ids).size, 11);
});

test("T029-T039 task definitions keep one bounded issue shape", () => {
  for (const task of fixture.tasks) {
    assert.match(task.task_id, /^T\d{3}$/);
    assert.equal(task.phase, "P2");
    assert.equal(typeof task.title, "string");
    assert.ok(task.title.length > 0);
    for (const field of ["goal", "why_now"]) {
      assert.equal(typeof task[field], "string", `${task.task_id}:${field}`);
      assert.ok(task[field].length > 0, `${task.task_id}:${field}`);
    }
    for (const field of ["suggested_labels", "scope", "out_of_scope", "dependencies", "deliverables", "acceptance_criteria", "risks"]) {
      assert.ok(Array.isArray(task[field]), `${task.task_id}:${field}`);
      assert.ok(task[field].length > 0, `${task.task_id}:${field}`);
    }
    assert.ok(task.suggested_labels.includes("phase:P2"));
    assert.ok(task.suggested_labels.some((label) => /^class:[ABCD]$/.test(label)));
    assert.ok(task.suggested_labels.some((label) => /^risk:(low|medium|high|critical)$/.test(label)));
    assert.ok(task.deliverables.includes(`docs/specs/${task.task_id.toLowerCase()}-validation-report.md`));
  }
});

test("T029-T039 dependencies are acyclic and point only to prior known task sources", () => {
  const seen = new Set();
  for (const task of fixture.tasks) {
    const current = numericTaskId(task.task_id);
    assert.ok(current !== null);
    for (const dependency of task.dependencies) {
      assert.match(dependency, /^T\d{3}$/);
      const depNumber = numericTaskId(dependency);
      assert.ok(depNumber !== null);
      assert.ok(
        completedPriorTasks.has(dependency) || seen.has(dependency),
        `${task.task_id} depends on noncanonical or later task ${dependency}`,
      );
      assert.ok(depNumber < current || completedPriorTasks.has(dependency), `${task.task_id} has a forward dependency on ${dependency}`);
    }
    seen.add(task.task_id);
  }
});

test("T041-2 readiness clears only the T029-T039 canonical-source blocker for T042", () => {
  assert.equal(readiness.schema_ref, "urn:forgeroot:t041-2:t042-readiness:v1");
  assert.equal(readiness.task_name, "T041-2");
  assert.deepEqual(readiness.canonicalized_task_source, fixture.tasks.map((task) => task.task_id));
  assert.equal(readiness.resolved_dependency_kind, "P2 memory/eval/provenance task definitions");
  assert.ok(readiness.t042_requires_before_implementation.includes("T040"));
  assert.ok(readiness.t042_requires_before_implementation.includes("T041"));
  assert.ok(readiness.t042_requires_before_implementation.includes("T041-2"));
  assert.ok(readiness.t042_blockers_cleared_by_t041_2.includes("T029-T039 canonical task source exists"));
  assert.ok(readiness.t042_blockers_not_cleared_by_t041_2.some((item) => item.includes("T041 security gates")));
});

test("T041-2 remains manifest-only and does not authorize live mutation", () => {
  const guards = readiness.manifest_only_guards;
  assert.equal(guards.no_github_api_call, true);
  assert.equal(guards.no_workflow_mutation, true);
  assert.equal(guards.no_policy_mutation, true);
  assert.equal(guards.no_ruleset_mutation, true);
  assert.equal(guards.no_branch_protection_mutation, true);
  assert.equal(guards.no_memory_or_evaluation_state_update, true);
  assert.equal(guards.no_federation_or_self_evolution, true);
});
