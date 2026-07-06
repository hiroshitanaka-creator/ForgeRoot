---
name: forgeroot-completion-engine
description: Use this skill when implementing features, fixing bugs, writing tests, verifying, auditing, self-repairing, preparing PRs, or routing the next task in hiroshitanaka-creator/ForgeRoot. Claude port of the Codex forgeroot-completion-engine with the forgeroot-pr-quality-gate integrated as mandatory phases. Enforces read-before-write, implementation-first, test-backed, expanded-context audit, plus the gate's design rules (G0), adversarial passes (G2), tamper-harness tests (G3), mechanical checks (G4), and gate report (G5) before any PR. Triggers include "実装して", "T0XXをやって", "バグを直して", "テストを書いて", "PRを準備して", and any packages/*, crates/*, .forge/* change.
---

# ForgeRoot Completion Engine(Claude版・品質ゲート統合)

Codex用 `forgeroot-completion-engine` のClaude移植版に、`forgeroot-pr-quality-gate` を必須フェーズとして統合したもの。実装タスクの「作り方」と「pushしてよい条件」を1つのループで定義する。

## 0. 位置づけと責務分担

このリポジトリのClaude skillは3つで役割を分ける。競合したら上の行が優先。

| Skill | 責務 |
|---|---|
| `forgeroot-completion-orchestrator` | タスク選定・安全境界・非エンジニア向けUI・User Decision Card |
| **`forgeroot-completion-engine`(このSkill)** | 実装タスクの実行規律(読む→設計→実装→テスト→監査→自己修復→PR→次タスク) |
| `forgeroot-pr-quality-gate` | push前の品質判定(G0〜G5)。このSkillのフェーズとして呼ばれる |

orchestrator の operating loop step 9〜12(実装〜PR本文作成)に入ったら、このSkillでその区間を実行する。ユーザーへの最終報告・意思決定は orchestrator の契約(日本語・User Decision Card)に従う。

## 1. Mission Lock

対象リポジトリは `https://github.com/hiroshitanaka-creator/ForgeRoot` のみ(ユーザーが明示的に他へ適用を指示した場合を除く)。

質問への抽象的な回答やドキュメント作成で終わらせず、**実装 → 証拠 → テスト → 監査 → 修復 → 検証 → PR → 次タスク**のループでリポジトリを完成に近づける。人間向け説明は簡単な日本語で行う。

## 2. Required References(必読)

非自明なタスクでは、編集やPR提案の前に以下を読む。エンジンの規律文書はCodex版と共通(モデル非依存の内容のため、`.agents/skills/` の原本を単一ソースとして参照する。コピーを作らない):

| ファイル | 内容 |
|---|---|
| `.agents/skills/forgeroot-completion-engine/references/output-contract.md` | 出力順序と各ブロック(`<repo_evidence>` / `<design_rationale>` / `<verification_result>` / `<impact_scope>` / `<audit_context>`)の形式 |
| `.agents/skills/forgeroot-completion-engine/references/gates-and-failure-policy.md` | 実装・検証・PR・失敗の各ゲートとhard failure条件、Definition of Done |
| `.agents/skills/forgeroot-completion-engine/references/audit-rubric.md` | 拡張コンテキスト敵対監査(アーキテクチャ漏洩・状態/並行・構造的負債)と自己修復ループ |
| `.agents/skills/forgeroot-completion-engine/references/next-task-routing.md` | 次タスク選定と `<next_task_routing>` の形式 |
| `../forgeroot-pr-quality-gate/SKILL.md` とその references/ | 品質ゲートG0〜G5(設計ルールR1〜R10 / 敵対パスP1〜P6 / tamper-harness / 機械検査 / レポート) |

## 3. 統合ワークフロー(エンジン13ステップ × ゲートG0〜G5)

Codex版の Forbidden Workflow(未熟なPRを出して人間レビューで直す)を禁止し、以下の順で実行する。**[G*]** が品質ゲートの挿入点。

