# Episode Digest Spec

**Task:** T031  
**Schema ref:** `urn:forgeroot:episode-digest:v1`  
**Status:** Implemented  
**Last updated:** 2026-06-17

---

## Purpose

Define the deterministic episode digest manifest: the artifact produced by `createEpisodeDigest` that records a completed task/PR episode in the ForgeRoot episodic memory layer. This manifest captures what happened, preserves both positive and negative outcomes, and provides a source-traced record for the episodic heads layer.

---

## Schema

```typescript
interface EpisodeDigest {
  manifest_version: 1;
  schema_ref: "urn:forgeroot:episode-digest:v1";
  digest_id: string;     // prefix: forge-episode-digest://
  created_at: string;    // RFC3339 UTC

  episode: {
    type: "accepted" | "rejected" | "blocked" | "quarantined"
        | "failed" | "reverted" | "unknown";
    title: string;       // max 160 chars
    summary: string;     // max 1200 chars
    reliability: "high" | "medium" | "low" | "unknown";
  };

  source: {
    repository: string | null;
    task_id: string;          // required, starts with T
    plan_id: string | null;
    audit_id: string | null;
    pr_number: number | null;
    commit_sha: string | null;
    artifact_sha256: string;  // required: sha256:<64 hex>
  };

  links: {
    related_plan_ids: readonly string[];    // sorted, unique
    related_audit_ids: readonly string[];   // sorted, unique
    related_pr_numbers: readonly number[];  // sorted, unique
  };

  retention: {
    preserve_rejected: true;  // always true
    preserve_blocked: true;   // always true
    pack_candidate: boolean;  // signals readiness for T032 archiver
  };

  guards: {
    source_refs_required: true;
    no_missing_source_guessing: true;
    deterministic_ordering: true;
    no_eval_score_update: true;
    no_mutation_generation: true;
    no_github_api_call: true;
  };

  provenance: {
    generated_by: "forgeroot-memory.digest";
    task: "T031";
  };
}
```

---

## Determinism Rules

1. **related_plan_ids**: Sorted by `localeCompare`, deduplicated.
2. **related_audit_ids**: Sorted by `localeCompare`, deduplicated.
3. **related_pr_numbers**: Sorted numerically ascending, deduplicated.
4. **digest_id**: If not supplied or invalid, `forge-episode-digest://<ts>-<rnd>` is generated.
5. **created_at**: If not supplied or invalid RFC3339 UTC, the current time is used.

---

## Source Ref Requirements

Both of these fields are mandatory:

| Field | Constraint |
|---|---|
| `source.task_id` | Non-empty, starts with `T` |
| `source.artifact_sha256` | Matches `sha256:<64 lowercase hex>` |

Missing source refs are a hard validation failure. Missing source refs must **not** be guessed, inferred, or substituted with placeholder values. The `guards.no_missing_source_guessing: true` field records this invariant.

---

## Episode Types

All seven episode types are valid first-class memory events:

| Type | Meaning | Preserved? |
|---|---|---|
| `accepted` | Task/PR was accepted and merged | yes |
| `rejected` | Proposal was reviewed and rejected | yes — mandatory |
| `blocked` | Input was blocked by a guard rule | yes — mandatory |
| `quarantined` | Artifact was quarantined pending review | yes |
| `failed` | Execution failed (sandbox, test, lint) | yes |
| `reverted` | A previously accepted change was reverted | yes |
| `unknown` | Outcome could not be determined | yes — requires `reliability: "unknown"` |

`rejected` and `blocked` are explicitly `preserve_rejected: true` / `preserve_blocked: true` in the retention object. Selective erasure of negative outcomes is prohibited.

---

## Validation Rules

| Rule | Enforced by |
|---|---|
| `manifest_version === 1` | validate |
| `schema_ref` exact match | validate |
| `digest_id` starts with `forge-episode-digest://` | validate |
| `created_at` is RFC3339 UTC | validate |
| `episode.type` is one of the seven valid types | create + validate |
| `episode.title` max 160 chars, non-empty | create + validate |
| `episode.summary` max 1200 chars | create + validate |
| `episode.reliability` is one of four valid values | create + validate |
| `episode.type === "unknown"` requires `reliability === "unknown"` | create + validate |
| `source.task_id` starts with `T` | create + validate |
| `source.artifact_sha256` matches `sha256:<64 hex>` | create + validate |
| `links.*` are sorted and unique | create (auto-sort) + validate |
| `retention.preserve_rejected === true` | validate |
| `retention.preserve_blocked === true` | validate |
| All `guards` fields are `true` | validate |
| No secret-like key names or values | create + validate |

---

## Forbidden Behavior

The `createEpisodeDigest` and `validateEpisodeDigest` functions must never:

- Write to `.forge` files directly
- Call GitHub APIs
- Compute eval scores or fitness ratings
- Generate mutations or code changes
- Guess or infer missing source refs
- Accept inputs with secret-like key names or values
- Mark rejected or blocked episodes as non-preserved

---

## Examples

### Accepted episode

```typescript
const result = createEpisodeDigest({
  episode: {
    type: "accepted",
    title: "T030 working memory update manifest implemented",
    summary: "Implemented deterministic T030 working memory manifest.",
    reliability: "high",
  },
  source: {
    task_id: "T030",
    artifact_sha256: "sha256:" + "a1b2c3d4".repeat(8),
    pr_number: 42,
  },
});
// result.ok === true
// result.digest.episode.type === "accepted"
// result.digest.retention.preserve_rejected === true
// result.digest.guards.no_eval_score_update === true
```

### Rejected episode (first-class memory event)

```typescript
const result = createEpisodeDigest({
  episode: {
    type: "rejected",
    title: "T999 rejected: exceeded max_items",
    summary: "Rejected because working memory update exceeded the max_items limit.",
    reliability: "high",
  },
  source: {
    task_id: "T999",
    artifact_sha256: "sha256:" + "b2c3d4e5".repeat(8),
  },
});
// result.ok === true  — rejected episodes are valid first-class events
```

### Rejected: unknown type with non-unknown reliability

```typescript
const result = createEpisodeDigest({
  episode: {
    type: "unknown",
    title: "Outcome unknown",
    summary: "Could not determine outcome.",
    reliability: "high",  // invalid — must be "unknown" for type "unknown"
  },
  source: { task_id: "T001", artifact_sha256: "sha256:" + "0".repeat(64) },
});
// result.ok === false
// result.errors includes "episode.type_unknown_requires_reliability_unknown"
```

---

## Acceptance Criteria

- [x] `createEpisodeDigest` and `validateEpisodeDigest` exported from `packages/memory/src/digest.ts`
- [x] Valid accepted digest accepted
- [x] Valid rejected digest accepted (first-class event)
- [x] Valid blocked digest accepted (first-class event)
- [x] `quarantined`, `failed`, `reverted` types valid
- [x] Missing `artifact_sha256` rejected
- [x] Missing `task_id` rejected
- [x] `unknown` type with non-unknown reliability rejected
- [x] Summary exceeding 1200 chars rejected
- [x] Title exceeding 160 chars rejected
- [x] Related IDs sorted and deduplicated
- [x] Secret-like key name rejected
- [x] Secret-like string value rejected
- [x] `preserve_rejected: true` and `preserve_blocked: true` always set
- [x] `no_eval_score_update: true` always set
- [x] `no_github_api_call: true` always set
