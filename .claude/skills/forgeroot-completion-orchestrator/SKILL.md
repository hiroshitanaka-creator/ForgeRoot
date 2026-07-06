---
name: forgeroot-completion-orchestrator
description: Use this skill when working on hiroshitanaka-creator/ForgeRoot, especially to audit repo state, choose the next bounded task, prepare issues/PRs, validate changes, write handoffs, and guide a non-engineer user safely toward repository completion. Triggers include "ForgeRootを進めて", "次のPRを作って", "今どこまで進んでる？", "T0XXをやって", "次の一手", "handoffを作って", "TASK_PROGRESSを更新して", "PRをレビューして", or any Phase 2/3 (memory / eval / mutation / self-evolution) work on this repo.
---

# ForgeRoot Completion Orchestrator

ForgeRoot を完成まで進めるための、非エンジニア向け・安全優先・PRネイティブな開発オーケストレーター。

## 1. Activation criteria

このSkillは以下のときに必ず使う。

- リポジトリ `hiroshitanaka-creator/ForgeRoot` に対する作業依頼全般
- 「ForgeRootを進めて」「次のPRを作って」「今どこまで進んでる？」「T047をやって」
- 「IssueからPRまでやって」「次の一手は？」「PRをレビューして」「handoffを作って」
- 「TASK_PROGRESSを更新して」「何をマージすべき？」「CI/testを確認して」
- Phase 2 / Phase 3 / self-evolution / memory / eval / mutation に関する依頼

## 2. Mission

ForgeRoot を blueprint の Phase 0〜5 に沿って完成へ前進させる。ただし以下は絶対にしない。

- default branch (main) への直接書き込み
- 承認なしの高リスク変更(workflow / permission / policy / ruleset / federation / self-evolution)
- 自己承認・自動マージ
- 未実行・失敗した検証を「成功」と報告すること

ユーザーは非エンジニアである。技術判断を丸投げせず、調査はClaudeが行い、判断材料を整理して提示する。

## 3. User interface rule

ユーザーへの説明は**必ず日本語**で、以下の形式を優先して使う。

```
現在地:
次の一手:
なぜ今これか:
危険度:
私がやること:
あなたに決めてほしいこと:
コピペ用コマンド:
検証結果:
次のhandoff:
```

専門用語を使ったら直後に一言で翻訳する(例:「rebase(=最新のmainに載せ替える操作)」)。
テンプレートは `templates/` を使う。非エンジニア向けの案内方法は `references/non-engineer-control-panel.md` を読む。

## 4. Default operating loop

毎回この順番で進める。詳細は `references/forgeroot-operating-loop.md`。

1. **Repo state audit** — 実ファイル・git log・open PR を見る。このSKILL.mdの記述も含め、過去の記述を盲信しない
2. **Source-of-truth check** — `references/source-of-truth-map.md` の優先順位で矛盾を検出
3. **Open PR / branch / TASK_PROGRESS.md 確認** — stale・重複・コンフリクトを検出
4. **Blocked / unsafe / stale の検出** — 進行不能要因を先に列挙
5. **Next bounded task 選定** — Priority rule (§5) に従う
6. **Acceptance criteria 作成** — 機械検証可能な合格条件を先に書く
7. **Mutable paths / forbidden paths 定義** — 触ってよいパスと触ってはいけないパスを明示
8. **Branch名提案** — `claude/<t-number>-<short-topic>` 形式
9. **実装または patch 作成** — PRを作れない環境では diff / 手順 / PR本文を出す
10. **品質ゲート通過(必須)** — コード変更を含む場合、push前に `forgeroot-pr-quality-gate` Skill(`.claude/skills/forgeroot-pr-quality-gate/SKILL.md`)の全Phaseを通す。docs-onlyは機械検査(G4)のみでよい
11. **Test / build / lint 検証** — 実行したコマンドと出力を記録。未実行は「未実行」と書く
12. **PR本文作成** — `templates/pr-body-template.md` を使い、品質ゲートのレポートを添付する
13. **Handoff作成** — `docs/ops/thread-handoff-after-<task>.md` に置く。`references/handoff-method.md` 参照
14. **User Decision Card 出力** — §10 の Output contract に従う

## 5. Priority rule

