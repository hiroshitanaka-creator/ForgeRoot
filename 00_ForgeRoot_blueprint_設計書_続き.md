# blueprint_second 設計案

## 推奨ファイル: `04_blueprint_second.md`

```markdown
# 04_blueprint_second

> Status: proposed second-level blueprint for ForgeRoot implementation continuity.  
> Scope: T029以降の task source 補完、T040以降の安全境界、T025衝突処理、Phase 2〜5 の実装導線を固定する。  
> This document does not replace `00_ForgeRoot_blueprint_設計書.md`.

---

## 0. 固定位置づけ

`04_blueprint_second.md` は、ForgeRoot v1 の第2設計図である。

ただし、これは最上位正本ではない。  
最上位原理、非ゴール、Source of Truth、承認クラス、Phase定義は `00_ForgeRoot_blueprint_設計書.md` が保持する。

この文書の役割は以下に限定する。

1. T029〜T039 の未定義 gap を埋める
2. T040〜T084 を実装可能な依存グラフへ接続する
3. T025番号衝突の扱いを明文化する
4. manifest-only chain から live transport / self-evolution / federation へ進む条件を定義する
5. Repo Map / Interface Registry / Issue Source に反映すべき差分を明示する

この文書は以下をしてはいけない。

- 4原理を変更する
- `.forge` を source of truth から外す
- default branch direct write を許可する
- workflow / permission / ruleset mutation を軽くする
- self-evolution や federation を Phase 2 以前に解禁する
- `EternalForge` など過去名称を復活させる

Chain of Verification:  
この文書は 00 blueprint の4原理を拡張せず、T029以降の実装導線だけを補完するため、ForgeRoot の核心原理と矛盾しない。
```

---

## 1. Source of Truth への追加提案

### 1.1 採用前

採用前の `blueprint_second` は会話由来の設計案であり、正本ではない。
この段階では、T040以降の実装に直接入ってはいけない。

### 1.2 採用後

`04_blueprint_second.md` を正本化する場合、`00_ForgeRoot_blueprint_設計書.md` の Source of Truth 節を次のように更新する。

