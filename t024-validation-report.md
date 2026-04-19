# `.forge` v1 Specification

Status: **T004 seed / Phase 0 normative draft**  
Schema artifact: [`../../schemas/forge-v1.schema.json`](../../schemas/forge-v1.schema.json)  
Fixture root: [`fixtures/forge-v1/`](fixtures/forge-v1/)

This document fixes the first executable contract for ForgeRoot `.forge` files. It narrows the v1 master blueprint into a parser-ready, schema-checkable, hashable file format while intentionally leaving parser implementation, hash kernel code, pack compaction runtime, migration tooling, and UI visualization to later tasks.

## 1. Design invariants

A `.forge` file MUST be:

1. **Human-reviewable** in a pull request diff.
2. **Machine-validatable** through the v1 JSON Schema plus semantic checks.
3. **Canonically hashable** without depending on a runtime database.
4. **Git-native**: Git object history remains the authoritative long-term state.
5. **Evolution-aware**: accepted, rejected, and rolled-back mutations remain representable.
6. **Pack-aware**: large or immutable event bodies are referenced through content-addressed sidecar packs instead of being inlined forever.

The file format optimizes for stable identity and reviewability before implementation convenience.

## 2. File grammar

```ebnf
forge-file       = magic-line LF yaml-document LF ;
magic-line       = "#!forge/v1" ;
yaml-document    = YAML-1.2-canonical-subset ;
```

A conforming `.forge` source file MUST start with exactly `#!forge/v1` followed by LF. The remaining document is parsed as the ForgeRoot YAML subset described below.

The JSON Schema validates the parsed YAML document after the magic line has been removed. The magic line, line ending, duplicate-key, anchor, alias, and canonicalization constraints are source-form rules and are not fully expressible in JSON Schema.

## 3. YAML subset

### 3.1 Required source-form constraints

MUST:

- UTF-8 encoded bytes.
- Unicode NFC normalization for all scalar strings.
- LF line endings only.
- Exactly one trailing newline at EOF.
- Spaces for indentation; tabs are forbidden.
- Mapping keys are strings.
- Duplicate mapping keys are forbidden at every level.
- YAML anchors, aliases, and merge keys are forbidden.
- Comments are allowed in source files but are excluded from canonical hash input.

SHOULD:

- Use two-space indentation.
- Prefer plain scalars for identifiers and enums.
- Quote glob strings that start with `.` or contain `*`.
- Keep inline `.forge` files below 128 KiB.

MUST NOT:

- Depend on YAML implicit timestamp conversion for semantic behavior. Timestamps are strings and MUST match RFC3339.
- Use environment-specific path separators.
- Store secret material in `.forge` files or packs.

### 3.2 Validation layers

Validation is deliberately layered:

| Layer | Name | Responsibility | T004 status |
|---|---|---|---|
| 0 | Source form | Magic line, UTF-8, LF, NFC, no tabs, no anchors, no duplicate keys | Specified here; parser implementation deferred to T005 |
| 1 | Schema tree | Required fields, enum values, type shapes, kind-specific required sections | Implemented by `schemas/forge-v1.schema.json` |
| 2 | Semantic integrity | Canonical hash, attachment hashes, signatures, monotonic revision/generation checks | Specified here; full kernel deferred to T005+ |
| 3 | Runtime policy | Approval routing, branch protection, quarantine, rate behavior | Enforced by policy engine in later tasks |

A file is production-valid only when all applicable layers pass. A fixture can be schema-valid while still lacking a computed canonical hash during Phase 0 bootstrap.

## 4. Directory layout

```text
.forge/
  mind.forge
  agents/
    planner.alpha.forge
    executor.alpha.forge
    auditor.alpha.forge
    evolution-guard.alpha.forge
    networker.alpha.forge
  policies/
    constitution.forge
    runtime-mode.forge
    mutation-budget.forge
    network-boundary.forge
  evals/
    core.eval.forge
    security.eval.forge
  lineage/
    graph.forge
    fitness.forge
    species.forge
  network/
    peers.forge
    reputation.forge
    treaties/
      peer.owner.repo.forge
  packs/
    episodes/
      <sha256>.jsonl.zst
    mutations/
      <sha256>.jsonl.zst
    dictionaries/
      forge-v1.zdict
```

The `.forge` tree is the durable identity and memory root. Runtime caches may index this tree, but they are never the source of truth.

## 5. Logical identifiers

### 5.1 Forge URI

```text
forge://<owner>/<repo>/<kind>/<slug>
```

Examples:

```text
forge://hiroshitanaka-creator/ForgeRoot/mind/root
forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha
forge://hiroshitanaka-creator/ForgeRoot/policy/runtime-mode
forge://hiroshitanaka-creator/ForgeRoot/treaty/peer.acme.librepo
```

Rules:

