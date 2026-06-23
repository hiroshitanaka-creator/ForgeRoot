# Working Memory Update

## Purpose
T030 defines deterministic source-ref-required manifests for proposed working-memory facts.

## Schema
A manifest includes version, schema ref, update id, creation time, target, source, facts, retention, approval, guards, and provenance.

## Determinism rules
Facts are deduped by normalized id, sorted by id, and tags are sorted and unique. `max_items` is enforced.

## Source ref requirements
`source.task_id`, `source.artifact_sha256`, `source.reason`, and each fact `source_ref` are required.

## Validation rules
Version and schema must match, ids use `forge-memory-update://`, timestamps are RFC3339 UTC, hashes match `sha256:<64 hex>`, TTL exists, confidence is 0..1, and secret-like fields are rejected.

## Forbidden behavior
No `.forge` direct write, GitHub API call, runtime DB authority, guessed source refs, or eval score update.

## Examples
```js
createWorkingMemoryUpdate({ source: { task_id: "T030", artifact_sha256: "sha256:<64hex>", reason: "audit" }, facts: [...] })
```

## Acceptance criteria
Valid manifests pass; missing sources, excessive items, duplicate unsanitized facts, nondeterministic order, secrets, and direct-write permission fail.
