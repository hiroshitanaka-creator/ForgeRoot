# Safety Boundaries(安全境界)

出典: `00_ForgeRoot_blueprint_設計書.md` §3(非ゴール)・§12(安全境界)、`.forge/policies/constitution.forge`、`README.md` Core laws。

## 恒久禁止(どのPhaseでも不可)

- default branch (main) への直接書き込み・force push
- PAT(個人アクセストークン)中心の運用を前提にすること
- workflow / permission / ruleset の無承認変更
- allowlist なしの peer federation(外部リポジトリとの自律連携)
- 高リスク変異の自己承認(self-approval)
- レビュー不能な自己改変
- secret / token の出力・保存・推測
- 失敗した検証を成功扱いすること・未実行テストを「passed」と書くこと

## 承認クラス(blueprint §12.2)

| Class | 対象 | ルール | Codexの動き |
|---|---|---|---|
| A | docs / tests / comments / 低リスクrefactor / 重複ファイル清掃 | 自動PR可、merge前の人間確認は任意 | draft PRまで自走してよい |
| B | 通常コード変更 / 内部prompt調整 / 新package追加 | PR必須、1人承認 | draft PRまで自走。マージ判断はユーザー |
| C | workflow / policy / treaty / spawn設定 / `.forge/policies/*` | PR必須、2段階またはcode owner承認 | **着手前に**User Decision Cardで明示承認を得る |
| D | branch protection / GitHub App権限 / open federation / workflow mutation | 常時手動、自己承認禁止 | 提案と手順書のみ。実行はユーザー |

判定に迷ったら**高い方のクラス**として扱う。

## class C/D と判定すべき変更パス(必ず該当)

- `.github/workflows/**`(新規追加も含む。CI導入はclass C)
- `.forge/policies/constitution.forge`(最高リスク)
- `.forge/mind.forge`
- `.forge/agents/*.forge` の identity / species / constitution_ref / evolution 節
- `.forge/network/**`(federation関連)
- `app-manifest.json` / `github-app-permissions.md`(App権限契約)
- branch protection / ruleset(リポジトリ設定。ファイルではなくGitHub設定画面)

## Phase gate(段階解禁)

- runtime mode は observe / propose / evolve / federate / quarantine / halted の6種(blueprint §12.3、`docs/ops/runtime-mode.md`)
- **Phase 2 完了前に evolve へ移行しない** — 現在はPhase 2進行中なので、live mutation・自己進化の実行系は書かない。manifest-only / dry-run の foundation までが許容範囲(T043〜T046のパターン)
- federation(Phase 4)は treaty schema と allowlist が揃うまで一切実装を進めない

## GitHub API 操作の境界(Codex向け)

許可(標準フローの範囲):
- read系すべて(PR一覧・diff・issue・CI状態の取得)
- feature branch への push
- draft PR の作成・本文更新
- ユーザーが明示依頼した issue / comment の作成

明示承認なしに禁止:
- PR の merge / approve / ready化 / close
- branch protection / ruleset / permission の変更
- main への push(恒久禁止)
- 他リポジトリへの一切の書き込み

## kill switch / halted

- ユーザーが「止めて」「halt」と言ったら、進行中の変更を即座に停止し、未pushの作業状態と安全状態を報告する。報告以外の操作をしない
- 再開はユーザーの明示指示でのみ行う