- `owner` SHOULD match the GitHub owner.
- `repo` MUST preserve canonical repository casing. For this repo, use `ForgeRoot`.
- `kind` MUST be one of the v1 kinds in section 7.
- `slug` MUST be lowercase ASCII using `a-z`, `0-9`, `.`, `_`, or `-`.
- Slugs MUST be stable semantic identifiers, not timestamps.

### 5.2 Revision

`revision` is a ULID string.

Rules:

- Every content update to a `.forge` file MUST update `revision`.
- Revisions MUST be monotonically increasing per logical file.
- Lexicographic order MUST match chronological order.
- Reformatting-only changes update `revision`, but do not increment `evolution.generation`.

### 5.3 Generation

`generation` is stored as `evolution.generation` when the file has an `evolution` block. If the field is absent in a bootstrap file, semantic validators MUST treat it as `0`.

Rules:

- Increment only when an accepted behavior-changing mutation lands.
- Do not increment for comments, formatting, typo-only changes, or metadata-only source relocation.
- Behavior-changing examples: prompt change, tool route change, threshold shift, role split/merge, memory-prune rule, policy tightening/loosening, treaty scope change.
- `generation` MUST NOT decrease. A decrease is corruption unless an explicit migration document proves otherwise.

## 6. Common required fields

Every parsed `.forge` YAML document MUST contain these top-level fields:

| Field | Type | Rule |
|---|---|---|
| `forge_version` | integer | MUST be `1` for this spec. |
| `schema_ref` | string | MUST be `urn:forgeroot:forge:<kind>:v1`. |
| `kind` | enum | One of section 7. |
| `id` | string | Forge URI. |
| `revision` | string | ULID. |
| `mind_ref` | string or null | Root mind reference. `mind` may use null. Non-`mind` files SHOULD reference the root mind. |
| `status` | enum | `seeded`, `active`, `quarantined`, `deprecated`, or `fossilized`. |
| `title` | string | Human short name. |
| `summary` | string | One-paragraph purpose summary. |
| `owners` | string array | Responsible human, app, or service URIs. At least one item. |
| `created_at` | RFC3339 string | Initial creation time. |
| `updated_at` | RFC3339 string | Last update time. |
| `extensions` | object | Vendor extension namespace. Empty object is valid. |

Common optional top-level fields are reserved in section 12.

## 7. Kinds

| Kind | Purpose |
|---|---|
| `mind` | Repository-level Forge Mind definition. |
| `agent` | Individual agent definition. |
| `policy` | Safety, budget, approval, runtime, treaty, or quarantine boundary. |
| `eval_suite` | Benchmark or evaluation suite. |
| `lineage` | Lineage graph, species, fitness, or adoption history. |
| `treaty` | Diplomatic contract with a peer Forge. |
| `memory_index` | Curated long-term memory index and digest references. |

## 8. Kind-specific required sections

### 8.1 `kind: mind`

Additional required top-level fields:

- `identity`
- `constitution`
- `repo_profile`
- `approval_matrix`
- `branch_contracts`
- `allowed_species`
- `budget_caps`
- `treaty_policy`
- `provenance`

`repo_profile` MUST define:

- `default_mode`: `observe`, `propose`, `evolve`, `federate`, `quarantine`, or `halted`.
- `network_mode`: `off`, `allowlisted`, `supervised`, or `open`.
- `spawn_mode`: `off`, `lab-only`, `allowlisted`, or `open`.
- `maintenance_sla`: object describing curated-memory and lineage refresh expectations.

`approval_matrix` MUST define classes `A`, `B`, `C`, and `D`.

### 8.2 `kind: agent`

Additional required top-level fields:

- `identity`
- `role`
- `constitution`
- `context_recipe`
- `tools`
- `memory`
- `scores`
- `evolution`
- `mutation_log`
- `provenance`

Agent `constitution` SHOULD include:

- `objective_function`
- `non_negotiables`
- `mutable_paths`
- `immutable_paths`
- `approval_class`

`tools[]` entries MUST describe namespaced tools with bounded call counts, timeouts, and approval behavior.

### 8.3 `kind: policy`

Additional required top-level fields:

- `policy_type`
- `rules`
- `thresholds`
- `actions_on_breach`
- `required_approvals`
- `cooldowns`
- `quarantine_triggers`
- `provenance`

Each `rules[]` entry SHOULD include:

- `id`
- `statement`
- `pass_conditions`
- `fail_conditions`
- `required_approval_class`

### 8.4 `kind: eval_suite`

Additional required top-level fields:

- `suite_name`
- `tasks`
- `graders`
- `risk_class`
- `success_metrics`
- `shadow_only`
- `provenance`

### 8.5 `kind: lineage`

Additional required top-level fields:

- `lineage_type`
- `entries`
- `provenance`

`lineage_type` SHOULD be one of `graph`, `fitness`, `species`, or `adoption`.

