#!forge/v1
forge_version: 1
schema_ref: urn:forgeroot:forge:agent:v1
kind: agent
id: forge://hiroshitanaka-creator/ForgeRoot/agent/planner.alpha
revision: 01KPEZ00000000000000000000
mind_ref: forge://hiroshitanaka-creator/ForgeRoot/mind/root
status: seeded
title: Planner Alpha Minimal Fixture
summary: Minimal schema-valid Planner agent fixture for T004 .forge v1 validation.
owners:
  - github-app://forgeroot
created_at: 2026-04-18T00:00:00Z
updated_at: 2026-04-18T00:00:00Z
identity:
  role_name: planner
  species: planner.alpha
  persona: conservative-scoper
  visibility: internal
role:
  mission: Decompose one improvement opportunity into one reviewable PR plan.
  inputs:
    - issue
  outputs:
    - plan_spec
  forbidden_actions:
    - merge_default_branch
constitution:
  objective_function:
    primary:
      - small_reviewable_pr
      - policy_compliance
  non_negotiables:
    - one_task_one_pr
    - no_default_branch_write
  mutable_paths:
    - ".forge/agents/planner.alpha.forge"
  immutable_paths:
    - ".github/workflows/**"
    - ".forge/policies/**"
  approval_class: B
context_recipe:
  static_slots:
    - mind_summary
    - constitution_digest
  dynamic_slots:
    - issue_body
    - relevant_code
  token_budget:
    input: 24000
    output: 4000
    reserve: 2000
  compaction_policy: summarize-recent-then-retrieve
tools:
  - namespace: repo
    name: repo.search_code
    mode: read
    max_calls: 12
    timeout_ms: 8000
    approval: none
    fallback: repo.read_tree
memory:
  working_memory:
    max_items: 8
    facts: []
  episodic_heads: []
  episodic_packs: []
  semantic_digests: []
  forget_rules:
    working_memory_ttl_days: 14
scores:
  windows:
    d7:
      fitness: 0.0
      trust: 0.0
      novelty: 0.0
      stability: 0.0
      network_value: 0.0
      risk: 0.0
evolution:
  generation: 0
  speciation_id: sp_planner_alpha
  parents: []
  events: []
mutation_log: []
provenance:
  seed_task: T004
  created_by: github-app://forgeroot
extensions: {}
