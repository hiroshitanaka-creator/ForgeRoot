# 03_issue

> Purpose: GitHub に起票するための **初期 issue ドラフト集**。  
> Rule: **1 issue = 1 bounded PR scope** を絶対に崩さない。  
> Recommended labels: `forge:auto`, `class:A|B|C|D`, `risk:*`, `status:*`, `phase:*`

## 0. 起票ルール

### Issue タイトル形式
```text
[P<phase>][T<task-id>] <short imperative title>
```

### 共通テンプレート

```markdown
## Goal
この issue で達成したいことを 1 文で書く。

## Why now
今やる理由を短く書く。

## Scope
この issue に含めるものを箇条書きで限定する。

## Out of scope
この issue でやらないことを書く。

## Dependencies
先行する task / file / decision を書く。

## Deliverables
この issue 完了時に存在すべきファイル、コード、文書。

## Acceptance criteria
レビュー時に pass/fail を判定できる条件。

## Risks
実装時に踏みやすい事故。

## Suggested labels
- forge:auto
- phase:P?
- class:?
- risk:?
```

---

## 1. [META][P0] ForgeRoot v1 bootstrap tracker

**Suggested labels**
- `phase:P0`
- `class:B`
- `risk:medium`

```markdown
## Goal
ForgeRoot v1 の初期立ち上げを追跡する親 issue を作る。

## Why now
実装順序が崩れると安全境界より先に機能が増え、設計が破綻するため。

## Scope
- Phase 0 の土台 issue を列挙する
- 依存関係を明示する
- 完了条件を追跡する

## Out of scope
- 個別実装
- コード変更
- workflow 詳細

## Dependencies
- 00_ForgeRoot_blueprint_設計書.md
- 01_単語や命名規則.md

## Deliverables
- 親 issue
- 子 issue へのリンク
- Phase 0 exit 条件チェックリスト

## Acceptance criteria
- T001 / T003 / T004 / T005 / T006 / T007 / T008 / T014 がリンクされている
- Phase 0 exit 条件が明記されている

## Risks
- issue が巨大化して実装 issue と責務が混ざる
```

---

## 2. [P0][T001] monorepo skeleton and .forge root

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:A`
- `risk:low`

```markdown
## Goal
ForgeRoot の最小モノレポ骨格と `.forge/` ルートを作る。

## Why now
この骨格がないと以後の parser / app / runtime / docs の配置先がぶれるため。

## Scope
- ルートディレクトリ骨格の作成
- `.forge/`
- `.github/`
- `apps/`
- `crates/`
- `packages/`
- `labs/`
- `docs/`
- プレースホルダ README の初期配置

## Out of scope
- `.forge` schema 実装
- GitHub App 実装
- workflow の本実装

## Dependencies
- 00_ForgeRoot_blueprint_設計書.md
- 01_単語や命名規則.md

## Deliverables
- 初期ディレクトリ構成
- `.gitkeep` または最低限の index file
- ルート README 整理

## Acceptance criteria
- clone 直後に repo 構造が把握できる
- 主要ディレクトリ名が naming rules と一致する
- typo 名称が残っていない

## Risks
- 先走って実装用ファイルを置きすぎる
- apps / packages / crates の責務が曖昧なまま増殖する
```

---

## 3. [P0][T003] initial constitution and mind.forge

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:B`
- `risk:medium`

```markdown
## Goal
ForgeRoot の非交渉境界を `.forge/mind.forge` と constitution policy に固定する。

## Why now
安全境界の前に自動化を作ると、後から止められない実装が入りやすいため。

## Scope
- `.forge/mind.forge`
- `.forge/policies/constitution.forge`
- default_mode / approval_matrix / non_negotiables の初版

## Out of scope
- mutation policy の本格設計
- federation treaty
- self-evolution 解禁

## Dependencies
- T001
- 00_ForgeRoot_blueprint_設計書.md

## Deliverables
- `mind.forge`
- `constitution.forge`
- 最小 validation fixture

## Acceptance criteria
- no_default_branch_write が明文化されている
- approval class A/B/C/D が定義されている
- network は allowlisted 前提になっている

## Risks
- 抽象論だけで pass/fail 条件がない
- mutable / immutable boundary が曖昧
```

---

## 4. [P0][T004] forge v1 spec and schema

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:B`
- `risk:medium`

```markdown
## Goal
`.forge` v1 仕様と schema を定義する。

## Why now
parser / hash / validation / replay は schema が固定されないと作れないため。

## Scope
- `.forge` file grammar
- required top-level fields
- canonicalization rule
- integrity rule
- pack reference shape
- schema definition file

## Out of scope
- 完全な migrator 実装
- 実運用 pack compaction engine
- UI 可視化

## Dependencies
- T003

