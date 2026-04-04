/**
 * JPX data_j.xls から api/17/{code}.json / api/33/{code}.json を生成する。
 * @see spec/03_data_transform.md
 * 使い方
 * - npm run build
 * - npm run build -- --input <path\to\data_j.xls>
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const DEFAULT_URL =
  "https://www.jpx.co.jp/markets/statistics-equities/misc/tvdivq0000001vg2-att/data_j.xls";

/**
 * コマンドライン引数を解釈し、出力先ディレクトリと入力 XLS のパスを返す。
 *
 * @param {string[]} argv - `process.argv` と同等の配列（先頭2要素は node とスクリプトパス）。
 * @returns {{ outDir: string, inputPath: string | null }} `outDir` は `--out-dir`（既定は `dist`）。`inputPath` は `--input` 指定時のみ絶対パス、未指定時は `null`。
 */
function parseArgs(argv) {
  let outDir = path.join(ROOT, "dist");
  let inputPath = null;
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir" && argv[i + 1]) {
      outDir = path.resolve(argv[++i]);
    } else if (a === "--input" && argv[i + 1]) {
      inputPath = path.resolve(argv[++i]);
    } else if (a === "--help" || a === "-h") {
      console.error(
        "Usage: node scripts/build.mjs [--out-dir <dir>] [--input <data_j.xls>]\n" +
          "  Env: DATA_J_XLS_URL (default: JPX data_j.xls URL)",
      );
      process.exit(0);
    }
  }
  return { outDir, inputPath };
}

/**
 * `data_j.xls` の読み取り用パスを返す。ローカル指定があればその存在を確認し、なければ URL からダウンロードする。
 *
 * @param {string | null} inputPath - `--input` で指定した絶対パス。未指定時は `null`。
 * @returns {Promise<string>} 読み込み可能な `.xls` ファイルのパス。
 * @throws {Error} ローカルファイルが存在しない、または HTTP ダウンロードが失敗した場合。
 */
async function ensureInputFile(inputPath) {
  if (inputPath) {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`入力ファイルが見つかりません: ${inputPath}`);
    }
    return inputPath;
  }
  const url = process.env.DATA_J_XLS_URL || DEFAULT_URL;
  const tmp = path.join(ROOT, ".data_j_download.xls");
  console.log(`Downloading: ${url}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`ダウンロード失敗 HTTP ${res.status}: ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(tmp, buf);
  console.log(`Saved: ${tmp} (${buf.length} bytes)`);
  return tmp;
}

/**
 * ヘッダ行から、候補名のいずれかに一致する列インデックスを探す（先頭から優先）。
 *
 * @param {unknown[]} headerRow - 1 行目相当のセル値の配列。
 * @param {string[]} candidates - 列名の候補（完全一致、前後空白トリム後）。
 * @returns {number} 見つかった列の 0 始まりインデックス。見つからなければ `-1`。
 */
function findColumnIndex(headerRow, candidates) {
  const row = headerRow.map((h) => String(h).trim());
  for (const name of candidates) {
    const i = row.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

/**
 * セル値を証券コード文字列に正規化する（空は空文字）。
 *
 * @param {unknown} value - シート上のセル値。
 * @returns {string} 証券コード。空・未設定は `""`。
 * @throws {Error} 数値だが整数でない場合。
 */
function normalizeSecurityCode(value) {
  if (value === "" || value === null || value === undefined) return "";
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`証券コードが整数ではありません: ${value}`);
    }
    return String(value);
  }
  return String(value).trim();
}

/**
 * 17 業種コード列の値をファイル名・キー用の文字列に正規化する。JPX の「-」や空は「該当なし」として除外する。
 *
 * @param {unknown} value - シート上のセル値。
 * @returns {string | null} 有効なコード文字列。除外対象の場合は `null`。
 * @throws {Error} 数値だが整数でない場合。
 */
function normalize17IndustryCode(value) {
  if (value === "-" || value === "" || value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`17業種コードが整数ではありません: ${value}`);
    }
    return String(value);
  }
  const s = String(value).trim();
  if (s === "-") return null;
  return s;
}

/**
 * 33 業種コード列の値を正規化する。数値・数字のみの文字列は先頭ゼロを含む 4 桁に揃える。
 *
 * @param {unknown} value - シート上のセル値。
 * @returns {string | null} 有効なコード文字列。除外対象の場合は `null`。
 * @throws {Error} 数値だが整数でない場合。
 */
function normalize33IndustryCode(value) {
  if (value === "-" || value === "" || value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new Error(`33業種コードが整数ではありません: ${value}`);
    }
    return String(value).padStart(4, "0");
  }
  const s = String(value).trim();
  if (s === "-") return null;
  if (/^\d+$/.test(s)) return s.padStart(4, "0");
  return s;
}

/**
 * 業種コード → 証券コード集合の `Map` に、証券コードを追加する（キー未登録時は `Set` を作成）。
 *
 * @param {Map<string, Set<string>>} map - 業種コードをキーとするマップ。
 * @param {string} key - 17 または 33 の業種コード文字列。
 * @param {string} securityCode - 証券コード文字列。
 * @returns {void}
 */