### 8.6 `kind: treaty`

Additional required top-level fields:

- `peer_repo`
- `trust_level`
- `allowed_actions`
- `forbidden_actions`
- `lineage_scope`
- `revocation_policy`
- `reputation_floor`
- `provenance`

`trust_level` MUST be one of `none`, `observe`, `exchange`, or `collaborate`.

### 8.7 `kind: memory_index`

Additional required top-level fields:

- `index_name`
- `sources`
- `entries`
- `retention_policy`
- `provenance`

A memory index is a curated map to digests and packs, not an opaque vector database dump.

## 9. Approval classes

| Class | Meaning | Default rule |
|---|---|---|
| `A` | Docs, tests, comments, low-risk refactors | Auto PR allowed; human merge optional. |
| `B` | Normal code changes, light dependencies, internal prompt tuning | PR required; one human approval. |
| `C` | Workflows, permissions, policies, treaties, spawn settings | PR required; code owner or two-stage approval. |
| `D` | Branch protection, app permissions, open federation, workflow mutation | Human-only; self-approval forbidden. |

Policy files may set stricter path floors. A stricter policy always wins over a looser local declaration.

## 10. Pack and attachment references

Large event bodies belong in content-addressed sidecar packs.

Attachment shape:

```yaml
attachments:
  - path: .forge/packs/episodes/<sha256>.jsonl.zst
    media_type: application/zstd
    sha256_raw: sha256:<64 lowercase hex chars>
    sha256_zstd: sha256:<64 lowercase hex chars>
    bytes: 18273
```

Pack rules:

- Source records use canonical NDJSON.
- Compression is zstd level 7 unless a future schema version says otherwise.
- Pack path format is `.forge/packs/<category>/<sha256>.jsonl.zst`.
- The first uncompressed record MUST be a `pack_header`.
- Each pack stores both raw and compressed SHA-256 values.
- Packs are immutable; corrections create a new pack and update references by PR.

Header example:

```json
{"record_type":"pack_header","pack_version":1,"category":"episodes","created_at":"2026-04-18T00:00:00Z","record_count":128}
```

## 11. Integrity object

`integrity` is optional during Phase 0 bootstrap but SHOULD be present after the canonical hash kernel exists.

Shape:

```yaml
integrity:
  canonical_hash: sha256:<64 lowercase hex chars>
  attachment_hashes:
    - sha256:<64 lowercase hex chars>
  signatures:
    - scheme: github-app-jws
      keyid: fr-app-prod-1
      sig: <compact signature string>
      signed_at: 2026-04-18T00:00:00Z
```

Rules:

- `canonical_hash` is the SHA-256 of the canonical byte stream defined in section 12.
- `attachment_hashes` MUST cover every referenced attachment hash that semantic validation requires.
- `signatures` sign the canonical hash, not the raw source text.
- During canonical hash calculation, `integrity.signatures` is treated as an empty array.
- During canonical hash calculation, `integrity.canonical_hash`, when present, is replaced with `sha256:0000000000000000000000000000000000000000000000000000000000000000`.
- If `integrity` is absent, hash calculation proceeds over the remaining canonical document and returns an external digest.

This avoids self-referential hashing while preserving a stable field location for the stored digest.

## 12. Canonicalization

Canonicalization is deterministic serialization for hashing. It is not a pretty-printer for human source files.

Input requirements:

1. Source-form validation passed.
2. YAML parsed into a data tree.
3. Schema validation passed.
4. All strings normalized to Unicode NFC.

Canonical procedure:

1. Include the magic line `#!forge/v1` in the hash input.
2. Remove source comments.
3. Normalize line endings to LF.
4. Normalize scalar strings to NFC.
5. Replace `integrity.canonical_hash` with the zero-hash sentinel when present.
6. Replace `integrity.signatures` with an empty array when present.
7. Emit top-level keys in this fixed v1 order:

```text
forge_version, schema_ref, kind, id, revision, mind_ref, status, title, summary,
owners, created_at, updated_at, identity, role, constitution, repo_profile,
approval_matrix, branch_contracts, allowed_species, budget_caps, treaty_policy,
policy_type, rules, thresholds, actions_on_breach, required_approvals,
cooldowns, quarantine_triggers, context_recipe, tools, memory, scores,
evolution, mutation_log, suite_name, tasks, graders, risk_class,
success_metrics, shadow_only, lineage_type, peer_repo, trust_level,
allowed_actions, forbidden_actions, lineage_scope, revocation_policy,
reputation_floor, index_name, sources, entries, retention_policy, provenance,
attachments, integrity, compat, extensions
```

8. Omit absent optional keys.
9. Preserve array order exactly.
10. Sort non-top-level mapping keys by Unicode code point unless a later spec explicitly marks the map as ordered.
11. Emit two-space indentation.
12. Use lowercase `true`, `false`, and `null`.
13. Emit strings using the shortest YAML-safe representation that round-trips exactly.
14. End with one LF.
15. SHA-256 hash the resulting UTF-8 bytes.

