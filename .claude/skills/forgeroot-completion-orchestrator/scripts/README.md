# Scripts Policy(スクリプト方針)

## 原則

- スクリプトは**補助**であり、このSkillの中核ではない。中核は SKILL.md の operating loop と人間の承認
- 追加するスクリプトは **read-only / dry-run を優先**する
- **GitHub API への mutation(PR作成・merge・comment・設定変更)をスクリプトから行うことは禁止**。mutating操作は必ずClaudeの対話フロー + ユーザー承認を通す
- secret / token / 環境変数の認証情報を読まない・出力しない
- main へ commit しない。スクリプト自身がgit書き込みを行わない
- スクリプトの追加・変更は必ずPRでレビューする(class B以上として扱う)

## 現状

現時点で実装済みのスクリプトは**なし**。監査・PR確認はClaudeの標準ツール(git / GitHub MCP read系)で足りている。

## 将来の候補(必要になったらPRで追加)

| 候補 | 内容 | 種別 |
|---|---|---|
| `audit-repo.mjs` | git log / TASK_PROGRESS / handoff の整合チェックを一括実行 | read-only |
| `collect-pr-state.mjs` | open PRの鮮度・重複・base ずれを表にする | read-only |
| `check-task-progress.mjs` | TASK_PROGRESS.md とマージ済みT番号の突き合わせ | read-only |
| `render-completion-ledger.mjs` | Phase 0〜5 Ledgerを証拠付きで生成 | read-only |

いずれも「読むだけ・表示するだけ」の設計とし、`--write` 系のオプションを持たせない。
