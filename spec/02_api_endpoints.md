# 2. API エンドポイント仕様

この API は GitHub Pages が提供する静的 JSON を返します（サーバサイド処理は行いません）。

## ベース URL
- 公開先: `https://{github-user}.github.io/jp-industry-codes/`
- API 配下: `/{repo}/api/`
  - 例: `https://nogamoga.github.io/jp-industry-codes/api/...`

## URL パターン
1. `GET /api/17/{code}.json`
2. `GET /api/33/{code}.json`

## パスパラメータ
- `{code}`
  - `17` の場合: 17 業種コード体系のコード（先頭ゼロは保持）
  - `33` の場合: 33 業種コード体系のコード（例: `0050` のように先頭ゼロを保持）

## レスポンス
- 常に `200 OK`（該当がある場合）
  - ボディ: JSON 配列のみ
  - Content-Type: `application/json`
  - 形式:
    - `["1101","222A","8326"]`
- 存在しない組み合わせは `404 Not Found`
  - 返却ボディの形式は固定しない（静的ファイルが無い場合の GitHub Pages 標準挙動）

## 返却データ（配列）仕様
- 配列要素は証券コード（文字列）
- 重複は排除する
- 安定した出力のため、生成時に証券コードをソートする（実装は「辞書順（文字列）」を推奨）

## キャッシュ
- 静的配信のため、GitHub Pages のヘッダに依存します
- 生成物の更新時点で自然に反映されます（キャッシュ制御の要件は現時点では指定しない）

