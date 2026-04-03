/**
 * JPX data_j.xls から api/17/{code}.json / api/33/{code}.json を生成する。
 * @see spec/03_data_transform.md
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

function findColumnIndex(headerRow, candidates) {
  const row = headerRow.map((h) => String(h).trim());
  for (const name of candidates) {
    const i = row.indexOf(name);
    if (i >= 0) return i;
  }
  return -1;
}

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

/** @returns {string|null} */
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

/** @returns {string|null} */
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

function addToMap(map, key, securityCode) {
  if (!map.has(key)) map.set(key, new Set());
  map.get(key).add(securityCode);
}

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