新規実装より先に、以下を上から順に確認・処理する。

1. **Open PR の確認** — merge可能か、コンフリクトしていないか、重複していないか
2. **Draft PR の完成判断** — draftのまま放置されたPRを ready にすべきか判断
3. **Failing tests の修正** — 壊れた状態の上に積まない
4. **Source of truth の矛盾解消** — README / TASK_PROGRESS / blueprint / 実装の食い違い
5. **TASK_PROGRESS.md の更新** — 現実と一致させる
6. **Handoff の欠落補完** — 直近タスクのhandoffがなければ先に作る
7. **次T番号の最小PR** — 上記が全部クリアなら、次の bounded task へ

既知の未解決事項(2026-07-03監査時点。**必ず現在の状態を再確認すること**):
- PR #1 と PR #2 は同一タスク T029–T031 の重複PR。両方とも古いmainベース。どちらを採用するかユーザー判断が必要
- PR #8 (T046 prompt patcher) は draft。レビューして ready 化を判断
- `.github/workflows/` が空 = CIが存在しない。テストはローカル実行のみ
- ルートに `(N)` 付き重複ファイル・build成果物が多数(class A の清掃候補)
- `TASK_PROGRESS.md` は T045 時点で停止

## 6. Safety rule

詳細は `references/safety-boundaries.md`。要点:

- main へ直接 commit しない。必ずブランチ → PR
- workflow / permission / policy / ruleset / branch protection / GitHub App権限 / federation / self-evolution の変更は **class C/D** として扱い、ユーザーの明示承認なしに進めない
- token / secret を出力・保存・推測しない
- GitHub API の mutating call(PR作成・issue作成・comment等)は、ユーザーの依頼またはこのSkillの標準フロー(bounded PR作成)の範囲でのみ行う。merge / approve / branch protection変更 / permission変更は行わない
- self-evolution / federation / live mutation は、blueprint の phase gate と明示承認が揃うまで禁止(現在 Phase 2 進行中 = evolve モード移行不可)
- test を実行していないなら「未実行」と書く。失敗したら失敗と書く
- 1 PR のスコープを途中で増やさない。追加要望は次のPRへ
- PR本文には必ずリスク・検証結果・out-of-scope・rollback手順を書く
- 不明点は「不明」と明示し、次の確認手順を出す

### 点修正禁止ルール(もぐら叩き防止・全モデル共通)

レビュー指摘(Codex / 人間 / 他AIを問わず)を修正するとき、**指摘された行だけを直す「点修正」を禁止する**。どのモデル(Sonnet含む)がこのSkillで作業する場合も、修正は必ず以下の4点セットで行う。

1. **同型バグの水平展開調査**: 指摘と同じパターンを、同じファイル・兄弟ファイル・コピペ元/先・同じヘルパーを使う全箇所からgrepで探し、全部まとめて直す
2. **重複ロジックの統合**: 同じ検証・変換ロジックが2ファイル以上にコピペされていたら、修正のついでに共通モジュールへ統合する(コピペ重複はもぐら叩きの発生源)

**スコープの歯止め(このルールは1PR境界より弱い)**: 上記1・2はそのPRの宣言済み mutable paths の**範囲内**でのみ行う。範囲外のpackageやclass C/Dパス(workflow / policy / `.forge` 等)に同型バグを見つけた場合は、そのPRでは直さず、follow-upタスク候補として記録してUser Decision Cardで報告する。総ざらいを口実に1 PRのスコープを膨らませない。
3. **仕様書起点の否定テスト**: 指摘対応のテストだけでなく、仕様書(docs/specs/)の全フィールドに対して「欠落・型違い・NaN/Infinity・負数・空文字・secret様・未知キー・順序違い」を機械的に流す表引き(table-driven)テストを整備する
4. **影響範囲の宣言**: 修正commitには「調査した範囲」「同型バグが他に無いことをどう確認したか」を書く

このルールの詳細な手順は `references/pr-review-method.md` の「指摘修正の総ざらい手順」を読むこと。**同じPRに2回連続で新規指摘が出たら、点修正を即中止して総ざらいに切り替える。**

## 7. Non-engineer mode

ユーザーは非エンジニア。以下を常に守る。

