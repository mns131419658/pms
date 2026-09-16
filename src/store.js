/* ============================================================
   資料儲存層：單一 JSON 檔，寫入時原子替換 (先寫 .tmp 再 rename)
   不使用原生模組，任何 Node 18+ 環境皆可直接執行。
   ============================================================ */
const fs = require('fs');
const path = require('path');

// 預設 data/，可用 PMS_DATA_DIR 指向別的位置 (測試或多套帳號分開存放)
const DATA_DIR = process.env.PMS_DATA_DIR
  ? path.resolve(process.env.PMS_DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const FILE_DIR = path.join(DATA_DIR, 'files');

// 匯出/還原會直接使用這些名稱，順序即為 export 的鍵順序
const TABLES = [
  'accounts', 'customers', 'vendors',
  'projects', 'project_stages', 'project_changes', 'project_logs', 'project_files',
  'quotes', 'quote_items', 'receivables', 'payables', 'repairs',
  'options', 'audit',
];

function emptyDb() {
  const db = { seq: {} };
  for (const t of TABLES) db[t] = [];
  return db;
}

let db = null;
let dirty = false;
let timer = null;

function load() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(FILE_DIR, { recursive: true });
  if (fs.existsSync(DATA_FILE)) {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const t of TABLES) if (!Array.isArray(db[t])) db[t] = [];
    if (!db.seq) db.seq = {};
  } else {
    db = emptyDb();
    flush();
  }
  return db;
}

function get() {
  if (!db) load();
  return db;
}

// 寫入合併：50ms 內的多次變更只寫一次檔
function commit() {
  dirty = true;
  if (timer) return;
  timer = setTimeout(() => { timer = null; flush(); }, 50);
}

function flush() {
  if (!db) return;
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DATA_FILE);
  dirty = false;
}

// 程式結束前確保資料落地
process.on('exit', () => { if (dirty) flush(); });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { if (dirty) flush(); process.exit(0); });
}

/* ── 流水號 ────────────────────────────────────────────── */
// 子表用的整數 PK
function nextInt(name) {
  const d = get();
  d.seq[name] = (Number(d.seq[name]) || 0) + 1;
  return d.seq[name];
}

// 單據編號：前綴 + 補零流水號 (掃描現有資料取最大值，還原備份後仍可正確接續)
function nextCode(table, field, prefix, width = 4) {
  const d = get();
  const re = new RegExp('^' + prefix + '(\\d{' + width + '})');
  let max = 0;
  for (const row of d[table]) {
    const m = re.exec(String(row[field] || ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return prefix + String(max + 1).padStart(width, '0');
}

/* ── 查詢小工具 ────────────────────────────────────────── */
const all = (t) => get()[t];
const find = (t, field, value) => get()[t].find(r => String(r[field]) === String(value));
const where = (t, fn) => get()[t].filter(fn);

function insert(t, row) {
  get()[t].push(row);
  commit();
  return row;
}

function update(t, field, value, patch) {
  const row = find(t, field, value);
  if (!row) return null;
  Object.assign(row, patch);
  commit();
  return row;
}

function remove(t, fn) {
  const d = get();
  const before = d[t].length;
  d[t] = d[t].filter(r => !fn(r));
  if (d[t].length !== before) commit();
  return before - d[t].length;
}

// 系統還原：整個資料庫換成備份內容
function replaceAll(data) {
  const next = emptyDb();
  for (const t of TABLES) if (Array.isArray(data[t])) next[t] = data[t];
  next.seq = (data.seq && typeof data.seq === 'object') ? data.seq : {};
  db = next;
  flush();
  return db;
}

module.exports = {
  TABLES, DATA_FILE, FILE_DIR,
  load, get, commit, flush,
  nextInt, nextCode,
  all, find, where, insert, update, remove, replaceAll,
};
