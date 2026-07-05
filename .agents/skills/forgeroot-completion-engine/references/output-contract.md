# Output Contract

Load this file for every non-trivial ForgeRoot task. These are public outputs, not hidden reasoning.

## Required Runtime Output Order

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

## Human-Facing Plan Before Major Action

Before any branch, PR, large patch, dependency change, schema change, broad refactor, or multi-file implementation, explain the plan in simple Japanese:

```markdown
## これから行うこと
### 目的
この作業で何を動くようにするかを、専門用語を避けて説明する。
### まず作るもの
READMEや整理ではなく、最初に作る実際に動く処理を書く。
### 確認すること
既存コードのどこを読み、どの処理とつながっているかを確認する。
### 壊さないための確認
どんなテストや検証で壊れていないことを確かめるかを書く。
### 最後に行うこと
内部監査で問題がなくなった後、PRまたは変更提案を作る。
```

Use plain language. If a technical term is necessary, explain it immediately in simple words.

## Task Intake

For every task, produce:

```markdown
## タスク理解
- 作るべき機能:
- 直すべき問題:
- 変更してはいけないもの:
- 確認が必要な既存コード:
- 完了条件:
```

If the user request is vague, infer the safest useful implementation from repository evidence. Ask the user only for product decisions that cannot be inferred, credentials or secrets, irreversible external actions, legal/billing/business policy, or insufficient repository access.

## Repository Evidence Block

Before any code, patch, diff, or PR body, output:

```markdown
<repo_evidence>
- 読み込んだ主要ファイル:
  - path/to/file
  - path/to/related_file
- 確認した既存の関数・型・設定:
  - functionName
  - TypeName
  - CONFIG_KEY
- 確認した依存関係:
  - A は B を呼び出している
  - C は A を import している
- 確認したテスト・検証方法:
  - 実際に見つけたテストコマンドまたは検証手順
- 確認したリポジトリ指示:
  - AGENTS.md / README / CI / package scripts など
- 不明点:
  - なし
</repo_evidence>
```

If unknowns remain, resolve them by reading more code before coding. Only business or product decisions that cannot be inferred may remain as user questions.

## Public Design Rationale

Before source code, patches, diffs, or PR text, output:

```markdown
<design_rationale>
- 採用する方針:
  - なぜこの実装方法を選ぶのか。
- 棄却した代替案:
  - 代替案1:
    - なぜ採用しないのか。
  - 代替案2:
    - なぜ採用しないのか。
- 既存構造との整合性:
  - 既存コードのどの構造に合わせるのか。
- 内向思考を避ける判断:
  - なぜdocs更新や不要な整理ではなく、実機能実装を先に行うのか。
- リスク:
  - どこが壊れやすいか。
  - そのリスクをどう抑えるか。
- テスト方針:
  - 正常系:
  - 異常系:
  - 境界値:
  - 権限:
  - 失敗時:
  - 並行・重複:
</design_rationale>
```

Keep it concise and reviewable.

## Verification Result

After verification, output:

```markdown
<verification_result>
- 実行したコマンド:
  - command here
- 結果:
  - passed / failed / not run
- 失敗または未実行の理由:
  - reason
- 失敗時に修正した内容:
  - 修正した場合のみ記載
- 次に必要な確認:
  - required follow-up
</verification_result>
```

Do not claim success unless the command actually succeeded. If tools cannot run tests, say so.

## Impact Scope

Before audit, build this block:

```markdown
<impact_scope>
- 変更ファイル:
  - path/to/changed_file
- 直接依存:
  - path/to/dependency
- 呼び出し元:
  - path/to/caller
- 兄弟ファイル:
  - path/to/sibling
- 関連テスト:
  - path/to/test
- 関連設定:
  - path/to/config
- 関連スキーマ・型:
  - path/to/schema_or_type
- 認証・認可関連:
  - path/to/auth_file
- DB・永続化関連:
  - path/to/db_or_migration
- 外部API関連:
  - path/to/client
- 非同期処理・ジョブ関連:
  - path/to/job
- エラー処理・ログ関連:
  - path/to/error_or_logger
- リスク領域:
  - 認可
  - 状態管理
  - DB更新
  - 外部API
  - 非同期処理
  - 並行処理
  - パフォーマンス
  - ログ
</impact_scope>
```

If a category is irrelevant, write `該当なし` and briefly explain why.

## Audit Context Package

Before the adversarial audit, assemble:

```markdown
<audit_context>
- ユーザー要求:
- 実装目的:
- 変更Diff:
- 変更ファイル全文:
- 変更ファイルの依存先:
- 変更ファイルの呼び出し元:
- 兄弟ファイル:
- 関連テスト:
- DBスキーマ:
- API仕様:
- 認証・認可関連:
- 外部API関連:
- 非同期処理関連:
- 状態管理関連:
- エラー処理関連:
- ログ関連:
- テスト実行結果:
- ビルド結果:
- 既知の制約:
</audit_context>
```

If context is incomplete, gather more repository evidence before audit.

## PR Body Format

Use this PR body format:

````markdown
## 概要
このPRで何を実装したかを短く説明する。

## ユーザーにとって何が変わるか
専門用語を避けて説明する。

## 実装内容
- 変更点1
- 変更点2
- 変更点3

## 確認した既存コード
- path/to/file
- path/to/related_file

## 設計意図
<design_rationale>
...
</design_rationale>

## テスト・検証
実行したコマンド:
```bash
actual command
```

結果:

passed / failed / not run

## 影響範囲

<impact_scope>
...
</impact_scope>

## 内部監査結果

## 🔴 致命的なアーキテクチャ欠陥 (Critical Architectural Flaws)
なし

## 🟡 潜在的な状態・並行処理リスク (State/Concurrency Risks)
なし

## 🔵 構造的負債 (Structural Debts)
なし

## 残っているリスク
- なし

or

- 明確に残る制約を書く。

## 次に行うべきタスク

<next_task_routing>
...
</next_task_routing>
````

## Tool-Limited Environment Output

If execution cannot happen, output:

```markdown
## 実行できなかったこと
- 実行できなかった操作:
- 理由:
- 代替として提示するもの:
- 実際の環境で確認すべきコマンド:
- PR作成前に必要な確認:
```

Even in limited environments, still provide repository evidence if available, design rationale, implementation patch proposal, test proposal, audit using available context, and next-task routing.
