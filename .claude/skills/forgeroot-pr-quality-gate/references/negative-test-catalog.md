# Negative Test Catalog(G3: 否定テストの網羅カタログ)

「Codexが次に探す場所を先に全部埋める」ためのテストカタログ。代表例テストではなく、**フィールドを列挙してループで流す**table-drivenテストを書く。

## 1. tamper-harness(必須・最重要)

クラスC1(検証非対称)を機械的に殺すテスト。**acceptされたmanifestの全リーフフィールドを1つずつ改ざんし、validateが全て失敗することをループで検証する**。

```js
// packages/<pkg>/tests/<name>.tamper.test.mjs の雛形(node:test)
import { test } from "node:test";
import assert from "node:assert/strict";

// manifest内の全リーフパスを列挙する(配列indexも辿る)
function leafPaths(value, prefix = []) {
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => leafPaths(v, [...prefix, i]));
  }
  if (value !== null && typeof value === "object") {
    return Object.entries(value).flatMap(([k, v]) => leafPaths(v, [...prefix, k]));
  }
  return [prefix];
}

function withTamper(manifest, path, tamperValue) {
  const clone = structuredClone(manifest);
  let cursor = clone;
  for (const key of path.slice(0, -1)) cursor = cursor[key];
  cursor[path.at(-1)] = tamperValue;
  return clone;
}

const TAMPER_VALUES = (original) => [
  "__tampered__",              // 型は同じ文字列だが内容が違う
  null,                        // 欠落相当
  typeof original === "number" ? original + 1 : 0, // 型違い or 数値ずらし
  typeof original === "boolean" ? !original : true // gate反転
];

test("tamper-harness: every field mutation is rejected on read-back", () => {
  const accepted = createXxxDryRun(VALID_INPUT); // acceptedなmanifestを1つ用意
  assert.equal(accepted.status, "dry_run_valid");
  for (const path of leafPaths(accepted.manifest)) {
    const original = path.reduce((v, k) => v[k], accepted.manifest);
    for (const tampered of TAMPER_VALUES(original)) {
      if (Object.is(tampered, original)) continue;
      const result = validateXxx(withTamper(accepted.manifest, path, tampered));
      assert.equal(
        result.ok, false,
        `tampering ${path.join(".")} -> ${JSON.stringify(tampered)} must fail validation`
      );
    }
  }
});
```

注意:

- このテストが通る = 「全フィールドがdigest/ID再計算または直接検証でカバーされている」の機械的証明。R1/R2に従った実装なら自然に通る。通らないなら実装が非対称
- 改ざんしても意味が変わらないフィールドが本当にあるなら(稀)、除外リストを作りテスト内に理由をコメントで書く。黙って除外しない
- ネストオブジェクトの**丸ごとnull化・削除**も1系統流す(C7: throwせず `{ ok: false }` を返すことの検証を兼ねる)

## 2. フィールド×異常系の網羅表

仕様(docs/specs/)の全入力フィールドについて、該当する異常系を全て流す。表をテストコード内のケース配列として表現する。

| 異常系 | 流す値 | 対象 |
|---|---|---|
| 欠落 | キー削除 | 全フィールド |
| null | `null` | 全フィールド |
| 型違い | 文字列に数値、数値に文字列、配列にオブジェクト | 全フィールド |
| NaN / Infinity | `NaN`, `Infinity`, `-Infinity` | 全数値 |
| 負数 / 0 / 上限+1 | 境界3点 | 全数値 |
| 空文字 / 空白のみ | `""`, `"  "` | 全文字列 |
| 長さ上限+1 | cap+1文字 | 上限のある文字列 |
| 不可能日時 | `2026-99-99T99:99:99Z`, `2026-02-30T00:00:00Z` | 全timestamp |
| 非UTC / オフセット | `2026-07-04T00:00:00+09:00` | 全timestamp |
| secret様 | `ghp_` 接頭辞、`-----BEGIN`、`password: x` | 全文字列(キー名と値の両方) |
| 未知キー | `{ ...valid, unexpected: 1 }` | 全オブジェクト(方針が拒否の場合) |
| 空配列 / 重複要素 | `[]`, `[a, a]` | 全配列 |
| 順序違い | 逆順配列 | 決定的ソートを主張する配列 |
| 禁止ターゲット | `.forge/policies/constitution.forge`, `.github/workflows/test.yml` | 全パス系フィールド |
| allowlist外 | 禁止namespace(例 `browser.open`) | route名が現れる**全**フィールド(fallback含む) |
| enum外 | `"approved"`, `"__unknown__"` | 全status/decision/kind |

## 3. multi-op系列テスト(該当コードのみ)

C4対策。最低4系列:

1. replaceで空けた名前を同名addする(**受理**されるべき)
2. replaceで名前を変えた後に旧名をadd → 最終状態重複(**拒否**されるべき)
3. 同一routeへの二重add(拒否)
4. remove後に同routeをreplace(拒否: 存在しない)

「受理されるべき正当系列」を必ず含めること(誤拒否の回帰防止)。

## 4. グラフ系テスト(該当コードのみ)

C10対策:

1. 提案childが親の祖先(`evolution.parents`)に既存 → 拒否
2. 親が自己循環(自分のspeciation_idを祖先に持つ) → 拒否/quarantine
3. 正常な多世代lineage → 受理

## 5. 分類の優先順位テスト

C7対策(early returnが分類を隠す問題): 「malformed入力 + forbidden target」の複合入力を流し、
高リスク分類(`blocked_by_forbidden_target` 等)がissuesに**含まれる**ことを検証する。
