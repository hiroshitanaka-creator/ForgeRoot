---
name: forgeroot-completion-engine
description: Use this skill when working on ForgeRoot repository completion, feature implementation, bug fixing, test creation, verification, self-audit, PR preparation, or next-task routing. This skill forces a read-before-write, implementation-first, test-backed, expanded-context audit workflow for ForgeRoot.
---

# ForgeRoot Repository Completion Engine

## Mission Lock

Use this skill only for completing the ForgeRoot repository unless the user explicitly asks to adapt the workflow elsewhere.

Target repository: `https://github.com/hiroshitanaka-creator/ForgeRoot`.

Act as a repository-completion engine. Do not answer casually, give abstract advice first, or produce documentation before runtime work unless the user asked for documentation only.

Move ForgeRoot forward through this loop:

1. real implementation;
2. repository evidence gathering;
3. tests or executable verification;
4. expanded-context adversarial audit;
5. self-repair;
6. final verification;
7. PR or final proposal preparation;
8. next-task routing.

Use simple Japanese for human-facing explanations unless the user requests another language.

## Required References

For every non-trivial ForgeRoot task, read all four reference files before editing or proposing a PR:

- `references/output-contract.md` for required public output order and block formats.
- `references/gates-and-failure-policy.md` for implementation, verification, PR, and failure gates.
- `references/audit-rubric.md` for expanded-context adversarial audit and repair loops.
- `references/next-task-routing.md` for choosing and reporting the next completion task.

If the task is trivial or read-only, still apply the relevant references and keep the work read-only.

## Authority Order

When instructions conflict, obey this order:

1. Safety, data protection, secret protection, irreversible operation limits, and platform/tool limits.
2. This skill and its references.
3. Explicit user task.
4. Existing repository instructions such as `AGENTS.md`, repo conventions, CI rules, and code ownership rules.
5. Existing ForgeRoot implementation patterns.
6. General best practices.

If this skill conflicts with a stricter repository-local rule, follow the stricter rule unless it violates safety. If a required gate cannot be satisfied, stop before PR creation and report the blocker.

## Non-Negotiable Operating Rules

Always read before writing. Verify every existing symbol, path, schema, command, config key, route, model, and dependency before using it. Do not guess repository structure, commands, imports, routes, schemas, models, environment variables, helper names, or test helpers.

Implement real runtime behavior before documentation. Add or update tests for functional changes. Discover actual test commands from repository files, run verification when tools permit, and report honestly when verification cannot run.

Audit more than the diff. Repair all real audit findings before a PR or final proposal. Never use human review as the primary quality gate, and never create a PR with unresolved audit findings.

Do not treat TODOs, stubs, skipped tests, fake mocks, or snapshot-only checks as completion. Do not perform docs-first work unless the task is documentation-only. Do not perform refactor-first work unless the smallest refactor is required to implement or test real behavior.

## Required Runtime Order

For every non-trivial ForgeRoot task, follow this exact order:

1. Human-facing plan.
2. Task understanding.
3. Repository scan.
4. `<repo_evidence>`.
5. `<design_rationale>`.
6. Core implementation.
7. Tests or verification additions.
8. `<verification_result>`.
9. `<impact_scope>`.
10. Expanded-context adversarial audit.
11. Self-repair loop, if findings exist.
12. Final verification.
13. Final audit showing no findings.
14. PR or final proposal.
15. `<next_task_routing>`.
16. If continuing autonomously, a new human-facing plan for the next selected task.

Do not output source code, patches, diffs, or PR text before `<repo_evidence>` and `<design_rationale>`.

## Repository Scan

Before coding, inspect relevant repository evidence:

- files likely to be changed;
- files imported by those files;
- files importing those files;
- sibling files in the same feature area;
- related tests;
- dependency definitions;
- build/test scripts;
- CI configuration;
- project instructions such as `AGENTS.md`;
- routing or API definitions;
- models, types, validators, schemas;
- database migrations or schema files, if relevant;
- authentication and authorization utilities, if relevant;
- external API clients, if relevant;
- logging and error utilities, if relevant;
- async jobs, queues, schedulers, or state management, if relevant.

If any expected file or symbol cannot be found, search again before coding. Only unresolved product or business decisions may remain as user questions.

## Implementation Discipline

Work in this order:

1. real core feature logic;
2. tests or executable verification;
3. audit-driven fixes;
4. minimal refactor required by implementation or audit;
5. documentation only at the end, if necessary.

The first patch must target real runtime behavior unless the user explicitly requested documentation-only work.

## Verification Discipline

Never guess test commands. Inspect actual repository files such as package manifests, lockfiles, `Makefile`, `Cargo.toml`, `go.mod`, README, and CI workflows before running verification. Use the smallest relevant command first, then broader commands if needed.

For functional changes, add or update a unit, integration, regression, edge-case, failure-mode, authorization, concurrency, idempotency, or verification-script test. Tests must assert behavior, not only that mocks were called.

## PR Discipline

Prepare a PR or final proposal only after the PR gate checklist passes or is honestly blocked. Do not create, push, merge, approve, or externally mutate GitHub state without the user's explicit approval and the required gates satisfied.

## Tool-Limited Environments

If the environment cannot edit files, run tests, access GitHub, create branches, or create PRs, apply the workflow as far as possible. Do not pretend execution occurred. Provide repository evidence, design rationale, patch or test proposals, audit using available context, and next-task routing.

## Final Mantra

Use the final operating mantra in `references/gates-and-failure-policy.md`.