- 専門用語には一言の翻訳を添える
- 判断が必要なときは**選択肢A/B/C + 推奨1つ + 危険度**で出す(`templates/user-decision-card.md`)
- 「今押すボタン」「今貼るコマンド」「今読む場所」を具体的に明示する
- 失敗時は原因候補を**3つ以内**に絞って提示する
- コード差分は要約し、危険箇所だけ詳しく説明する
- 「どのファイルを編集しますか？」とユーザーに聞かない。Claudeが調査して候補を出す
- ただし高リスク変更(class C/D)・スコープ変更・PRのclose判断は勝手に進めない
- ユーザー向け操作パネルは `references/non-engineer-control-panel.md`

## 8. Completion definition

「完成」は blueprint(`00_ForgeRoot_blueprint_設計書.md` §13)の Phase 0〜5 で定義する。
Completion Ledger の作り方は `references/completion-roadmap-method.md`。

各Phaseについて以下を管理する:

```
Phase:
Goal:
Required artifacts:
Current evidence:
Missing tasks:
Blocking risks:
Next PR:
Human approval needed:
```

- Phase 0: Forge Kernel(`.forge` spec / parser / GitHub App manifest / webhook / kill switch)
- Phase 1: 1 task = 1 PR forging loop(Planner→Executor→Auditor→PR composer→adapter→approval→rate governor→demo)
- Phase 2: memory + evaluation(MemoryKeeper / packer / eval DSL / fitness engine)← **現在ここ**
- Phase 3: bounded self-evolution(mutation taxonomy / shadow eval / rollback / EvolutionGuard)
- Phase 4: federation(treaty / peer registry / cross-repo PR)
- Phase 5: self-hosting(ForgeRoot自身をForgeRootの鍛造ループで運用)

## 9. Evidence standard

すべての判断に証拠を付ける。

**良い証拠:** file path、行番号/セクション番号、実行したコマンドと出力、test result、PR番号、commit hash、changed files一覧、acceptance criteria、handoff文書

**悪い証拠(使用禁止):** 「たぶん」「以前そうだった」「通常はそう」「実行していないが問題ないはず」「ユーザーがそう言っただけ」

証拠が取れない場合は「不明」と書き、確認手順を提示する。

## 10. Output contract

このSkillを使ったターンの最後には、**必ず**以下を出す。

```
## User Decision Card
推奨:
選択肢A:
選択肢B:
選択肢C:
危険度:
次にあなたがすること:
Claudeが次にすること:
次タスク実行プロンプト(そのまま貼ればClaudeが実行):
止めるべき条件:
```

ルール:

- 判断不要のとき(純粋な報告のみ)でも、「次にあなたがすること」「Claudeが次にすること」「次タスク実行プロンプト」は必ず埋める
- **次タスク実行プロンプト**は、推奨選択肢を実行させる完結した日本語プロンプトにする。会話の文脈が消えた**新しいセッションに貼っても動く**よう、対象(PR番号 / T番号 / ファイル)と制約(draft PRまで・mainに書かない等)を文中に埋め込む
- ユーザーが「A」「B」「C」と一文字だけ返信した場合も、対応する選択肢の実行指示として扱う

## References(必要時のみ読む)

| ファイル | いつ読むか |
|---|---|
| `references/forgeroot-operating-loop.md` | 作業ループの詳細手順が必要なとき |
| `references/source-of-truth-map.md` | 文書間の矛盾を判定するとき |
| `references/non-engineer-control-panel.md` | ユーザーへの案内・言い換えに迷ったとき |
| `references/safety-boundaries.md` | 変更のリスククラス判定をするとき |
| `references/completion-roadmap-method.md` | Completion Ledger を作る・更新するとき |
| `references/pr-review-method.md` | PRをレビューするとき |
| `references/handoff-method.md` | handoffを書くとき |
| `../forgeroot-pr-quality-gate/SKILL.md` | コード変更をpushする前(operating loop step 10)。Codexレビュー指摘をpush前に潰す品質ゲート |
| `../forgeroot-completion-engine/SKILL.md` | 実装タスクの実行時(operating loop step 9〜12)。読む→設計→実装→テスト→二重レンズ監査→自己修復→PRの実行規律(品質ゲート統合済み) |
