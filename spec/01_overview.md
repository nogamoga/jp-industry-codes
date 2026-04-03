# 1. 概要

## 背景
JPX が公開する `data_j.xls` を元に、業種コード別に「該当する証券コード一覧」を引ける Web API（静的 JSON）を提供します。

## 目標
- 2 種類の業種体系（`17` および `33`）それぞれについて、指定されたコードに対応する証券コード配列を JSON 配列のみで返す
- GitHub Actions により、JPX 公開データを毎日自動更新し、GitHub Pages で配信する

## 例
- `17` 業種コード体系:
  - `https://nogamoga.github.io/jp-industry-codes/api/17/1.json`
  - 返却: `["1101","222A","8326"]`
- `33` 業種コード体系:
  - `https://nogamoga.github.io/jp-industry-codes/api/33/0050.json`
  - 返却: `["1325","323A","9125"]`

