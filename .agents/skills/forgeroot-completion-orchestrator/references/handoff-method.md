# Handoff Method(次のセッションへの引き継ぎ作成方法)

ForgeRootの記憶はセッションではなくGitに残す(Repo-first原則)。
作業スレッドを終えるとき・大きな区切りがついたときは、必ずhandoffを作る。

## 置き場所と命名

- パス: `docs/ops/thread-handoff-after-<task>.md`(例: `thread-handoff-after-t047.md`)
- タスク番号がない作業(hygiene・矛盾解消等)は内容がわかる名前(例: `thread-handoff-after-pr-dedup.md`)
- handoffはそのタスクのPRに**同梱**する(handoffだけの後追いPRにしない)

## 必須内容(`templates/handoff-template.md` を使う)

- Current phase / Current task
- What changed(file path付き)
- What passed(実行したコマンドと結果)
- What failed(あれば。隠さない)
- What was not attempted(**重要**: やっていないことを明示する)
- Open PRs(番号と状態)
- Next recommended task(根拠付き)
- Exact next command(次のCodexがコピペで開始できるコマンドまたは起動文)
- Risks
- Files to read first(次のセッションが最初に読むべき3〜5ファイル)

## 書き方のルール

- 「たぶん」「〜のはず」を書かない。証拠(path / PR番号 / コマンド出力)で書く
- 未実行の検証を実行済みのように書かない
- 次タスクの推奨には必ず根拠(canonical task source / blueprint節番号 / 依存関係)を付ける
- 過去のhandoff(`docs/ops/thread-handoff-after-t045.md` 等)の文体・粒度に合わせる

## TASK_PROGRESS.md との関係

- handoff = そのタスクの完結記録(不変)
- `TASK_PROGRESS.md` = 今の現在地(毎回上書き)
- タスク完了PRには両方を含める: 新しいhandoff + TASK_PROGRESS.mdの更新

## セッション途中で切れそうなとき

作業が未完のままセッションが終わりそうな場合は、未完handoffを優先して書く:

- どこまでやったか(ブランチ名・commit hash・未pushの有無)
- 何が検証済みで何が未検証か
- 再開するための正確なコマンド
