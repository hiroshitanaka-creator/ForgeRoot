# ForgeRoot Operating Loop(毎回の作業ループ詳細)

ForgeRoot での1セッションは必ず以下の7段階で進める。段階を飛ばさない。

## Stage 1: Audit(監査)

実行するコマンド(read-only):

```bash
git -C <repo> fetch origin main
git -C <repo> log --oneline -15 origin/main
git -C <repo> status
git -C <repo> branch -a
```

確認するファイル(優先順):

1. `TASK_PROGRESS.md` — 前回どこまで進んだか(staleの可能性を常に疑う)
2. `docs/ops/thread-handoff-after-*.md` の**最新ファイル** — 前セッションの引き継ぎ。`ls -t docs/ops/thread-handoff-after-*.md | head -3` で新しい順に見る
3. GitHub の open PR 一覧(`mcp__github__list_pull_requests` で state=open)
4. `01_DECISION_LOG.md` — 過去の確定判断
5. `00_ForgeRoot_blueprint_設計書.md` §13 — Phaseロードマップ
6. `docs/specs/t029-t039-canonical-task-source.md` と `docs/specs/fixtures/task-source/*.json` — T番号タスクの正準ソース

監査で必ず答える問い:

- 最後にマージされたタスクは何か(git log の証拠付きで)
- open PR は何件で、それぞれ fresh / stale / duplicate / conflicted のどれか
- TASK_PROGRESS.md は現実と一致しているか
- テストは今この瞬間に通るか(実行するまで「不明」)
- CIは存在するか(2026-07時点: `.github/workflows/` は空 = 存在しない)

## Stage 2: Plan(計画)

- Priority rule(SKILL.md §5)に従い、次の bounded task を**1つだけ**選ぶ
- タスクのT番号・スコープを canonical task source と最新handoffで裏取りする
- `templates/issue-template.md` の形式で Goal / Scope / Out of scope / Acceptance criteria を書く
- mutable paths(触ってよい)と forbidden paths(触ってはいけない)を明示する
  - 常に forbidden: `.forge/policies/constitution.forge`、`.forge/mind.forge`、`.github/workflows/**`(class C/D)、既存agent genomeのidentity/species
- branch名: `claude/<t-number>-<short-topic>`(例: `claude/t047-tool-routing-mutator`)

## Stage 3: Execute(実装)

- ブランチを切ってから編集する。mainの上で直接編集しない
- スコープ外のファイルに触れたくなったら止まり、次のPR候補としてメモする
- 既存パターンに従う: 各packageは `packages/<name>/` に `src/` `tests/` `package.json` `tsconfig.json`、決定論的(deterministic)・dry-run・manifest-onlyの設計を踏襲する
- 検証レポートは `docs/specs/t<NNN>-<topic>-validation-report.md` に置く

## Stage 4: Verify(検証)

実行例(タスクに応じて選ぶ):

```bash
npm --prefix packages/<name> test
node --test --test-force-exit packages/<name>/tests/*.test.mjs
cargo test --manifest-path crates/forge-kernel/Cargo.toml
```

ルール:

- 実行したコマンド・終了コード・要約出力を必ず記録する
- 失敗したら「失敗」と書き、原因候補を3つ以内に絞る
- 実行できなかった検証は「未実行」と書く。理由と、ユーザーが手元で実行するためのコピペコマンドを添える
- 変更したpackageだけでなく、影響しうる隣接packageのテストも回す

## Stage 5: PR(プルリクエスト)

- `templates/pr-body-template.md` で本文を作る
- push は feature branch のみ: `git push -u origin <branch>`
- PR は **draft** で作成する(ready化はユーザー判断)
- PR作成が環境的に不可能な場合: patch(diff)、適用手順、PR本文案をユーザーに渡す

## Stage 6: Handoff(引き継ぎ)

- `docs/ops/thread-handoff-after-<task>.md` を `templates/handoff-template.md` で作成し、同じPRに含める
- `TASK_PROGRESS.md` を現実に合わせて更新する(これも同じPRでよい。ただしタスク本体と無関係な大改編は別PR)

## Stage 7: Next task(次タスク提示)

- User Decision Card(SKILL.md §10)で締める
- 次タスクの根拠(handoff / canonical task source / blueprint の該当箇所)を必ず引用する