1. タスク理解(`## タスク理解` ブロック)
2. 人間向け計画の説明(`## これから行うこと` ブロック・平易な日本語)
3. リポジトリ証拠の読み込み → `<repo_evidence>`
4. 設計 → `<design_rationale>` **[G0: 設計ルールR1〜R10を適用。validator/manifest系なら単一検証コア・allowlist・fail-closed・リプレイ検証を設計段階で決める]**
5. コア実装(ドキュメントより先に実動作)
6. テスト追加 **[G3: validator/manifest系は tamper-harness + 否定テスト網羅表を必須で実装]**
7. 検証実行 → `<verification_result>`(コマンドはリポジトリから発見。推測禁止)
8. `<impact_scope>` 構築
9. 拡張コンテキスト敵対監査 **[二重レンズで実施: (a) audit-rubric のアーキテクチャ監査(🔴🟡🔵) + (b) G2 の敵対パスP1〜P6(ForgeRoot実指摘クラスC1〜C10)]**
10. 自己修復ループ(指摘は点修正せず根本原因から直す。orchestratorの点修正禁止ルール4点セットに従う)
11. 再検証 + 再監査(両レンズとも指摘ゼロになるまで6〜10を反復)
12. **[G4: 機械検査 — `npm test` / `npm run build` / `cargo test --workspace --locked` / `git diff --check` / mojibakeスキャン / blueprint正準API名grep / `npm run validate:skills`(skill変更時)]**
13. PR準備 **[G5: gate report をPR本文に添付]** + §4 のCI Governor適合確認
14. `<next_task_routing>` で次タスクを提示

コード・パッチ・PR本文を `<repo_evidence>` と `<design_rationale>` より先に出力しない。

## 4. Forge PR Governor 適合(CI「completion gate」を赤にしない)

`.github/workflows/forge-pr-governor.yml` が全PRを検査する。PR作成時に以下を満たすこと:

- **PR本文の必須要素**: `## Implementation evidence`(または `## Changed files`)、`## Verification` 系セクション、`- Command:` / `- Result: passed ...` 形式の検証記録、head SHA と一致する `- Current head commit: <sha>` 行。`- Result: not run` は禁止(未実行はNote行で理由を書く)
- **docs-only PR**: 実装成果物ゼロのPRはデフォルトでブロックされる。正規の通し方は `docs-only-approved` ラベル(付与はオーナー承認事項。勝手に付けず、User Decision Cardで依頼するか、ユーザーから委任済みの場合のみ代行する)
- **manifest-only / dry-run PR**: 本文にその旨を書く場合は `manifest-only-approved` ラベルが必要
- **Codexレビュー負債**: open PR全体でアクティブなCodex指摘スレッドがあると新PRのgateが落ちる(P1/P2は0件必須)。先に既存PRの指摘を解消する(orchestrator priority ruleと一致)
- docs比率40%超・docsファイル4個以上も承認ラベルなしではブロックされる。実装PRでは docs をコード変更に従属させる

## 5. Non-Negotiable Operating Rules(Codex版から継承)

- **読む前に書かない**: 既存のsymbol・path・schema・command・config key・依存を全て実物で確認する。推測禁止(zero-hallucination policy)
- **実装が先、ドキュメントは最後**: docs-first / cleanup-first / refactor-first への退避を禁止(anti-inward-thinking)。refactorは実装・テスト・監査が物理的に要求する最小限のみ
- **placeholder完了禁止**: TODO・stub・skipped test・mock呼び出し確認だけのテスト・snapshot-onlyを完了扱いしない
- **人間レビューを品質ゲートの代わりにしない**: 監査指摘が残った状態でPRを作らない
- **正直な報告**: 未実行は「未実行+理由」。失敗は失敗と書く
- **Authority order**: 安全・secret保護・不可逆操作の制限 > このSkillとgate/orchestrator > ユーザーの明示タスク > `AGENTS.md` 等のリポジトリ規約 > 既存実装パターン > 一般的ベストプラクティス。より厳しいリポジトリローカル規則があればそちらに従う
- **安全境界**: main直書き・無承認のclass C/D変更(workflow / policy / `.forge/policies/**` / permission / federation / self-evolution)・自己マージ・自己承認をしない(orchestrator §6と同一)

## 6. Hard Failure

`gates-and-failure-policy.md` のhard failure条件に加え、以下もworkflow失敗とする:

- G0を飛ばしてvalidator/manifest系コードを書き始めた
- G2の両レンズ監査を省略してPRを作った
- tamper-harness無しでvalidator系PRを出した
- gate report無しでコード変更PRを出した
- Governor要件(§4)を確認せずPRを出してCIを赤にした

発生したら: 停止 → 失敗したゲートを特定 → そのゲートからやり直す。

## 7. Final Mantra

説明してから動く。読んでから書く。実装から逃げない。テストで証明する。Diffだけを見ない。監査で壊す(二重レンズで)。自分で直す。**ゲートを通ってから出す。**終わったら次を決める。
