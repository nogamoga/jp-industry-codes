# 仕様書（JPX 業種コード別 証券コード API）

このリポジトリの `spec/` 配下には、JPX 公開データ（`data_j.xls`）を加工して、GitHub Pages 上で静的 JSON として配信するための仕様をまとめます。

## 書いていること
- 静的 API の URL 設計（`/api/17/{code}.json` / `/api/33/{code}.json`）
- 入力データ（`data_j.xls`）からの変換ルール（文字列化・重複排除・ソート）
- 毎日 1:00(JST) 更新する GitHub Actions の手順と公開方法

## ドキュメント
- [01 概要](./01_overview.md)
- [02 API エンドポイント](./02_api_endpoints.md)
- [03 入力データと変換仕様](./03_data_transform.md)
- [04 出力ファイル構成](./04_output_layout.md)
- [05 デプロイ手順（GitHub Actions / Pages）](./05_github_actions_deploy.md)
- [06 生成時バリデーション](./06_validation_checks.md)

