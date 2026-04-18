fixture_version: 1
task: T003
title: Initial mind and constitution validation fixture
artifacts:
  - path: .forge/mind.forge
    kind: mind
    required_values:
      repo_profile.default_mode: observe
      repo_profile.network_mode: allowlisted
      repo_profile.spawn_mode: lab-only
    required_presence:
      - approval_matrix.A
      - approval_matrix.B
      - approval_matrix.C
      - approval_matrix.D
      - constitution.non_negotiables
      - constitution.mutable_paths
      - constitution.immutable_paths
    required_contains:
      constitution.non_negotiables:
        - no_default_branch_write
        - behavior_change_requires_reviewable_pr
        - no_open_federation_without_treaty
  - path: .forge/policies/constitution.forge
    kind: policy
    required_presence:
      - rules
      - thresholds
      - actions_on_breach
      - required_approvals
      - cooldowns
      - quarantine_triggers
    required_rule_ids:
      - git-is-source-of-truth
      - no-default-branch-write
      - behavior-change-requires-pr
      - allowlisted-federation-only
      - elevated-approval-for-policy-and-workflow
negative_assertions:
  - description: direct writes to the default branch remain forbidden
    assert:
      artifact: .forge/policies/constitution.forge
      rule_id: no-default-branch-write
      field: pass_conditions.direct_write
      equals: false
  - description: network does not default to open
    assert:
      artifact: .forge/mind.forge
      field: repo_profile.network_mode
      not_equals: open
