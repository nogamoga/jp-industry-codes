# jp-industry-codes
- 東証(JPX)の上場銘柄の証券コードを業種コードごとにJSONで返します

## 注意事項
- Cursor を利用して作成
- 1日1回深夜1時に更新

## API仕様
- 17業種コード
    - **GET**：https://nogamoga.github.io/jp-industry-codes/api/17/1.json
    - ～ 省略 ～
    - **GET**：https://nogamoga.github.io/jp-industry-codes/api/17/17.json
- 33業種コード
    - **GET**：https://nogamoga.github.io/jp-industry-codes/api/33/0050.json
    - ～ 省略 ～
    - **GET**：https://nogamoga.github.io/jp-industry-codes/api/33/9050.json

## レスポンス
```json
["1301","1332","1333","1375","1376","1377","1379","1380","1381","1382","1383","1384"]
```

## 元データ
[東証上場銘柄一覧 - 日本取引所グループ](https://www.jpx.co.jp/markets/statistics-equities/misc/01.html)