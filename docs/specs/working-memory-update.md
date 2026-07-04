# Working Memory Update

## Purpose
T030 defines deterministic source-ref-required manifests for proposed working-memory facts.

## Schema
A manifest includes version, schema ref, update id, creation time, target, source, facts, retention, approval, guards, and provenance.

## Determinism rules
Facts are deduped by normalized id, sorted by id, and tags are sorted and unique. `max_items` is enforced. `created_at` must be supplied by the caller; there is no wall-clock default, so the same input always produces the same manifest. Wrong-typed caller values are never silently coerced or replaced with defaults; they are preserved and rejected by validation.

## Source ref requirements
`source.task_id`, `source.artifact_sha256`, `source.reason`, and each fact `source_ref` are required.

## Validation rules
Version and schema must match, ids use `forge-memory-update://`, timestamps are RFC3339 UTC, hashes match `sha256:<64 hex>`, TTL exists, confidence is 0..1, and secret-like fields are rejected.

## Forbidden behavior
No `.forge` direct write, GitHub API call, runtime DB authority, guessed source refs, or eval score update.

## Examples
```js
createWorkingMemoryUpdate({
  created_at: "2026-06-18T00:00:00.000Z",
  source: { task_id: "T030", artifact_sha256: "sha256:<64hex>", reason: "audit" },
  facts: [{ id: "fact-1", text: "Merge landed cleanly.", confidence: 0.9, source_ref: "artifact#1", tags: [] }],
})
```

## Acceptance criteria
Valid manifests pass; missing sources, excessive items, duplicate unsanitized facts, nondeterministic order, secrets, and direct-write permission fail.