```markdown
## Source of Truth priority after blueprint_second adoption

1. `00_ForgeRoot_blueprint_設計書.md`
2. `01_単語や命名規則.md`
3. `.forge/mind.forge`
4. `.forge/policies/*.forge`
5. `02_README.md`
6. `04_blueprint_second.md`
7. `03_issue.md`
8. 個別 PR / Issue / 会話ログ
```

理由:

* `04_blueprint_second.md` は `03_issue.md` の issue source を補完・制約する
* ただし `.forge/mind.forge` / `.forge/policies/*.forge` より上位には置かない
* 00 / 01 の基本原理・命名規則を上書きしない

### 1.3 `01_単語や命名規則.md` への追加

`01_単語や命名規則.md` の正本ドキュメント表に以下を追加する。

```markdown
| `04_blueprint_second.md` | T029以降の実装導線、task source gap、Phase 2〜5 の補助設計 |
```

Chain of Verification:
`04_blueprint_second.md` は 00 / 01 / `.forge` を上書きせず、03 issue を補助する位置に置くため、既存の正本階層を破壊しない。

````

---

## 2. T025番号衝突の処理

### 2.1 衝突内容

現在の衝突は以下。

```text
00 blueprint:
  T025 = check suite integration

T028 handoff / current repo:
  T025 = GitHub PR adapter
````

この衝突は、T040以降の依存解釈に影響する。
特に T040 SARIF bridge / T041 security gates は、本来 check / scan / security surface に近いため、T025 をどちらとして扱うかで依存グラフが変わる。

### 2.2 採用する修正案

`T025` は、既に実装済み chain に合わせて **GitHub PR adapter** として固定する。
理由:

* T025 実装済み artifact が存在する
* T026 approval checkpoint / T027 rate governor / T028 E2E demo が T025 GitHub PR adapter に依存して成立している
* T025 を再定義すると、T026〜T028 の意味が崩れる
* `01_単語や命名規則.md` は task ID 再利用を禁止している

### 2.3 check suite integration の扱い

`check suite integration` は T025 に戻さない。
次のどちらかにする。

* Phase 2以降の将来 task として新規IDを採番する
* T040 / T041 では live Checks API 連携をやらず、SARIF-like / gate decision manifest に限定する

この `blueprint_second` では後者を採用する。
つまり T040 / T041 は **GitHub Check API live integration ではない**。

### 2.4 Decision Log 反映案

```markdown
## D-XXXX: Fix T025 as GitHub PR adapter

### Decision
T025 は `GitHub PR adapter` として固定する。
`00_ForgeRoot_blueprint_設計書.md` 内の `T025 check suite integration` は旧表記として扱い、今後の実装依存には使わない。

### Reason
T025〜T028 の実装済み manifest chain が GitHub PR adapter を前提に成立しているため。

### Consequence
Check suite integration は T040/T041 では live integration しない。
将来必要なら新規 task ID で定義する。

### Affected files
- `00_ForgeRoot_blueprint_設計書.md`
- `04_blueprint_second.md`
- `03_issue.md`
- `docs/ops/thread-handoff-after-t025.md`
- `docs/ops/thread-handoff-after-t028.md`
```

Chain of Verification:
T025を既存実装に合わせて固定し、旧 `check suite integration` を再利用しないため、task ID再利用禁止と実装済み chain の両方を守る。

````

---

## 3. T029〜T039 canonical task source 補完

以下は `03_issue.md` に追記するための補完 source である。  
T040以降を安全に実装するには、このブロックを先に canonical 化する。

### T029 — memory partition contract

```markdown
## [P2][T029] memory partition contract

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:medium

### Goal
Working Memory / Episodic Heads / Episodic Packs / Semantic Digests の責務境界を固定する。

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
- T004 forge v1 spec
- T028 E2E manifest chain

### Deliverables
- `docs/specs/memory-model.md`
- `.forge/policies/memory.forge`
- `docs/specs/t029-validation-report.md`

### Acceptance criteria
- 4層 memory model が定義されている
- runtime DB が memory source of truth ではないことが明記される
- curated memory update は PR 経由である
- memory と eval の責務が分離されている
````

### T030 — working memory writer

```markdown
## [P2][T030] working memory writer

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:medium

### Goal
短期 working memory update manifest を deterministic に生成・検証する。

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
- T029 memory partition contract

### Deliverables
- `packages/memory/src/working.ts`
- `packages/memory/tests/working.test.mjs`
- `docs/specs/t030-validation-report.md`

### Acceptance criteria
- max_items を超える update を reject できる
- source task / source artifact が必須
- 同じ input から同じ update manifest が出る
- GitHub API を呼ばない
```

### T031 — episodic digest generator

```markdown
## [P2][T031] episodic digest generator

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:medium

### Goal
PR / audit / rejection / failure を episode digest として要約する manifest を作る。

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
- T029 memory partition contract
- T030 working memory writer
- T023 auditor runtime
- T028 E2E manifest chain

### Deliverables
- `packages/memory/src/digest.ts`
- `packages/memory/tests/digest.test.mjs`
- `docs/specs/t031-validation-report.md`

### Acceptance criteria
- episode digest に source refs / task id / decision / reliability が含まれる
- rejected / blocked episode も保存対象になる
- digest は deterministic に生成される
- memory の捏造を防ぐため source artifact が必須
```

### T032 — archive packer

```markdown
## [P2][T032] archive packer

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:high

### Goal
episode / mutation / eval artifact を `.jsonl.zst` pack へ格納する deterministic packer を設計・実装する。

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
- T005 canonical parser/hash kernel
- T031 episodic digest generator

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
```

### T033 — semantic retrieval adapter

```markdown
## [P2][T033] semantic retrieval adapter

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:medium

### Goal
episode / digest / semantic pattern を token budget 内で取得する retrieval adapter を作る。

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
- T029 memory partition contract
- T031 episodic digest generator
- T032 archive packer

### Deliverables
- `packages/memory/src/retrieval.ts`
- `packages/memory/tests/retrieval.test.mjs`
- `docs/specs/t033-validation-report.md`

### Acceptance criteria
- retrieved item は source refs を保持する
- budget 超過時に deterministic trimming される
- missing memory を推測で補わない
- vector index は派生物として扱う
```

### T034 — eval suite DSL

```markdown
## [P2][T034] eval suite DSL

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:medium

### Goal
ForgeRoot の benchmark / grader / score input を eval suite として定義する。

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
- T004 forge v1 spec
- T028 E2E manifest chain

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
```

### T035 — benchmark fixture seeds

```markdown
## [P2][T035] benchmark fixture seeds

### Suggested labels
- forge:auto
- phase:P2
- class:B
- risk:medium

### Goal
ForgeRoot の planner / auditor / security / memory 評価に使う初期 benchmark fixtures を作る。

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
- T034 eval suite DSL

### Deliverables
- `labs/benchmarks/README.md`
- `labs/benchmarks/fixtures/*.json`
- `docs/specs/t035-validation-report.md`

### Acceptance criteria
- 最低30件の fixture がある
- pass / fail / blocked / quarantined の代表例を含む
- fixture は deterministic に読める
- real GitHub API を呼ばない
```

### T036 — merge outcome collector

```markdown
## [P2][T036] merge outcome collector

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:medium

### Goal
PR outcome を merge / reject / stale / revert / quarantined として収集する manifest を定義する。

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
- T024 PR composer
- T026 approval checkpoint
- T031 episodic digest generator
- T034 eval suite DSL

### Deliverables
- `packages/eval/src/outcomes.ts`
- `packages/eval/tests/outcomes.test.mjs`
- `docs/specs/t036-validation-report.md`

### Acceptance criteria
- merged / rejected / reverted / quarantined を区別できる
- source PR / task / commit trailer refs を持つ
- missing outcome を推測しない
- GitHub API を呼ばない
```

### T037 — fitness calculator

```markdown
## [P2][T037] fitness calculator

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:high

### Goal
fitness / trust / risk / stability / novelty を deterministic に算出する。

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
- T034 eval suite DSL
- T035 benchmark fixture seeds
- T036 merge outcome collector

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
```

### T038 — memory compaction engine

```markdown
## [P2][T038] memory compaction engine

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:high

### Goal
inline memory を pack 化し、`.forge` の肥大化を防ぐ compaction manifest を作る。

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
- T030 working memory writer
- T031 episodic digest generator
- T032 archive packer
- T033 semantic retrieval adapter
- T037 fitness calculator

### Deliverables
- `packages/memory/src/compact.ts`
- `packages/memory/tests/compact.test.mjs`
- `docs/specs/t038-validation-report.md`

### Acceptance criteria
- inline size 上限を超える場合に compaction candidate を出せる
- accepted / rejected の保持数ルールが守られる
- source refs を失わない
- destructive delete を直接行わない
```

### T039 — provenance/signature writer

```markdown
## [P2][T039] provenance/signature writer

### Suggested labels
- forge:plan
- phase:P2
- class:B
- risk:high

### Goal
PR composition / audit / pack / `.forge` artifact に provenance manifest と署名対象 hash を付与する。

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
- T005 canonical parser/hash kernel
- T024 PR composer
- T032 archive packer

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
```

Chain of Verification:
T029〜T039 は Phase 2 の memory / eval / provenance の最小依存を埋めるだけであり、self-evolution や federation を解禁しないため、段階的ロードマップと矛盾しない。

````

---

## 4. T040〜T084 追補ルール

前回定義した T040〜T084 は、以下の共通ルールを追加して初めて implementation-ready とする。

### 4.1 `forge:auto` 付与ルール

`forge:auto` を付けてよいのは、次を満たす task のみ。

```text
- deterministic manifest / docs / fixture / validator 中心
- GitHub API write を呼ばない
- workflow / permission / ruleset を変更しない
- self-evolution を実行しない
- federation transport を実行しない
- secrets を扱わない
````

原則:

```text
P2:
  T040 = forge:auto 可
  T041 = forge:plan 推奨
  T042 = forge:auto 可

P3:
  原則 forge:plan
  self-evolution demo は class:C / risk:critical

P4:
  原則 forge:plan
  federation は allowlisted / lab-only

P5:
  docs/autogen / governance docs は forge:auto 可
  workflow / release / attestation / self-hosting は forge:plan または手動
```

### 4.2 live GitHub mutation 禁止ライン

T040〜T084 のうち、明示的に許可されない限り、以下は禁止。

```text
- GitHub API write
- PR create live call
- merge / approve / review submission
- workflow dispatch
- code scanning upload
- fork creation
- ruleset mutation
- branch protection mutation
- App permission mutation
```

T040 / T041 は特に誤解されやすい。
T040 は SARIF-like artifact bridge であり、Code Scanning upload ではない。
T041 は security gate decision manifest であり、branch protection / ruleset 設定ではない。

### 4.3 class:C/D 起票ルール

class:C / class:D の issue は、最低でも次を含める。

```text
- human approval requirement
- rollback / quarantine plan
- affected source-of-truth files
- forbidden actions
- validation mode
- why lower class is insufficient
```

### 4.4 blocked 扱い

依存 task が canonical 化されていない場合は、issue に以下を付ける。

```text
- status:blocked
```

例:

```text
T042 depends on T037/T040/T041.
T045 depends on T034/T037/T041/T043/T044.
T053 depends on T037/T048/T052.
T061 depends on T032/T053/T057/T058.
T076 depends on T005/T008/T039/T071.
```

Chain of Verification:
T040以降の issue を manifest-first / blocked-aware に制限するため、安全境界を越えた実装先行を防ぐ。

````

---

## 5. Phase 2〜5 dependency DAG

```mermaid
flowchart TB
  T028[T028 E2E forged PR demo]

  T028 --> T029[T029 memory partition]
  T029 --> T030[T030 working memory writer]
  T030 --> T031[T031 episodic digest]
  T031 --> T032[T032 archive packer]
  T032 --> T033[T033 semantic retrieval]
  T033 --> T038[T038 memory compaction]
  T031 --> T038

  T028 --> T034[T034 eval suite DSL]
  T034 --> T035[T035 benchmark fixtures]
  T035 --> T036[T036 merge outcome collector]
  T036 --> T037[T037 fitness calculator]

  T005[T005 forge kernel] --> T032
  T005 --> T039[T039 provenance writer]
  T024[T024 PR composer] --> T039

  T023[T023 auditor runtime] --> T040[T040 SARIF bridge]
  T028 --> T040
  T040 --> T041[T041 security gates]
  T026[T026 approval checkpoint] --> T041
  T027[T027 rate governor] --> T041

  T033 --> T042[T042 report/dashboard source]
  T037 --> T042
  T041 --> T042

  T037 --> T043[T043 mutation taxonomy]
  T041 --> T043
  T043 --> T044[T044 mutation budget]
  T044 --> T045[T045 shadow-run harness]
  T034 --> T045
  T037 --> T045
  T045 --> T046[T046 prompt patcher]
  T045 --> T047[T047 tool-routing mutator]
  T046 --> T048[T048 speciation]
  T047 --> T048
  T041 --> T049[T049 n-version audit]
  T049 --> T050[T050 EvolutionGuard]
  T043 --> T050
  T044 --> T050
  T050 --> T051[T051 mutation PR generator]
  T051 --> T052[T052 rollback engine]
  T048 --> T053[T053 lineage thresholds]
  T052 --> T053
  T044 --> T054[T054 evolution scheduler]
  T053 --> T054
  T051 --> T055[T055 evolution report]
  T052 --> T055
  T043 --> T056[T056 self-evolution demo]
  T055 --> T056

  T056 --> T057[T057 treaty schema]
  T057 --> T058[T058 peer registry]
  T058 --> T059[T059 remote discovery]
  T059 --> T060[T060 fork manager]
  T032 --> T061[T061 lineage pack]
  T053 --> T061
  T057 --> T061
  T058 --> T061
  T061 --> T062[T062 cross-repo PR composer]
  T057 --> T062
  T058 --> T062
  T062 --> T063[T063 peer reputation]
  T063 --> T064[T064 gossip cadence]
  T045 --> T065[T065 conflict arena]
  T053 --> T065
  T063 --> T065
  T065 --> T066[T066 symbiosis demo]
  T057 --> T067[T067 network boundary]
  T063 --> T067
  T067 --> T068[T068 federation observability]
  T057 --> T069[T069 three-repo testnet]
  T068 --> T069
  T069 --> T070[T070 distributed evolution demo]

  T070 --> T071[T071 self-host bootstrap]
  T071 --> T072[T072 compatibility generation]
  T071 --> T073[T073 recursive maintainer workflow]
  T042 --> T074[T074 browser extension approval UI]
  T071 --> T075[T075 forge doctor]
  T039 --> T076[T076 disaster recovery/replay]
  T071 --> T076
  T027 --> T077[T077 cost budgets]
  T071 --> T078[T078 release pipeline]
  T078 --> T079[T079 artifact attestation]
  T071 --> T080[T080 docs/autogen diagrams]
  T047 --> T081[T081 MCP/plugin registry]
  T071 --> T082[T082 governance RFC]
  T076 --> T083[T083 chaos suite]
  T077 --> T083
  T071 --> T084[T084 v1 hardening checklist]
  T083 --> T084
````

Chain of Verification:
このDAGは memory/eval/provenance → SARIF/security → self-evolution → federation → self-hosting の順を強制し、Phase順序を崩さない。

```

---

## 6. Interface Registry 追補

`03_INTERFACE_REGISTRY.md` が存在する場合、以下を追加する。  
存在しない場合は、この節を `04_blueprint_second.md` に保持し、Interface Registry 作成時に移す。

### 6.1 `packages/memory`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `createWorkingMemoryUpdate(input)` | T030 | task refs / facts | working memory update manifest | `.forge` 直接書き込み |
| `validateWorkingMemoryUpdate(update)` | T030 | update manifest | validation result | 推測補完 |
| `createEpisodeDigest(input)` | T031 | PR/audit/outcome refs | episode digest | source refs なし digest |
| `packMemoryRecords(input)` | T032 | canonical records | pack manifest | nondeterministic ordering |
| `retrieveMemoryContext(input)` | T033 | query + budget | bounded context refs | vector DB を正本化 |
| `createMemoryCompactionPlan(input)` | T038 | inline memory state | compaction proposal | destructive delete |

### 6.2 `packages/eval`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `validateEvalSuite(input)` | T034 | eval suite | validation result | benchmark実行 |
| `loadBenchmarkFixtures(input)` | T035 | fixture path | fixture set | live repo mutation |
| `collectMergeOutcome(input)` | T036 | PR metadata refs | outcome manifest | outcome 推測 |
| `calculateFitness(input)` | T037 | outcome/eval inputs | score manifest | score 改ざん |
| `compareArenaCandidates(input)` | T065 | candidate set | arena decision | reputation単独判定 |

### 6.3 `packages/auditor`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `convertAuditFindingsToSarif(input)` | T040 | audit findings | SARIF-like artifact | GitHub upload |
| `evaluateSecurityGate(input)` | T041 | SARIF-like artifact + policy | gate decision | ruleset mutation |
| `createProvenanceManifest(input)` | T039 | artifact refs | provenance manifest | secret signing key扱い |
| `routeNVersionAudit(input)` | T049 | audit request | verifier routing | self-approval |

### 6.4 `packages/mutate`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `validateMutationClass(input)` | T043 | mutation candidate | taxonomy result | unknown class pass |
| `applyPromptPatchDryRun(input)` | T046 | prompt patch | dry-run diff | policy patch |
| `applyToolRoutingPatchDryRun(input)` | T047 | tool patch | dry-run diff | permission expansion without escalation |
| `createSpeciationProposal(input)` | T048 | parent/child data | lineage proposal | silent replacement |
| `composeMutationPr(input)` | T051 | guarded candidate | PR composition manifest | live PR create |

### 6.5 `packages/guard`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `evaluateEvolutionGuard(input)` | T050 | mutation proposal | guard decision | Guard自己無効化 |
| `createRollbackPlan(input)` | T052 | accepted mutation refs | rollback proposal | direct revert |

### 6.6 `packages/network`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `validateTreaty(input)` | T057 | treaty file | validation result | open federation default |
| `resolvePeer(input)` | T058 | peer id | peer registry entry | unknown peer active |
| `scanPeerCompatibility(input)` | T059 | peer metadata | discovery result | unauthorized crawling |
| `createForkExperimentPlan(input)` | T060 | treaty/peer/scope | fork plan | live fork |
| `exportLineagePack(input)` | T061 | lineage refs | pack manifest | treaty外 export |
| `composeCrossRepoPr(input)` | T062 | peer proposal | PR composition manifest | live PR create |
| `evaluatePeerReputation(input)` | T063 | peer outcomes | reputation score | automatic adoption |
| `scheduleGossipSync(input)` | T064 | peer registry | sync plan | rate limit bypass |
| `enforceNetworkBoundary(input)` | T067 | peer action | boundary decision | treaty bypass |

### 6.7 `packages/reporting`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `renderSecurityReport(input)` | T042 | gate result | Markdown/JSON report | missing score補完 |
| `renderEvolutionReport(input)` | T055 | mutation eval | Markdown/JSON report | optimistic-only report |
| `renderFederationReport(input)` | T068 | peer state | Markdown/JSON report | treaty代替 |

### 6.8 `packages/runtime` / `packages/replay`

| API | 初出Task | 入力 | 出力 | 禁止事項 |
|---|---:|---|---|---|
| `scheduleEvolution(input)` | T054 | runtime/budget/state | schedule decision | cooldown無視 |
| `evaluateCostBudget(input)` | T077 | token/API/PR usage | budget decision | budget自己増額 |
| `replayForgeState(input)` | T076 | Git/events/.forge refs | recovery report | destructive overwrite |

Chain of Verification:  
Interface Registry は既存 package の責務分離を維持し、新規 package の境界を先に固定するため、重複概念と依存方向の崩壊を防ぐ。
```

---

## 7. Repo Map 追補

`02_REPO_MAP.md` が存在する場合、以下を追加する。
存在しない場合は、`04_blueprint_second.md` に仮保持する。

```text
packages/
  memory/
    src/working.ts          # T030
    src/digest.ts           # T031
    src/packer.ts           # T032
    src/retrieval.ts        # T033
    src/compact.ts          # T038

  eval/
    src/eval-suite.ts       # T034
    src/outcomes.ts         # T036
    src/fitness.ts          # T037
    src/shadow-run.ts       # T045
    src/speciation-thresholds.ts # T053
    src/peer-reputation.ts  # T063
    src/arena.ts            # T065

  auditor/
    src/provenance.ts       # T039
    src/sarif.ts            # T040
    src/security-gates.ts   # T041
    src/nversion.ts         # T049

  reporting/
    src/security-report.ts  # T042
    src/fitness-report.ts   # T042
    src/evolution-report.ts # T055
    src/federation-report.ts # T068

  mutate/
    src/prompt-patch.ts     # T046
    src/tool-routing.ts     # T047
    src/speciation.ts       # T048
    src/pr.ts               # T051

  guard/
    src/run.ts              # T050
    src/rollback.ts         # T052

  network/
    src/registry.ts         # T058
    src/discovery.ts        # T059
    src/fork.ts             # T060
    src/lineage-pack.ts     # T061
    src/cross-pr.ts         # T062
    src/gossip.ts           # T064
    src/boundary.ts         # T067

  runtime/
    src/evolve-schedule.ts  # T054
    src/costs.ts            # T077

  replay/
    src/replay.ts           # T076

apps/
  cli/
    src/commands/doctor.ts  # T075

  browser-extension/
    src/panels/approval.tsx # T074
    src/panels/risk.tsx    # T074

labs/
  benchmarks/               # T035
  arena/                    # T065
  forge-net/                # T066-T070
  chaos/                    # T083
```

配置原則:

* `packages/auditor` は security artifact / provenance / audit routing を扱う
* `packages/eval` は score / benchmark / arena を扱う
* `packages/memory` は curated memory / pack / retrieval を扱う
* `packages/mutate` は mutation candidate の表現と PR composition まで
* `packages/guard` は mutation の許可・停止・rollback
* `packages/network` は treaty / peer / lineage exchange の manifest 境界
* `packages/reporting` は派生 report だけを扱い、source of truth にならない
* `packages/runtime` は scheduling / budget / mode decision
* `packages/replay` は derived runtime state の再構築

Chain of Verification:
新規配置は既存の Planner / Executor / Auditor / PR Composer / Adapter / Approval / RateGovernor の責務を侵食せず、Phaseごとに増える責務を分離している。

````

---

## 8. manifest-only から live operation への昇格条件

### 8.1 現在の状態

T028時点では、ForgeRoot は以下を実行しない。

```text
- GitHub API 呼び出し
- real PR creation
- command execution
- file edit
- merge / approve
- memory/eval update
- federation
- self-evolution
````

これは README と handoff 上の current implementation status と一致する。

### 8.2 live operation 解禁条件

live operation を許可するには、最低でも次が必要。

```text
1. T040 SARIF bridge 完了
2. T041 security gates 完了
3. T039 provenance 完了
4. T077 cost budget 完了、または同等の予算境界
5. runtime mode が `propose` 以上
6. default branch protection / required checks / human approval が確認済み
7. `forge doctor` 相当の診断が green
8. その task の issue に live operation が明記されている
```

### 8.3 明示的な禁止

以下は、`blueprint_second` 採用後も明示 task なしには禁止。

```text
- auto-merge
- workflow mutation
- GitHub App permission mutation
- branch protection mutation
- open federation
- production self-evolution
- high-risk mutation self-approval
```

Chain of Verification:
live operation の解禁条件を Phase 2 safety floor 後に置くため、T028 manifest-only 境界と安全原則を破壊しない。

````

---

## 9. `03_issue.md` への反映方針

`03_issue.md` は issue 起票 source であり、`blueprint_second` の内容をそのまま長大に重複させるべきではない。

反映方法は次の2段階にする。

### 9.1 追記すべきもの

`03_issue.md` に追記するもの:

```text
- T029〜T039 の issue body
- T040〜T084 の issue body
- T025 conflict note
- class:C/D 起票注意
- blocked dependency rule
````

### 9.2 追記しないもの

`03_issue.md` に追記しないもの:

```text
- full dependency DAG
- Interface Registry table
- Repo Map table
- Source of Truth order proposal
- Decision Log draft
```

これらは `04_blueprint_second.md` または専用正本に置く。

Chain of Verification:
03 issue は起票sourceに限定し、設計理由や依存全体図は blueprint_second に置くため、issue source が巨大化して責務混在することを防ぐ。

````

---

## 10. 採用時に必要な差分

### 10.1 `00_ForgeRoot_blueprint_設計書.md`

必要差分:

```diff
 Source of Truth:
 1. 00_ForgeRoot_blueprint_設計書.md
 2. 01_単語や命名規則.md
 3. .forge/mind.forge
 4. .forge/policies/*.forge
 5. 02_README.md
+6. 04_blueprint_second.md
-6. 03_issue.md
+7. 03_issue.md
-7. 個別 PR / Issue / 会話ログ
+8. 個別 PR / Issue / 会話ログ
````

T025箇所:

```diff
- T025 check suite integration
+ T025 GitHub PR adapter
+ Note: check suite integration is not T025. If needed, define it under a new task ID.
```

### 10.2 `01_単語や命名規則.md`

必要差分:

```diff
 | `03_issue.md` | 初期 issue 起票用ドラフト |
+| `04_blueprint_second.md` | T029以降の実装導線と task source gap 補完 |
```

### 10.3 `03_issue.md`

必要差分:

```text
- section 16: T025 conflict note
- section 17: T029-T039 canonical issue source
- section 18: T040-T084 canonical issue source
- section 19: class:C/D blocked rule
```

### 10.4 `01_DECISION_LOG.md`

必要 decision:

```text
D-XXXX: Introduce blueprint_second as subordinate implementation supplement
D-XXXX: Fix T025 as GitHub PR adapter and do not reuse T025
D-XXXX: Add T029-T039 canonical task source before implementing T040-dependent tasks
D-XXXX: Keep T040/T041 manifest-only; no live Code Scanning upload or ruleset mutation
```

### 10.5 `02_REPO_MAP.md`

必要差分:

```text
Add packages/memory
Add packages/eval
Add packages/mutate
Add packages/guard
Add packages/network
Add packages/reporting
Add packages/runtime
Add packages/replay
Add apps/cli command slot
Add apps/browser-extension slot
Add labs/benchmarks, labs/arena, labs/forge-net, labs/chaos
```

### 10.6 `03_INTERFACE_REGISTRY.md`

必要差分:

```text
Register APIs listed in blueprint_second section 6.
Mark all new APIs as manifest-only unless explicitly promoted.
```

Chain of Verification:
採用時に必要な派生ファイル差分を同時に提示しているため、設計変更の既成事実化を避けられる。

````

---

## 11. blueprint_second 自体の完了条件

`04_blueprint_second.md` を採用する条件は以下。

```text
- 00 blueprint の4原理を変更していない
- 01 naming rules と衝突していない
- T025 conflict を明示している
- T029〜T039 を補完している
- T040〜T084 の blocked / class / manifest-only rule を明示している
- Repo Map 影響範囲を示している
- Interface Registry 影響範囲を示している
- Decision Log に必要な決定を列挙している
- 03_issue.md に反映すべき差分を示している
````

Chain of Verification:
完了条件が source-of-truth / issue / repo map / interface registry への反映を要求しているため、blueprint_second が孤立文書になることを防ぐ。

```

---

## 3. 影響を受けるファイル / モジュール / ディレクトリ

### 直接影響

- `04_blueprint_second.md`  
  新規追加候補。T029以降の補助正本。
- `00_ForgeRoot_blueprint_設計書.md`  
  Source of Truth 順位と T025表記の修正が必要。
- `01_単語や命名規則.md`  
  `04_blueprint_second.md` を正本ドキュメント一覧へ追加する必要。
- `03_issue.md`  
  T029〜T039 と T040〜T084 の issue source 追記が必要。
- `01_DECISION_LOG.md`  
  未提供だが、T025衝突・blueprint_second採用・T040/T041 manifest-only境界の決定記録が必要。
- `02_REPO_MAP.md`  
  未提供だが、新規 package / apps / labs の配置追記が必要。
- `03_INTERFACE_REGISTRY.md`  
  未提供だが、T029以降のAPI境界登録が必要。

### 後続実装で影響を受ける可能性がある package

- `packages/memory`
- `packages/eval`
- `packages/auditor`
- `packages/reporting`
- `packages/mutate`
- `packages/guard`
- `packages/network`
- `packages/runtime`
- `packages/replay`
- `apps/cli`
- `apps/browser-extension`
- `labs/benchmarks`
- `labs/arena`
- `labs/forge-net`
- `labs/chaos`

### 既存との差分

現在の T028 repo surface には Phase 1 chain の package は存在しますが、Phase 2以降の package 群はまだ存在しません。したがって `blueprint_second` は、**実装ではなく配置・依存・API境界の先行定義**です。

---

## 4. 実行順序

1. `01_DECISION_LOG.md` 相当へ、T025衝突と解決方針を記録する。
2. `04_blueprint_second.md` を追加する。
3. `01_単語や命名規則.md` に `04_blueprint_second.md` を登録する。
4. `00_ForgeRoot_blueprint_設計書.md` の Source of Truth 順位と T025表記を更新する。
5. `03_issue.md` に T029〜T039 を追記する。
6. 前回出力した T040〜T084 を `03_issue.md` に追記する。
7. `02_REPO_MAP.md` が存在する場合は、新規 package / apps / labs を追加する。
8. `03_INTERFACE_REGISTRY.md` が存在する場合は、新規API境界を追加する。
9. その後に初めて T040 実装へ進む。
10. T042以降は T029〜T039 の該当依存が canonical 化されるまで `status:blocked` にする。

---

## 5. 未解決事項

1. **`01_DECISION_LOG.md`, `02_REPO_MAP.md`, `03_INTERFACE_REGISTRY.md` が未提供**  
   プロジェクト指示ではこれらが高位正本に含まれるため、存在するなら必ず確認が必要です。現時点では未提供のため、今回の差分は「反映案」として提示しています。

2. **`04_blueprint_second.md` の正本化はまだ未完了**  
   この回答だけでは正本化されません。正本化には 00 / 01 / 03 / decision log / repo map / interface registry の更新が必要です。

3. **T025衝突は設計上の未解決事項から決定事項へ移す必要がある**  
   実装済み T025 を優先する方針は合理的ですが、decision log 化しなければ後続スレッドで再衝突します。

4. **T040 はまだ実装対象ではない**  
   `blueprint_second` と `03_issue.md` への反映が終わるまで、T040実装に入ると依存正本が未確定です。

5. **Rust kernel validation caveat**  
   handoff では Rust toolchain の実行確認に caveat が残っています。T032 / T039 / T076 へ進む前に、Rust環境で `cargo test` を通す必要があります。

---

## 6. プロジェクト保存用メモ

`blueprint_second` は、`00_ForgeRoot_blueprint_設計書.md` を置き換えるものではなく、T029以降の実装導線を補完する第2設計図として扱う。推奨ファイル名は `04_blueprint_second.md`。採用するには `01_単語や命名規則.md` への登録、`00_ForgeRoot_blueprint_設計書.md` の Source of Truth 順位更新、`03_issue.md` への T029〜T084 issue source 追記、`01_DECISION_LOG.md` への T025衝突解決記録、`02_REPO_MAP.md` / `03_INTERFACE_REGISTRY.md` への package/API 境界追加が必要。T025 は既存実装に合わせて `GitHub PR adapter` として固定し、旧 `check suite integration` 表記は再利用しない。T040/T041 は live GitHub Code Scanning や ruleset mutation ではなく、SARIF-like artifact / security gate decision manifest に限定する。T040以降を実装する前に、T029〜T039 の memory/eval/provenance source を canonical 化する。
```
