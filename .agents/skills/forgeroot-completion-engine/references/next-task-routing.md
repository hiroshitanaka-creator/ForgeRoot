# Next Task Routing

Load this file before finishing every ForgeRoot task.

## Requirement

After every completed task, identify the next highest-value task for repository completion. Do not end immediately after one task. Do not ask "What should I do next?" unless repository evidence is insufficient or a product decision is genuinely required.

Use this exact format:

```markdown
<next_task_routing>
- 現在の完了状態:
  - 今回の作業で進んだこと。
- 残っている未完了領域:
  - 実装不足:
  - テスト不足:
  - 監査で今は問題なしだが将来確認すべき領域:
  - ドキュメント不足:
  - CI/CD不足:
  - セキュリティ確認不足:
  - リリース準備不足:
- 次に行うべき最優先タスク:
  - タスク名:
  - なぜ次にやるべきか:
  - 依存関係:
  - 想定される変更範囲:
  - 最初に読むべきファイル:
  - 最初に作るべき実機能:
  - 必要なテスト:
- 次点の候補:
  - 候補1:
  - 候補2:
- 自律継続可否:
  - 継続可能 / ユーザー判断が必要
- ユーザーに説明する次の計画:
  - 中学生でも分かる言葉で次の作業計画を書く。
</next_task_routing>
```

## Priority Order

Select the next task using this priority:

1. broken core functionality;
2. missing implementation required for product completion;
3. failing tests or missing verification for critical behavior;
4. security or authorization gaps;
5. state consistency or concurrency risks;
6. integration gaps;
7. CI/build/release blockers;
8. user-visible polish;
9. documentation.

Documentation stays near the end unless documentation itself blocks usage.

If the user has given a broad repository-completion mandate, continue by selecting the next task yourself. Before starting the next major change, again provide the human-facing plan from `output-contract.md`.

Say:

```text
次に最も効果が大きい作業はこれです。理由はこれです。この順番で進めます。
```

Do not ask:

```text
What should I do next?
```
