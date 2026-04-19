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

---

## 16. [P2][T041-2] T029-T039 canonical task source append for T042 dependency resolution

> Status: integrated by T041-2.  
> Purpose: T042 の `P2 memory / evaluator task definitions once canonicalized` 依存を解消する。  
> Boundary: この追補は T029-T039 の task source を canonical 化する。T029-T039 の runtime 実装、T041 security gates、T042 reporting 実装は含めない。

Task name: `T041-2`

This document integrates the missing T029-T039 task source needed before T042 can consume memory / eval / provenance artifacts. It does not implement the T029-T039 runtime modules.

## Boundary

- Adds canonical task source for T029-T039 only.
- Keeps every task as `1 issue = 1 bounded PR scope`.
- Does not call GitHub APIs.
- Does not mutate workflows, policies, rulesets, or branch protection.
- Does not write memory or evaluation state.
- Does not perform self-evolution or federation.

## [P2][T029] memory partition contract

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
Working Memory / Episodic Heads / Episodic Packs / Semantic Digests の責務境界を固定する。

### Why now
T042 が memory state を report する前に、memory の層・権威・更新責務を task source として固定する必要があるため。

### Scope
- memory layer 定義
- inline memory と pack memory の境界
- forget rule
- memory update approval class
- memory artifact schema

### Out of scope
- 実際の memory 書き込み
- pack 圧縮実装
- eval score 算出
- self-evolution

### Dependencies
- T004
- T028

### Deliverables
- `docs/specs/memory-model.md`
- `.forge/policies/memory.forge`
- `docs/specs/t029-validation-report.md`

### Acceptance criteria
- 4層 memory model が定義されている
- runtime DB が memory source of truth ではないことが明記される
- curated memory update は PR 経由である
- memory と eval の責務が分離されている

### Risks
- memory と eval の責務が混ざる
- runtime DB を source of truth として扱う

## [P2][T030] working memory writer

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
短期 working memory update manifest を deterministic に生成・検証する。

### Why now
T042 が working memory の状態を表示するとき、短期 memory update の形が未定義だと missing/unknown と実データを区別できないため。

### Scope
- working memory update schema
- max_items enforcement
- TTL metadata
- source task reference
- deterministic ordering

### Out of scope
- `.forge` への直接書き込み
- episodic digest
- semantic retrieval
- eval score update

### Dependencies
- T029

### Deliverables
- `packages/memory/src/working.ts`
- `packages/memory/tests/working.test.mjs`
- `docs/specs/t030-validation-report.md`

### Acceptance criteria
- max_items を超える update を reject できる
- source task / source artifact が必須
- 同じ input から同じ update manifest が出る
- GitHub API を呼ばない

### Risks
- source refs のない memory を書ける
- 短期 memory が無制限に肥大する

## [P2][T031] episodic digest generator

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
PR / audit / rejection / failure を episode digest として要約する manifest を作る。

### Why now
T042 で recent episode や rejected/blocked 結果を report するには、episode digest の source refs と reliability を先に定義する必要があるため。

### Scope
- episode digest schema
- accepted / rejected / blocked / quarantined event type
- source artifact hash
- reliability field
- digest length limit

### Out of scope
- pack compression
- semantic search
- fitness calculation
- mutation proposal

### Dependencies
- T029
- T030
- T023
- T028

### Deliverables
- `packages/memory/src/digest.ts`
- `packages/memory/tests/digest.test.mjs`
- `docs/specs/t031-validation-report.md`

### Acceptance criteria
- episode digest に source refs / task id / decision / reliability が含まれる
- rejected / blocked episode も保存対象になる
- digest は deterministic に生成される
- memory の捏造を防ぐため source artifact が必須

### Risks
- 失敗 episode が保存されず同じ失敗を繰り返す
- source artifact なしの digest で記憶汚染する

## [P2][T032] archive packer

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
episode / mutation / eval artifact を `.jsonl.zst` pack へ格納する deterministic packer を設計・実装する。

