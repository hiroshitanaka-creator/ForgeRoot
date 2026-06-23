# T033 — Deterministic Memory Retrieval Adapter

## Purpose

`retrieveMemoryContext` selects and ranks a set of candidate memory items
within a token budget. All scoring is lexical (no vector DB, no embedding
provider, no runtime DB). The result is a deterministic, auditable manifest.

## API

```typescript
import {
  createMemoryRetrievalRequest,
  retrieveMemoryContext,
  validateMemoryRetrievalResult,
  MEMORY_RETRIEVAL_VERSION,
  MEMORY_RETRIEVAL_SCHEMA_REF,
} from "@forgeroot/memory";
```

### `createMemoryRetrievalRequest(input)`

Creates a validated retrieval request. `token_budget` defaults to 4096 and
is capped at 32768. Negative budgets are rejected.

| Field | Type | Required | Notes |
|---|---|---|---|
| `query.text` | `string` | Yes | Non-empty |
| `query.intent` | `string` | Yes | Arbitrary string label |
| `query.token_budget` | `number` | No | Default 4096, max 32768 |
| `source.requested_by` | `string` | Yes | |
| `source.repository` | `string` | No | |
| `source.task_id` | `string` | No | |

### `retrieveMemoryContext(input)`

Performs the retrieval. Accepts `candidates` (array of `MemoryContextItem`)
and an optional `missing_memory` override.

### `validateMemoryRetrievalResult(value)`

Validates an existing retrieval result manifest.

## Result Shape

```json
{
  "manifest_version": 1,
  "schema_ref": "urn:forgeroot:memory-retrieval:v1",
  "retrieval_id": "forge-memory-retrieval://...",
  "created_at": "2026-01-01T00:00:00.000Z",
  "query": {
    "text": "working memory planner",
    "intent": "planning",
    "token_budget": 512
  },
  "context": {
    "items": [...],
    "estimated_tokens": 35,
    "truncated": false,
    "missing_memory": "none"
  },
  "derived_indexes": {
    "vector_index_used": false,
    "embedding_provider_used": false,
    "runtime_db_used": false
  },
  "guards": {
    "source_refs_preserved": true,
    "token_budget_enforced": true,
    "missing_memory_not_guessed": true,
    "vector_db_not_authority": true,
    "no_memory_mutation": true
  },
  "provenance": {
    "generated_by": "forgeroot-memory.retrieval",
    "task": "T033"
  }
}
```

## Ranking

Items are scored as `relevance + lexicalScore(query.text, item)`:

- `relevance` — caller-supplied (0.0–1.0)
- `lexicalScore` — normalized token overlap between query text and the
  concatenation of `item.summary` and `item.source_ref`
- Tokens: split on `\W+`, minimum 2 characters, lowercased

Final sort: score descending, then `id` ascending (deterministic tiebreak).

## Token Budget Enforcement

Items are admitted greedily in ranked order. At least one item is always
included even if it alone exceeds the budget. `context.truncated` is set to
`true` when one or more items were excluded.

## Missing Memory

| Condition | `missing_memory` |
|---|---|
| Items present | `"none"` |
| No candidates, no override | `"not_available"` |
| No candidates, caller set `"unknown"` | `"unknown"` |

The adapter never guesses, invents, or synthesizes absent memory.

## Safety Constraints

- `vector_index_used`, `embedding_provider_used`, `runtime_db_used` are always
  `false` — no external index or DB is queried.
- Secret keys (TOKEN, SECRET, PASSWORD, PRIVATE_KEY, CREDENTIAL — suffix/exact
  match excluding `token_budget`) are rejected.
- Items with empty `source_ref` or invalid `artifact_sha256` are rejected.
- Duplicate item `id` values are deduplicated (first-occurrence wins).
