# ForgeRoot Repo Integrity Spec

**Version:** 1.0  
**Task:** T041-3 Genome Integrity  
**Date:** 2026-06-17

---

## 1. Purpose

This spec defines the invariants that must hold for the ForgeRoot repository surface to be considered "genome-intact." It is checked before any Phase 2 (memory/eval/provenance) work begins.

---

## 2. Genome File Layout

### 2.1 Agent files

Every active agent must have a canonical `.forge` identity file at:

```
.forge/agents/<species>.forge
```

Where `<species>` is the agent's species identifier (e.g., `planner.alpha`).

**Required internal consistency for an agent file at `.forge/agents/<species>.forge`:**

| Field | Required value |
|---|---|
| `kind` | `agent` |
| `id` | must end with `/agent/<species>` |
| `schema_ref` | `urn:forgeroot:forge:agent:v1` |
| `identity.species` | must equal `<species>` |
| `identity.role_name` | must equal the prefix of `<species>` before the first `.` |

### 2.2 Mind file

The root mind must be at `.forge/mind.forge` with `kind: mind`.

### 2.3 Policy files

Governance policies must be at `.forge/policies/<slug>.forge` with `kind: policy`.

### 2.4 No agent files at the repository root

Agent `.forge` files must not reside at the repository root. Root-level `*.forge` files are not recognized as canonical genome artifacts.

---

## 3. Path-Aware Validation

The forge-kernel provides `validate_document_shape_for_path(value, path)` which enforces the consistency rules in §2. It is applied at:

- CI parse checks
- Agent genome conformance tests
- Any tool that reads or updates `.forge` identity files

---

## 4. Canonical Agent Registry

As of T041-3, the following agents are registered:

| Species | Seed Task | Approval Class |
|---|---|---|
| planner.alpha | T017 | B |
| executor.alpha | T019 | B |
| auditor.alpha | T023 | B |
| pr-composer.alpha | T024 | B |
| github-pr-adapter.alpha | T025 | B |
| approval-checkpoint.alpha | T026 | B |
| rate-governor.alpha | T027 | B |

---

## 5. Immutable Paths

The following paths may never be modified by any agent or automated process:

- `.github/**`
- `.forge/mind.forge`
- `.forge/policies/**`
- `.forge/network/**`
- `apps/github-app/app-manifest.json`
- `schemas/forge-v1.schema.json`

---

## 6. Forbidden Root-Level Artifacts

The following root-level files are known hygiene issues (quarantine candidates) that should not be treated as canonical:

| File | Issue |
|---|---|
| `mind.forge` | Duplicate of `.forge/mind.forge` |
| `minimal-agent.forge` | Markdown report with wrong extension |
| `missing-revision.forge` | Markdown report with wrong extension |

These are preserved in git history but should not be referenced by agents or tooling.