### Why now
T042 以降で source artifact hash を report に載せるには、pack manifest と hash の責務を先に canonical 化する必要があるため。

### Scope
- canonical JSONL record
- pack header
- raw hash / zstd hash
- deterministic record ordering
- pack verification

### Out of scope
- live memory compaction scheduler
- semantic retrieval
- external object storage
- federation lineage exchange

### Dependencies
- T005
- T031

### Deliverables
- `packages/memory/src/packer.ts`
- `packages/memory/tests/packer.test.mjs`
- `.forge/packs/README.md`
- `docs/specs/t032-validation-report.md`

### Acceptance criteria
- 同じ records から同じ pack manifest が生成される
- raw hash / compressed hash が検証可能
- invalid header / record_count mismatch を reject できる
- `.forge` inline size と pack の責務境界が明確

### Risks
- 非決定的な record ordering で hash が揺れる
- pack を external storage の権威として扱う

## [P2][T033] semantic retrieval adapter

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
episode / digest / semantic pattern を token budget 内で取得する retrieval adapter を作る。

### Why now
T042 の report source は memory context を表示できるが、retrieval が source refs と budget を保持しなければ推測補完になるため。

### Scope
- retrieval request schema
- relevance score
- token budget cap
- deterministic fallback
- source refs preservation

### Out of scope
- embedding provider integration
- vector DB as source of truth
- memory mutation
- self-evolution

### Dependencies
- T029
- T031
- T032

### Deliverables
- `packages/memory/src/retrieval.ts`
- `packages/memory/tests/retrieval.test.mjs`
- `docs/specs/t033-validation-report.md`

### Acceptance criteria
- retrieved item は source refs を保持する
- budget 超過時に deterministic trimming される
- missing memory を推測で補わない
- vector index は派生物として扱う

### Risks
- retrieval が source refs を落とす
- vector DB を `.forge` より上位の正本として扱う

## [P2][T034] eval suite DSL

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
ForgeRoot の benchmark / grader / score input を eval suite として定義する。

### Why now
T042 が fitness / trust / risk を report するとき、score の出所である eval suite と grader が未定義だと評価値を説明できないため。

### Scope
- eval suite schema
- task fixture schema
- grader definition
- risk class
- shadow_only flag

### Out of scope
- actual benchmark runner
- fitness calculation
- mutation selection
- live CI integration

### Dependencies
- T004
- T028

### Deliverables
- `.forge/evals/core.eval.forge`
- `docs/specs/eval-suite.md`
- `packages/eval/src/eval-suite.ts`
- `packages/eval/tests/eval-suite.test.mjs`
- `docs/specs/t034-validation-report.md`

### Acceptance criteria
- eval suite が schema validation 可能
- benchmark task と grader が分離されている
- risk class が明示される
- shadow_only を表現できる

### Risks
- grader と benchmark fixture が一体化して再利用不能になる
- eval が live CI integration と混ざる

## [P2][T035] benchmark fixture seeds

### Suggested labels
- `forge:auto`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
ForgeRoot の planner / auditor / security / memory 評価に使う初期 benchmark fixtures を作る。

### Why now
T037 fitness calculator と T042 report source は、score の根拠となる fixture set がなければ unknown と実測値を区別できないため。

### Scope
- docs-only task fixture
- tests-only task fixture
- invalid scope fixture
- security finding fixture
- rejection fixture

### Out of scope
- live benchmark execution
- model evaluation
- score calculation
- self-evolution

### Dependencies
- T034

### Deliverables
- `labs/benchmarks/README.md`
- `labs/benchmarks/fixtures/*.json`
- `docs/specs/t035-validation-report.md`

### Acceptance criteria
- 最低30件の fixture がある
- pass / fail / blocked / quarantined の代表例を含む
- fixture は deterministic に読める
- real GitHub API を呼ばない

### Risks
- fixture が成功例に偏る
- fixture generation が live repo mutation を伴う

