# AGENTS.md

このリポジトリで作業するエージェント向けの実務ルールです。推測でコマンドを増やさず、作業前に必ず該当する `package.json` / `Cargo.toml` / README / workflow を確認してください。

## リポジトリ構成

- `.forge/`: ForgeRoot の durable genome / memory surface。`mind.forge` と policy/eval/lineage/network/pack 類を置く。
- `packages/*`: npm workspace の主要実装。root `package.json` の `workspaces` はここだけを指す。
- `crates/forge-kernel`: Rust workspace の `.forge` v1 parser/hash kernel。
- `apps/`: GitHub App、CLI、browser extension などのアプリ領域。
- `docs/`: specs、RFC、ops handoff、検証記録。
- `schemas/`: `.forge` などのスキーマ。
- `.github/workflows/test.yml`: PR/push で `npm test` と `cargo test --workspace --locked` を実行するCI。
- ルート直下の `README (N).md`、`index (N).ts`、`run (N).js`、`ForgeRoot_T0XX_*.diff`、`*_validation_output.txt` などは履歴・アップロード由来の成果物が混在している。現在の実装判断では、原則として `README.md`、`TASK_PROGRESS.md`、`docs/ops/*`、`packages/*`、`crates/*`、`.forge/*` を優先する。

## セットアップ

- Node.js は `packages/*` の `engines` に合わせて 22.5 以上を使う。root `package.json` は 20 以上だが、個別パッケージの方が厳しい。
- npm workspace 依存を入れる場合は root で `npm install` を使う。lockfile は現時点で確認できないため、`package-lock.json` が生成されたら変更に含めるべきか確認する。
- Rust 側は root `Cargo.toml` の workspace に `crates/forge-kernel` が登録されている。CI は `Cargo.lock` を使って `cargo test --workspace --locked` を実行する。

## テスト

- 全 npm workspace: `npm test`
- 全 Rust workspace: `cargo test --workspace --locked`
- 個別 npm package: `npm --prefix packages/<name> test`
- GitHub CI と同じ最低限の確認は、`npm test` と `cargo test --workspace --locked`。
- docs-only の変更でも、少なくとも `git diff --check` で不要な空白やパッチ崩れを確認する。

## lint / 型チェック

- 専用の `lint` script は root/package-level `package.json` では確認できない。lint 済みと報告しない。
- TypeScript の型チェックは各 package の `build` script に含まれる `tsc -p tsconfig.json`、または `node scripts/build.mjs` 経由で行う。全 npm workspace は `npm run build`。
- Rust 専用の型チェックコマンドはCIに定義されていない。Rust 側の確認は `cargo test --workspace --locked` を基準にする。

## PR作成前の品質ゲート(必須)

- コード変更(`packages/*`、`crates/*`、`.forge/*`)を含むPRは、push前に `.claude/skills/forgeroot-pr-quality-gate/SKILL.md` の品質ゲート(G0〜G5)を通す。どのエージェント(Claude / Codex / その他)も対象。
- 過去PRのレビュー指摘は約10クラスの既知パターンに分類済み(`references/codex-finding-taxonomy.md`)。特に validator を書くときは「createとvalidateの単一検証コア」「enum のallowlist検証」「tamper-harness テスト」を必ず適用する(`references/design-rules.md`)。
- ゲートの実行結果は `templates/gate-report-template.md` の形式でPR本文に添付する。docs-only の変更は機械検査(G4)のみでよい。

## PR作成ルール

- default branch へ直接書き込まない。すべて branch からPRにする。
- 1 task = 1 PR。途中でスコープを増やさない。
- branch 名は原則 `codex/<task-id>-<short-topic>`。
- PR は原則 draft で作成し、ready 化・merge・approve はユーザー判断に委ねる。
- PR本文には最低限、Summary / Task / Scope / Out of scope / Risk class / Safety boundaries / Test plan / Verification result / Changed files / Rollback / Handoff を書く。
- workflow、permission、ruleset、branch protection、GitHub App permissions、`.forge/policies/**`、federation/self-evolution 系は高リスク変更として扱い、着手前に明示承認を取る。

## 禁止事項

- `main` への直接 push、force push、無承認の branch protection / ruleset / permission 変更。
- secret / token / private key の出力、保存、推測、ログ化。
- 未実行のテストを passed と書くこと。失敗した検証を成功扱いにすること。
- GitHub PR の merge / approve / ready 化 / close を無承認で行うこと。
- live GitHub transport、live mutation、memory write、federation、self-evolution を、該当 phase gate と明示承認なしに実装・実行すること。
- source-of-truth でない重複ファイルを根拠に仕様判断すること。

## 完了条件

- 変更範囲が依頼内容と一致し、不要なリファクタや成果物更新を含まない。
- 関連する README / specs / `TASK_PROGRESS.md` / handoff との矛盾を確認済み。
- 実行した検証コマンドと結果を最終報告またはPR本文に明記している。未実行の場合は理由を書く。
- `git status --short` で変更ファイルを確認し、意図しない差分がない。
- 高リスク領域に触れた場合、承認内容・リスク・rollback をPR本文に明記している。