function addToMap(map, key, securityCode) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(securityCode);
}

/**
 * `outDir/api/{subdir}/{code}.json` に、証券コードの JSON 配列（改行付き）を書き出す。ファイル・配列とも辞書順で安定化する。
 *
 * @param {string} outDir - 出力ルート（例: `dist`）。
 * @param {string} subdir - `api` 直下のサブディレクトリ名（`"17"` または `"33"`）。
 * @param {Map<string, Set<string>>} codeToSet - 業種コード → 証券コード集合。
 * @returns {void}
 */
function writeJsonFiles(outDir, subdir, codeToSet) {
  const base = path.join(outDir, "api", subdir);
  fs.mkdirSync(base, { recursive: true });
  for (const [code, set] of [...codeToSet.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], "ja"),
  )) {
    const arr = [...set].sort((x, y) => x.localeCompare(y, "ja"));
    const filePath = path.join(base, `${code}.json`);
    fs.writeFileSync(filePath, `${JSON.stringify(arr)}\n`, "utf8");
  }
}

/**
 * 生成された `api/17`・`api/33` のファイル数と期待集合が一致し、各ファイルがパース可能な JSON 配列であることを確認する。
 *
 * @param {string} outDir - 出力ルート。
 * @param {Set<string>} expected17 - 出力が存在すべき 17 業種コードの集合。
 * @param {Set<string>} expected33 - 出力が存在すべき 33 業種コードの集合。
 * @returns {void}
 * @throws {Error} 件数不一致、欠落ファイル、または JSON パース失敗時。
 */
function validateOutputs(outDir, expected17, expected33) {
  const api17 = path.join(outDir, "api", "17");
  const api33 = path.join(outDir, "api", "33");
  const files17 = fs.existsSync(api17)
    ? fs.readdirSync(api17).filter((f) => f.endsWith(".json"))
    : [];
  const files33 = fs.existsSync(api33)
    ? fs.readdirSync(api33).filter((f) => f.endsWith(".json"))
    : [];
  if (files17.length !== expected17.size) {
    throw new Error(
      `api/17 のファイル数が期待と一致しません: got ${files17.length}, expected ${expected17.size}`,
    );
  }
  if (files33.length !== expected33.size) {
    throw new Error(
      `api/33 のファイル数が期待と一致しません: got ${files33.length}, expected ${expected33.size}`,
    );
  }
  for (const code of expected17) {
    const p = path.join(api17, `${code}.json`);
    if (!fs.existsSync(p)) throw new Error(`欠落: ${p}`);
    const raw = fs.readFileSync(p, "utf8");
    JSON.parse(raw);
  }
  for (const code of expected33) {
    const p = path.join(api33, `${code}.json`);
    if (!fs.existsSync(p)) throw new Error(`欠落: ${p}`);
    JSON.parse(fs.readFileSync(p, "utf8"));
  }
  console.log(
    `Validation OK: api/17 ${files17.length} files, api/33 ${files33.length} files`,
  );
}

/**
 * XLS を読み込み、業種別に証券コードを集約して `dist`（または `--out-dir`）配下に JSON を生成し、検証まで行うエントリポイント。
 *
 * @returns {Promise<void>}
 * @throws {Error} 列特定失敗、データ不正、検証失敗など。未捕捉時はプロセス終了ハンドラで `process.exit(1)`。
 */
async function main() {
  const { outDir, inputPath } = parseArgs(process.argv);
  const xlsPath = await ensureInputFile(inputPath);

  const workbook = XLSX.readFile(xlsPath, { type: "file", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("シートがありません");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  if (rows.length < 2) throw new Error("データ行がありません");

  const headerRow = rows[0];
  const idxCode = findColumnIndex(headerRow, ["証券コード", "コード"]);
  const idx17 = findColumnIndex(headerRow, ["17業種コード"]);
  const idx33 = findColumnIndex(headerRow, ["33業種コード"]);
  if (idxCode < 0) {
    throw new Error(
      "列「証券コード」または「コード」が見つかりません。ヘッダ: " +
        JSON.stringify(headerRow),
    );
  }
  if (idx17 < 0) {
    throw new Error(
      "列「17業種コード」が見つかりません。ヘッダ: " +
        JSON.stringify(headerRow),
    );
  }
  if (idx33 < 0) {
    throw new Error(
      "列「33業種コード」が見つかりません。ヘッダ: " +
        JSON.stringify(headerRow),
    );
  }

  const map17 = new Map();
  const map33 = new Map();

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const securityRaw = row[idxCode];
    const code = normalizeSecurityCode(securityRaw);
    if (!code) continue;

    const c17 = normalize17IndustryCode(row[idx17]);
    const c33 = normalize33IndustryCode(row[idx33]);

    if (c17 !== null) addToMap(map17, c17, code);
    if (c33 !== null) addToMap(map33, c33, code);
  }

  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });

  writeJsonFiles(outDir, "17", map17);
  writeJsonFiles(outDir, "33", map33);

  const expected17 = new Set(map17.keys());
  const expected33 = new Set(map33.keys());
  validateOutputs(outDir, expected17, expected33);

  console.log(`Done. Output: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