Any parser/kernel implementation that serializes a different byte stream for the same logical document is non-conforming.

## 13. Reserved top-level keys

The following keys are reserved by `.forge` v1 and are the only non-extension top-level keys accepted by the base schema:

```text
forge_version, schema_ref, kind, id, revision, mind_ref, status, title, summary,
owners, created_at, updated_at, identity, role, constitution, repo_profile,
approval_matrix, branch_contracts, allowed_species, budget_caps, treaty_policy,
policy_type, rules, thresholds, actions_on_breach, required_approvals,
cooldowns, quarantine_triggers, context_recipe, tools, memory, scores,
evolution, mutation_log, suite_name, tasks, graders, risk_class,
success_metrics, shadow_only, lineage_type, peer_repo, trust_level,
allowed_actions, forbidden_actions, lineage_scope, revocation_policy,
reputation_floor, index_name, sources, entries, retention_policy, provenance,
attachments, integrity, compat, extensions
```

Vendor-specific data MUST be nested under `extensions` and MUST NOT create ad-hoc top-level keys.

`extensions` keys SHOULD be organization slugs, for example:

```yaml
extensions:
  acme-labs:
    local_note: safe experimental metadata
```

## 14. Versioning and compatibility

`forge_version`:

- Major schema version.
- Remains `1` for all v1-compatible documents.
- Increment only for breaking source or semantic changes.

`schema_ref`:

- Canonical value is `urn:forgeroot:forge:<kind>:v1`.
- The `<kind>` segment MUST match `kind`.

`revision`:

- Updated on every file content change.
- Monotonic per logical file.

`evolution.generation`:

- Updated only when an accepted behavior-changing mutation lands.
- Formatting-only changes do not increment it.

`compat` is optional but recommended once runtimes exist:

```yaml
compat:
  min_runtime: "0.4.0"
  max_runtime: "1.x"
  migrates_from:
    - forge_version: 0
      migrator: migration/forge-v0-to-v1.ts
```

## 15. Corruption and rejection conditions

A validator or policy engine MUST reject or quarantine a file when any of these apply:

- Missing or incorrect magic line.
- Non-UTF-8 bytes.
- CRLF line endings.
- Tabs used for indentation.
- YAML anchors, aliases, merge keys, or duplicate keys.
- Schema validation failure.
- `schema_ref` kind mismatch.
- Invalid Forge URI.
- `revision` is not a ULID.
- `revision` decreases relative to known history.
- `evolution.generation` decreases.
- `integrity.canonical_hash` mismatch.
- Attachment hash mismatch.
- Parent lineage cycle.
- Self-mutation outside declared mutable paths.
- Rejected mutation history disappears without an explicit approved migration.

## 16. JSON Schema contract

The schema file at `schemas/forge-v1.schema.json` is a Draft 2020-12 JSON Schema for the parsed YAML tree.

It MUST enforce:

- Common required fields.
- v1 kind enum.
- `schema_ref` matching the declared `kind`.
- ULID-like `revision` shape.
- Forge URI shape.
- RFC3339 string formats where JSON Schema format validation is enabled.
- Kind-specific required sections.
- Hash, attachment, approval, runtime mode, trust level, and status enum shapes.

It intentionally does not fully enforce:

- Magic line source bytes.
- Duplicate YAML keys.
- YAML comments.
- YAML anchors and aliases.
- NFC normalization.
- Monotonic history across Git commits.
- Actual canonical hash equality.
- Real signature verification.
- Attachment file existence.

Those are layer 0 and layer 2 responsibilities.

## 17. Fixtures

T004 provides fixture files under `docs/specs/fixtures/forge-v1/`:

```text
docs/specs/fixtures/forge-v1/
  valid/
    minimal-agent.forge
  invalid/
    missing-revision.forge
```

Expected result:

- `valid/minimal-agent.forge` passes the JSON Schema after stripping `#!forge/v1`.
- `invalid/missing-revision.forge` fails because `revision` is absent.

The existing T003 files `.forge/mind.forge` and `.forge/policies/constitution.forge` are also intended to pass the T004 schema as bootstrap documents.

## 18. T004 boundary

Implemented in T004:

- `.forge` v1 source grammar.
- Required top-level fields.
- Canonicalization and integrity rules.
- Pack reference shape.
- JSON Schema definition.
- Valid and invalid schema fixtures.

Deferred:

- Canonical parser implementation.
- Actual canonical hash computation kernel.
- Signature verification.
- Pack compaction engine.
- Replay engine.
- Migration runner.
- UI overlays.

This boundary keeps T004 as the contract layer and leaves executable kernel behavior to T005.
