# Episode Digest

## Purpose
T031 defines deterministic digests for accepted, rejected, blocked, quarantined, failed, reverted, and unknown episodes.

## Schema
A digest includes version, schema ref, digest id, creation time, episode, source, links, retention, guards, and provenance.

## Determinism rules
Related plan ids, audit ids, and PR numbers are sorted and unique.

## Source ref requirements
Task id and artifact hash are mandatory. PR, audit, outcome, commit, and related refs are preserved when provided. Missing sources are not guessed.

## Validation rules
Summary is capped at 1200 chars, title at 160 chars, artifact hash must be `sha256:<64 hex>`, unknown type requires unknown reliability, rejected/blocked/quarantined are first-class events, and secret-like fields or values are rejected.

## Forbidden behavior
No GitHub API call, source-less digest, eval score calculation, mutation generation, or missing-source guessing.

## Examples
```js
createEpisodeDigest({ episode: { type: "blocked", title: "Blocked", summary: "Policy blocked.", reliability: "high" }, source: { task_id: "T031", artifact_sha256: "sha256:<64hex>" } })
```

## Acceptance criteria
Accepted, rejected, and blocked digests validate; missing artifact hashes, invalid unknown reliability, excessive summaries, nondeterministic links, and secrets fail.