## Deliverables
- `docs/specs/forge-v1.md`
- `schemas/forge-v1.schema.json`

## Acceptance criteria
- 最低1件の valid fixture と invalid fixture で schema の有効性が見える
- revision / generation / canonical hash のルールが書かれている

## Risks
- JSON Schema と文書仕様がズレる
- YAML subset の制約が曖昧
```

---

## 5. [P0][T005] canonical parser and hash kernel

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:B`
- `risk:high`

```markdown
## Goal
`.forge` を厳密に読み取り、canonical hash を決定的に再現する kernel を実装する。

## Why now
ForgeRoot の自己同一性は `.forge` の決定的再現性に依存するため。

## Scope
- parser
- duplicate key detection
- NFC / LF normalization
- comment stripping for canonical hash
- fixed key order serialization
- hash calculation
- golden fixture tests

## Out of scope
- network / mutation / evaluator 本実装
- UI / dashboard
- GitHub App 統合

## Dependencies
- T004

## Deliverables
- `crates/forge-kernel/`
- conformance tests
- hash reproduction fixtures

## Acceptance criteria
- 同じ入力は常に同じ hash
- invalid `.forge` を正しく reject
- valid fixture が安定通過

## Risks
- YAML parser の挙動差で hash が揺れる
- signature 領域の扱いを誤る
```

---

## 6. [P0][T006] minimum GitHub App manifest and permissions

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:C`
- `risk:high`

```markdown
## Goal
ForgeRoot が必要とする最小権限の GitHub App manifest を定義する。

## Why now
制御面の権限が曖昧だと後から過剰権限が定着するため。

## Scope
- app manifest
- required permissions doc
- installation scope
- webhook event shortlist

## Out of scope
- server 実装
- token refresh 実装
- production rollout

## Dependencies
- T001

## Deliverables
- `apps/github-app/app-manifest.json`
- `docs/github-app-permissions.md`

## Acceptance criteria
- 何のためにどの権限が必要か説明されている
- Administration 権限に依存していない
- metadata / contents / pull_requests / issues / checks などの粒度が明確

## Risks
- 将来必要そうという理由だけで権限を盛る
- webhook event を最初から広げすぎる
```

---

## 7. [P0][T007] webhook ingest with signature verification

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:B`
- `risk:high`

```markdown
## Goal
署名検証付き webhook ingest server を実装する。

## Why now
GitHub App がイベントを受けても、検証と即時 ACK がなければ運用不能なため。

## Scope
- webhook endpoint
- HMAC verification
- event allowlist
- immediate ACK
- async handoff interface

## Out of scope
- full scheduler
- planner integration
- redelivery automation 完成版

## Dependencies
- T006

## Deliverables
- `apps/github-app/src/server.ts`
- `apps/github-app/src/webhooks.ts`

## Acceptance criteria
- 不正署名を reject
- 正常イベントを 2XX で即返す
- delivery ID を後続処理へ渡せる

## Risks
- 同期処理をやりすぎて webhook timeout
- event payload をそのまま信用する
```

---

## 8. [P0][T008] event inbox and idempotency

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:B`
- `risk:high`

```markdown
## Goal
webhook delivery の重複排除と event inbox を実装する。

## Why now
同じ delivery の再処理は PR spam や二重 mutation を引き起こすため。

## Scope
- event inbox table
- delivery GUID dedupe
- enqueue API
- status transition
- replay-ready persistence

## Out of scope
- full replay engine
- telemetry dashboard
- mutation scheduling

## Dependencies
- T007

## Deliverables
- runtime inbox implementation
- DB migration
- idempotency tests

## Acceptance criteria
- 同一 delivery の重複処理が発生しない
- イベント状態が追跡できる
- 失敗イベントが再試行対象として区別できる

## Risks
- dedupe key の設計不足
- in-memory のみで済ませて再起動時に破綻
```

---

## 9. [P0][T014] runtime mode and kill switch

**Suggested labels**
- `forge:auto`
- `phase:P0`
- `class:C`
- `risk:high`

```markdown
## Goal
runtime mode と kill switch を導入し、mutating lane を即停止可能にする。

## Why now
ForgeRoot は安全境界を先に持たないと、後で止められない自動化になるため。

## Scope
- runtime mode definition
- observe / propose / evolve / federate / quarantine / halted
- kill switch handler
- downgrade trigger design

## Out of scope
- full incident UI
- browser extension overlay
- federation logic

## Dependencies
- T003
- T007

## Deliverables
- `.forge/policies/runtime-mode.forge`
- kill-switch runtime code

## Acceptance criteria
- 1操作で mutating action を停止できる
- halted / quarantine の挙動差が明文化されている
- repeated 403/429 を mode downgrade に接続できる

