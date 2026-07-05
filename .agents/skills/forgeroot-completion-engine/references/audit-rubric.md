# Audit Rubric

Load this file before every expanded-context adversarial audit.

## Audit Identity

Do not act as a linter or a general code reviewer. Act as a principal engineer responsible for mission-critical distributed systems and an adversarial inspector trying to break the implementation.

Audit only for:

- architectural leakage;
- missing required logic;
- state inconsistency;
- authorization failure;
- concurrency risk;
- transaction or rollback failure;
- idempotency failure;
- performance collapse;
- insufficient failure logging;
- weak tests that would allow broken behavior to pass.

Do not report syntax errors, typos, naming style, formatting, indentation, blank lines, superficial optimization, praise, or social filler.

## Required Audit Output

Use this exact output format:

```markdown
## 🔴 致命的なアーキテクチャ欠陥 (Critical Architectural Flaws)
なし
or
- [対象ファイル/行]:
  - 欠陥のメカニズム:
  - 不在の指摘:
  - Why it is fatal:
  - 修正の方向性:

## 🟡 潜在的な状態・並行処理リスク (State/Concurrency Risks)
なし
or
- [対象ファイル/行]:
  - 競合のシナリオ:
  - Why it is fatal:
  - 修正の方向性:

## 🔵 構造的負債 (Structural Debts)
なし
or
- [対象ファイル/行]:
  - 結合の理由:
  - Why it is fatal:
  - 修正の方向性:
```

Audit pass requires all three sections to be `なし`. Repair substantive findings before PR or final proposal.

## Required Audit Checks

### Authorization Beyond Authentication

Check whether the current user may access or modify the exact resource. Look for owner ID mismatch, tenant/workspace/org boundary violation, BOLA/IDOR, server-side authorization gaps, service-layer authorization gaps, database constraint gaps, and authenticated-but-not-authorized failures.

### Failure and Rollback

Check API timeout, database deadlock, local success with external failure, external success with local failure, retry safety, rollback path, compensation path, idempotency, and duplicate submission.

### Concurrency

Check race conditions, lost updates, double inserts, stale reads, long transactions, lock scope, async job duplication, and queue retry duplication.

### Performance

Check N+1 queries, full-table scan risk, unbounded memory load, missing pagination, large file read, synchronous blocking, and cache inconsistency.

### Logging

Failure logs should contain useful context where safe: operation name, request ID, user ID, resource ID, external service, retry count, and failure reason.

Never log secrets, tokens, passwords, private keys, or unnecessary personal data.

## Expanded Context Requirement

Do not audit only the diff. Review the implementation against:

- changed files;
- direct dependencies;
- callers;
- sibling files;
- related tests;
- related config;
- schemas and types;
- auth and authorization utilities;
- DB and persistence files;
- external API clients;
- async jobs or state management;
- error handling and logging;
- test and build results.

Use the `<impact_scope>` and `<audit_context>` blocks from `output-contract.md` before running the audit.

## Self-Repair Loop

If the audit finds a real issue:

1. read the finding;
2. identify the root cause;
3. return to implementation;
4. modify core logic, not only symptoms;
5. add or update a test that would fail without the fix;
6. re-run verification;
7. rebuild `<impact_scope>`;
8. re-run adversarial audit;
9. repeat until all audit sections are `なし`.

Do not outsource repair to the human. Escalate only for product decisions, secrets, irreversible actions, legal or business policy, or insufficient repository access.
