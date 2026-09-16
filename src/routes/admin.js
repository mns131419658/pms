/* ── 操作紀錄 / 資料備份匯出 / 系統還原 (僅系統管理者) ── */
const express = require('express');
const store = require('../store');
const { requirePerm, str, matches, nowISO } = require('../util');
const drive = require('../googleDrive');

const router = express.Router();
const perm = requirePerm('perm_admin');

/* 最近 1000 筆寫入動作 (由 server.js 的稽核中介層寫入) */
router.get('/admin/audit', perm, (req, res) => {
  const q = str(req.query.q);
  const rows = store.all('audit')
    .filter(a => matches(a, ['emp_id', 'emp_name', 'path', 'method'], q))
    .slice().sort((a, b) => str(b.at).localeCompare(str(a.at)));
  res.json(rows);
});

function buildExport() {
  const db = store.get();
  const data = { exported_at: nowISO(), version: 1 };
  for (const t of store.TABLES) data[t] = db[t];
  data.seq = db.seq;
  return data;
}

/* 匯出完整備份 (系統還原頁會先自動下載一份現況再執行還原) */
router.get('/admin/export', perm, (req, res) => {
  res.json(buildExport());
});

/* ── 自動備份上傳 Google 雲端硬碟 ──
   兩種呼叫方式都接受：
   1) 系統管理者已登入 (系統內手動按「立即備份」)
   2) 帶正確的 X-Backup-Secret 標頭 (外部排程服務定時呼叫，沒有登入 session)
   兩者都沒有才拒絕。 */
function backupAuth(req, res, next) {
  if (req.session?.user?.perm_admin) return next();
  const secret = process.env.BACKUP_SECRET;
  if (secret && req.get('X-Backup-Secret') === secret) return next();
  return res.status(401).json({ error: '未授權：需要管理者登入，或正確的 X-Backup-Secret 標頭。' });
}

// Asia/Taipei 檔名時間戳記，不受伺服器本身時區影響
function taipeiStamp() {
  const parts = new Intl.DateTimeFormat('zh-TW', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = (t) => parts.find(p => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}_${get('hour')}${get('minute')}`;
}

// 實際執行備份上傳；HTTP 路由與 server.js 的排程計時器都呼叫這個
async function runBackup() {
  if (!drive.isConfigured()) {
    throw new Error('尚未設定 Google 雲端硬碟金鑰 (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN / GOOGLE_FOLDER_ID)。');
  }
  const data = buildExport();
  const filename = `pms-backup_${taipeiStamp()}.json`;
  return drive.uploadJSON(filename, JSON.stringify(data));
}

router.post('/admin/backup-now', backupAuth, async (req, res) => {
  try {
    const file = await runBackup();
    res.json({ ok: true, file_id: file.id, name: file.name });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

/* 還原：清空目前所有資料並換成備份檔內容 */
router.post('/admin/restore', perm, (req, res) => {
  if (str(req.body?.confirm) !== '確定還原') {
    return res.status(400).json({ error: '請輸入「確定還原」四個字以確認。' });
  }
  const data = req.body?.data;
  if (!data || typeof data !== 'object' || !Array.isArray(data.accounts)) {
    return res.status(400).json({ error: '備份檔格式不正確 (缺少帳號資料)。' });
  }
  // 還原後若沒有可登入的管理者，系統將無法再進入
  const admins = data.accounts.filter(a => a.perm_admin && a.status === '正常' && a.password);
  if (!admins.length) {
    return res.status(400).json({ error: '備份檔中沒有任何「正常」狀態的系統管理者帳號，還原後將無法登入，已中止。' });
  }

  store.replaceAll(data);
  req.session.destroy(() => {});
  res.json({ ok: true, accounts: data.accounts.length });
});

module.exports = router;
module.exports.runBackup = runBackup;
module.exports.taipeiStamp = taipeiStamp;