## Risks
- stop はあるが restore の責任境界が曖昧
- observe / propose / evolve の差が実装されない
```

---

## 10. [P1][T015] issue intake classifier

**Suggested labels**
- `forge:auto`
- `phase:P1`
- `class:B`
- `risk:medium`

```markdown
## Goal
issue / alert / comment を鍛造対象へ分類する。

## Why now
何でも planner に流すとノイズでスコープ管理が壊れるため。

## Scope
- intake categories
- minimal classification logic
- task candidate normalization
- forge:auto label handling

## Out of scope
- full LLM planner
- PR creation
- network offer handling 完成版

## Dependencies
- T007
- T008
- T014

## Deliverables
- `packages/planner/src/intake.ts`

## Acceptance criteria
- 4分類以上で安定判定できる
- forge:auto のみ自動対象にできる
- block / ignore / escalate の区別がある

## Risks
- 何でも自動化対象にしてしまう
- docs issue と code mutation issue を分けられない
```

---

## 11. [P1][T016] one-task-one-PR plan spec DSL

**Suggested labels**
- `forge:auto`
- `phase:P1`
- `class:B`
- `risk:medium`

```markdown
## Goal
1 task = 1 PR を機械的に守る plan spec DSL を定義する。

## Why now
Planner の自由度が高すぎると scope explosion でレビュー不能になるため。

## Scope
- plan schema
- acceptance criteria schema
- scope contract
- mutable paths declaration
- risk / approval class link

## Out of scope
- executor runtime
- test runner adapter
- mutation generation

## Dependencies
- T004
- T015

## Deliverables
- `docs/specs/plan-spec.md`
- `packages/planner/src/plan-schema.ts`

## Acceptance criteria
- acceptance criteria が機械判定可能
- mutable paths と out-of-scope が明記される
- issue 1件から plan spec 1件へ落ちる

## Risks
- DSL が抽象的すぎて実装に落ちない
- 逆に細かすぎて Planner が使えない
```

---

## 12. [P1][T017] planner runtime

**Suggested labels**
- `forge:auto`
- `phase:P1`
- `class:B`
- `risk:high`

```markdown
## Goal
Planner agent が 1 issue から 1 reviewable plan spec を生成できるようにする。

## Why now
ForgeRoot の最初の鍛造ループは Planner なしでは始まらないため。

## Scope
- planner agent definition
- planner runtime
- context recipe
- bounded output contract

## Out of scope
- executor file editing
- audit report generation
- PR composer

## Dependencies
- T015
- T016

## Deliverables
- `.forge/agents/planner.alpha.forge`
- `packages/planner/src/run.ts`

## Acceptance criteria
- 1 issue → 1 plan spec
- out-of-scope が明記される
- approval class が出力される
- mutable paths が明記される

## Risks
- issue を丸ごと大規模計画に膨らませる
- acceptance criteria を曖昧にする
```

---

## 13. [P1][T028] end-to-end forged PR demo

**Suggested labels**
- `forge:auto`
- `phase:P1`
- `class:B`
- `risk:high`

```markdown
## Goal
Issue から forged PR までの最初の end-to-end デモを成立させる。

## Why now
個別部品が動いても、連結できなければ ForgeRoot の本質は証明されないため。

## Scope
- one issue intake
- planner
- executor
- audit
- PR compose
- approval checkpoint
- safe merge-ready result

## Out of scope
- self-evolution
- federation
- memory compaction

## Dependencies
- T015, T016, T017
- T018, T019, T023, T024, T025, T026, T027

## Deliverables
- E2E demo doc
- 1 forged PR example

## Acceptance criteria
- issue 1件から reviewable PR 1件が安全に生成される
- risk summary と acceptance criteria が PR に載る
- approval gate が働く

## Risks
- demo のために手作業を混ぜてしまう
- out-of-scope が collapse する
```

---

## 14. 推奨起票順

最初の起票順は固定する。

1. META bootstrap tracker
2. T001 repo skeleton
3. T003 constitution + mind.forge
4. T004 forge v1 spec
5. T005 canonical parser
6. T006 GitHub App manifest
7. T007 webhook ingest
8. T008 event inbox
9. T014 runtime mode + kill switch
10. T015 intake classifier
11. T016 plan spec DSL
12. T017 planner runtime
13. T028 e2e demo

---

## 15. 起票時の注意

- 1 issue に複数の大機能を入れない
- 依存関係が未確定なら先に dependency issue を作る
- class:C / D を軽く扱わない
- naming rules に反するタイトルを付けない
- 実装者が変わっても再現できる acceptance criteria を書く

**Issue の質が PR の質を決める。**  
ForgeRoot では、issue は雑なメモではなく、選択可能な変異の入口である。
