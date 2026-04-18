{
  "plan_version": 1,
  "kind": "forge.plan",
  "plan_id": "forge-plan://forge-task-github-hiroshitanaka-creator-forgeroot-issue-42",
  "status": "ready",
  "created_at": "2026-04-18T00:00:00Z",
  "source": {
    "candidate_id": "forge-task://github/hiroshitanaka-creator/forgeroot/issue/42",
    "source_key": "github://hiroshitanaka-creator/forgeroot/issue/42",
    "source_kind": "issue",
    "repository": "hiroshitanaka-creator/ForgeRoot",
    "issue_number": 42,
    "url": "https://github.example/issues/42"
  },
  "intent": {
    "title": "Fix README typo in setup guide",
    "summary": "The quickstart has one spelling mistake.",
    "category": "docs",
    "one_task": "Address exactly one docs task from github://hiroshitanaka-creator/forgeroot/issue/42: Fix README typo in setup guide",
    "non_goals": [
      "No default-branch direct writes.",
      "No workflow, policy, permission, or network treaty changes.",
      "No broad refactor or unrelated cleanup.",
      "No runtime code changes."
    ]
  },
  "risk": {
    "level": "low",
    "approval_class": "A",
    "requires_human_approval": false,
    "rationale": [
      "intake.category:docs",
      "intake.risk:low",
      "approval_class:A",
      "risk/approval link inherited from deterministic intake classification"
    ]
  },
  "scope": {
    "contract": "one-task-one-pr",
    "mutable_paths": [
      "README.md",
      "docs/**",
      "*.md"
    ],
    "forbidden_paths": [
      ".github/workflows/**",
      ".forge/policies/**",
      ".forge/network/**"
    ],
    "out_of_scope": [
      "workflow mutation",
      "policy mutation",
      "network or treaty mutation",
      "default branch write",
      "multi-issue bundling",
      "code behavior changes"
    ],
    "max_files_changed": 3,
    "max_prs": 1
  },
  "steps": [
    {
      "id": "S1",
      "kind": "inspect",
      "actor": "executor",
      "title": "Confirm the bounded task surface",
      "action": "Read the source issue, current files, and relevant test/doc context before editing.",
      "inputs": [
        "source",
        "scope.mutable_paths",
        "scope.forbidden_paths"
      ],
      "outputs": [
        "bounded_task_notes"
      ]
    },
    {
      "id": "S2",
      "kind": "edit",
      "actor": "executor",
      "title": "Apply a docs-only correction",
      "action": "Edit only documentation paths needed to satisfy the source task.",
      "inputs": [
        "bounded_task_notes"
      ],
      "outputs": [
        "patch"
      ]
    },
    {
      "id": "S3",
      "kind": "test",
      "actor": "executor",
      "title": "Run category-specific verification",
      "action": "Run npm run docs:check --if-present and capture output.",
      "inputs": [
        "patch"
      ],
      "outputs": [
        "test_or_check_output"
      ]
    },
    {
      "id": "S4",
      "kind": "audit",
      "actor": "auditor",
      "title": "Audit scope and acceptance criteria",
      "action": "Verify changed paths, diff size, commands, and risk/approval link independently of Executor.",
      "inputs": [
        "patch",
        "test_or_check_output",
        "acceptance_criteria"
      ],
      "outputs": [
        "audit_report"
      ]
    }
  ],
  "acceptance_criteria": [
    {
      "id": "AC-001",
      "description": "This plan opens at most one pull request for the source task."
    },
    {
      "id": "AC-002",
      "description": "Every changed path is inside the declared mutable path set.",
      "check": {
        "type": "path_allowlist",
        "patterns": [
          "README.md",
          "docs/**",
          "*.md"
        ],
        "applies_to": "changed_paths"
      }
    },
    {
      "id": "AC-003",
      "description": "No changed path touches workflow, policy, or network-forbidden paths.",
      "check": {
        "type": "path_denylist",
        "patterns": [
          ".github/workflows/**",
          ".forge/policies/**",
          ".forge/network/**"
        ],
        "applies_to": "changed_paths"
      }
    },
    {
      "id": "AC-004",
      "description": "The PR changes no more than 3 file(s).",
      "check": {
        "type": "max_files_changed",
        "max": 3
      }
    },
    {
      "id": "AC-005",
      "description": "The category-specific verification command succeeds or is explicitly absent.",
      "check": {
        "type": "command_succeeds",
        "command": "npm run docs:check --if-present",
        "timeout_ms": 600000
      }
    }
  ],
  "evidence": {
    "required_checks": [
      "npm run docs:check --if-present"
    ],
    "required_artifacts": [
      "audit_report"
    ]
  },
  "handoff": {
    "executor": "ready",
    "audit_required": true,
    "notes": [
      "Executor must not expand beyond scope.mutable_paths without returning the plan to Planner.",
      "Auditor must independently verify every acceptance_criteria check before PR creation."
    ]
  }
}
