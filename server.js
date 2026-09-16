/* ============================================================
   專案管理系統 — 本機版伺服器
   啟動：npm start   → http://localhost:3000
   ============================================================ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');

/* ── 載入 .env 設定檔（如果有的話）──
   不使用額外套件。必須在載入 seed 之前執行，因為 seed 會讀取環境變數。
   刻意自己解析而不用 Node 內建的 loadEnvFile，原因是：
   Windows 的記事本存檔常會加上 BOM，會讓「第一個」變數的名稱多出隱藏字元
   而靜默失效——初學者幾乎不可能查出這種問題。 */
function loadDotEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return false; }
  text = text.replace(/^﻿/, '');                    // 去掉記事本可能加上的 BOM
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;               // 空行與註解
    const eq = s.indexOf('=');
    if (eq < 1) continue;
    const key = s.slice(0, eq).trim();
    let val = s.slice(eq + 1).trim();
    if (val.length > 1 && ((val[0] === '"' && val.endsWith('"')) ||
                           (val[0] === "'" && val.endsWith("'")))) {
      val = val.slice(1, -1);                            // 去掉成對引號
    }
    // 真正的環境變數（例如 Render 上設定的）優先，.env 不覆蓋它
    if (val !== '' && process.env[key] === undefined) { process.env[key] = val; count++; }
  }
  console.log(`  已載入 .env 設定（${count} 項）`);
  return true;
}
loadDotEnv(path.join(__dirname, '.env'));

const store = require('./src/store');
const { seed } = require('./src/seed');
const { nowISO } = require('./src/util');

const PORT = Number(process.env.PORT) || 3000;
const app = express();

store.load();
seed();

/* ── Session 簽章金鑰 ──
   優先用環境變數 SESSION_SECRET；沒有的話首次啟動自動產生一組亂數存檔，
   之後每次啟動沿用同一組。目的是讓每套安裝各自擁有獨立金鑰，
   而不是全部共用寫死在原始碼裡的同一組。
   註：登入狀態本身存在記憶體，重啟伺服器仍會需要重新登入。 */
function sessionSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const file = path.join(path.dirname(store.DATA_FILE), 'session-secret.txt');
  try {
    const saved = fs.readFileSync(file, 'utf8').trim();
    if (saved) return saved;
  } catch { /* 檔案還不存在，往下產生 */ }
  const secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(file, secret + '\n', 'utf8');
  console.log('  已產生本機專用的 session 金鑰：' + file);
  return secret;
}

// 檔案上傳走 base64 JSON，單檔上限 10MB → 放寬 body 上限
app.use(express.json({ limit: '25mb' }));
app.use(session({
  name: 'pms.sid',
  secret: sessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', maxAge: 8 * 60 * 60 * 1000 },  // 8 小時
}));

/* ── 操作紀錄：記錄所有寫入動作 (不含查詢與密碼內容) ── */
const SECRET_KEYS = ['password', 'old_password', 'new_password', 'new_password2', 'data', 'image'];
app.use((req, res, next) => {
  if (req.method === 'GET' || !req.path.startsWith('/api/')) return next();
  res.on('finish', () => {
    const user = req.session?.user;
    const detail = {};
    for (const [k, v] of Object.entries(req.body || {})) {
      if (SECRET_KEYS.includes(k)) detail[k] = '***';
      else if (typeof v === 'string' && v.length > 120) detail[k] = v.slice(0, 120) + '…';
      else if (Array.isArray(v)) detail[k] = `[${v.length} 筆]`;
      else detail[k] = v;
    }
    const rows = store.all('audit');
    rows.push({
      id: store.nextInt('audit'),
      at: nowISO(),
      emp_id: user?.emp_id || '',
      emp_name: user?.name || '',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      detail,
    });
    // 只保留最近 1000 筆
    if (rows.length > 1000) rows.splice(0, rows.length - 1000);
    store.commit();
  });
  next();
});

/* ── API 路由 ── */
app.use('/api', require('./src/routes/auth'));
app.use('/api', require('./src/routes/lookups'));
app.use('/api', require('./src/routes/customers'));
app.use('/api', require('./src/routes/vendors'));
app.use('/api', require('./src/routes/projects'));
app.use('/api', require('./src/routes/repairs'));
app.use('/api', require('./src/routes/quotes'));
app.use('/api', require('./src/routes/receivables'));
app.use('/api', require('./src/routes/payables'));
app.use('/api', require('./src/routes/accounting'));
app.use('/api', require('./src/routes/reports'));
app.use('/api', require('./src/routes/accounts'));
app.use('/api', require('./src/routes/admin'));

// 未定義的 API 一律回 JSON (避免前端 res.json() 解析到 HTML)
app.use('/api', (req, res) => res.status(404).json({ error: '找不到此功能 (' + req.path + ')。' }));

/* ── 靜態檔案 (前端與原站完全相同) ── */
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

/* ── 錯誤處理 ── */
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  const tooLarge = err.type === 'entity.too.large';
  res.status(tooLarge ? 413 : 500)
    .json({ error: tooLarge ? '檔案過大，單檔上限 10MB。' : (err.message || '伺服器發生錯誤。') });
});

app.listen(PORT, () => {
  console.log('');
  console.log('  專案管理系統 (本機版) 已啟動');
  console.log(`  網址：http://localhost:${PORT}`);
  console.log(`  資料：${store.DATA_FILE}`);
  console.log('');
});

/* ── 排程備份 (每週五 20:00 台北時間) ──
   這只是行程持續存活時的保險；服務若因閒置睡著 (如 Render 免費方案)，
   計時器不會在睡著時觸發，主要還是靠外部排程服務呼叫 /api/admin/backup-now。
   每分鐘檢查一次，用 lastRun 記錄「今天有沒有跑過」避免同一分鐘內重複觸發。 */
let lastBackupRunDate = null;
setInterval(() => {
  if (!require('./src/googleDrive').isConfigured()) return;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(new Date());
  if (get('weekday') === 'Fri' && get('hour') === '20' && get('minute') === '00' && lastBackupRunDate !== dateKey) {
    lastBackupRunDate = dateKey;
    require('./src/routes/admin').runBackup()
      .then(f => console.log('  [排程備份] 已上傳：' + f.name))
      .catch(e => console.error('  [排程備份] 失敗：' + e.message));
  }
}, 60 * 1000);
