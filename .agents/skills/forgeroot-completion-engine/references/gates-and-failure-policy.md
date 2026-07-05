# Gates And Failure Policy

Load this file for every ForgeRoot implementation, bug fix, test, verification, audit, PR, or final proposal task.

## Zero-Hallucination Policy

Every existing symbol used in new code must satisfy at least one condition:

1. found in existing ForgeRoot code;
2. imported from a verified dependency;
3. newly introduced in the current patch.

Never guess function names, class names, variable names, import paths, route paths, database table names, column names, model fields, environment variable names, test helper names, framework conventions, build commands, package manager, or directory layout. If unknown, search and read.

## Implementation Priority

Always work in this order:

1. real core feature logic;
2. tests or executable verification;
3. audit-driven fixes;
4. minimal refactor required by the implementation or audit;
5. documentation only at the end, if necessary.

The first patch must target real runtime behavior. Forbidden as first action unless the task is explicitly documentation-only: README update, docs update, folder cleanup, naming-only cleanup, comment-only change, style-only change, broad abstraction, or architecture shell without behavior.

## Refactor Control

Refactor-first work is forbidden unless the current structure physically prevents implementation, the refactor is the smallest safe step needed to implement the feature, the current code cannot be tested without minimal extraction, or the adversarial audit identifies a structural flaw that must be fixed.

Justify every permitted refactor in `<design_rationale>`. Keep the refactor scope minimal. Do not perform opportunistic cleanup.

## Test And Verification Requirements

For every functional change, add or update at least one unit test, integration test, regression test, edge-case test, failure-mode test, authorization test, concurrency or idempotency test, or verification script.

Consider these cases where relevant: normal input, empty input, null/undefined/None, zero, extreme values, missing resource, unauthorized user, wrong owner/tenant/workspace, duplicate request, external API failure, timeout, database failure, partial failure, retry behavior, concurrent access, and idempotency.

Tests must assert behavior, not only that mocks were called. Do not use skipped tests as proof. Do not use snapshot-only tests as proof unless the snapshot directly captures meaningful behavior.

## Test Command Discovery

Never guess test commands. Before running verification, inspect relevant files such as:

- `package.json`;
- `pnpm-lock.yaml`;
- `yarn.lock`;
- `package-lock.json`;
- `pyproject.toml`;
- `poetry.lock`;
- `requirements.txt`;
- `Makefile`;
- `Cargo.toml`;
- `go.mod`;
- README;
- `.github/workflows/*`;
- CI config files.

Use the actual repository command. If multiple commands exist, choose the smallest relevant command first, then broader commands if needed.

## Security Gate

Before PR or final proposal, check:

- auth vs authorization separation;
- ownership and tenant boundaries;
- secret exposure;
- unsafe logs;
- external API trust boundary;
- user-controlled input reaching file, shell, SQL, network, or template execution;
- dependency risk introduced by the patch.

## Data And Migration Gate

If database or schema changes are involved, check forward migration, rollback or recovery plan, data backfill requirement, nullability, default values, uniqueness, indexes, foreign keys, large-table migration risk, and compatibility with existing records.

## API Contract Gate

If API behavior changes, check request validation, response shape, error codes, authentication, authorization, idempotency, pagination, rate limiting or abuse risk, and backward compatibility.

## CI And Release Gate

Before PR proposal, check that the smallest relevant test passed or was honestly blocked, broader test command was identified, lint/typecheck/build command was identified if present, CI workflow impact is understood, dependency or lockfile changes are justified, and no generated artifacts are committed unless expected by repo conventions.

## Observability Gate

For meaningful runtime failures, check for actionable error messages, structured log context where repository convention supports it, no secrets in logs, and enough context to debug production failure.

## Dependency Gate

Before adding a dependency, prove existing dependencies cannot solve the task, check package manager from repository evidence, justify security and maintenance risk, update lockfile if the repository uses one, and add tests proving the dependency-backed behavior. Do not add dependencies for convenience.

## Documentation Gate

Docs may be updated only after implementation, tests, verification, audit, and repair. Docs are allowed earlier only when the user's task is explicitly documentation-only. If docs are updated, they must describe actual behavior, not planned behavior.

## PR Gate Checklist

A PR or final proposal is allowed only when every item below is satisfied or honestly blocked:

- [ ] Target repository is ForgeRoot.
- [ ] Human-facing plan was provided.
- [ ] Existing code was read.
- [ ] Repository instructions were checked.
- [ ] `<repo_evidence>` was produced.
- [ ] `<design_rationale>` was produced before code.
- [ ] Core functionality was implemented before docs.
- [ ] Tests or verification were added.
- [ ] Actual test command was discovered from repository files.
- [ ] Verification was run or inability to run was honestly reported.
- [ ] `<impact_scope>` was produced.
- [ ] Expanded-context adversarial audit was run.
- [ ] All real audit findings were repaired.
- [ ] Re-verification was performed.
- [ ] Final audit returned `なし` for every section.
- [ ] Documentation was updated only at the end, if necessary.
- [ ] Next-task routing was performed.

If any item fails, do not create a PR. Report the blocker.

## Tool-Limited Environment Rule

If the environment cannot edit files, run tests, access GitHub, create branches, or create PRs, still apply the workflow as far as possible. Do not pretend execution occurred. Use the tool-limited output from `output-contract.md`.

## Hard Failure Conditions

The workflow fails if any of these occur:

- code is generated before reading relevant existing files;
- code is generated before `<repo_evidence>`;
- code is generated before `<design_rationale>`;
- docs are updated before core implementation without a docs-only task;
- import paths are guessed;
- existing symbols are guessed;
- tests are omitted for functional changes;
- test commands are guessed;
- test success is claimed without execution;
- audit only reviews the diff;
- audit ignores tests;
- audit gives style, naming, formatting, typo, or linter-level comments;
- audit includes praise or social filler;
- PR is created with unresolved audit findings;
- human review is used as a substitute for internal audit;
- next-task routing is omitted.

If a hard failure occurs:

1. stop;
2. identify the failed gate;
3. repair the workflow;
4. restart from the correct gate.

## Definition Of Done

A task is done only when:

- [ ] ForgeRoot is the active target.
- [ ] Human-facing plan was explained simply.
- [ ] Existing repository code was read.
- [ ] Repository instructions were checked.
- [ ] No guessed symbols, paths, configs, schemas, or commands remain.
- [ ] `<repo_evidence>` was produced.
- [ ] `<design_rationale>` was produced before code.
- [ ] Real core functionality was implemented first.
- [ ] Tests or verification were added.
- [ ] Repository-derived test command was used.
- [ ] Test result was honestly reported.
- [ ] Expanded impact scope was built.
- [ ] Embedded adversarial audit was run.
- [ ] All real audit findings were repaired.
- [ ] Re-test was performed.
- [ ] Re-audit returned `なし` in every section.
- [ ] Documentation was updated only at the end, if needed.
- [ ] PR or final proposal was prepared.
- [ ] Next-task routing was performed.

## Final Operating Mantra

Operate by this rule:

説明してから動く。
読んでから書く。
実装から逃げない。
テストで証明する。
Diffだけを見ない。
監査で壊す。
自分で直す。
問題が消えてから出す。
終わったら次を決める。
