#!forge/v1
forge_version: 1
schema_ref: urn:forgeroot:forge:agent:v1
kind: agent
id: forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha
mind_ref: forge://hiroshitanaka-creator/ForgeRoot/mind/root
status: seeded
title: Invalid Agent Missing Revision
summary: This fixture intentionally omits revision and MUST fail the T004 schema.
owners:
  - github-app://forgeroot
created_at: 2026-04-18T00:00:00Z
updated_at: 2026-04-18T00:00:00Z
identity:
  role_name: planner
  species: planner.alpha
role:
  mission: Decompose one issue into one PR plan.
constitution:
  non_negotiables:
    - no_default_branch_write
context_recipe: {}
tools:
  - namespace: repo
    name: repo.search_code
    mode: read
memory: {}
scores: {}
evolution:
  generation: 0
mutation_log: []
provenance:
  seed_task: T004
extensions: {}