## [P2][T036] merge outcome collector

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:medium`

### Goal
PR outcome を merge / reject / stale / revert / quarantined として収集する manifest を定義する。

### Why now
T037 と T042 が merge 結果を扱うには、outcome を推測ではなく source PR metadata に基づく manifest として定義する必要があるため。

### Scope
- merge outcome schema
- review outcome
- CI outcome
- revert linkage
- source PR metadata reference

### Out of scope
- GitHub API polling
- score calculation
- memory update write
- auto rollback

### Dependencies
- T024
- T026
- T031
- T034

### Deliverables
- `packages/eval/src/outcomes.ts`
- `packages/eval/tests/outcomes.test.mjs`
- `docs/specs/t036-validation-report.md`

### Acceptance criteria
- merged / rejected / reverted / quarantined を区別できる
- source PR / task / commit trailer refs を持つ
- missing outcome を推測しない
- GitHub API を呼ばない

### Risks
- missing outcome を成功または失敗として補完する
- outcome collection が GitHub polling 実装と混ざる

## [P2][T037] fitness calculator

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
fitness / trust / risk / stability / novelty を deterministic に算出する。

### Why now
T042 の report で score を出すか unknown とするかを決めるには、score schema と missing value handling が先に必要なため。

### Scope
- score input schema
- fitness formula
- trust formula
- risk formula
- score explanation
- missing value handling

### Out of scope
- score に基づく mutation execution
- self-evolution
- federation reputation
- UI dashboard

### Dependencies
- T034
- T035
- T036

### Deliverables
- `packages/eval/src/fitness.ts`
- `packages/eval/tests/fitness.test.mjs`
- `.forge/lineage/fitness.forge`
- `docs/specs/t037-validation-report.md`

### Acceptance criteria
- 同じ input から同じ score が出る
- missing value は unknown として扱い、勝手に補完しない
- risk は max-risk 原則を守る
- score explanation が reviewer に読める

### Risks
- missing value を推測して評価汚染する
- score を mutation execution と直結する

## [P2][T038] memory compaction engine

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
inline memory を pack 化し、`.forge` の肥大化を防ぐ compaction manifest を作る。

### Why now
T042 以降で memory health を表示するには、inline size と compaction candidate の判断基準を source refs 付きで定義する必要があるため。

### Scope
- compaction request schema
- inline size threshold
- keep_recent accepted/rejected policy
- pack reference update
- dry-run report

### Out of scope
- actual PR creation
- scheduler
- semantic deletion
- mutation generation

### Dependencies
- T030
- T031
- T032
- T033
- T037

### Deliverables
- `packages/memory/src/compact.ts`
- `packages/memory/tests/compact.test.mjs`
- `docs/specs/t038-validation-report.md`

### Acceptance criteria
- inline size 上限を超える場合に compaction candidate を出せる
- accepted / rejected の保持数ルールが守られる
- source refs を失わない
- destructive delete を直接行わない

### Risks
- compaction が destructive delete になる
- accepted/rejected の保持数ルールを破る

## [P2][T039] provenance/signature writer

### Suggested labels
- `forge:plan`
- `phase:P2`
- `class:B`
- `risk:high`

### Goal
PR composition / audit / pack / `.forge` artifact に provenance manifest と署名対象 hash を付与する。

### Why now
T042 report が source artifact hash / task id / approval class を表示するには、provenance manifest と署名対象 hash の形を先に定義する必要があるため。

### Scope
- provenance manifest schema
- source task / PR / commit / artifact refs
- canonical hash reference
- signature placeholder
- verification report

### Out of scope
- production key management
- live signing service
- GitHub attestation API
- release artifact attestation

### Dependencies
- T005
- T024
- T032

### Deliverables
- `packages/auditor/src/provenance.ts`
- `packages/auditor/tests/provenance.test.mjs`
- `docs/specs/provenance.md`
- `docs/specs/t039-validation-report.md`

### Acceptance criteria
- provenance に source refs / artifact hashes / runtime profile が含まれる
- signature field はあるが secret material を扱わない
- hash mismatch を検出できる
- GitHub API を呼ばない

### Risks
- signature placeholder が secret material を要求する
- hash mismatch を report から隠す
