# Working Memory Update Spec

**Task:** T030  
**Schema ref:** `urn:forgeroot:working-memory-update:v1`  
**Status:** Implemented  
**Last updated:** 2026-06-17

---

## Purpose

Define the deterministic working memory update manifest: the artifact produced by `createWorkingMemoryUpdate` that captures short-term facts for the ForgeRoot agent memory surface. This manifest is the pre-PR artifact — it must not be written directly to `.forge`; it becomes a `.forge` memory change only when committed via a reviewed pull request.

---

## Schema

```typescript
interface WorkingMemoryUpdate {
  manifest_version: 1;
  schema_ref: "urn:forgeroot:working-memory-update:v1";
  update_id: string;        // prefix: forge-memory-update://
  created_at: string;       // RFC3339 UTC

  target: {
    repository: string | null;
    mind_id: string;         // required
    agent_species: string | null;
    memory_layer: "working_memory";  // fixed
  };

  source: {
    task_id: string;         // required, starts with T
    plan_id: string | null;
    audit_id: string | null;
    pr_number: number | null;
    artifact_sha256: string; // required: sha256:<64 hex>
    reason: string;          // required, non-empty
  };

  facts: readonly WorkingMemoryFact[];

  retention: {
    ttl_days: number;           // default 90
    keep_last_accepted: number; // default 50
    keep_last_rejected: number; // default 20
  };

  approval: {
    approval_class: "A" | "B" | "C" | "D";
    update_requires_pr: true;   // always true
    direct_write_allowed: false; // always false
  };

  guards: {
    no_direct_forge_write: true;
    no_runtime_db_authority: true;
    source_refs_required: true;
    deterministic_ordering: true;
    max_items_enforced: true;
    no_eval_score_update: true;
    no_github_api_call: true;
  };

  provenance: {
    generated_by: "forgeroot-memory.working";
    task: "T030";
  };
}

interface WorkingMemoryFact {
  id: string;            // required, non-empty
  text: string;          // required, non-empty
  confidence: number;    // 0.0 to 1.0
  source_ref: string;    // required, non-empty
  tags: readonly string[]; // sorted, unique
}
```

---

## Determinism Rules

1. **Fact deduplication**: Facts with the same normalized id (case-insensitive) are deduplicated; the first occurrence wins.
2. **Fact ordering**: Facts are sorted by `id` using lexicographic `localeCompare`.
3. **Tag ordering**: Tags within each fact are sorted using `localeCompare` and deduplicated.
4. **update_id**: If not supplied or invalid, a deterministic `forge-memory-update://<ts>-<rnd>` is generated.
5. **created_at**: If not supplied or invalid RFC3339 UTC, the current time is used.

Given the same ordered input with no duplicates, `createWorkingMemoryUpdate` produces the same fact set in the same order.

---

## Source Ref Requirements

All three of these fields are mandatory:

| Field | Constraint |
|---|---|
| `source.task_id` | Non-empty, starts with `T` (e.g. `T030`) |
| `source.artifact_sha256` | Matches `sha256:<64 lowercase hex>` |
| `source.reason` | Non-empty human-readable string |

Missing or invalid source refs cause `createWorkingMemoryUpdate` to return `{ ok: false }`. The validator `validateWorkingMemoryUpdate` also rejects manifests with missing source refs.

---

## Validation Rules

| Rule | Enforced by |
|---|---|
| `manifest_version === 1` | validate |
| `schema_ref` exact match | validate |
| `update_id` starts with `forge-memory-update://` | validate |
| `created_at` is RFC3339 UTC | validate |
| `target.mind_id` non-empty | create + validate |
| `target.memory_layer === "working_memory"` | validate |
| `source.task_id` starts with `T` | create + validate |
| `source.artifact_sha256` matches `sha256:<64 hex>` | create + validate |
| `source.reason` non-empty | create + validate |
| `facts.length > 0` | create + validate |
| `facts.length <= max_items` | create |
| Each fact has non-empty `id`, `text`, `source_ref` | create + validate |
| `confidence` is 0.0–1.0 | create + validate |
| Facts sorted by id | create (auto-sort) + validate (checks order) |
| No duplicate fact ids (normalized) | create (dedup) + validate |
| Tags sorted and unique within each fact | create (auto-sort) + validate |
| `approval.update_requires_pr === true` | validate |
| `approval.direct_write_allowed === false` | validate |
| All `guards` fields are `true` | validate |
| No secret-like key names (TOKEN, SECRET, PASSWORD, PRIVATE_KEY, CREDENTIAL) | create + validate |

---

## Forbidden Behavior

The `createWorkingMemoryUpdate` function and `validateWorkingMemoryUpdate` function must never:

- Write to `.forge` files directly
- Call GitHub APIs
- Compute eval scores or fitness ratings
- Trigger self-evolution
- Guess or infer missing source refs
- Accept inputs with secret-like key names

---

## Examples

### Minimal valid input

```typescript
const result = createWorkingMemoryUpdate({
  target: {
    mind_id: "forge://hiroshitanaka-creator/ForgeRoot/mind/root",
  },
  source: {
    task_id: "T030",
    artifact_sha256: "sha256:" + "a1b2c3d4".repeat(8),
    reason: "Initial working memory update for T030",
  },
  facts: [
    {
      id: "fact-001",
      text: "ForgeRoot uses git as the authoritative source of truth.",
      confidence: 0.99,
      source_ref: "T030:00_ForgeRoot_blueprint_設計書.md",
      tags: ["architecture", "memory"],
    },
  ],
});

// result.ok === true
// result.update.manifest_version === 1
// result.update.approval.direct_write_allowed === false
// result.update.guards.no_direct_forge_write === true
```

### Rejected: missing artifact hash

```typescript
const result = createWorkingMemoryUpdate({
  target: { mind_id: "forge://…/mind/root" },
  source: { task_id: "T030", artifact_sha256: "not-a-hash", reason: "…" },
  facts: [{ id: "f1", text: "…", confidence: 1, source_ref: "T030:x", tags: [] }],
});
// result.ok === false
// result.errors includes "source.artifact_sha256_required_sha256:<64hex>"
```

---

## Acceptance Criteria

- [x] `createWorkingMemoryUpdate` and `validateWorkingMemoryUpdate` exported from `packages/memory/src/working.ts`
- [x] Valid update accepted with correct manifest shape
- [x] Missing `source.task_id` rejected
- [x] Missing `artifact_sha256` rejected
- [x] Empty facts rejected
- [x] `max_items` exceeded rejected
- [x] Duplicate facts deduplicated deterministically
- [x] Facts sorted by id
- [x] Tags sorted and unique
- [x] Secret-like key name rejected
- [x] `direct_write_allowed: false` enforced in manifest and validation
- [x] `update_requires_pr: true` enforced in manifest and validation
