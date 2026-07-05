---
name: repository-finisher
description: Use this skill when resolving Codex review comments, making ForgeRoot PRs mergeable, or finishing the repository through executable progress instead of docs-only drift.
---

# Repository Finisher Skill

## Purpose

Use this skill when the objective is to finish a GitHub repository as a working, high-quality product rather than extending plans, proposals, specs, or handoff notes. The skill is intentionally biased toward executable progress, review-debt collapse, and mergeable PRs.

ForgeRoot-specific context: this repository is PR-native and one-task-one-PR, but many existing Phase 1 surfaces are still pre-execution manifests. Finishing the repository requires moving from specification surfaces into runtime behavior, transport behavior, tests, and end-to-end evidence.

## Activation Triggers

Activate this skill for requests containing any of these intents:

- finish the repository
- complete ForgeRoot
- continue the repo without docs drift
- resolve Codex review comments
- make the PR mergeable
- stop creating only docs/specs/manifests
- convert plan/proposal surfaces into runtime behavior

## Non-Negotiable Operating Rules

1. Do not start a new task while an open PR has unresolved Codex P1/P2 review comments.
2. Do not create a docs-only PR unless the user explicitly asks for documentation-only work.
3. Do not use a handoff document, validation report, README update, or issue text as evidence of implementation.
4. Do not add another manifest/proposal/adapter layer unless it unblocks an executable path in the same PR or the immediately next PR.
5. Every implementation PR must contain at least one executable artifact: source code, test code, workflow automation, schema validation logic, CLI/runtime behavior, or a deterministic integration harness.
6. Every implementation PR must include verification evidence: command, result, changed tests, or a recorded blocker that is external to the repository.
7. A PR is not ready for merge until active Codex P1/P2 review debt is zero and the latest verification result reflects the current head commit.
8. If Codex produces more than three active review threads, stop feature expansion and run a review-collapse pass.

## Anti-Introspection Guard

At the start of each work cycle, write down exactly one concrete file mutation target before editing any docs.

Required work-cycle header:

```text
Next concrete file mutation: <path>
Runtime behavior affected: <yes/no + one sentence>
Verification command: <command>
Docs budget: <0, 1, 2, or explicitly approved>
Review debt status: <zero / P1 count / P2 count / other count>
```

If `Next concrete file mutation` is a Markdown file under `docs/`, `README`, `TASK_PROGRESS`, or a handoff note, stop and choose a runtime, test, workflow, schema, or package file instead unless the user explicitly requested docs-only work.

## Repository Completion Loop

### 0. Reality Check

Before selecting work:

- Inspect open PRs and active Codex review threads.
- Inspect failing checks or missing verification.
- Read the current README/TASK_PROGRESS only to locate the next runtime gap.
- Prefer current open PR repair over new task creation.

Stop condition: any active Codex P1/P2 thread exists. Fix that PR first.

### 1. Select the Smallest Runtime-Advancing Slice

A valid next slice must satisfy at least one:

- turns a manifest into an executable function
- connects an existing adapter to a real transport boundary
- adds a deterministic test harness that exercises real package behavior
- removes a blocker preventing branch, worktree, sandbox, PR, or audit execution
- adds a guardrail that prevents bad PRs from merging

A weak slice is rejected when it only:

- renames a phase
- adds a proposal schema without executor use
- adds a handoff note
- updates TASK_PROGRESS without behavior
- repeats safety boundaries already stated elsewhere

### 2. Code First

Implementation order:

1. Add or modify executable code.
2. Add or modify tests for that code.
3. Run targeted verification.
4. Only then update docs/handoff/progress, with no more than two doc files unless explicitly approved.

### 3. Review-Collapse Pass

When Codex review comments exist:

1. Group comments by defect class rather than replying one-by-one.
2. Fix P1/P2 defects in code and tests first.
3. Add regression tests for every safety or validation defect.
4. Re-run targeted tests.
5. Update the PR body with the latest head commit and verification result.
6. Request another review only after all active P1/P2 issues are addressed.

Do not open the next task PR until the current review debt is collapsed.

### 4. Merge Readiness Gate

A PR is merge-ready only when all are true:

- active Codex P1/P2 threads: zero
- active Codex review threads total: at most three
- implementation or governance artifact changed: yes
- verification evidence exists and matches current head
- docs line ratio is subordinate to code unless docs-only is approved
- PR body contains implementation evidence and verification result
- rollback path is clear

## ForgeRoot Task Selection Bias

ForgeRoot already has many pre-execution contracts. Prefer tasks that cross into real execution boundaries:

1. branch/worktree creation that actually calls git in a bounded harness
2. sandbox execution that actually runs allowlisted commands
3. audit evidence generation from real command output
4. PR transport behind GitHub App authorization
5. rate-governed dispatch using real queue state
6. end-to-end demo that creates verifiable artifacts from real code paths

Avoid selecting another dry-run mutation proposal unless it is the missing prerequisite for one of the above execution boundaries.

## PR Body Contract

Every PR body produced under this skill must contain the repository-required AGENTS.md fields plus the completion evidence fields:

```markdown
## Summary

## Task

## Scope

## Out of scope

## Risk class

## Safety boundaries

## Implementation evidence
- Runtime/code artifact changed:
- Test artifact changed:
- Behavior now possible that was not possible before:

## Test plan

## Verification result
- Command:
- Result:
- Current head commit:

## Changed files

## Codex review debt
- Active P1/P2:
- Active other:
- Review-collapse notes:

## Docs budget
- Docs files changed:
- Why each doc update is necessary:

## Scope control
- One task / one PR boundary:
- Explicitly out of scope:
- Manifest-only or dry-run work? If yes, approved label:

## Rollback
- Revert strategy:

## Handoff
```

## Definition of Done for Repository Completion

The repository is closer to complete only when a merged PR leaves behind working code or enforceable automation. A merged PR that only adds prose, handoff notes, or future intent is not completion progress.
