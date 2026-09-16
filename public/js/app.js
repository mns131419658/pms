/* ============================================================
   專案管理系統 前端邏輯 (原生 JS，單頁應用)
   ============================================================ */

let USER = null;
const lookupCache = {};
const optionCache = {};  // 項目維護的下拉清單快取

/* ── 通用工具 ─────────────────────────────────────────── */
async function api(url, options = {}) {
  const opt = { headers: {}, ...options };
  if (opt.body && typeof opt.body !== 'string') {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(opt.body);
  }
  const method = (opt.method || 'GET').toUpperCase();
  const res = await fetch(url, opt);
  if (res.status === 401) { location.href = '/'; throw new Error('未登入'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '操作失敗');
  // 有寫入動作時清除快取，確保新資料即時出現
  if (method !== 'GET') {
    for (const k in lookupCache) delete lookupCache[k];
    for (const k in optionCache) delete optionCache[k];
  }
  return data;
}
const esc = (s) => (s === null || s === undefined) ? '' : String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => (n === null || n === undefined || n === '') ? '' : Number(n).toLocaleString('en-US');
const fmtDate = (d) => d ? String(d).slice(0, 10) : '';
// 檔案大小顯示 (B / KB / MB)
const fileSize = (n) => {
  const b = Number(n) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
};
const fmtDT = (d) => d ? String(d).replace('T', ' ').slice(0, 16) : '';

function statusBadge(s) {
  const map = {
    '啟用': 'green', '正常': 'green', '已收款': 'green', '已付款': 'green', '已確認': 'green',
    '進行中': 'blue', '準備進場': 'blue',
    '待收款': 'amber', '待付款': 'amber', '施工中': 'amber', '設計中': 'amber', '停工': 'amber',
    '待處理': 'amber', '待確認': 'amber', '派工中': 'blue', '已完修': 'green',
    '已結案': 'gray', '已完工': 'gray', '結案': 'gray',
    '停用': 'red', '作廢': 'red', '鎖住': 'red', '已離職': 'red', '拒絕往來': 'red',
  };
  return `<span class="badge ${map[s] || 'gray'}">${esc(s || '')}</span>`;
}

async function getLookup(name) {
  if (!lookupCache[name]) lookupCache[name] = await api('/api/lookups/' + name);
  return lookupCache[name];
}
// 項目維護的下拉清單 (由資料庫維護)
async function getOptions(category) {
  if (!optionCache[category]) optionCache[category] = await api('/api/options/' + category);
  return optionCache[category];
}
// 由字串陣列產生 <option> (單選下拉，不可自填)
function optionsFromList(list, selected, withBlank = true) {
  let html = withBlank ? '<option value="">— 請選擇 —</option>' : '';
  html += list.map(o => `<option ${o === selected ? 'selected' : ''}>${esc(o)}</option>`).join('');
  return html;
}
function options(items, valueKey, labelKey, selected, withBlank = true) {
  let html = withBlank ? '<option value="">— 請選擇 —</option>' : '';
  for (const it of items) {
    const v = it[valueKey];
    const label = `${v}${it[labelKey] ? ' ' + it[labelKey] : ''}`;
    html += `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(label)}</option>`;
  }
  return html;
}
// 固定選項的狀態下拉 (不可自行輸入)
function statusSelectOptions(list, selected) {
  return list.map(s => `<option ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('');
}

/* ── 彈窗 ─────────────────────────────────────────────── */
const mask = document.getElementById('modalMask');
function openModal(title, bodyHtml, footHtml) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHtml;
  document.getElementById('modalFoot').innerHTML = footHtml || '';
  mask.classList.add('show');
}
function closeModal() { mask.classList.remove('show'); }
document.getElementById('modalClose').onclick = closeModal;
mask.addEventListener('click', (e) => { if (e.target === mask) closeModal(); });

/* ── 通用表單彈窗 ─────────────────────────────────────
   fields: [{name,label,type,options(html),required,full,value,readonly,hint,disabledOpts}]
   type: text|number|date|textarea|select|password|checkbox
─────────────────────────────────────────────────────── */
function fieldHtml(f) {
  const v = f.value ?? '';
  const req = f.required ? 'required' : '';
  const ro = f.readonly ? 'readonly' : '';
  let input;
  if (f.type === 'textarea') {
    input = `<textarea name="${f.name}" rows="2" ${req} ${ro}>${esc(v)}</textarea>`;
  } else if (f.type === 'select') {
    input = `<select name="${f.name}" ${req} ${f.onchange ? `onchange="${f.onchange}"` : ''}>${f.options}</select>`;
  } else if (f.type === 'datalist') {
    const listId = f.name + '_dl';
    input = `<input name="${f.name}" list="${listId}" value="${esc(v)}" ${req} placeholder="選擇或自行輸入">
      <datalist id="${listId}">${(f.list || []).map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
  } else if (f.type === 'multicheck') {
    // 複選核取方塊，提交時以逗號串接；保留清單外的既有值
    const selected = String(v || '').split(',').map(s => s.trim()).filter(Boolean);
    const all = (f.list || []).slice();
    selected.forEach(s => { if (!all.includes(s)) all.push(s); });
    input = `<div class="multicheck">${all.length ? all.map(o =>
      `<label class="mc-item"><input type="checkbox" name="${f.name}" value="${esc(o)}" ${selected.includes(o) ? 'checked' : ''}> ${esc(o)}</label>`
    ).join('') : '<span class="hint">尚無選項，請至「項目維護」新增</span>'}</div>`;
  } else if (f.type === 'locked') {
    // 顯示用唯讀文字，實際值以隱藏欄位送出 (例如客戶不可改但要保留)
    input = `<input type="text" value="${esc(f.display ?? v)}" readonly>
      <input type="hidden" name="${f.name}" value="${esc(v)}">`;
  } else if (f.type === 'checkbox') {
    input = `<label style="font-weight:400"><input type="checkbox" name="${f.name}" ${v ? 'checked' : ''} ${f.onchange ? `onchange="${f.onchange}"` : ''}> ${esc(f.checkLabel || '')}</label>`;
  } else {
    input = `<input type="${f.type || 'text'}" name="${f.name}" value="${esc(v)}" ${req} ${ro}
      ${f.step ? `step="${f.step}"` : ''} ${f.oninput ? `oninput="${f.oninput}"` : ''}>`;
  }
  return `<div class="field ${f.full ? 'full' : ''}">
    <label>${esc(f.label)}${f.required ? ' *' : ''}</label>${input}
    ${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}</div>`;
}

function openForm({ title, fields, extraHtml = '', topHtml = '', onSubmit }) {
  const body = `<form id="modalForm">${topHtml}<div class="form-grid">
    ${fields.map(fieldHtml).join('')}</div>${extraHtml}</form>`;
  const foot = `<button class="btn ghost" type="button" id="fCancel">取消</button>
    <button class="btn" type="submit" form="modalForm" id="fSave">儲存</button>`;
  openModal(title, body, foot);
  document.getElementById('fCancel').onclick = closeModal;
  document.getElementById('modalForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const values = {};
    fields.forEach(f => {
      if (f.type === 'checkbox') values[f.name] = fd.get(f.name) === 'on';
      else if (f.type === 'multicheck') values[f.name] = fd.getAll(f.name).join(',');
      else values[f.name] = fd.get(f.name);
    });
    const saveBtn = document.getElementById('fSave');
    saveBtn.disabled = true; saveBtn.textContent = '儲存中...';
    try {
      await onSubmit(values, e.target);
      closeModal();
    } catch (err) {
      alert(err.message);
      saveBtn.disabled = false; saveBtn.textContent = '儲存';
    }
  };
}

function confirmDelete(text, fn) {
  if (confirm(text)) fn();
}

/* ── 清單頁面骨架 ─────────────────────────────────────── */
function renderListPage({ searchable, placeholder, defaultHint }) {
  document.getElementById('content').innerHTML = `
    <div class="toolbar">
      ${searchable ? `<input class="search" id="searchInput" placeholder="${esc(placeholder || '搜尋關鍵字...')}">
        <button class="btn" id="searchBtn">搜尋</button>` : ''}
      <button class="btn ghost" id="exportCsvBtn" style="margin-left:auto">匯出CSV</button>
    </div>
    ${defaultHint ? `<div class="hint" id="listHint" style="margin-bottom:10px">${esc(defaultHint)}</div>` : ''}
    <div class="card"><div id="listArea"><div class="empty">${searchable ? '請輸入關鍵字後查詢' : '載入中...'}</div></div></div>`;
  document.getElementById('exportCsvBtn').onclick = () => exportListCSV();
}

// 將一個表格轉為 CSV 文字列陣列 (略過操作/維護欄)
function tableToCsvLines(table) {
  const skip = new Set();
  Array.from(table.querySelectorAll('thead th')).forEach((th, i) => {
    const t = th.textContent.trim();
    if (!t || t === '操作' || t === '維護') skip.add(i);
  });
  const lines = [];
  table.querySelectorAll('tr').forEach(tr => {
    const cells = Array.from(tr.querySelectorAll('th,td'))
      .filter((_, i) => !skip.has(i))
      .map(td => '"' + td.textContent.trim().replace(/"/g, '""') + '"');
    if (cells.length) lines.push(cells.join(','));
  });
  return lines;
}
// 下載 CSV (含 Excel 中文 BOM)
function downloadCSV(lines, filename) {
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}
// 匯出目前清單明細為 CSV (分頁清單會匯出「全部」資料，不只當前頁)
function exportListCSV() {
  let table = document.querySelector('#listArea table');
  const wrap = document.querySelector('#listArea [id^="pg"]');
  if (wrap && __paged[wrap.id]) {
    const s = __paged[wrap.id];
    const tmp = document.createElement('div');
    tmp.innerHTML = tableHtml(s.columns, s.rows, s.footer);   // 全部資料重組
    table = tmp.querySelector('table');
  }
  if (!table) { alert('目前沒有可匯出的明細，請先查詢。'); return; }
  const lines = tableToCsvLines(table);
  if (lines.length <= 1) { alert('目前沒有可匯出的明細。'); return; }
  const title = (document.getElementById('pageTitle').textContent || '明細').trim();
  downloadCSV(lines, `${title}_${new Date().toISOString().slice(0, 10)}.csv`);
}
// footer：與 columns 對齊的合計列陣列 (字串 HTML，不需要時省略)
function tableHtml(columns, rows, footer) {
  if (!rows.length) return `<div class="empty">查無資料</div>`;
  const head = columns.map(c => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
  const body = rows.map(r => '<tr>' + columns.map(c => {
    let val = c.render ? c.render(r) : esc(r[c.key]);
    return `<td class="${c.num ? 'num' : ''}">${val}</td>`;
  }).join('') + '</tr>').join('');
  const foot = footer
    ? `<tfoot><tr>${columns.map((c, i) => `<td class="${c.num ? 'num' : ''}">${footer[i] ?? ''}</td>`).join('')}</tr></tfoot>`
    : '';
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table>`;
}

/* ── CSV 匯入 (客戶/廠商) ─────────────────────────────── */
const IMPORT_DEFS = {
  customer: {
    api: '/api/customers/import', name: '客戶',
    headers: ['姓名', '手機', '公司', '連絡地址', '備註'],
    keys: ['name', 'mobile', 'company', 'contact_addr', 'note'],
  },
  vendor: {
    api: '/api/vendors/import', name: '廠商',
    headers: ['公司名稱', '業務姓名', '手機', '營業項目', '結帳方式', '統編', '備註'],
    keys: ['company_name', 'sales_name', 'mobile', 'business_item', 'payment_method', 'tax_id', 'note'],
  },
};
// 簡易 CSV 解析 (支援引號欄位)；自動嘗試 UTF-8 與 Big5 (Excel 存的 CSV)
function parseCSV(text) {
  const rows = []; let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; }
      else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}
function decodeCsvBuffer(buf) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('big5').decode(buf); } catch { return utf8.replace(/^﻿/, ''); }
}
function importCSVFlow(kind) {
  const def = IMPORT_DEFS[kind];
  const input = document.createElement('input');
  input.type = 'file'; input.accept = '.csv,text/csv';
  input.onchange = async () => {
    if (!input.files.length) return;
    try {
      const buf = await input.files[0].arrayBuffer();
      const rows = parseCSV(decodeCsvBuffer(buf));
      if (rows.length < 2) { alert('CSV 內容不足（第一行需為欄位名稱，之後每行一筆）。'); return; }
      const head = rows[0].map(h => h.trim());
      // 依範本欄名對應欄位位置 (順序可不同，缺欄位視為空)
      const idx = def.headers.map(h => head.indexOf(h));
      if (idx[0] === -1) { alert(`第一行找不到必要欄位「${def.headers[0]}」。\n請先下載範本核對欄位名稱。`); return; }
      const data = rows.slice(1).map(r => {
        const o = {};
        def.keys.forEach((k, i) => { o[k] = idx[i] >= 0 ? (r[idx[i]] || '').trim() : ''; });
        return o;
      });
      if (!confirm(`即將匯入 ${data.length} 筆${def.name}資料，確定執行？`)) return;
      const res = await api(def.api, { method: 'POST', body: { rows: data } });
      let msg = `匯入完成：成功 ${res.ok} 筆`;
      if (res.skipped?.length) msg += `\n略過 ${res.skipped.length} 筆：\n` + res.skipped.slice(0, 10).join('\n');
      alert(msg);
      MODULES[kind].render();
    } catch (e) { alert('匯入失敗：' + e.message); }
  };
  input.click();
}
function downloadImportTemplate(kind) {
  const def = IMPORT_DEFS[kind];
  downloadCSV([def.headers.map(h => `"${h}"`).join(',')], `${def.name}匯入範本.csv`);
}
// 在清單工具列加入 匯入CSV / 範本 按鈕 (客戶與廠商頁用)
function addImportButtons(kind) {
  const exp = document.getElementById('exportCsvBtn');
  if (!exp) return;
  exp.style.marginLeft = '0';
  exp.insertAdjacentHTML('beforebegin',
    `<button class="btn ghost" id="importCsvBtn" style="margin-left:auto">匯入CSV</button>
     <button class="btn ghost" id="tplCsvBtn">範本</button>`);
  document.getElementById('importCsvBtn').onclick = () => importCSVFlow(kind);
  document.getElementById('tplCsvBtn').onclick = () => downloadImportTemplate(kind);
}

/* ── 清單分頁 (每頁 25 筆) ────────────────────────────── */
const PAGE_SIZE = 25;
let __pagedSeq = 0;
const __paged = {};   // pid → { columns, rows, footer, page }
// 取代 tableHtml 用於清單頁：超過 25 筆自動出現換頁列
function pagedTable(columns, rows, footer) {
  const pid = 'pg' + (++__pagedSeq);
  __paged[pid] = { columns, rows, footer, page: 1 };
  return `<div id="${pid}">${pagedInner(pid)}</div>`;
}
function pagedInner(pid) {
  const s = __paged[pid];
  const total = s.rows.length;
  const pages = Math.max(Math.ceil(total / PAGE_SIZE), 1);
  s.page = Math.min(Math.max(s.page, 1), pages);
  const from = (s.page - 1) * PAGE_SIZE;
  const slice = s.rows.slice(from, from + PAGE_SIZE);
  let pager = '';
  if (total > PAGE_SIZE) {
    const btn = (label, page, disabled) =>
      `<button class="btn ghost sm" ${disabled ? 'disabled' : ''} onclick="pagedGo('${pid}',${page})">${label}</button>`;
    // 頁碼最多列 7 個，目前頁置中
    let start = Math.max(1, Math.min(s.page - 3, pages - 6));
    const nums = [];
    for (let i = start; i <= Math.min(start + 6, pages); i++) {
      nums.push(i === s.page
        ? `<button class="btn sm" disabled style="opacity:1">${i}</button>`
        : `<button class="btn ghost sm" onclick="pagedGo('${pid}',${i})">${i}</button>`);
    }
    pager = `<div class="pager">
      <span class="pager-info">第 ${from + 1}–${Math.min(from + PAGE_SIZE, total)} 筆，共 ${total} 筆</span>
      <span class="pager-btns">${btn('上一頁', s.page - 1, s.page <= 1)}${nums.join('')}${btn('下一頁', s.page + 1, s.page >= pages)}</span>
    </div>`;
  }
  return tableHtml(s.columns, slice, s.footer) + pager;
}
function pagedGo(pid, page) {
  const s = __paged[pid];
  const el = document.getElementById(pid);
  if (!s || !el) return;
  s.page = page;
  el.innerHTML = pagedInner(pid);
}

/* ============================================================
   各模組
   ============================================================ */
const MODULES = {};

/* ── 客戶基本資料表 ─────────────────────────────────── */
MODULES.customer = {
  title: '客戶基本資料', perm: 'perm_customer',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 客戶編號 / 姓名 / 手機 / 公司',
      defaultHint: '請輸入關鍵字查詢明細如下：' });
    addImportButtons('customer');
    setTopAction('＋ 新增客戶', () => this.form());
    const doSearch = async () => {
      const q = document.getElementById('searchInput').value.trim();
      const rows = await api('/api/customers?q=' + encodeURIComponent(q));
      document.getElementById('listArea').innerHTML = pagedTable([
        { key: 'cust_id', label: '客戶編號', render: r => `<a class="link" onclick="MODULES.customer.detail('${r.cust_id}')">${esc(r.cust_id)}</a>` },
        { key: 'name', label: '客戶姓名' },
        { key: 'mobile', label: '手機' },
        { key: 'status', label: '系統狀態', render: r => statusBadge(r.status) },
      ], rows);
    };
    document.getElementById('searchBtn').onclick = doSearch;
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  },
  async detail(id) {
    const c = await api('/api/customers/' + id);
    openModal('客戶明細 ' + c.cust_id, `<dl class="dl">
      <dt>客戶編號</dt><dd>${esc(c.cust_id)}</dd>
      <dt>客戶姓名</dt><dd>${esc(c.name)}</dd>
      <dt>手機</dt><dd>${esc(c.mobile)}</dd>
      <dt>任職公司</dt><dd>${esc(c.company)}</dd>
      <dt>任職職稱</dt><dd>${esc(c.job_title)}</dd>
      <dt>公司電話</dt><dd>${esc(c.company_phone)}</dd>
      <dt>公司信箱</dt><dd>${esc(c.company_email)}</dd>
      <dt>公司地址</dt><dd>${esc(c.company_addr)}</dd>
      <dt>家裡電話</dt><dd>${esc(c.home_phone)}</dd>
      <dt>家裡地址</dt><dd>${esc(c.home_addr)}</dd>
      <dt>連絡地址</dt><dd>${esc(c.contact_addr)}</dd>
      <dt>備註</dt><dd>${esc(c.note)}</dd>
      <dt>系統狀態</dt><dd>${statusBadge(c.status)}</dd>
      <dt>填表人</dt><dd>${esc(c.created_by_name || c.created_by)}</dd>
      <dt>建立日期</dt><dd>${fmtDT(c.created_at)}</dd>
      <dt>最後修改日期</dt><dd>${fmtDT(c.updated_at)}</dd>
      <dt>維護窗口</dt><dd>${esc(c.maintainer_name || c.maintainer)}</dd>
    </dl>`, `<button class="btn ghost" onclick="closeModal()">關閉</button>
      <button class="btn" onclick="MODULES.customer.form('${c.cust_id}')">修改</button>
      <button class="btn danger" onclick="MODULES.customer.remove('${c.cust_id}')">刪除</button>`);
  },
  async form(id) {
    const c = id ? await api('/api/customers/' + id) : {};
    const emps = await getLookup('employees');
    openForm({
      title: id ? '修改客戶 ' + id : '新增客戶',
      fields: [
        { name: 'name', label: '客戶姓名', required: true, value: c.name },
        { name: 'mobile', label: '手機', required: true, value: c.mobile },
        { name: 'company', label: '任職公司', value: c.company },
        { name: 'job_title', label: '任職職稱', value: c.job_title },
        { name: 'company_phone', label: '公司電話', value: c.company_phone },
        { name: 'company_email', label: '公司信箱', value: c.company_email },
        { name: 'company_addr', label: '公司地址', full: true, value: c.company_addr },
        { name: 'home_phone', label: '家裡電話', value: c.home_phone },
        { name: 'home_addr', label: '家裡地址', value: c.home_addr },
        { name: 'contact_addr', label: '連絡地址', full: true, value: c.contact_addr },
        { name: 'maintainer', label: '維護窗口', type: 'select', options: options(emps, 'emp_id', 'name', c.maintainer || USER.emp_id) },
        { name: 'status', label: '系統狀態', type: 'select', options: statusSelectOptions(['正常', '拒絕往來'], c.status || '正常') },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: c.note },
      ],
      onSubmit: async (v) => {
        if (id) await api('/api/customers/' + id, { method: 'PUT', body: v });
        else await api('/api/customers', { method: 'POST', body: v });
        MODULES.customer.render();
      },
    });
  },
  remove(id) {
    confirmDelete('確定刪除客戶 ' + id + '？', async () => {
      try { await api('/api/customers/' + id, { method: 'DELETE' }); closeModal(); MODULES.customer.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── 廠商基本資料表 ─────────────────────────────────── */
MODULES.vendor = {
  title: '廠商基本資料', perm: 'perm_vendor',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 廠商編號 / 公司 / 業務 / 營業項目 / 手機',
      defaultHint: '請輸入關鍵字查詢明細如下：' });
    addImportButtons('vendor');
    setTopAction('＋ 新增廠商', () => this.form());
    const doSearch = async () => {
      const q = document.getElementById('searchInput').value.trim();
      const rows = await api('/api/vendors?q=' + encodeURIComponent(q));
      document.getElementById('listArea').innerHTML = pagedTable([
        { key: 'vend_id', label: '廠商編號', render: r => `<a class="link" onclick="MODULES.vendor.detail('${r.vend_id}')">${esc(r.vend_id)}</a>` },
        { key: 'company_name', label: '公司名稱' },
        { key: 'sales_name', label: '業務姓名' },
        { key: 'business_item', label: '營業項目' },
        { key: 'mobile', label: '手機' },
        { key: 'status', label: '系統狀態', render: r => statusBadge(r.status) },
      ], rows);
    };
    document.getElementById('searchBtn').onclick = doSearch;
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });
  },
  async detail(id) {
    const v = await api('/api/vendors/' + id);
    openModal('廠商明細 ' + v.vend_id, `<dl class="dl">
      <dt>廠商編號</dt><dd>${esc(v.vend_id)}</dd>
      <dt>公司名稱</dt><dd>${esc(v.company_name)}</dd>
      <dt>公司統編</dt><dd>${esc(v.tax_id)}</dd>
      <dt>業務姓名</dt><dd>${esc(v.sales_name)}</dd>
      <dt>任職職稱</dt><dd>${esc(v.job_title)}</dd>
      <dt>手機</dt><dd>${esc(v.mobile)}</dd>
      <dt>營業項目</dt><dd>${esc(v.business_item)}</dd>
      <dt>結帳方式</dt><dd>${esc(v.payment_method)}</dd>
      <dt>公司電話</dt><dd>${esc(v.company_phone)}</dd>
      <dt>公司信箱</dt><dd>${esc(v.company_email)}</dd>
      <dt>公司地址</dt><dd>${esc(v.company_addr)}</dd>
      <dt>備註</dt><dd>${esc(v.note)}</dd>
      <dt>系統狀態</dt><dd>${statusBadge(v.status)}</dd>
      <dt>填表人</dt><dd>${esc(v.created_by_name || v.created_by)}</dd>
      <dt>建立日期</dt><dd>${fmtDT(v.created_at)}</dd>
      <dt>最後修改日期</dt><dd>${fmtDT(v.updated_at)}</dd>
      <dt>維護窗口</dt><dd>${esc(v.maintainer_name || v.maintainer)}</dd>
    </dl>`, `<button class="btn ghost" onclick="closeModal()">關閉</button>
      <button class="btn" onclick="MODULES.vendor.form('${v.vend_id}')">修改</button>
      <button class="btn danger" onclick="MODULES.vendor.remove('${v.vend_id}')">刪除</button>`);
  },
  async form(id) {
    const v = id ? await api('/api/vendors/' + id) : {};
    const emps = await getLookup('employees');
    // 直接抓最新清單 (不吃快取)，確保與「項目維護」即時連動
    const [bizOpts, payOpts] = [await api('/api/options/vendor_business'), await api('/api/options/vendor_payment')];
    openForm({
      title: id ? '修改廠商 ' + id : '新增廠商',
      fields: [
        { name: 'company_name', label: '公司名稱', required: true, value: v.company_name },
        { name: 'tax_id', label: '公司統編', value: v.tax_id },
        { name: 'sales_name', label: '業務姓名', required: true, value: v.sales_name },
        { name: 'job_title', label: '任職職稱', value: v.job_title },
        { name: 'mobile', label: '手機', required: true, value: v.mobile },
        { name: 'business_item', label: '營業項目（可複選）', full: true, type: 'multicheck', list: bizOpts, value: v.business_item },
        { name: 'payment_method', label: '結帳方式', type: 'select', options: optionsFromList(payOpts, v.payment_method) },
        { name: 'company_phone', label: '公司電話', value: v.company_phone },
        { name: 'company_email', label: '公司信箱', value: v.company_email },
        { name: 'company_addr', label: '公司地址', full: true, value: v.company_addr },
        { name: 'maintainer', label: '維護窗口', type: 'select', options: options(emps, 'emp_id', 'name', v.maintainer || USER.emp_id) },
        { name: 'status', label: '系統狀態', type: 'select', options: statusSelectOptions(['正常', '拒絕往來'], v.status || '正常') },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: v.note },
      ],
      onSubmit: async (val) => {
        if (id) await api('/api/vendors/' + id, { method: 'PUT', body: val });
        else await api('/api/vendors', { method: 'POST', body: val });
        MODULES.vendor.render();
      },
    });
  },
  remove(id) {
    confirmDelete('確定刪除廠商 ' + id + '？', async () => {
      try { await api('/api/vendors/' + id, { method: 'DELETE' }); closeModal(); MODULES.vendor.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── 專案管理資料表 ─────────────────────────────────── */
MODULES.project = {
  title: '專案管理資料', perm: 'perm_project',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 專案名稱',
      defaultHint: '預設顯示「您負責且進行中」的專案，依開工日期遞減；搜尋關鍵字將涵蓋所有專案(含結案)。' });
    setTopAction('＋ 新增專案', () => this.form());
    // 匯出全部 CSV (含階段/變更單/日誌/附件)：僅會計權限可見，後端也會再檢查一次權限
    if (USER.perm_admin || USER.perm_accounting) {
      addTopAction('匯出全部CSV', () => this.exportAllCSV());
    }
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async exportAllCSV() {
    try {
      const res = await fetch('/api/projects/export-all/csv');
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '匯出失敗。');
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename\*=UTF-8''([^;]+)/.exec(cd);
      const name = m ? decodeURIComponent(m[1]) : `專案管理資料_全部_${new Date().toISOString().slice(0, 10)}.csv`;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    } catch (e) { alert(e.message); }
  },
  async load(q) {
    const rows = await api('/api/projects?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'proj_id', label: '專案編號', render: r => `<a class="link" onclick="MODULES.project.detail('${r.proj_id}')">${esc(r.proj_id)}</a>` },
      { key: 'proj_name', label: '專案名稱' },
      { key: 'cust_name', label: '客戶名稱' },
      { key: 'sales_name', label: '業務姓名' },
      { key: 'start_date', label: '開工日期', render: r => fmtDate(r.start_date) },
      { key: 'owner_name', label: '專案負責人' },
      { key: '_prog', label: '進度', render: r => {
        if (!r.stage_total) return '<span class="hint">—</span>';
        const pct = Math.round(r.stage_done / r.stage_total * 100);
        return `<div class="prog"><div class="prog-bar"><div class="prog-fill" style="width:${pct}%"></div></div>
          <span class="prog-txt">${r.stage_done}/${r.stage_total}</span></div>`;
      } },
      { key: 'status', label: '系統狀態', render: r => statusBadge(r.status) },
    ], rows);
  },
  async detail(id) {
    const p = await api('/api/projects/' + id);
    const logRows = (p.logs || []).map(l => `<tr>
      <td>${fmtDate(l.log_date)}</td><td>${esc(l.progress)}</td><td>${esc(l.note)}</td>
      <td>${esc(l.created_by_name || l.created_by)}</td>
      <td><button class="btn danger sm" onclick="MODULES.project.delLog('${id}',${l.log_id})">刪</button></td></tr>`).join('')
      || `<tr><td colspan="5" class="empty">尚無日誌</td></tr>`;
    openModal('專案明細 ' + p.proj_id, `
      <div class="detail-actions">
        <button class="btn" onclick="MODULES.project.form('${p.proj_id}')">修改</button>
        <button class="btn danger" onclick="MODULES.project.remove('${p.proj_id}')">刪除</button>
      </div>
      <dl class="dl">
      <dt>專案編號</dt><dd>${esc(p.proj_id)}</dd>
      <dt>專案名稱</dt><dd>${esc(p.proj_name)}</dd>
      <dt>客戶</dt><dd>${esc(p.cust_id)} ${esc(p.cust_name || '')}</dd>
      <dt>開工日期</dt><dd>${fmtDate(p.start_date)}</dd>
      <dt>結束日期</dt><dd>${fmtDate(p.end_date)}</dd>
      <dt>保固期限</dt><dd>${esc(p.warranty)}</dd>
      <dt>裝修地址</dt><dd>${esc(p.addr)}</dd>
      <dt>專案狀態</dt><dd>${esc(p.proj_status)}</dd>
      <dt>系統狀態</dt><dd>${statusBadge(p.status)}</dd>
      <dt>專案負責人</dt><dd>${esc(p.owner_name || p.owner)}</dd>
      <dt>業務(填表人)</dt><dd>${esc(p.created_by_name || p.created_by)}</dd>
      <dt>建立日期</dt><dd>${fmtDT(p.created_at)}</dd>
      <dt>備註</dt><dd>${esc(p.note)}</dd>
    </dl>
    <div class="section-title">進度追蹤 (甘特圖)
      <button class="btn sm" style="float:right" onclick="MODULES.project.stageForm('${id}')">＋ 新增階段</button></div>
    ${stageSection(p)}
    <div class="section-title">追加減帳 (變更單)
      <button class="btn sm" style="float:right" onclick="MODULES.project.changeForm('${id}')">＋ 新增變更單</button></div>
    ${changeSection(p)}
    <div class="section-title">專案日誌 (子表單)
      <button class="btn sm" style="float:right" onclick="MODULES.project.addLog('${id}')">＋ 新增日誌</button></div>
    <table class="subtable"><thead><tr><th>建檔日期</th><th>進度說明</th><th>備註</th><th>填表人</th><th></th></tr></thead>
      <tbody>${logRows}</tbody></table>
    <div class="section-title">結案附件</div>
    <div id="fileArea"><div class="hint">載入中...</div></div>
    <div class="section-title">應收款項 (本專案)</div>
    ${projArTable(p.receivables || [])}
    <div class="section-title">應付款項 (本專案)</div>
    ${projApTable(p.payables || [])}
    <div class="section-title">維修工單 (本專案)</div>
    ${projRepairTable(p.repairs || [])}`,
      `<button class="btn ghost" onclick="closeModal()">關閉</button>`);
    this.loadFiles(id, p.status);
  },

  /* ── 結案附件：僅「結案」專案可上傳；下載/刪除限系統管理者 ── */
  async loadFiles(id, status) {
    const area = document.getElementById('fileArea');
    if (!area) return;
    const closed = ['結案', '已結案'].includes(status);
    try {
      const r = await api('/api/projects/' + id + '/files');
      const rows = r.files.map(f => `<tr>
        <td>${esc(f.orig_name)}</td>
        <td class="num">${fileSize(f.size_bytes)}</td>
        <td>${esc(f.uploaded_by_name || f.uploaded_by || '')}</td>
        <td>${fmtDT(f.uploaded_at)}</td>
        <td>${r.can_download ? `<div class="row-actions">
              <button class="btn sm" onclick="MODULES.project.download('${id}',${f.file_id},'${esc(f.orig_name).replace(/'/g, "\\'")}')">下載</button>
              <button class="btn danger sm" onclick="MODULES.project.delFile('${id}',${f.file_id})">刪</button>
            </div>` : '<span class="hint">僅管理者可下載</span>'}</td></tr>`).join('')
        || `<tr><td colspan="5" class="empty">尚無附件</td></tr>`;
      area.innerHTML = `
        ${closed ? `<div class="toolbar" style="margin-bottom:10px">
            <input type="file" id="fileInput" multiple>
            <button class="btn" id="fileUploadBtn">上傳</button>
          </div>` : `<div class="hint" style="margin-bottom:10px">
            專案系統狀態為「結案」後才能上傳附件。</div>`}
        ${r.drive_ready ? '' : '<div class="hint" style="color:var(--danger);margin-bottom:10px">雲端硬碟尚未設定完成，暫時無法上傳。</div>'}
        <table class="subtable"><thead><tr><th>檔名</th><th class="num">大小</th><th>上傳者</th><th>上傳時間</th><th></th></tr></thead>
          <tbody>${rows}</tbody></table>
        <div class="hint" style="margin-top:6px">檔案存放於公司 Google Drive，依專案編號分資料夾；單檔上限 10MB。</div>`;
      const btn = document.getElementById('fileUploadBtn');
      if (btn) btn.onclick = () => this.upload(id);
    } catch (e) {
      area.innerHTML = `<div class="hint" style="color:var(--danger)">${esc(e.message)}</div>`;
    }
  },
  async upload(id) {
    const input = document.getElementById('fileInput');
    const btn = document.getElementById('fileUploadBtn');
    if (!input.files.length) { alert('請先選擇檔案。'); return; }
    btn.disabled = true;
    try {
      let n = 0;
      for (const file of Array.from(input.files)) {
        if (file.size > 10 * 1024 * 1024) { alert(`「${file.name}」超過 10MB，已略過。`); continue; }
        btn.textContent = `上傳中 ${++n}/${input.files.length}...`;
        const data = await new Promise((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(String(fr.result).split(',').pop());
          fr.onerror = () => reject(new Error('讀取檔案失敗。'));
          fr.readAsDataURL(file);
        });
        await api('/api/projects/' + id + '/files', {
          method: 'POST',
          body: { name: file.name, mime: file.type || 'application/octet-stream', data },
        });
      }
      alert('上傳完成。');
      const p = await api('/api/projects/' + id);
      this.loadFiles(id, p.status);
    } catch (e) {
      alert('上傳失敗：' + e.message);
      btn.disabled = false; btn.textContent = '上傳';
    }
  },
  async download(id, fileId, name) {
    try {
      const res = await fetch(`/api/projects/${id}/files/${fileId}/download`);
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || '下載失敗');
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
    } catch (e) { alert(e.message); }
  },
  delFile(id, fileId) {
    confirmDelete('確定刪除這個附件？(雲端檔案會移到 Google Drive 垃圾桶)', async () => {
      try {
        await api(`/api/projects/${id}/files/${fileId}`, { method: 'DELETE' });
        const p = await api('/api/projects/' + id);
        MODULES.project.loadFiles(id, p.status);
      } catch (e) { alert(e.message); }
    });
  },
  async form(id) {
    const p = id ? await api('/api/projects/' + id) : {};
    const emps = await getLookup('employees');
    const iso = (d) => d.toISOString().slice(0, 10);
    let fields;
    if (!id) {
      // 新增：隱藏 專案狀態/系統狀態/結束日期/保固期限；提供「已確認報價單」帶入
      const [custs, cquotes] = [await getLookup('customers'), await getLookup('confirmed-quotes')];
      window.__confirmedQuotes = cquotes;
      const quoteOpts = '<option value="">— 不帶入 —</option>' +
        cquotes.map(q => `<option value="${esc(q.quote_id)}">${esc(q.proj_name || '')}${q.cust_name ? '（' + esc(q.cust_name) + '）' : ''}</option>`).join('');
      fields = [
        { name: '_from_quote', label: '從「已確認」報價單挑選專案名稱帶入（含客戶、裝修地址）', full: true, type: 'select', options: quoteOpts, onchange: 'projFillFromQuote(this)' },
        { name: 'proj_name', label: '專案名稱', required: true, full: true, value: p.proj_name },
        { name: 'cust_id', label: '客戶', type: 'select', options: options(custs, 'cust_id', 'name', p.cust_id) },
        { name: 'owner', label: '專案負責人', type: 'select', options: options(emps, 'emp_id', 'name', p.owner || USER.emp_id) },
        { name: 'start_date', label: '開工日期', type: 'date', value: iso(new Date()) },
        { name: 'end_date', label: '預定完工日期', type: 'date', hint: '供進度追蹤分配階段日期，可留空' },
        { name: 'stage_count', label: '進度追蹤：分幾個階段', type: 'select',
          options: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(n2 => `<option value="${n2}" ${n2 === 5 ? 'selected' : ''}>${n2 === 0 ? '不建立' : n2 + ' 個階段'}</option>`).join(''),
          hint: '自動以「專案狀態」清單命名並平均分配預定完成日期(無完工日則每階段14天)，建立後可修改' },
        { name: 'addr', label: '裝修地址', full: true, value: p.addr },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: p.note },
      ];
    } else {
      // 修改：顯示全部欄位（不含報價單帶入）；專案名稱與客戶不可修改
      // 專案狀態下拉(由項目維護管理，保留既有值)
      let psOpts = await api('/api/options/project_status');
      const curPs = p.proj_status || '準備進場';
      if (curPs && !psOpts.includes(curPs)) psOpts = [curPs, ...psOpts];
      fields = [
        { name: 'proj_name', label: '專案名稱', required: true, full: true, readonly: true, value: p.proj_name },
        { name: 'cust_id', label: '客戶（不可修改）', type: 'locked', value: p.cust_id, display: `${p.cust_id || ''} ${p.cust_name || ''}`.trim() },
        { name: 'owner', label: '專案負責人', type: 'select', options: options(emps, 'emp_id', 'name', p.owner) },
        { name: 'start_date', label: '開工日期', type: 'date', value: fmtDate(p.start_date) },
        { name: 'end_date', label: '結束日期', type: 'date', value: fmtDate(p.end_date) },
        { name: 'warranty', label: '保固期限', type: 'date', value: fmtDate(p.warranty) },
        { name: 'contract_amount', label: '原約金額', type: 'number', step: '1',
          value: p.contract_amount ? Math.round(Number(p.contract_amount)) : '', hint: '追加減帳的基準金額，非必填' },
        { name: 'addr', label: '裝修地址', full: true, value: p.addr },
        { name: 'proj_status', label: '專案狀態', type: 'select', options: optionsFromList(psOpts, curPs) },
        { name: 'status', label: '系統狀態', type: 'select', options: statusSelectOptions(['進行中', '停工', '結案'], p.status || '進行中') },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: p.note },
      ];
    }
    openForm({
      title: id ? '修改專案 ' + id : '新增專案',
      fields,
      onSubmit: async (v) => {
        delete v._from_quote;
        const closing = id && v.status === '結案' && p.status !== '結案';  // 這次才改成結案
        if (id) await api('/api/projects/' + id, { method: 'PUT', body: v });
        else await api('/api/projects', { method: 'POST', body: v });
        MODULES.project.render();
        // 結案時提示上傳附件 (也可日後再補傳)
        if (closing && confirm('專案已結案。要現在上傳結案附件嗎？\n(按「取消」可日後從專案明細再上傳)')) {
          await MODULES.project.detail(id);
        }
      },
    });
  },
  // 進度追蹤：新增/修改階段 (sid 省略＝新增)
  async stageForm(id, sid) {
    const p = await api('/api/projects/' + id);
    const st = sid ? (p.stages || []).find(s => String(s.stage_id) === String(sid)) : null;
    if (sid && !st) { alert('查無此階段。'); return; }
    const maxNo = (p.stages || []).length + (sid ? 0 : 1);
    openForm({
      title: sid ? `維護階段（${st.stage_name}）` : '新增階段',
      fields: [
        { name: 'seq_no', label: 'NO（順序）', type: 'number', step: '1', value: st ? st.seq_no : maxNo, hint: '改數字即可調整順序' },
        { name: 'stage_name', label: '階段名稱', required: true, value: st?.stage_name },
        { name: 'planned_end', label: '預定完成日期', type: 'date', value: fmtDate(st?.planned_end) },
        { name: 'actual_end', label: '實際完成日期', type: 'date', value: fmtDate(st?.actual_end), hint: '完成後填入，甘特圖與進度依此計算' },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: st?.note },
      ],
      onSubmit: async (v) => {
        if (sid) await api(`/api/projects/${id}/stages/${sid}`, { method: 'PUT', body: v });
        else await api(`/api/projects/${id}/stages`, { method: 'POST', body: v });
        MODULES.project.detail(id);
      },
    });
  },
  delStage(id, sid) {
    confirmDelete('確定刪除這個階段？', async () => {
      await api(`/api/projects/${id}/stages/${sid}`, { method: 'DELETE' });
      MODULES.project.detail(id);
    });
  },
  // 追加減帳：新增/修改變更單 (金額 正=追加、負=減帳)
  async changeForm(id, cid) {
    const p = await api('/api/projects/' + id);
    const c = cid ? (p.changes || []).find(x => String(x.change_id) === String(cid)) : null;
    if (cid && !c) { alert('查無此變更單。'); return; }
    openForm({
      title: cid ? '修改變更單' : '新增變更單（追加減帳）',
      fields: [
        { name: 'co_date', label: '變更日期', type: 'date', value: fmtDate(c?.co_date) || new Date().toISOString().slice(0, 10) },
        { name: 'amount', label: '金額（正＝追加、負＝減帳）', type: 'number', step: '1', required: true, value: c ? Math.round(Number(c.amount)) : '' },
        { name: 'description', label: '變更說明', required: true, full: true, value: c?.description },
        { name: 'status', label: '狀態', type: 'select', options: statusSelectOptions(['已確認', '待確認', '作廢'], c?.status || '已確認') },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: c?.note },
      ],
      onSubmit: async (v) => {
        if (cid) await api(`/api/projects/${id}/changes/${cid}`, { method: 'PUT', body: v });
        else await api(`/api/projects/${id}/changes`, { method: 'POST', body: v });
        MODULES.project.detail(id);
      },
    });
  },
  delChange(id, cid) {
    confirmDelete('確定刪除這張變更單？', async () => {
      await api(`/api/projects/${id}/changes/${cid}`, { method: 'DELETE' });
      MODULES.project.detail(id);
    });
  },
  addLog(id) {
    openForm({
      title: '新增專案日誌',
      fields: [
        { name: 'log_date', label: '建檔日期', type: 'date', value: new Date().toISOString().slice(0, 10) },
        { name: 'progress', label: '進度說明', type: 'textarea', full: true },
        { name: 'note', label: '備註', type: 'textarea', full: true },
      ],
      onSubmit: async (v) => { await api(`/api/projects/${id}/logs`, { method: 'POST', body: v }); MODULES.project.detail(id); },
    });
  },
  delLog(id, logId) {
    confirmDelete('警告!!該筆專案日誌資料刪除後無法複原！', async () => { await api(`/api/projects/${id}/logs/${logId}`, { method: 'DELETE' }); MODULES.project.detail(id); });
  },
  remove(id) {
    confirmDelete('警告!!該筆專案資料刪除後，包含專案日誌均無法複原！', async () => {
      try { await api('/api/projects/' + id, { method: 'DELETE' }); closeModal(); MODULES.project.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── 專案進度追蹤：甘特圖 + 階段列表 ─────────────────── */
// 階段狀態文字：已完成(綠) / 逾期(紅) / 進行中
function stageStatus(st) {
  const today = new Date().toISOString().slice(0, 10);
  if (st.actual_end) {
    const late = st.planned_end && fmtDate(st.actual_end) > fmtDate(st.planned_end);
    return `<span class="badge ${late ? 'amber' : 'green'}">完成${late ? '(晚)' : ''}</span>`;
  }
  if (st.planned_end && fmtDate(st.planned_end) < today) return '<span class="badge red">逾期</span>';
  return '<span class="badge blue">進行中</span>';
}

// 甘特圖 + 階段列表 (放在專案明細)
function stageSection(p) {
  const stages = p.stages || [];
  if (!stages.length) return '<div class="hint" style="margin-bottom:8px">尚未建立階段，按右上「＋ 新增階段」開始。</div>';

  // 時間軸範圍：開工日(或最早日期) ～ 最晚的預定/實際/今天
  const today = new Date().toISOString().slice(0, 10);
  const dates = [fmtDate(p.start_date), today];
  stages.forEach(s => { dates.push(fmtDate(s.planned_end), fmtDate(s.actual_end)); });
  const valid = dates.filter(Boolean).map(d => Date.parse(d));
  const min = Math.min(...valid), max = Math.max(...valid);
  const span = Math.max(max - min, 86400000);
  const pct = (d) => Math.min(Math.max((Date.parse(d) - min) / span * 100, 0), 100);
  const start = fmtDate(p.start_date) || new Date(min).toISOString().slice(0, 10);

  let prev = start;   // 每階段的橫桿從上一階段預定日開始 (第一階段從開工日)
  const rows = stages.map(s => {
    const pEnd = fmtDate(s.planned_end), aEnd = fmtDate(s.actual_end);
    const from = prev; if (pEnd) prev = pEnd;
    const left = pct(from);
    const planW = pEnd ? Math.max(pct(pEnd) - left, 1.5) : 0;
    const actW = aEnd ? Math.max(pct(aEnd) - left, 1.5) : 0;
    const overdue = !aEnd && pEnd && pEnd < today;
    return `<div class="g-row">
      <div class="g-label">${s.seq_no}. ${esc(s.stage_name)}</div>
      <div class="g-track">
        ${pEnd ? `<div class="g-bar plan ${overdue ? 'late' : ''}" style="left:${left}%;width:${planW}%" title="預定 ${pEnd}"></div>` : ''}
        ${aEnd ? `<div class="g-bar actual ${pEnd && aEnd > pEnd ? 'late' : ''}" style="left:${left}%;width:${actW}%" title="實際 ${aEnd}"></div>` : ''}
        <div class="g-today" style="left:${pct(today)}%" title="今天 ${today}"></div>
      </div>
      <div class="g-date">${pEnd || '—'}</div>
    </div>`;
  }).join('');

  const table = `<table class="subtable"><thead><tr><th>NO</th><th>階段名稱</th><th>預定完成</th><th>實際完成</th><th>狀態</th><th>備註</th><th></th></tr></thead>
    <tbody>${stages.map(s => `<tr>
      <td class="num">${s.seq_no}</td>
      <td>${esc(s.stage_name)}</td>
      <td>${fmtDate(s.planned_end)}</td>
      <td>${fmtDate(s.actual_end)}</td>
      <td>${stageStatus(s)}</td>
      <td>${esc(s.note)}</td>
      <td><div class="row-actions">
        <button class="btn sm" onclick="MODULES.project.stageForm('${p.proj_id}',${s.stage_id})">維護</button>
        <button class="btn danger sm" onclick="MODULES.project.delStage('${p.proj_id}',${s.stage_id})">刪</button>
      </div></td></tr>`).join('')}</tbody></table>`;

  const done = stages.filter(s => s.actual_end).length;
  return `<div class="gantt">
      <div class="g-head"><span>開工 ${start}</span>
        <span>完成 ${done}/${stages.length}（${Math.round(done / stages.length * 100)}%）</span>
        <span>${new Date(max).toISOString().slice(0, 10)}</span></div>
      ${rows}
      <div class="g-legend"><i class="lg plan"></i>預定 <i class="lg actual"></i>實際完成 <i class="lg latebox"></i>逾期/延遲 <i class="lg todayline"></i>今天</div>
    </div>${table}`;
}

// 追加減帳區塊：原約金額 + 已確認變更合計 = 現行合約金額
function changeSection(p) {
  const chs = p.changes || [];
  const n = (v) => Math.round(Number(v)) || 0;
  const confirmed = chs.filter(c => c.status === '已確認').reduce((s, c) => s + n(c.amount), 0);
  const contract = p.contract_amount !== null && p.contract_amount !== undefined ? n(p.contract_amount) : null;
  const amtCell = (v) => `<span class="${Number(v) < 0 ? 'neg-num' : ''}">${Number(v) > 0 ? '+' : ''}${money(v)}</span>`;
  const summary = `<div class="hint" style="margin-bottom:8px">
    原約金額 <b>${contract === null ? '未設定（可在「修改」填寫）' : money(contract)}</b>
    ＋ 已確認追加減 <b>${confirmed >= 0 ? '+' : ''}${money(confirmed)}</b>
    ＝ 現行合約金額 <b>${contract === null ? '—' : money(contract + confirmed)}</b></div>`;
  if (!chs.length) return summary + '<div class="hint" style="margin-bottom:8px">尚無變更單。</div>';
  return summary + `<div class="subtable-wrap"><table class="subtable">
    <thead><tr><th>變更日期</th><th>變更說明</th><th class="num">金額(±)</th><th>狀態</th><th>備註</th><th>填表人</th><th></th></tr></thead>
    <tbody>${chs.map(c => `<tr>
      <td>${fmtDate(c.co_date)}</td><td>${esc(c.description)}</td>
      <td class="num">${amtCell(c.amount)}</td>
      <td>${statusBadge(c.status)}</td><td>${esc(c.note)}</td>
      <td>${esc(c.created_by_name || c.created_by)}</td>
      <td><div class="row-actions">
        <button class="btn sm" onclick="MODULES.project.changeForm('${p.proj_id}',${c.change_id})">修改</button>
        <button class="btn danger sm" onclick="MODULES.project.delChange('${p.proj_id}',${c.change_id})">刪</button>
      </div></td></tr>`).join('')}</tbody></table></div>`;
}

// 專案明細：本專案的維修工單子表單
function projRepairTable(rows) {
  if (!rows.length) return '<div class="hint" style="margin-bottom:8px">本專案尚無維修工單。</div>';
  return `<div class="subtable-wrap"><table class="subtable">
    <thead><tr><th>維修單號</th><th>報修日期</th><th>問題描述</th><th>負責人</th><th>預計處理日</th><th>狀態</th><th>完修日期</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td><a class="link" onclick="MODULES.repair.detail('${r.ro_id}')">${esc(r.ro_id)}</a></td>
      <td>${fmtDate(r.reported_date)}</td><td>${esc(r.issue)}</td>
      <td>${esc(r.assignee_name)}</td><td>${fmtDate(r.scheduled_date)}</td>
      <td>${statusBadge(r.status)}</td><td>${fmtDate(r.completed_date)}</td></tr>`).join('')}</tbody></table></div>`;
}

// 專案明細：本專案的應收款項子表單 (含合計)
function projArTable(rows) {
  if (!rows.length) return '<div class="hint" style="margin-bottom:8px">本專案尚無應收款項。</div>';
  const sum = (k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  return `<div class="subtable-wrap"><table class="subtable">
    <thead><tr><th>收款單號</th><th>應收日期</th><th>項目</th><th class="num">應收金額</th>
      <th class="num">5%稅額</th><th>狀態</th><th>收款日期</th><th class="num">實收金額</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${esc(r.ar_id)}</td><td>${fmtDate(r.due_date)}</td>
      <td>${esc(r.item)}${r.is_retention ? ' <span class="badge amber">保留款</span>' : ''}</td>
      <td class="num">${money(r.amount)}</td><td class="num">${money(r.tax)}</td>
      <td>${statusBadge(r.status)}</td><td>${fmtDate(r.received_date)}</td>
      <td class="num">${money(r.received_amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="3" class="right">合計</th><th class="num">${money(sum('amount'))}</th>
      <th class="num">${money(sum('tax'))}</th><th></th><th></th>
      <th class="num">${money(sum('received_amount'))}</th></tr></tfoot></table></div>`;
}
// 專案明細：本專案的應付款項子表單 (含合計)
function projApTable(rows) {
  if (!rows.length) return '<div class="hint" style="margin-bottom:8px">本專案尚無應付款項。</div>';
  const sum = (k) => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0);
  return `<div class="subtable-wrap"><table class="subtable">
    <thead><tr><th>付款單號</th><th>廠商</th><th>項目</th><th class="num">應付金額</th>
      <th class="num">抵扣稅額</th><th>狀態</th><th>付款日期</th><th class="num">實付金額</th></tr></thead>
    <tbody>${rows.map(r => `<tr>
      <td>${esc(r.ap_id)}</td><td>${esc(r.vend_name)}</td><td>${esc(r.item)}</td>
      <td class="num">${money(r.amount)}</td><td class="num">${money(r.tax_deduct)}</td>
      <td>${statusBadge(r.status)}</td><td>${fmtDate(r.paid_date)}</td>
      <td class="num">${money(r.paid_amount)}</td></tr>`).join('')}</tbody>
    <tfoot><tr><th colspan="3" class="right">合計</th><th class="num">${money(sum('amount'))}</th>
      <th class="num">${money(sum('tax_deduct'))}</th><th></th><th></th>
      <th class="num">${money(sum('paid_amount'))}</th></tr></tfoot></table></div>`;
}

// 從已確認報價單帶入 專案名稱 / 客戶 / 裝修地址 (皆可再修改)
function projFillFromQuote(sel) {
  const q = (window.__confirmedQuotes || []).find(x => x.quote_id === sel.value);
  if (!q) return;
  const form = sel.closest('form');
  if (!form) return;
  const set = (name, val) => { const el = form.querySelector(`[name=${name}]`); if (el) el.value = val || ''; };
  set('proj_name', q.proj_name);
  set('cust_id', q.cust_id);
  set('addr', q.addr);
}

/* ── 保固維修工單 (報修 → 派工 → 完修) ───────────────── */
MODULES.repair = {
  title: '維修工單', perm: 'perm_project',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 單號 / 客戶 / 專案 / 問題',
      defaultHint: '預設顯示「未完修」的工單；搜尋涵蓋所有工單(含已完修)。' });
    setTopAction('＋ 新增維修單', () => this.form());
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async load(q) {
    const rows = await api('/api/repairs?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'ro_id', label: '維修單號', render: r => `<a class="link" onclick="MODULES.repair.detail('${r.ro_id}')">${esc(r.ro_id)}</a>` },
      { key: 'proj_id', label: '專案編號', render: r => r.proj_id
        ? `<a class="link" onclick="MODULES.project.detail('${r.proj_id}')">${esc(r.proj_id)}</a>` : '' },
      { key: 'reported_date', label: '報修日期', render: r => fmtDate(r.reported_date) },
      { key: 'cust_name', label: '客戶' },
      { key: 'proj_name', label: '原專案' },
      { key: 'issue', label: '問題描述' },
      { key: 'assignee_name', label: '負責人' },
      { key: 'scheduled_date', label: '預計處理日', render: r => fmtDate(r.scheduled_date) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
    ], rows);
  },
  async detail(id) {
    const r = await api('/api/repairs/' + id);
    openModal('維修單明細 ' + r.ro_id, `<dl class="dl">
      <dt>維修單號</dt><dd>${esc(r.ro_id)}</dd>
      <dt>報修日期</dt><dd>${fmtDate(r.reported_date)}</dd>
      <dt>客戶</dt><dd>${esc(r.cust_id)} ${esc(r.cust_name || '')}</dd>
      <dt>原專案</dt><dd>${esc(r.proj_id)} ${esc(r.proj_name || '')}</dd>
      <dt>問題描述</dt><dd>${esc(r.issue)}</dd>
      <dt>負責人</dt><dd>${esc(r.assignee_name || r.assignee)}</dd>
      <dt>預計處理日</dt><dd>${fmtDate(r.scheduled_date)}</dd>
      <dt>狀態</dt><dd>${statusBadge(r.status)}</dd>
      <dt>完修日期</dt><dd>${fmtDate(r.completed_date)}</dd>
      <dt>填表人</dt><dd>${esc(r.created_by_name || r.created_by)}</dd>
      <dt>備註</dt><dd>${esc(r.note)}</dd>
    </dl>`, `<button class="btn ghost" onclick="closeModal()">關閉</button>
      <button class="btn" onclick="MODULES.repair.form('${r.ro_id}')">修改</button>
      <button class="btn danger" onclick="MODULES.repair.remove('${r.ro_id}')">刪除</button>`);
  },
  async form(id) {
    const r = id ? await api('/api/repairs/' + id) : {};
    const [custs, projs, emps] = [await getLookup('customers'), await getLookup('projects'), await getLookup('employees')];
    openForm({
      title: id ? '修改維修單 ' + id : '新增維修單',
      fields: [
        { name: 'cust_id', label: '客戶', type: 'select', options: options(custs, 'cust_id', 'name', r.cust_id) },
        { name: 'proj_id', label: '原專案', type: 'select', options: options(projs, 'proj_id', 'proj_name', r.proj_id), hint: '非必填' },
        { name: 'reported_date', label: '報修日期', type: 'date', value: fmtDate(r.reported_date) || new Date().toISOString().slice(0, 10) },
        { name: 'assignee', label: '負責人（派工）', type: 'select', options: options(emps, 'emp_id', 'name', r.assignee) },
        { name: 'scheduled_date', label: '預計處理日', type: 'date', value: fmtDate(r.scheduled_date) },
        { name: 'status', label: '狀態', type: 'select', options: statusSelectOptions(['待處理', '派工中', '已完修'], r.status || '待處理') },
        { name: 'completed_date', label: '完修日期', type: 'date', value: fmtDate(r.completed_date), hint: '完修時填寫' },
        { name: 'issue', label: '問題描述', required: true, full: true, value: r.issue },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: r.note },
      ],
      onSubmit: async (v) => {
        if (id) await api('/api/repairs/' + id, { method: 'PUT', body: v });
        else await api('/api/repairs', { method: 'POST', body: v });
        MODULES.repair.render();
      },
    });
  },
  remove(id) {
    confirmDelete('確定刪除維修單 ' + id + '？', async () => {
      try { await api('/api/repairs/' + id, { method: 'DELETE' }); closeModal(); MODULES.repair.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── 操作紀錄 (僅系統管理者) ─────────────────────────── */
MODULES.audit = {
  title: '操作紀錄', perm: 'perm_admin',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 人員代號 / 姓名 / API 路徑',
      defaultHint: '顯示最近 1000 筆寫入動作（新增/修改/刪除；不含查詢與密碼內容）。' });
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async load(q) {
    const rows = await api('/api/admin/audit?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'at', label: '時間', render: r => fmtDT(r.at) },
      { key: 'emp_id', label: '人員', render: r => `${esc(r.emp_name || '')}${r.emp_id ? '（' + esc(r.emp_id) + '）' : ''}` },
      { key: 'method', label: '動作' },
      { key: 'path', label: '路徑' },
      { key: 'status', label: '結果', render: r => `<span class="badge ${r.status < 400 ? 'green' : 'red'}">${r.status}</span>` },
      { key: 'detail', label: '內容摘要', render: r => {
        const t = r.detail ? JSON.stringify(r.detail) : '';
        return `<span class="hint">${esc(t.length > 80 ? t.slice(0, 80) + '…' : t)}</span>`;
      } },
    ], rows);
  },
};

/* ── 報價單 ─────────────────────────────────────────── */
MODULES.quote = {
  title: '報價資料', perm: 'perm_quote',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 報價單號 / 客戶名稱',
      defaultHint: '預設明細採近二個月報價單，依報價日期遞減排序。' });
    setTopAction('＋ 新增報價單', () => this.form());
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async load(q) {
    const rows = await api('/api/quotes?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'quote_id', label: '報價單編號', render: r => `<a class="link" onclick="MODULES.quote.detail('${r.quote_id}')">${esc(r.quote_id)}</a>` },
      { key: 'cust_name', label: '客戶名稱' },
      { key: 'proj_name', label: '專案名稱' },
      { key: 'quote_date', label: '報價日期', render: r => fmtDate(r.quote_date) },
      { key: 'total', label: '金額', num: true, render: r => money(r.total) },
      { key: 'maintainer_name', label: '維護窗口' },
      { key: 'status', label: '系統狀態', render: r => statusBadge(r.status) },
    ], rows);
  },
  async detail(id) {
    const q = await api('/api/quotes/' + id);
    let total = 0, costTotal = 0;
    const itemRows = (q.items || []).map((it, i) => {
      const sub = Number(it.subtotal) || 0;
      const cost = Number(it.vendor_price) || 0;
      total += sub; costTotal += cost;
      return `<tr><td class="num">${it.seq_no || i + 1}</td>
        <td>${esc(it.item)}</td><td class="num">${money(it.unit_price)}</td><td>${esc(it.unit)}</td>
        <td class="num">${money(it.qty)}</td><td class="num">${money(sub)}</td>
        <td class="num">${money(cost)}</td><td class="num">${profitNum(sub - cost)}</td>
        <td class="num">${profitPct(sub - cost, sub)}</td><td>${esc(it.note)}</td></tr>`;
    }).join('') || `<tr><td colspan="10" class="empty">無明細</td></tr>`;
    const tax = q.tax_flag ? Math.round(total * 0.05) : 0;   // 稅金 (5% 或 0)
    const grand = total + tax;                                // 總計
    const profit = total - costTotal;                         // 利潤 = 小計合計 − 廠商報價合計
    openModal('報價單明細 ' + q.quote_id, `
    <div class="detail-actions">
      <button class="btn" onclick="MODULES.quote.duplicate('${q.quote_id}')">複製報價單</button>
    </div>
    <dl class="dl">
      <dt>報價單編號</dt><dd>${esc(q.quote_id)}</dd>
      <dt>客戶</dt><dd>${esc(q.cust_id)} ${esc(q.cust_name || '')}</dd>
      <dt>專案名稱</dt><dd>${esc(q.proj_name)}</dd>
      <dt>裝修地址</dt><dd>${esc(q.addr)}</dd>
      <dt>報價日期</dt><dd>${fmtDate(q.quote_date)}</dd>
      <dt>有效日期</dt><dd>${fmtDate(q.valid_date)}</dd>
      <dt>系統狀態</dt><dd>${statusBadge(q.status)}</dd>
      <dt>稅金</dt><dd>${q.tax_flag ? '計 5% 稅金 (V)' : '不計稅'}</dd>
      <dt>填表人</dt><dd>${esc(q.created_by_name || q.created_by)}</dd>
      <dt>維護窗口</dt><dd>${esc(q.maintainer_name || q.maintainer)}</dd>
      <dt>備註</dt><dd>${esc(q.note)}</dd>
    </dl>
    <div class="section-title">報價明細 (子表單)</div>
    <div class="subtable-wrap">
    <table class="subtable"><thead><tr><th class="num">NO</th><th>項目</th><th class="num">單價</th><th>單位</th><th class="num">數量</th>
      <th class="num">小計</th><th class="num">廠商報價</th><th class="num">利潤</th><th class="num">%</th><th>備註</th></tr></thead>
      <tbody>${itemRows}</tbody>
      <tfoot>
        <tr><th colspan="5" class="right">合計</th><th class="num">${money(total)}</th>
          <th class="num">${money(costTotal)}</th><th class="num">${profitNum(profit)}</th>
          <th class="num">${profitPct(profit, total)}</th><th></th></tr>
        <tr><th colspan="5" class="right">稅金 (${q.tax_flag ? '5%' : '免'})</th><th class="num">${money(tax)}</th><th colspan="4"></th></tr>
        <tr><th colspan="5" class="right">總計</th><th class="num">${money(grand)}</th><th colspan="4"></th></tr>
      </tfoot></table></div>
    <div class="hint" style="margin-top:6px">廠商報價／利潤／% 為內部成本資訊，匯出給客戶的報價單 PDF 不會列印。</div>
      ${q.status !== '進行中' ? `<div class="hint" style="margin-top:10px;color:var(--warn)">此報價單已「${esc(q.status)}」，僅供檢視、無法修改；如需變更請按「複製改版」建立新版本。</div>` : ''}`,
      quoteDetailFoot(q));
  },
  async form(id) {
    const q = id ? await api('/api/quotes/' + id) : { items: [] };
    const [custs, emps] = [await getLookup('customers'), await getLookup('employees')];
    const items = q.items && q.items.length ? q.items : [{}];
    const dl = (dlId, arr) => `<datalist id="${dlId}">${arr.map(o => `<option value="${esc(o)}">`).join('')}</datalist>`;
    const itemsHtml = `<div class="section-title">報價明細</div>
      ${dl('qItemOptions', QUOTE_ITEM_OPTIONS)}${dl('qUnitOptions', QUOTE_UNIT_OPTIONS)}
      <div class="subtable-wrap">
      <table class="subtable" id="itemsTable"><thead><tr><th>NO</th><th>項目</th><th>單價</th><th>單位</th><th>數量</th>
        <th>小計</th><th>廠商報價</th><th>利潤</th><th>%</th><th>備註</th><th></th></tr></thead>
      <tbody id="itemsBody">${items.map((it, i) => itemRowInputs(it, i + 1)).join('')}</tbody></table></div>
      <button type="button" class="btn ghost sm" style="margin-top:8px" onclick="addItemRow()">＋ 新增一列</button>
      <div class="hint">NO 可直接改數字調整順序（例如把第 4 列改成 1，該列就會移到最前面），離開欄位即重新排序編號。<br>
        項目與單位可從清單選擇，亦可自行輸入；數量、單價與廠商報價請填整數。<br>
        廠商報價為該項目的成本，利潤 ＝ 小計 － 廠商報價、% ＝ 利潤 ÷ 小計；此三欄僅供內部參考，客戶報價單 PDF 不會列印。</div>
      <div class="quote-totals">
        <div><span>合計</span><b id="qt_sub">0</b></div>
        <div><span>稅金</span><b id="qt_tax">0</b></div>
        <div class="grand"><span>總計</span><b id="qt_grand">0</b></div>
        <div><span>廠商報價合計</span><b id="qt_cost">0</b></div>
        <div><span>利潤</span><b id="qt_profit">0</b></div>
        <div><span>利潤%</span><b id="qt_pct">—</b></div>
      </div>`;
    const iso = (d) => d.toISOString().slice(0, 10);
    const today = new Date();
    const plus7 = new Date(today.getTime() + 7 * 86400000);
    const taxDefault = (q.tax_flag === undefined ? false : q.tax_flag);
    // 新增時系統狀態固定「進行中」不可修改；修改時才可調整
    const statusField = id
      ? { name: 'status', label: '系統狀態', type: 'select', options: ['進行中', '已確認', '作廢'].map(s => `<option ${q.status === s ? 'selected' : ''}>${s}</option>`).join('') }
      : { name: 'status', label: '系統狀態', type: 'text', value: '進行中', readonly: true, hint: '新增時固定為「進行中」' };
    openForm({
      title: id ? '修改報價單 ' + id : '新增報價單',
      fields: [
        { name: 'cust_id', label: '客戶', type: 'select', options: options(custs, 'cust_id', 'name', q.cust_id) },
        { name: 'proj_name', label: '專案名稱', value: q.proj_name },
        { name: 'addr', label: '裝修地址', full: true, value: q.addr },
        { name: 'quote_date', label: '報價日期', type: 'date', value: fmtDate(q.quote_date) || iso(today) },
        { name: 'valid_date', label: '有效日期', type: 'date', value: fmtDate(q.valid_date) || iso(plus7) },
        statusField,
        { name: 'maintainer', label: '維護窗口', type: 'select', options: options(emps, 'emp_id', 'name', q.maintainer || USER.emp_id) },
        { name: 'tax_flag', label: '稅金', type: 'checkbox', checkLabel: '勾選另計 5% 稅金', value: taxDefault, onchange: 'updateQuoteTotals()' },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: q.note },
      ],
      extraHtml: itemsHtml,
      onSubmit: async (v, formEl) => {
        v.items = collectItems(formEl);
        if (id) await api('/api/quotes/' + id, { method: 'PUT', body: v });
        else await api('/api/quotes', { method: 'POST', body: v });
        MODULES.quote.render();
      },
    });
    updateQuoteTotals(); // 初次載入即計算合計/稅金/總計
  },
  remove(id) {
    confirmDelete('確定刪除報價單 ' + id + '？(含明細)', async () => {
      try { await api('/api/quotes/' + id, { method: 'DELETE' }); closeModal(); MODULES.quote.render(); }
      catch (e) { alert(e.message); }
    });
  },
  // 複製報價單：整份複製 (含明細) 成全新單號，接著直接進入編輯畫面
  async duplicate(id) {
    if (!confirm('要複製報價單 ' + id + ' 嗎？\n會以「全新單號」建立一份相同內容 (含明細)，並直接進入編輯。')) return;
    try {
      const r = await api('/api/quotes/' + id + '/duplicate', { method: 'POST' });
      closeModal();
      await MODULES.quote.form(r.quote_id);   // 畫面留在編輯該張新報價單
    } catch (e) { alert(e.message); }
  },
  async revise(id) {
    if (!confirm('要複製報價單 ' + id + ' 為新版本嗎？\n新版本編號會加上 -1／-2…，狀態為「進行中」可再編輯。')) return;
    try {
      const r = await api('/api/quotes/' + id + '/revise', { method: 'POST' });
      closeModal();
      alert('已建立新版本：' + r.quote_id + '，請編輯內容後儲存。');
      await MODULES.quote.form(r.quote_id);
    } catch (e) { alert(e.message); }
  },
  async exportPDF(id) {
    try { const q = await api('/api/quotes/' + id); quotePrint(q); }
    catch (e) { alert(e.message); }
  },
};

// 報價單明細視窗底部按鈕 (依系統狀態決定可用動作)
function quoteDetailFoot(q) {
  const id = q.quote_id;
  let btns = `<button class="btn ghost" onclick="closeModal()">關閉</button>`;
  if (q.status === '進行中') {
    btns += `<button class="btn" onclick="MODULES.quote.form('${id}')">修改</button>
             <button class="btn danger" onclick="MODULES.quote.remove('${id}')">刪除</button>`;
  } else if (q.status === '已確認') {
    btns += `<button class="btn ghost" onclick="MODULES.quote.revise('${id}')">複製改版</button>
             <button class="btn" onclick="MODULES.quote.exportPDF('${id}')">匯出PDF</button>`;
  } else { // 作廢
    btns += `<button class="btn ghost" onclick="MODULES.quote.revise('${id}')">複製改版</button>`;
  }
  return btns;
}

// 匯出報價單 PDF (以列印方式，換頁時整列不切斷、表頭每頁重複)
function quotePrint(q) {
  let total = 0;
  const rows = (q.items || []).map((it, i) => {
    const sub = Number(it.subtotal) || 0; total += sub;
    return `<tr><td class="c">${it.seq_no || i + 1}</td><td>${esc(it.item)}</td><td class="r">${money(it.unit_price)}</td>
      <td class="c">${esc(it.unit)}</td><td class="r">${money(it.qty)}</td>
      <td class="r">${money(sub)}</td><td>${esc(it.note)}</td></tr>`;
  }).join('') || `<tr><td colspan="7" style="text-align:center">無明細</td></tr>`;
  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
    <title>報價單_${esc(q.quote_id)}</title><style>
    *{font-family:"Microsoft JhengHei","Segoe UI",sans-serif;box-sizing:border-box;}
    body{margin:0;color:#222;}
    .wrap{padding:24px;}
    .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #98c810;padding-bottom:12px;margin-bottom:16px;}
    .head img{width:auto;height:60px;border-radius:4px;border:1px solid #ccc;background:#fff;}
    .head h1{margin:0;font-size:22px;}
    .head .sub{color:#666;font-size:13px;margin-top:2px;}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:16px;font-size:14px;}
    .meta span{color:#777;display:inline-block;width:76px;}
    table{border-collapse:collapse;width:100%;font-size:13px;}
    th,td{border:1px solid #bbb;padding:7px 9px;}
    thead th{background:#eef6d8;}
    td.r{text-align:right;}td.c{text-align:center;}
    tfoot th{text-align:right;background:#f7fbe9;font-size:14px;}
    .foot{margin-top:16px;font-size:12px;color:#555;display:flex;justify-content:space-between;}
    @page{margin:16mm;}
    @media print{
      thead{display:table-header-group;}   /* 表頭每頁重複 */
      tfoot{display:table-row-group;}
      tr{page-break-inside:avoid;}          /* 換頁時整列不切斷 */
    }
    </style></head>
    <body onload="setTimeout(function(){window.focus();window.print();},250)">
    <div class="wrap">
      <div class="head"><img src="/img/logo.jpg" alt="logo">
        <div><h1>報價單 QUOTATION</h1><div class="sub">單號：${esc(q.quote_id)}</div></div></div>
      <div class="meta">
        <div><span>客戶</span>${esc(q.cust_name || '')} ${q.cust_id ? '(' + esc(q.cust_id) + ')' : ''}</div>
        <div><span>專案名稱</span>${esc(q.proj_name || '')}</div>
        <div><span>報價日期</span>${fmtDate(q.quote_date)}</div>
        <div><span>有效日期</span>${fmtDate(q.valid_date)}</div>
        <div style="grid-column:1/-1"><span>裝修地址</span>${esc(q.addr || '')}</div>
      </div>
      <table>
        <thead><tr><th style="width:38px">NO</th><th>項目</th><th>單價</th><th>單位</th><th>數量</th><th>小計</th><th>備註</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot>
          <tr><th colspan="5" style="text-align:right">合計</th><th style="text-align:right">${money(total)}</th><th></th></tr>
          <tr><th colspan="5" style="text-align:right">稅金 (${q.tax_flag ? '5%' : '免'})</th><th style="text-align:right">${money(q.tax_flag ? Math.round(total * 0.05) : 0)}</th><th></th></tr>
          <tr><th colspan="5" style="text-align:right">總計</th><th style="text-align:right">${money(total + (q.tax_flag ? Math.round(total * 0.05) : 0))}</th><th></th></tr>
        </tfoot>
      </table>
      <div class="foot"><span>填表人：${esc(q.created_by_name || q.created_by || '')}</span>
        <span>列印日期：${new Date().toLocaleDateString('zh-TW')}</span></div>
    </div></body></html>`;
  printHtml(html);
}

// 以隱藏 iframe 列印 (瀏覽器列印視窗可選「另存為 PDF」)
function printHtml(html) {
  const iframe = document.createElement('iframe');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  document.body.appendChild(iframe);
  const doc = iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow.onafterprint = () => iframe.remove();
  setTimeout(() => { if (document.body.contains(iframe)) iframe.remove(); }, 60000);
}

// 請款單 PDF (應收款項)：表頭「請款單」、表尾「請款人」
function receivablePrint(r) {
  const amount = Number(r.amount) || 0;
  const tax = Number(r.tax) || 0;
  const discount = Number(r.discount) || 0;
  const total = amount + tax - discount;                      // 應收合計
  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
    <title>請款單_${esc(r.ar_id)}</title><style>
    *{font-family:"Microsoft JhengHei","Segoe UI",sans-serif;box-sizing:border-box;}
    body{margin:0;color:#222;}
    .wrap{padding:24px;}
    .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #98c810;padding-bottom:12px;margin-bottom:16px;}
    .head img{width:auto;height:60px;border-radius:4px;border:1px solid #ccc;background:#fff;}
    .head h1{margin:0;font-size:22px;letter-spacing:4px;}
    .head .sub{color:#666;font-size:13px;margin-top:2px;}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:16px;font-size:14px;}
    .meta span{color:#777;display:inline-block;width:76px;}
    table{border-collapse:collapse;width:100%;font-size:14px;}
    th,td{border:1px solid #bbb;padding:9px 10px;}
    thead th{background:#eef6d8;}
    td.r{text-align:right;}
    .note{margin-top:14px;font-size:13px;border:1px solid #bbb;padding:10px;min-height:56px;}
    .note b{color:#777;font-weight:600;}
    .sign{margin-top:28px;display:flex;justify-content:space-between;align-items:flex-end;font-size:14px;}
    .sign .line{border-bottom:1px solid #333;display:inline-block;width:190px;height:22px;}
    .foot{margin-top:22px;font-size:12px;color:#555;display:flex;justify-content:space-between;}
    @page{margin:16mm;}
    </style></head>
    <body onload="setTimeout(function(){window.focus();window.print();},250)">
    <div class="wrap">
      <div class="head"><img src="/img/logo.jpg" alt="logo">
        <div><h1>請款單</h1><div class="sub">單號：${esc(r.ar_id)}</div></div></div>
      <div class="meta">
        <div><span>客戶</span>${esc(r.cust_name || '')} ${r.cust_id ? '(' + esc(r.cust_id) + ')' : ''}</div>
        <div><span>公司</span>${esc(r.cust_company || '')}</div>
        <div><span>專案</span>${esc(r.proj_id || '')} ${esc(r.proj_name || '')}</div>
        <div><span>報價單號</span>${esc(r.quote_id || '')}</div>
        <div><span>項目</span>${esc(r.item || '')}${r.is_retention ? '（保留款）' : ''}</div>
        <div><span>應收日期</span>${fmtDate(r.due_date) || ''}</div>
        <div><span>發票號碼</span>${esc(r.invoice_no || '')}${r.invoice_void ? '（作廢）' : ''}</div>
        <div><span>發票日期</span>${fmtDate(r.invoice_date) || ''}</div>
        <div><span>收款方式</span>${esc(r.receive_method || '')}</div>
        <div><span>收款日期</span>${fmtDate(r.received_date) || ''}</div>
      </div>
      <table>
        <thead><tr><th>應收金額</th><th>5%稅額</th><th>折讓</th><th>應收合計</th></tr></thead>
        <tbody><tr>
          <td class="r">${money(amount)}</td><td class="r">${money(tax)}</td>
          <td class="r">${money(discount)}</td><td class="r"><b>${money(total)}</b></td>
        </tr></tbody>
      </table>
      <div class="note"><b>備註：</b>${esc(r.note || '')}</div>
      <div class="sign">
        <div>請款人：<span class="line"></span></div>
        <div>日期：<span class="line" style="width:150px"></span></div>
      </div>
      <div class="foot"><span>填表人：${esc(r.created_by_name || r.created_by || '')}</span>
        <span>列印日期：${new Date().toLocaleDateString('zh-TW')}</span></div>
    </div></body></html>`;
  printHtml(html);
}

// 付款憑証 PDF (應付款項)：表頭「付款憑証」、表尾「簽收人」
function payablePrint(p) {
  const amount = Number(p.amount) || 0;
  const taxDeduct = Number(p.tax_deduct) || 0;
  const discount = Number(p.discount) || 0;
  const paid = (p.paid_amount === null || p.paid_amount === undefined || p.paid_amount === '')
    ? amount - discount : Number(p.paid_amount);
  const html = `<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="UTF-8">
    <title>付款憑証_${esc(p.ap_id)}</title><style>
    *{font-family:"Microsoft JhengHei","Segoe UI",sans-serif;box-sizing:border-box;}
    body{margin:0;color:#222;}
    .wrap{padding:24px;}
    .head{display:flex;align-items:center;gap:14px;border-bottom:3px solid #98c810;padding-bottom:12px;margin-bottom:16px;}
    .head img{width:auto;height:60px;border-radius:4px;border:1px solid #ccc;background:#fff;}
    .head h1{margin:0;font-size:22px;letter-spacing:4px;}
    .head .sub{color:#666;font-size:13px;margin-top:2px;}
    .meta{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;margin-bottom:16px;font-size:14px;}
    .meta span{color:#777;display:inline-block;width:76px;}
    table{border-collapse:collapse;width:100%;font-size:14px;}
    th,td{border:1px solid #bbb;padding:9px 10px;}
    thead th{background:#eef6d8;}
    td.r{text-align:right;}
    tfoot th{text-align:right;background:#f7fbe9;font-size:15px;}
    .note{margin-top:14px;font-size:13px;border:1px solid #bbb;padding:10px;min-height:56px;}
    .note b{color:#777;font-weight:600;}
    .sign{margin-top:28px;display:flex;justify-content:space-between;align-items:flex-end;font-size:14px;}
    .sign .line{border-bottom:1px solid #333;display:inline-block;width:190px;height:22px;}
    .foot{margin-top:22px;font-size:12px;color:#555;display:flex;justify-content:space-between;}
    @page{margin:16mm;}
    </style></head>
    <body onload="setTimeout(function(){window.focus();window.print();},250)">
    <div class="wrap">
      <div class="head"><img src="/img/logo.jpg" alt="logo">
        <div><h1>付款憑証</h1><div class="sub">單號：${esc(p.ap_id)}</div></div></div>
      <div class="meta">
        <div><span>廠商</span>${esc(p.vend_name || '')} ${p.vend_id ? '(' + esc(p.vend_id) + ')' : ''}</div>
        <div><span>統一編號</span>${esc(p.vend_tax_id || '')}</div>
        <div><span>專案</span>${esc(p.proj_id || '')} ${esc(p.proj_name || '')}</div>
        <div><span>項目</span>${esc(p.item || p.expense_category || '')}</div>
        <div><span>憑證類別</span>${esc(p.doc_type || '')}</div>
        <div><span>發票號碼</span>${esc(p.invoice_no || '')}${p.invoice_void ? '（作廢）' : ''}</div>
        <div><span>發票日期</span>${fmtDate(p.invoice_date) || ''}</div>
        <div><span>付款日期</span>${fmtDate(p.paid_date) || ''}</div>
        <div><span>付款方式</span>${esc(p.pay_method || '')}${p.check_no ? '（票號 ' + esc(p.check_no) + (p.check_due ? '，到期 ' + fmtDate(p.check_due) : '') + '）' : ''}</div>
      </div>
      <table>
        <thead><tr><th>應付金額</th><th>抵扣稅額</th><th>折讓</th><th>實付金額</th></tr></thead>
        <tbody><tr>
          <td class="r">${money(amount)}</td><td class="r">${money(taxDeduct)}</td>
          <td class="r">${money(discount)}</td><td class="r"><b>${money(paid)}</b></td>
        </tr></tbody>
      </table>
      <div class="note"><b>備註：</b>${esc(p.note || '')}</div>
      <div class="sign">
        <div>簽收人：<span class="line"></span></div>
        <div>日期：<span class="line" style="width:150px"></span></div>
      </div>
      <div class="foot"><span>填表人：${esc(p.created_by_name || p.created_by || '')}</span>
        <span>列印日期：${new Date().toLocaleDateString('zh-TW')}</span></div>
    </div></body></html>`;
  printHtml(html);
}

// 報價明細下拉選項 (可自行輸入)
const QUOTE_ITEM_OPTIONS = ['丈量費', '設計圖費用', '工程管理費用', '拆除工程', '清潔工程',
  '保護工程', '窗簾工程', '冷氣工程', '地板工程', '木作工程', '輕隔間工程', '壁紙工程',
  '油漆工程', '門窗工程', '鐵件工程'];
const QUOTE_UNIT_OPTIONS = ['式', '組', '個', '坪', '平方公尺', '條', '支', '片', '才'];

// 利潤數字 (負數紅字)；利潤% = 利潤 ÷ 小計，小計為 0 時顯示「—」
function profitNum(v) { return `<span class="${Number(v) < 0 ? 'neg-num' : ''}">${money(v)}</span>`; }
function profitPct(profit, sub) {
  if (!Number(sub)) return '—';
  const p = Math.round(profit / Number(sub) * 1000) / 10;
  return `<span class="${p < 0 ? 'neg-num' : ''}">${p.toFixed(1)}%</span>`;
}

function itemRowInputs(it = {}, no = 0) {
  const sub = (it.unit_price && it.qty) ? Math.round(it.unit_price) * Math.round(it.qty) : (Number(it.subtotal) || 0);
  const cost = Math.round(Number(it.vendor_price)) || 0;
  const hasRow = it.unit_price || it.qty || it.subtotal;
  return `<tr>
    <td><input name="i_no" type="number" step="1" min="1" value="${no || it.seq_no || ''}" style="width:52px" class="right" onchange="reorderItems(this)"></td>
    <td><input name="i_item" list="qItemOptions" value="${esc(it.item)}" placeholder="選擇或輸入" style="width:130px"></td>
    <td><input name="i_price" type="number" step="1" min="0" value="${esc(it.unit_price ? Math.round(it.unit_price) : it.unit_price)}" style="width:80px" oninput="calcRow(this)"></td>
    <td><input name="i_unit" list="qUnitOptions" value="${esc(it.unit)}" placeholder="選擇或輸入" style="width:64px"></td>
    <td><input name="i_qty" type="number" step="1" min="0" value="${esc(it.qty ? Math.round(it.qty) : it.qty)}" style="width:64px" oninput="calcRow(this)"></td>
    <td><input name="i_sub" value="${hasRow ? money(sub) : ''}" style="width:84px" class="right" readonly></td>
    <td><input name="i_cost" type="number" step="1" min="0" value="${it.vendor_price !== undefined && it.vendor_price !== null ? cost : ''}" style="width:84px" oninput="calcRow(this)"></td>
    <td><input name="i_profit" value="${hasRow ? money(sub - cost) : ''}" style="width:84px" class="right ${sub - cost < 0 ? 'neg-num' : ''}" readonly></td>
    <td><input name="i_pct" value="${sub ? (Math.round((sub - cost) / sub * 1000) / 10).toFixed(1) + '%' : ''}" style="width:60px" class="right ${sub - cost < 0 ? 'neg-num' : ''}" readonly></td>
    <td><input name="i_note" value="${esc(it.note)}" style="width:90px"></td>
    <td><button type="button" class="btn danger sm" onclick="this.closest('tr').remove();renumberItems();updateQuoteTotals()">刪</button></td></tr>`;
}
function addItemRow() {
  const body = document.getElementById('itemsBody');
  body.insertAdjacentHTML('beforeend', itemRowInputs({}, body.querySelectorAll('tr').length + 1));
  updateQuoteTotals();
}
// NO 欄重新編號 1,2,3…（依畫面現有順序）
function renumberItems() {
  document.querySelectorAll('#itemsBody tr').forEach((tr, i) => {
    tr.querySelector('[name=i_no]').value = i + 1;
  });
}
// 使用者改了某列的 NO：依 NO 遞增重新排列，改動的那一列插到該位置之前，再重新編號
function reorderItems(inp) {
  const body = document.getElementById('itemsBody');
  const moved = inp.closest('tr');
  const rows = Array.from(body.querySelectorAll('tr'));
  const keyed = rows.map((tr, i) => {
    const v = Number(tr.querySelector('[name=i_no]').value);
    const key = Number.isFinite(v) && v > 0 ? v : i + 1;
    return { tr, key: tr === moved ? key - 0.5 : key, i };   // 被改的那列優先插到同號之前
  });
  keyed.sort((a, b) => a.key - b.key || a.i - b.i);
  keyed.forEach(k => body.appendChild(k.tr));
  renumberItems();
}
// 讀取一列的 小計 / 廠商報價 / 利潤
function rowAmounts(tr) {
  const price = Math.round(Number(tr.querySelector('[name=i_price]').value)) || 0;
  const qty = Math.round(Number(tr.querySelector('[name=i_qty]').value)) || 0;
  const cost = Math.round(Number(tr.querySelector('[name=i_cost]').value)) || 0;
  const sub = price * qty;
  return { sub, cost, profit: sub - cost };
}
function calcRow(inp) {
  const tr = inp.closest('tr');
  const { sub, profit } = rowAmounts(tr);
  tr.querySelector('[name=i_sub]').value = money(sub);          // 小計顯示千分位
  const pf = tr.querySelector('[name=i_profit]'), pc = tr.querySelector('[name=i_pct]');
  pf.value = money(profit);                                     // 利潤 = 小計 − 廠商報價
  pc.value = sub ? (Math.round(profit / sub * 1000) / 10).toFixed(1) + '%' : '';
  pf.classList.toggle('neg-num', profit < 0);                   // 負值紅字
  pc.classList.toggle('neg-num', profit < 0);
  updateQuoteTotals();
}
// 計算報價單 合計 / 稅金(5%或0) / 總計 / 成本 / 利潤，並更新畫面
function updateQuoteTotals() {
  const f = document.getElementById('modalForm');
  if (!f || !document.getElementById('qt_sub')) return;
  let sub = 0, cost = 0;
  f.querySelectorAll('#itemsBody tr').forEach(tr => {
    const a = rowAmounts(tr);
    sub += a.sub; cost += a.cost;
  });
  const cb = f.querySelector('[name=tax_flag]');
  const taxOn = cb ? cb.checked : true;
  const tax = taxOn ? Math.round(sub * 0.05) : 0;
  const profit = sub - cost;
  document.getElementById('qt_sub').textContent = money(sub);
  document.getElementById('qt_tax').textContent = money(tax);
  document.getElementById('qt_grand').textContent = money(sub + tax);
  document.getElementById('qt_cost').textContent = money(cost);
  document.getElementById('qt_profit').innerHTML = profitNum(profit);
  document.getElementById('qt_pct').innerHTML = profitPct(profit, sub);
}
function collectItems(formEl) {
  return Array.from(formEl.querySelectorAll('#itemsBody tr')).map((tr, i) => {
    const price = tr.querySelector('[name=i_price]').value;
    const qty = tr.querySelector('[name=i_qty]').value;
    const cost = tr.querySelector('[name=i_cost]').value;
    const no = Number(tr.querySelector('[name=i_no]').value);
    return {
      seq_no: no > 0 ? no : i + 1,                               // NO (遞增排序用)
      item: tr.querySelector('[name=i_item]').value,
      unit_price: price === '' ? '' : Math.round(Number(price)), // 單價為整數
      unit: tr.querySelector('[name=i_unit]').value,
      qty: qty === '' ? '' : Math.round(Number(qty)),            // 數量為整數
      vendor_price: cost === '' ? 0 : Math.round(Number(cost)),  // 廠商報價為整數
      note: tr.querySelector('[name=i_note]').value,
    };
  }).filter(it => it.item || it.unit_price || it.qty);
}

/* ── 應收款項 ─────────────────────────────────────────── */
MODULES.receivable = {
  title: '應收款項', perm: 'perm_receivable',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 報價單號 / 客戶名稱',
      defaultHint: '預設顯示「待收款」，依收款單號遞減。' });
    setTopAction('＋ 新增應收款', () => this.form());
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async load(q) {
    const rows = await api('/api/receivables?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'ar_id', label: '收款單號', render: r => `<a class="link" onclick="MODULES.receivable.detail('${r.ar_id}')">${esc(r.ar_id)}</a>` },
      { key: 'cust_name', label: '客戶名稱' },
      { key: 'quote_id', label: '報價單號' },
      { key: 'item', label: '項目', render: r => `${esc(r.item)}${r.is_retention ? ' <span class="badge amber">保留款</span>' : ''}` },
      { key: 'amount', label: '應收金額', num: true, render: r => money(r.amount) },
      { key: 'tax', label: '5%稅額', num: true, render: r => money(r.tax) },
      { key: 'created_by_name', label: '填表人' },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
    ], rows);
  },
  async detail(id) {
    const r = await api('/api/receivables/' + id);
    openModal('收款單明細 ' + r.ar_id, `<dl class="dl">
      <dt>收款單號</dt><dd>${esc(r.ar_id)}</dd>
      <dt>建立日期</dt><dd>${fmtDT(r.created_at)}</dd>
      <dt>應收日期</dt><dd>${fmtDate(r.due_date)}</dd>
      <dt>客戶</dt><dd>${esc(r.cust_id)} ${esc(r.cust_name || '')}</dd>
      <dt>報價單號</dt><dd>${esc(r.quote_id)}</dd>
      <dt>專案編號</dt><dd>${esc(r.proj_id)}</dd>
      <dt>項目</dt><dd>${esc(r.item)}</dd>
      <dt>應收金額</dt><dd>${money(r.amount)}</dd>
      <dt>5%稅額</dt><dd>${money(r.tax)}</dd>
      <dt>發票號碼</dt><dd>${esc(r.invoice_no)}${r.invoice_void ? ' <span class="badge red">作廢</span>' : ''}</dd>
      <dt>發票日期</dt><dd>${fmtDate(r.invoice_date)}</dd>
      <dt>收款方式</dt><dd>${esc(r.receive_method)}</dd>
      <dt>折讓</dt><dd>${money(r.discount)}</dd>
      <dt>保留款</dt><dd>${r.is_retention ? '是（應收日期即到期日）' : '否'}</dd>
      <dt>狀態</dt><dd>${statusBadge(r.status)}</dd>
      <dt>收款日期</dt><dd>${fmtDate(r.received_date)}</dd>
      <dt>實收金額</dt><dd>${money(r.received_amount)}</dd>
      <dt>填表人</dt><dd>${esc(r.created_by_name || r.created_by)}</dd>
      <dt>備註</dt><dd>${esc(r.note)}</dd>
    </dl>`, `<button class="btn ghost" onclick="closeModal()">關閉</button>
      <button class="btn ghost" onclick="MODULES.receivable.exportPDF('${r.ar_id}')">匯出PDF</button>
      <button class="btn" onclick="MODULES.receivable.form('${r.ar_id}')">修改</button>
      <button class="btn danger" onclick="MODULES.receivable.remove('${r.ar_id}')">刪除</button>`);
  },
  async exportPDF(id) {
    try { receivablePrint(await api('/api/receivables/' + id)); }
    catch (e) { alert(e.message); }
  },
  async form(id) {
    const r = id ? await api('/api/receivables/' + id) : {};
    const [custs, quotes, projs] = [await getLookup('customers'), await getLookup('quotes'), await getLookup('projects')];
    // 應收「項目」「收款方式」下拉清單 (由項目維護管理，即時抓取)
    let itemOpts = await api('/api/options/receivable_item');
    if (r.item && !itemOpts.includes(r.item)) itemOpts = [r.item, ...itemOpts]; // 保留清單外的既有值
    let rmOpts = await api('/api/options/receivable_receive_method');
    if (r.receive_method && !rmOpts.includes(r.receive_method)) rmOpts = [r.receive_method, ...rmOpts];
    // 狀態一律唯讀 (新增固定待收款、修改沿用原值)；變更狀態請至「會計維護」
    const statusField = { name: 'status', label: '狀態', type: 'text', value: r.status || '待收款', readonly: true };
    openForm({
      title: id ? '修改應收款 ' + id : '新增應收款',
      fields: [
        { name: 'cust_id', label: '客戶', type: 'select', required: true, options: options(custs, 'cust_id', 'name', r.cust_id) },
        { name: 'quote_id', label: '報價單號', type: 'select', required: true, options: options(quotes, 'quote_id', 'proj_name', r.quote_id) },
        { name: 'proj_id', label: '專案編號', type: 'select', required: true, options: options(projs, 'proj_id', 'proj_name', r.proj_id) },
        { name: 'due_date', label: '應收日期', type: 'date', value: fmtDate(r.due_date) || new Date().toISOString().slice(0, 10) },
        { name: 'item', label: '項目', type: 'select', options: optionsFromList(itemOpts, r.item) },
        { name: 'amount', label: '應收金額', type: 'number', step: '1', value: r.amount },
        { name: 'tax', label: '5%稅額', type: 'number', step: '1', value: r.tax, hint: '留空則自動以金額×5%計算' },
        { name: 'invoice_no', label: '發票號碼', value: r.invoice_no, hint: '非必填，格式如 AB-12345678' },
        { name: 'invoice_date', label: '發票日期', type: 'date', value: fmtDate(r.invoice_date), hint: '營業稅(401)申報依此日期歸期' },
        { name: 'invoice_void', label: '發票作廢', type: 'checkbox', checkLabel: '此發票已作廢', value: r.invoice_void },
        { name: 'receive_method', label: '收款方式', type: 'select', options: optionsFromList(rmOpts, r.receive_method || '現金', false) },
        { name: 'discount', label: '折讓', type: 'number', step: '1', value: r.discount || 0, hint: '非必填' },
        { name: 'is_retention', label: '保留款', type: 'checkbox', checkLabel: '此筆為保留款/保固金', value: r.is_retention },
        statusField,
        { name: 'note', label: '備註', type: 'textarea', full: true, value: r.note },
      ],
      onSubmit: async (v) => {
        if (id) await api('/api/receivables/' + id, { method: 'PUT', body: v });
        else await api('/api/receivables', { method: 'POST', body: v });
        MODULES.receivable.render();
      },
    });
  },
  remove(id) {
    confirmDelete('確定刪除收款單 ' + id + '？', async () => {
      try { await api('/api/receivables/' + id, { method: 'DELETE' }); closeModal(); MODULES.receivable.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── 應付款項 ─────────────────────────────────────────── */
MODULES.payable = {
  title: '應付款項', perm: 'perm_payable',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 廠商名稱',
      defaultHint: '預設顯示「待付款」，依付款單號遞減。' });
    setTopAction('＋ 新增應付款', () => this.form());
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async load(q) {
    const rows = await api('/api/payables?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'ap_id', label: '付款單號', render: r => `<a class="link" onclick="MODULES.payable.detail('${r.ap_id}')">${esc(r.ap_id)}</a>` },
      { key: 'vend_name', label: '廠商名稱' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '應付金額', num: true, render: r => money(r.amount) },
      { key: 'tax_deduct', label: '抵扣稅額', num: true, render: r => money(r.tax_deduct) },
      { key: 'created_by_name', label: '填表人' },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
    ], rows);
  },
  async detail(id) {
    const p = await api('/api/payables/' + id);
    openModal('付款單明細 ' + p.ap_id, `<dl class="dl">
      <dt>付款單號</dt><dd>${esc(p.ap_id)}</dd>
      <dt>建立日期</dt><dd>${fmtDT(p.created_at)}</dd>
      <dt>廠商</dt><dd>${esc(p.vend_id)} ${esc(p.vend_name || '')}</dd>
      <dt>專案編號</dt><dd>${esc(p.proj_id)}</dd>
      <dt>應付日期</dt><dd>${fmtDate(p.due_date)}</dd>
      <dt>項目</dt><dd>${esc(p.item)}</dd>
      <dt>費用類別</dt><dd>${esc(p.expense_category)}</dd>
      <dt>應付金額</dt><dd>${money(p.amount)}</dd>
      <dt>憑證類別</dt><dd>${esc(p.doc_type)}</dd>
      <dt>抵扣稅額</dt><dd>${money(p.tax_deduct)}</dd>
      <dt>發票號碼</dt><dd>${esc(p.invoice_no)}${p.invoice_void ? ' <span class="badge red">作廢</span>' : ''}</dd>
      <dt>發票日期</dt><dd>${fmtDate(p.invoice_date)}</dd>
      <dt>所得類別</dt><dd>${esc(p.income_type)}</dd>
      <dt>扣繳稅額</dt><dd>${money(p.withholding_tax)}</dd>
      <dt>二代健保</dt><dd>${money(p.nhi_surcharge)}</dd>
      <dt>折讓</dt><dd>${money(p.discount)}</dd>
      <dt>狀態</dt><dd>${statusBadge(p.status)}</dd>
      <dt>付款日期</dt><dd>${fmtDate(p.paid_date)}</dd>
      <dt>付款方式</dt><dd>${esc(p.pay_method)}${p.check_no ? '（票號 ' + esc(p.check_no) + (p.check_due ? '，到期 ' + fmtDate(p.check_due) : '') + '）' : ''}</dd>
      <dt>實付金額</dt><dd>${money(p.paid_amount)}</dd>
      <dt>填表人</dt><dd>${esc(p.created_by_name || p.created_by)}</dd>
      <dt>備註</dt><dd>${esc(p.note)}</dd>
    </dl>`, `<button class="btn ghost" onclick="closeModal()">關閉</button>
      <button class="btn ghost" onclick="MODULES.payable.exportPDF('${p.ap_id}')">匯出PDF</button>
      <button class="btn" onclick="MODULES.payable.form('${p.ap_id}')">修改</button>
      <button class="btn danger" onclick="MODULES.payable.remove('${p.ap_id}')">刪除</button>`);
  },
  async exportPDF(id) {
    try { payablePrint(await api('/api/payables/' + id)); }
    catch (e) { alert(e.message); }
  },
  async form(id) {
    const p = id ? await api('/api/payables/' + id) : {};
    const [vends, projs] = [await getLookup('vendors'), await getLookup('projects')];
    // 應付「項目」與「費用類別」下拉清單 (由項目維護管理，即時抓取)
    let itemOpts = await api('/api/options/payable_item');
    if (p.item && !itemOpts.includes(p.item)) itemOpts = [p.item, ...itemOpts];
    let expOpts = await api('/api/options/expense_category');
    if (p.expense_category && !expOpts.includes(p.expense_category)) expOpts = [p.expense_category, ...expOpts];
    let pmOpts = await api('/api/options/payable_pay_method');
    if (p.pay_method && !pmOpts.includes(p.pay_method)) pmOpts = [p.pay_method, ...pmOpts];
    // 狀態一律唯讀 (新增固定待付款、修改沿用原值)；變更狀態請至「會計維護」
    const statusField = { name: 'status', label: '狀態', type: 'text', value: p.status || '待付款', readonly: true };
    openForm({
      title: id ? '修改應付款 ' + id : '新增應付款',
      topHtml: `<div class="ai-scan">
        <button type="button" class="btn ghost" id="aiScanBtn">📷 AI 發票辨識</button>
        <input type="file" id="aiScanFile" accept="image/*" capture="environment" style="display:none">
        <span class="hint" id="aiScanMsg">拍照或選擇發票圖片，自動填入 金額 / 稅額 / 發票號碼</span>
      </div>`,
      fields: [
        { name: 'vend_id', label: '廠商', type: 'select', options: options(vends, 'vend_id', 'company_name', p.vend_id), hint: '工程款請選廠商；營業費用可留空' },
        { name: 'proj_id', label: '專案編號', type: 'select', options: options(projs, 'proj_id', 'proj_name', p.proj_id), hint: '工程款請選專案；營業費用可留空' },
        { name: 'due_date', label: '應付日期', type: 'date', value: fmtDate(p.due_date), hint: '非必填，首頁到期提醒依此日期' },
        { name: 'item', label: '項目', type: 'select', options: optionsFromList(itemOpts, p.item) },
        { name: 'expense_category', label: '費用類別', type: 'select', options: optionsFromList(expOpts, p.expense_category), hint: '非專案的營業費用 (房租/水電…) 請選類別' },
        { name: 'amount', label: '應付金額', type: 'number', step: '1', value: p.amount },
        { name: 'doc_type', label: '憑證類別', type: 'select',
          options: optionsFromList(['三聯式發票', '電子發票(含統編)', '二聯式發票', '收據', '免用統一發票', '勞務報酬單'], p.doc_type),
          hint: '僅三聯式/含統編電子發票可扣抵進項稅額' },
        { name: 'tax_deduct', label: '抵扣稅額', type: 'number', step: '1', value: p.tax_deduct, hint: '非可扣抵憑證系統會自動歸零' },
        { name: 'invoice_no', label: '發票號碼', value: p.invoice_no, hint: '非必填，格式如 AB-12345678' },
        { name: 'invoice_date', label: '發票日期', type: 'date', value: fmtDate(p.invoice_date), hint: '營業稅(401)申報依此日期歸期' },
        { name: 'invoice_void', label: '發票作廢', type: 'checkbox', checkLabel: '此發票已作廢', value: p.invoice_void },
        { name: 'discount', label: '折讓', type: 'number', step: '1', value: p.discount || 0, hint: '非必填' },
        { name: 'income_type', label: '所得類別', type: 'select',
          options: optionsFromList(['薪資所得(50)', '執行業務所得(9B)', '其他所得(92)'], p.income_type),
          hint: '付款對象為個人(無發票)時填寫，供扣繳憑單使用' },
        { name: 'withholding_tax', label: '扣繳稅額', type: 'number', step: '1', value: p.withholding_tax || 0, hint: '非必填' },
        { name: 'nhi_surcharge', label: '二代健保補充保費', type: 'number', step: '1', value: p.nhi_surcharge || 0, hint: '非必填' },
        { name: 'pay_method', label: '付款方式', type: 'select', options: optionsFromList(pmOpts, p.pay_method || '現金', false) },
        statusField,
        { name: 'note', label: '備註', type: 'textarea', full: true, value: p.note },
      ],
      onSubmit: async (v) => {
        if (id) await api('/api/payables/' + id, { method: 'PUT', body: v });
        else await api('/api/payables', { method: 'POST', body: v });
        MODULES.payable.render();
      },
    });
    wireAiInvoiceScan();   // 啟用「AI 發票辨識」按鈕
  },
  remove(id) {
    confirmDelete('確定刪除付款單 ' + id + '？', async () => {
      try { await api('/api/payables/' + id, { method: 'DELETE' }); closeModal(); MODULES.payable.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── AI 發票辨識：縮圖上傳 → 解析 → 自動填入表單 ─────────── */
// 將圖片縮到長邊 2000px 內並轉 JPEG，控制上傳量與辨識費用
function shrinkImage(file, maxSide = 2000) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('無法讀取圖片，請改用 JPG/PNG 格式。')); };
    img.src = url;
  });
}
function wireAiInvoiceScan() {
  const btn = document.getElementById('aiScanBtn');
  const fileInput = document.getElementById('aiScanFile');
  const msg = document.getElementById('aiScanMsg');
  if (!btn || !fileInput) return;
  btn.onclick = () => fileInput.click();
  fileInput.onchange = async () => {
    if (!fileInput.files.length) return;
    const f = document.getElementById('modalForm');
    btn.disabled = true; btn.textContent = '🔍 辨識中…';
    msg.textContent = 'AI 正在讀取發票內容，約需 10～30 秒…';
    try {
      const image = await shrinkImage(fileInput.files[0]);
      const r = await api('/api/payables/parse-invoice', { method: 'POST', body: { image, mime: 'image/jpeg' } });
      const set = (name, val) => { const el = f.querySelector(`[name=${name}]`); if (el && val !== undefined && val !== null && val !== '') el.value = val; };
      set('amount', r.amount || '');
      set('tax_deduct', r.tax || 0);
      set('invoice_no', r.invoice_no);
      set('invoice_date', r.invoice_date);
      if (r.doc_type && r.doc_type !== '其他') set('doc_type', r.doc_type);
      const parts = [];
      if (r.seller_name) parts.push('賣方：' + r.seller_name + (r.seller_tax_id ? '（統編 ' + r.seller_tax_id + '）' : ''));
      parts.push('信心：' + (r.confidence || '—'));
      if (r.note) parts.push('⚠ ' + r.note);
      msg.textContent = '✅ 已自動填入，請核對金額與號碼。' + parts.join('；');
      if (r.seller_name) msg.textContent += '（廠商請自行從下拉選擇）';
    } catch (e) {
      msg.textContent = '❌ ' + e.message;
    } finally {
      btn.disabled = false; btn.textContent = '📷 AI 發票辨識';
      fileInput.value = '';
    }
  };
}

/* ── 會計維護 ─────────────────────────────────────────── */
MODULES.accounting = {
  title: '會計維護', perm: 'perm_accounting',
  _tab: 'ar',
  render() {
    clearTopAction();
    document.getElementById('content').innerHTML = `
      <div class="tabs">
        <button class="tab" id="tabAR" onclick="MODULES.accounting.tab('ar')">應收款項</button>
        <button class="tab" id="tabAP" onclick="MODULES.accounting.tab('ap')">應付款項</button>
        <button class="tab" id="tabSal" onclick="MODULES.accounting.tab('salary')">員工薪資</button>
      </div>
      <div id="acctWrap"><div class="card"><div id="acctArea"><div class="empty">載入中...</div></div></div></div>`;
    this.tab(this._tab || 'ar');
  },
  tab(which) {
    this._tab = which;
    document.getElementById('tabAR').classList.toggle('active', which === 'ar');
    document.getElementById('tabAP').classList.toggle('active', which === 'ap');
    document.getElementById('tabSal').classList.toggle('active', which === 'salary');
    if (which === 'salary') { this.renderSalary(); return; }
    document.getElementById('acctWrap').innerHTML =
      '<div class="card"><div id="acctArea"><div class="empty">載入中...</div></div></div>';
    if (which === 'ar') this.loadAR(); else this.loadAP();
  },

  /* ── 員工薪資 (薪資單存於應付款項，僅本頁籤可查) ── */
  renderSalary() {
    document.getElementById('acctWrap').innerHTML = `
      <div class="toolbar">
        <input class="search" id="salSearch" placeholder="搜尋 員工代號 / 姓名 / 項目 / 單號">
        <button class="btn" id="salSearchBtn">搜尋</button>
        <button class="btn ghost" id="salBonusBtn" style="margin-left:auto">＋ 本月獎金</button>
        <button class="btn" id="salPayBtn">本月發薪</button>
      </div>
      <div class="hint" style="margin-bottom:10px">
        「本月發薪」會為狀態「正常」的員工各建立一筆當月薪資應付款（項目：年月薪資、金額：帳號管理設定的薪資、狀態：待付款），同一個月重複按不會重複建立。
        「＋ 本月獎金」則手動選員工、輸入金額建立獎金單（項目：年月獎金）。薪資與獎金單都不會出現在「應付款項」功能，只有這裡查得到。
      </div>
      <div class="card"><div id="salArea"><div class="empty">載入中...</div></div></div>`;
    document.getElementById('salSearchBtn').onclick = () => this.loadSalary();
    document.getElementById('salSearch').addEventListener('keydown', e => { if (e.key === 'Enter') this.loadSalary(); });
    document.getElementById('salPayBtn').onclick = () => this.payMonth();
    document.getElementById('salBonusBtn').onclick = () => this.bonusForm();
    this.loadSalary();
  },
  // 本月獎金：空白表單自行選員工/輸入金額
  async bonusForm() {
    const emps = await getLookup('employees');
    const now = new Date();
    const item = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}獎金`;
    openForm({
      title: '本月獎金',
      fields: [
        { name: 'emp_id', label: '員工', type: 'select', required: true, options: options(emps, 'emp_id', 'name') },
        { name: '_proj', label: '專案編號', type: 'text', readonly: true, value: '員工獎金' },
        { name: '_item', label: '項目', type: 'text', readonly: true, value: item },
        { name: 'amount', label: '獎金金額', type: 'number', step: '1', required: true },
        { name: '_status', label: '狀態', type: 'text', readonly: true, value: '待付款' },
        { name: 'note', label: '備註', type: 'textarea', full: true },
      ],
      onSubmit: async (v) => {
        const r = await api('/api/accounting/salaries/bonus', { method: 'POST', body: v });
        alert(`已建立 ${r.item}：${r.emp_name}（單號 ${r.ap_id}）`);
        MODULES.accounting.loadSalary();
      },
    });
  },
  async loadSalary() {
    const q = (document.getElementById('salSearch')?.value || '').trim();
    const data = await api('/api/accounting/salaries?q=' + encodeURIComponent(q));
    document.getElementById('salArea').innerHTML = pagedTable([
      { key: 'ap_id', label: '付款單號' },
      { key: 'emp_name', label: '廠商(員工姓名)', render: r => `${esc(r.emp_name || '')}${r.emp_id ? '（' + esc(r.emp_id) + '）' : ''}` },
      { key: '_proj', label: '專案編號', render: r => /獎金$/.test(r.item || '') ? '員工獎金' : '員工薪資' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '應付金額', num: true, render: r => money(r.amount) },
      { key: 'discount', label: '折讓金額', num: true, render: r => money(r.discount) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
      { key: 'paid_date', label: '付款日期', render: r => fmtDate(r.paid_date) },
      { key: 'paid_amount', label: '實付金額', num: true, render: r => money(r.paid_amount) },
      { key: '_', label: '維護', render: r => `<button class="btn sm" onclick="MODULES.accounting.editSalary('${r.ap_id}')">維護</button>` },
    ], data.rows);
  },
  async payMonth() {
    const now = new Date();
    const ym = `${now.getFullYear()}年${now.getMonth() + 1}月`;
    if (!confirm(`確定要建立 ${ym} 的薪資應付款嗎？\n(狀態「正常」且有設定薪資的員工各一筆，已建立過的不會重複)`)) return;
    const btn = document.getElementById('salPayBtn');
    btn.disabled = true; btn.textContent = '處理中...';
    try {
      const r = await api('/api/accounting/salaries/pay-month', { method: 'POST' });
      const lines = [`${r.item} 發薪完成。`, `新增 ${r.created.length} 筆${r.created.length ? '：' + r.created.join('、') : ''}`];
      if (r.skipped.length) lines.push(`已存在略過 ${r.skipped.length} 筆：${r.skipped.join('、')}`);
      if (r.no_salary.length) lines.push(`未設定薪資略過 ${r.no_salary.length} 筆：${r.no_salary.join('、')}`);
      alert(lines.join('\n'));
      this.loadSalary();
    } catch (e) { alert(e.message); }
    finally { btn.disabled = false; btn.textContent = '本月發薪'; }
  },
  async editSalary(id) {
    const p = await api('/api/accounting/salaries/' + id);
    const d = p.salary_detail || p.prev_detail || {};   // 本單明細；沒有則帶上次的預填
    const n = (v) => Math.round(Number(v)) || 0;
    window.__salGross = n(p.amount);
    openForm({
      title: `員工薪資維護 ${id}（${p.emp_name || ''}）`,
      fields: [
        { name: '_item', label: '項目', type: 'text', readonly: true, value: p.item },
        { name: '_amount', label: '應發薪資', type: 'text', readonly: true, value: money(p.amount) },
        { name: 'labor_ins', label: '勞保自付', type: 'number', step: '1', value: d.labor_ins || 0, oninput: 'calcSalaryNet()' },
        { name: 'health_ins', label: '健保自付', type: 'number', step: '1', value: d.health_ins || 0, oninput: 'calcSalaryNet()' },
        { name: 'salary_tax', label: '所得稅扣繳', type: 'number', step: '1', value: d.salary_tax || 0, oninput: 'calcSalaryNet()' },
        { name: 'paid_amount', label: '實發金額', type: 'number', step: '1', readonly: true,
          value: p.paid_amount ?? (n(p.amount) - n(d.labor_ins) - n(d.health_ins) - n(d.salary_tax)),
          hint: '＝應發 − 勞保 − 健保 − 所得稅，自動計算' },
        { name: 'emp_labor', label: '公司負擔-勞保', type: 'number', step: '1', value: d.emp_labor || 0, hint: '不影響實發，供成本與申報記錄' },
        { name: 'emp_health', label: '公司負擔-健保', type: 'number', step: '1', value: d.emp_health || 0, hint: '不影響實發，供成本與申報記錄' },
        { name: 'pension', label: '公司負擔-勞退6%', type: 'number', step: '1', value: d.pension || 0, hint: '不影響實發，供成本與申報記錄' },
        { name: 'status', label: '狀態', type: 'select', options: statusSelectOptions(['已付款', '待付款'], '已付款') },
        { name: 'paid_date', label: '付款日期', type: 'date', value: fmtDate(p.paid_date) || new Date().toISOString().slice(0, 10) },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: p.note },
      ],
      onSubmit: async (v) => {
        const body = {
          status: v.status, paid_date: v.paid_date, note: v.note,
          paid_amount: n(v.paid_amount),
          salary_detail: {
            labor_ins: n(v.labor_ins), health_ins: n(v.health_ins), salary_tax: n(v.salary_tax),
            emp_labor: n(v.emp_labor), emp_health: n(v.emp_health), pension: n(v.pension),
          },
        };
        await api(`/api/accounting/salaries/${id}/pay`, { method: 'PATCH', body });
        MODULES.accounting.loadSalary();
      },
    });
    calcSalaryNet();   // 依預填值先算一次實發
  },
  async loadAR() {
    const ar = await api('/api/accounting/receivables');
    document.getElementById('acctArea').innerHTML = pagedTable([
      { key: 'ar_id', label: '收款單號' },
      { key: 'cust_name', label: '客戶' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '應收金額', num: true, render: r => money(r.amount) },
      { key: 'discount', label: '折讓金額', num: true, render: r => money(r.discount) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
      { key: 'received_date', label: '收款日期', render: r => fmtDate(r.received_date) },
      { key: 'received_amount', label: '實收金額', num: true, render: r => money(r.received_amount) },
      { key: 'created_by_name', label: '填表人' },
      { key: '_', label: '維護', render: r => `<button class="btn sm" onclick="MODULES.accounting.editAR('${r.ar_id}')">維護</button>` },
    ], ar);
  },
  async loadAP() {
    const ap = await api('/api/accounting/payables');
    document.getElementById('acctArea').innerHTML = pagedTable([
      { key: 'ap_id', label: '付款單號' },
      { key: 'vend_name', label: '廠商' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '應付金額', num: true, render: r => money(r.amount) },
      { key: 'discount', label: '折讓金額', num: true, render: r => money(r.discount) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
      { key: 'paid_date', label: '付款日期', render: r => fmtDate(r.paid_date) },
      { key: 'paid_amount', label: '實付金額', num: true, render: r => money(r.paid_amount) },
      { key: 'created_by_name', label: '填表人' },
      { key: '_', label: '維護', render: r => `<button class="btn sm" onclick="MODULES.accounting.editAP('${r.ap_id}')">維護</button>` },
    ], ap);
  },
  // 維護表單：完整欄位皆可修改 (含原始單據資訊 + 會計收付款資訊)
  async editAR(id) {
    const r = await api('/api/receivables/' + id);
    const [custs, quotes, projs] = [await getLookup('customers'), await getLookup('quotes'), await getLookup('projects')];
    let itemOpts = await api('/api/options/receivable_item');
    if (r.item && !itemOpts.includes(r.item)) itemOpts = [r.item, ...itemOpts];
    let rmOpts = await api('/api/options/receivable_receive_method');
    if (r.receive_method && !rmOpts.includes(r.receive_method)) rmOpts = [r.receive_method, ...rmOpts];
    const num = (v) => Math.round(Number(v)) || 0;
    openForm({
      title: '會計維護 - 應收 ' + id,
      fields: [
        { name: 'cust_id', label: '客戶', type: 'select', options: options(custs, 'cust_id', 'name', r.cust_id) },
        { name: 'quote_id', label: '報價單號', type: 'select', options: options(quotes, 'quote_id', 'proj_name', r.quote_id) },
        { name: 'proj_id', label: '專案編號', type: 'select', options: options(projs, 'proj_id', 'proj_name', r.proj_id) },
        { name: 'due_date', label: '應收日期', type: 'date', value: fmtDate(r.due_date) },
        { name: 'item', label: '項目', type: 'select', options: optionsFromList(itemOpts, r.item) },
        { name: 'amount', label: '應收金額', type: 'number', step: '1', value: num(r.amount) },
        { name: 'tax', label: '5%稅額', type: 'number', step: '1', value: num(r.tax), hint: '留空則自動以金額×5%計算' },
        { name: 'invoice_no', label: '發票號碼', value: r.invoice_no, hint: '格式如 AB-12345678' },
        { name: 'invoice_date', label: '發票日期', type: 'date', value: fmtDate(r.invoice_date), hint: '營業稅(401)申報依此日期歸期' },
        { name: 'invoice_void', label: '發票作廢', type: 'checkbox', checkLabel: '此發票已作廢', value: r.invoice_void },
        { name: 'is_retention', label: '保留款', type: 'checkbox', checkLabel: '此筆為保留款/保固金', value: r.is_retention },
        { name: 'status', label: '狀態', type: 'select', options: statusSelectOptions(['已收款', '待收款'], '已收款') },
        { name: 'received_date', label: '收款日期', type: 'date', value: fmtDate(r.received_date) || new Date().toISOString().slice(0, 10) },
        { name: 'receive_method', label: '收款方式', type: 'select', options: optionsFromList(rmOpts, r.receive_method || '現金', false) },
        { name: 'discount', label: '折讓金額', type: 'number', step: '1', value: num(r.discount) },
        { name: 'received_amount', label: '實收金額', type: 'number', step: '1',
          value: r.received_amount ?? (num(r.amount) + num(r.tax) - num(r.discount)), hint: '預帶 金額＋稅額－折讓，可修改' },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: r.note },
      ],
      onSubmit: async (v) => { await api(`/api/receivables/${id}/receive`, { method: 'PATCH', body: v }); MODULES.accounting.tab('ar'); },
    });
  },
  async editAP(id) {
    const p = await api('/api/payables/' + id);
    const [vends, projs] = [await getLookup('vendors'), await getLookup('projects')];
    let itemOpts = await api('/api/options/payable_item');
    if (p.item && !itemOpts.includes(p.item)) itemOpts = [p.item, ...itemOpts];
    let expOpts = await api('/api/options/expense_category');
    if (p.expense_category && !expOpts.includes(p.expense_category)) expOpts = [p.expense_category, ...expOpts];
    let pmOpts = await api('/api/options/payable_pay_method');
    if (p.pay_method && !pmOpts.includes(p.pay_method)) pmOpts = [p.pay_method, ...pmOpts];
    const num = (v) => Math.round(Number(v)) || 0;
    openForm({
      title: '會計維護 - 應付 ' + id,
      fields: [
        { name: 'vend_id', label: '廠商', type: 'select', options: options(vends, 'vend_id', 'company_name', p.vend_id) },
        { name: 'proj_id', label: '專案編號', type: 'select', options: options(projs, 'proj_id', 'proj_name', p.proj_id) },
        { name: 'due_date', label: '應付日期', type: 'date', value: fmtDate(p.due_date) },
        { name: 'item', label: '項目', type: 'select', options: optionsFromList(itemOpts, p.item) },
        { name: 'expense_category', label: '費用類別', type: 'select', options: optionsFromList(expOpts, p.expense_category), hint: '非專案的營業費用請選類別' },
        { name: 'amount', label: '應付金額', type: 'number', step: '1', value: num(p.amount) },
        { name: 'doc_type', label: '憑證類別', type: 'select',
          options: optionsFromList(['三聯式發票', '電子發票(含統編)', '二聯式發票', '收據', '免用統一發票', '勞務報酬單'], p.doc_type),
          hint: '僅三聯式/含統編電子發票可扣抵進項稅額' },
        { name: 'tax_deduct', label: '抵扣稅額', type: 'number', step: '1', value: num(p.tax_deduct), hint: '非可扣抵憑證系統會自動歸零' },
        { name: 'invoice_no', label: '發票號碼', value: p.invoice_no, hint: '格式如 AB-12345678' },
        { name: 'invoice_date', label: '發票日期', type: 'date', value: fmtDate(p.invoice_date), hint: '營業稅(401)申報依此日期歸期' },
        { name: 'invoice_void', label: '發票作廢', type: 'checkbox', checkLabel: '此發票已作廢', value: p.invoice_void },
        { name: 'income_type', label: '所得類別', type: 'select',
          options: optionsFromList(['薪資所得(50)', '執行業務所得(9B)', '其他所得(92)'], p.income_type),
          hint: '付款對象為個人(無發票)時填寫' },
        { name: 'withholding_tax', label: '扣繳稅額', type: 'number', step: '1', value: num(p.withholding_tax) },
        { name: 'nhi_surcharge', label: '二代健保補充保費', type: 'number', step: '1', value: num(p.nhi_surcharge) },
        { name: 'status', label: '狀態', type: 'select', options: statusSelectOptions(['已付款', '待付款'], '已付款') },
        { name: 'paid_date', label: '付款日期', type: 'date', value: fmtDate(p.paid_date) || new Date().toISOString().slice(0, 10) },
        { name: 'discount', label: '折讓金額', type: 'number', step: '1', value: num(p.discount) },
        { name: 'paid_amount', label: '實付金額', type: 'number', step: '1',
          value: p.paid_amount ?? (num(p.amount) - num(p.discount)), hint: '預帶 金額－折讓，可修改' },
        { name: 'pay_method', label: '付款方式', type: 'select', options: optionsFromList(pmOpts, p.pay_method || '現金', false) },
        { name: 'check_no', label: '支票號碼', value: p.check_no, hint: '付款方式為支票時填寫' },
        { name: 'check_due', label: '支票到期日', type: 'date', value: fmtDate(p.check_due), hint: '付款方式為支票時填寫' },
        { name: 'note', label: '備註', type: 'textarea', full: true, value: p.note },
      ],
      onSubmit: async (v) => { await api(`/api/payables/${id}/pay`, { method: 'PATCH', body: v }); MODULES.accounting.tab('ap'); },
    });
  },
};

/* ── 公司報表 (營收結算 / 專案獲利 兩個分頁) ──────────── */
// 期間查詢列：年份 + 月份起迄 (前綴 id 供各分頁各自使用)
function periodToolbar(prefix, defFrom, defTo, extraHtml = '') {
  const now = new Date();
  const thisYear = now.getFullYear();
  const years = [];
  for (let y = thisYear + 1; y >= thisYear - 6; y--) years.push(y);
  const monthOpts = (sel) => Array.from({ length: 12 }, (_, i) => i + 1)
    .map(m => `<option value="${m}" ${m === sel ? 'selected' : ''}>${m} 月</option>`).join('');
  return `<div class="toolbar">
    <span class="tb-label">年份</span>
    <select id="${prefix}Year">${years.map(y => `<option ${y === thisYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
    <span class="tb-label">期間</span>
    <select id="${prefix}From">${monthOpts(defFrom)}</select>
    <span class="tb-sep">～</span>
    <select id="${prefix}To">${monthOpts(defTo)}</select>
    <button class="btn" id="${prefix}Search">查詢</button>
    ${extraHtml}
  </div>`;
}
function readPeriod(prefix) {
  return {
    year: Number(document.getElementById(prefix + 'Year').value),
    from: Number(document.getElementById(prefix + 'From').value),
    to: Number(document.getElementById(prefix + 'To').value),
  };
}
const ACCT_DATE_HINT = '歸期方式：應收「已收款」依收款日期、「待收款」依應收日期；應付「已付款」依付款日期、「待付款」依建立日期。';

MODULES.acctreport = {
  title: '公司報表', perm: 'perm_accounting',
  _tab: 'revenue', _data: null, _proj: null,
  render() {
    clearTopAction();
    document.getElementById('content').innerHTML = `
      <div class="tabs">
        <button class="tab" id="tabRev" onclick="MODULES.acctreport.tab('revenue')">營收結算</button>
        <button class="tab" id="tabProf" onclick="MODULES.acctreport.tab('profit')">專案獲利</button>
        <button class="tab" id="tabAging" onclick="MODULES.acctreport.tab('aging')">帳齡分析</button>
        <button class="tab" id="tabVat" onclick="MODULES.acctreport.tab('vat')">營業稅申報(401)</button>
        <button class="tab" id="tabWh" onclick="MODULES.acctreport.tab('wh')">扣繳彙總</button>
      </div>
      <div id="rpBody"></div>`;
    this.tab(this._tab || 'revenue');
  },
  tab(which) {
    this._tab = which;
    for (const [id2, k] of [['tabRev', 'revenue'], ['tabProf', 'profit'], ['tabAging', 'aging'], ['tabVat', 'vat'], ['tabWh', 'wh']]) {
      document.getElementById(id2).classList.toggle('active', which === k);
    }
    if (which === 'revenue') this.renderRevenue();
    else if (which === 'profit') this.renderProfit();
    else if (which === 'aging') this.renderAging();
    else if (which === 'wh') this.renderWithholding();
    else this.renderVat();
  },

  /* ── 帳齡分析：待收款依逾期天數分桶 (以今天為基準) ── */
  _aging: null,
  async renderAging() {
    document.getElementById('rpBody').innerHTML = `
      <div class="toolbar">
        <button class="btn" id="agReload">重新整理</button>
        <button class="btn ghost" id="agCsv" style="margin-left:auto">匯出CSV</button>
      </div>
      <div class="hint" style="margin-bottom:10px">
        所有「待收款」依應收日期與今天的差距分桶，用於催款排序；含保留款（會標示）。
      </div>
      <div id="agArea"><div class="empty">載入中...</div></div>`;
    document.getElementById('agReload').onclick = () => this.loadAging();
    document.getElementById('agCsv').onclick = () => this.exportAgingCSV();
    this.loadAging();
  },
  async loadAging() {
    const area = document.getElementById('agArea');
    try {
      this._aging = await api('/api/accounting/aging');
      const a = this._aging;
      const card = (label, value, cls = '') =>
        `<div class="sum-card ${cls}"><div class="k">${esc(label)}</div><div class="v">${money(value)}</div></div>`;
      const custTable = tableHtml([
        { key: 'cust_name', label: '客戶' },
        { key: 'mobile', label: '手機' },
        { key: 'count', label: '筆數', num: true },
        { key: 'not_due', label: '未逾期', num: true, render: r => money(r.not_due) },
        { key: 'd1_30', label: '逾期1-30天', num: true, render: r => money(r.d1_30) },
        { key: 'd31_60', label: '31-60天', num: true, render: r => money(r.d31_60) },
        { key: 'd61_90', label: '61-90天', num: true, render: r => money(r.d61_90) },
        { key: 'd90p', label: '90天以上', num: true, render: r => money(r.d90p) },
        { key: 'total', label: '合計', num: true, render: r => `<b>${money(r.total)}</b>` },
      ], a.customers, ['合計', '', `${a.rows.length} 筆`,
        money(a.buckets.not_due), money(a.buckets.d1_30), money(a.buckets.d31_60),
        money(a.buckets.d61_90), money(a.buckets.d90p), money(a.total)]);
      const bucketName = { not_due: '未逾期', d1_30: '1-30天', d31_60: '31-60天', d61_90: '61-90天', d90p: '90天以上' };
      const detTable = tableHtml([
        { key: 'ar_id', label: '收款單號' },
        { key: 'cust_name', label: '客戶' },
        { key: 'item', label: '項目', render: r => `${esc(r.item)}${r.is_retention ? ' <span class="badge amber">保留款</span>' : ''}` },
        { key: 'due_date', label: '應收日期', render: r => fmtDate(r.due_date) },
        { key: 'days_overdue', label: '逾期天數', num: true, render: r => (r.days_overdue > 0 ? `<span class="neg-num">${r.days_overdue}</span>` : '—') },
        { key: 'bucket', label: '帳齡', render: r => bucketName[r.bucket] || '' },
        { key: 'outstanding', label: '未收金額(含稅)', num: true, render: r => money(r.outstanding) },
      ], a.rows, ['合計', '', '', '', '', '', money(a.total)]);
      area.innerHTML = `
        <div class="section-title">帳齡彙總（基準日 ${a.as_of}）</div>
        <div class="sum-grid">
          ${card('未逾期', a.buckets.not_due)}
          ${card('逾期 1-30 天', a.buckets.d1_30, a.buckets.d1_30 ? 'amber' : '')}
          ${card('逾期 31-60 天', a.buckets.d31_60, a.buckets.d31_60 ? 'amber' : '')}
          ${card('逾期 61-90 天', a.buckets.d61_90, a.buckets.d61_90 ? 'neg' : '')}
          ${card('逾期 90 天以上', a.buckets.d90p, a.buckets.d90p ? 'neg' : '')}
          ${card('待收款總額（含稅）', a.total, 'hl')}
        </div>
        <div class="section-title">各客戶帳齡（依未收金額排序）</div>
        <div class="card" id="agCust">${custTable}</div>
        <div class="section-title">待收款明細（${a.rows.length} 筆）</div>
        <div class="card" id="agDet">${detTable}</div>`;
    } catch (e) { area.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  },
  exportAgingCSV() {
    if (!this._aging) { alert('請先載入報表。'); return; }
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [[q('應收帳齡分析'), q('基準日 ' + this._aging.as_of)].join(','), '', [q('各客戶帳齡')].join(',')];
    const t1 = document.querySelector('#agCust table');
    lines.push(...(t1 ? tableToCsvLines(t1) : []));
    lines.push('', [q('待收款明細')].join(','));
    const t2 = document.querySelector('#agDet table');
    lines.push(...(t2 ? tableToCsvLines(t2) : []));
    downloadCSV(lines, `帳齡分析_${this._aging.as_of}.csv`);
  },

  /* ── 扣繳彙總 (年度，供扣繳憑單申報彙整) ── */
  _wh: null,
  renderWithholding() {
    const thisYear = new Date().getFullYear();
    const years = [];
    for (let y = thisYear; y >= thisYear - 6; y--) years.push(y);
    document.getElementById('rpBody').innerHTML = `
      <div class="toolbar">
        <span class="tb-label">年度</span>
        <select id="whYear">${years.map(y => `<option ${y === thisYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <button class="btn" id="whSearch">查詢</button>
        <button class="btn ghost" id="whCsv" style="margin-left:auto">匯出CSV</button>
      </div>
      <div class="hint" style="margin-bottom:10px">
        彙總年度內「已付款」的個人所得給付（應付款有填所得類別者）與員工薪資/獎金，
        供年初開立扣繳憑單使用；正式申報媒體檔請由記帳士以此表轉檔。
      </div>
      <div id="whArea"><div class="empty">請選擇年度後按「查詢」</div></div>`;
    document.getElementById('whSearch').onclick = () => this.loadWithholding();
    document.getElementById('whCsv').onclick = () => this.exportWhCSV();
    this.loadWithholding();
  },
  async loadWithholding() {
    const year = Number(document.getElementById('whYear').value);
    const area = document.getElementById('whArea');
    area.innerHTML = '<div class="empty">查詢中...</div>';
    try {
      this._wh = await api('/api/accounting/withholding?year=' + year);
      const w = this._wh;
      const t1 = tableHtml([
        { key: 'payee', label: '所得人' },
        { key: 'tax_id', label: '統編' },
        { key: 'income_type', label: '所得類別' },
        { key: 'cnt', label: '筆數', num: true },
        { key: 'total_paid', label: '給付總額', num: true, render: r => money(r.total_paid) },
        { key: 'withholding', label: '扣繳稅額', num: true, render: r => money(r.withholding) },
        { key: 'nhi', label: '二代健保', num: true, render: r => money(r.nhi) },
      ], w.others);
      const t2 = tableHtml([
        { key: 'emp_id', label: '員工代號' },
        { key: 'payee', label: '姓名' },
        { key: 'cnt', label: '筆數', num: true },
        { key: 'total_paid', label: '給付總額(薪資+獎金)', num: true, render: r => money(r.total_paid) },
        { key: 'withholding', label: '扣繳稅額', num: true, render: r => money(r.withholding) },
      ], w.salaries);
      area.innerHTML = `
        <div class="section-title">${w.year} 年（民國 ${w.year - 1911} 年）個人/廠商所得給付</div>
        <div class="card" id="whOther">${t1}</div>
        <div class="section-title">員工薪資所得(50)</div>
        <div class="card" id="whSal">${t2}</div>`;
    } catch (e) { this._wh = null; area.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  },
  exportWhCSV() {
    if (!this._wh) { alert('請先查詢。'); return; }
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [[q('各類所得扣繳彙總'), q(`${this._wh.year} 年 (民國 ${this._wh.year - 1911} 年)`)].join(','), '', [q('個人/廠商所得給付')].join(',')];
    const t1 = document.querySelector('#whOther table');
    lines.push(...(t1 ? tableToCsvLines(t1) : [q('查無資料')]));
    lines.push('', [q('員工薪資所得(50)')].join(','));
    const t2 = document.querySelector('#whSal table');
    lines.push(...(t2 ? tableToCsvLines(t2) : [q('查無資料')]));
    downloadCSV(lines, `扣繳彙總_${this._wh.year}年.csv`);
  },

  /* ── 分頁一：營收結算 (預設今年 1 月 ～ 當月) ── */
  renderRevenue() {
    const thisMonth = new Date().getMonth() + 1;
    document.getElementById('rpBody').innerHTML =
      periodToolbar('rp', 1, thisMonth, '<button class="btn ghost" id="rpCsv" style="margin-left:auto">匯出CSV</button>') +
      `<div class="hint" style="margin-bottom:10px">${ACCT_DATE_HINT}</div>
       <div id="rpArea"><div class="empty">請選擇年份與月份起迄期間後按「查詢」</div></div>`;
    document.getElementById('rpSearch').onclick = () => this.load();
    document.getElementById('rpCsv').onclick = () => this.exportCSV();
    this.load();
  },
  async load() {
    const { year, from, to } = readPeriod('rp');
    if (from > to) { alert('起始月份不可大於結束月份。'); return; }
    const area = document.getElementById('rpArea');
    area.innerHTML = '<div class="empty">查詢中...</div>';
    try {
      this._data = await api(`/api/accounting/report?year=${year}&from=${from}&to=${to}`);
      this.paint();
    } catch (e) {
      this._data = null;
      area.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  },
  // 損益表列 (財務報表型式)：金額負數紅字；pctVal 顯示占營收比
  _finRow(label, value, cls = '', pctVal = null) {
    const amt = (value === null || value === undefined) ? ''
      : `<span class="${Number(value) < 0 ? 'neg-num' : ''}">${money(value)}</span>`;
    return `<tr class="${cls}"><td class="fin-label">${label}</td>
      <td class="num">${amt}</td>
      <td class="num fin-pct">${pctVal === null || pctVal === undefined ? '' : pctVal.toFixed(1) + '%'}</td></tr>`;
  },
  paint() {
    const { period: p, receivables: ar, payables: ap, summary: s, statement: f } = this._data;
    const card = (label, value, cls = '') =>
      `<div class="sum-card ${cls}"><div class="k">${esc(label)}</div><div class="v">${money(value)}</div></div>`;
    const colSum = (rows, key) => rows.reduce((t, r) => t + (Number(r[key]) || 0), 0);
    const R = this._finRow;

    // ── 損益表 ──
    const finTable = `<div class="card fin-card"><table class="fin-table">
      <thead><tr><th>損益表（權責基礎，未稅）</th><th class="num">金額</th><th class="num fin-pct">占營收</th></tr></thead>
      <tbody>
        ${R('營業收入', null, 'fin-sec')}
        ${R('　工程收入（應收款項）', f.revenue)}
        ${f.sales_discount ? R('　減：銷貨折讓', -f.sales_discount) : ''}
        ${R('營業收入淨額', f.net_revenue, 'fin-sub', 100)}
        ${R('營業成本', null, 'fin-sec')}
        ${R('　工程成本（專案應付款項）', -f.cost)}
        ${f.cost_discount ? R('　減：進貨折讓', f.cost_discount) : ''}
        ${R('營業毛利', f.gross, 'fin-sub', f.gross_pct)}
        ${R('營業費用', null, 'fin-sec')}
        ${f.expenses.map(e => R('　' + esc(e.name), -e.amount)).join('')}
        ${f.expenses.length ? '' : R('　（本期無營業費用）', null)}
        ${R('營業費用合計', -f.expense_total, 'fin-sub')}
        ${R('本期損益', f.net_income, 'fin-total', f.net_pct)}
      </tbody></table>
      <div class="hint" style="padding:0 16px 12px">
        附註：銷項稅額 ${money(f.sales_tax)}、進項可扣抵稅額 ${money(f.purchase_tax)}（代收代付性質，不列入損益）；
        費用含薪資/獎金與各費用類別（未掛專案之應付款）。
      </div></div>`;

    const arTable = tableHtml([
      { key: 'acct_date', label: '歸屬日期', render: r => fmtDate(r.acct_date) },
      { key: 'ar_id', label: '收款單號' },
      { key: 'cust_name', label: '客戶' },
      { key: 'proj_name', label: '專案' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '應收金額', num: true, render: r => money(r.amount) },
      { key: 'tax', label: '稅額', num: true, render: r => money(r.tax) },
      { key: 'discount', label: '折讓金額', num: true, render: r => money(r.discount) },
      { key: 'received_amount', label: '實收金額', num: true, render: r => money(r.received_amount) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
    ], ar, ['合計', `${ar.length} 筆`, '', '', '',
      money(colSum(ar, 'amount')), money(colSum(ar, 'tax')),
      money(s.ar_discount), money(s.ar_received), '']);

    const apTable = tableHtml([
      { key: 'acct_date', label: '歸屬日期', render: r => fmtDate(r.acct_date) },
      { key: 'ap_id', label: '付款單號' },
      { key: 'vend_name', label: '廠商' },
      { key: 'proj_name', label: '專案' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '應付金額', num: true, render: r => money(r.amount) },
      { key: 'tax_deduct', label: '抵扣稅額', num: true, render: r => money(r.tax_deduct) },
      { key: 'discount', label: '折讓金額', num: true, render: r => money(r.discount) },
      { key: 'paid_amount', label: '實付金額', num: true, render: r => money(r.paid_amount) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
    ], ap, ['合計', `${ap.length} 筆`, '', '', '',
      money(s.ap_total), money(s.ap_tax_deduct), money(s.ap_discount), money(s.ap_paid), '']);

    document.getElementById('rpArea').innerHTML = `
      <div class="section-title">結算期間：${p.year} 年 ${p.from} 月 ～ ${p.to} 月</div>
      ${finTable}
      <div class="section-title">現金流量（同期間）</div>
      <div class="sum-grid">
        ${card('實收金額', s.ar_received)}
        ${card('實付金額', s.ap_paid)}
        ${card('淨現金流（實收－實付）', f.net_cash, 'hl ' + (f.net_cash < 0 ? 'neg' : ''))}
        ${card('待收款（含稅）', s.ar_pending, 'amber')}
        ${card('待付款', s.ap_pending, 'amber')}
      </div>
      <div class="section-title">應收帳款明細（${s.ar_count} 筆）</div>
      <div class="card" id="rpAR">${arTable}</div>
      <div class="section-title">應付帳款明細（${s.ap_count} 筆）</div>
      <div class="card" id="rpAP">${apTable}</div>`;
  },
  exportCSV() {
    if (!this._data) { alert('請先查詢報表。'); return; }
    const { period: p, summary: s, statement: f } = this._data;
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const row2 = (a, b) => [q(a), q(b)].join(',');
    const lines = [
      row2('損益表（權責基礎，未稅）', `${p.year} 年 ${p.from} 月 ～ ${p.to} 月`),
      '',
      row2('工程收入(應收款項)', f.revenue),
      row2('減：銷貨折讓', -f.sales_discount),
      row2('營業收入淨額', f.net_revenue),
      row2('工程成本(專案應付款項)', -f.cost),
      row2('減：進貨折讓', f.cost_discount),
      row2('營業毛利', f.gross),
      ...f.expenses.map(e => row2('營業費用－' + e.name, -e.amount)),
      row2('營業費用合計', -f.expense_total),
      row2('本期損益', f.net_income),
      '',
      row2('附註：銷項稅額', f.sales_tax),
      row2('附註：進項可扣抵稅額', f.purchase_tax),
      row2('現金流量：實收金額', s.ar_received),
      row2('現金流量：實付金額', s.ap_paid),
      row2('現金流量：淨現金流', f.net_cash),
      row2('待收款(含稅)', s.ar_pending),
      row2('待付款', s.ap_pending),
      '',
      [q('應收帳款明細')].join(','),
    ];
    const arT = document.querySelector('#rpAR table');
    lines.push(...(arT ? tableToCsvLines(arT) : [q('查無資料')]));
    lines.push('', [q('應付帳款明細')].join(','));
    const apT = document.querySelector('#rpAP table');
    lines.push(...(apT ? tableToCsvLines(apT) : [q('查無資料')]));
    downloadCSV(lines, `公司報表_${p.year}年${p.from}-${p.to}月.csv`);
  },

  /* ── 分頁二：專案獲利 (預設近一個月＝當月) ── */
  renderProfit() {
    const thisMonth = new Date().getMonth() + 1;
    document.getElementById('rpBody').innerHTML =
      periodToolbar('pp', thisMonth, thisMonth, '<button class="btn ghost" id="ppCsv" style="margin-left:auto">匯出CSV</button>') +
      `<div class="hint" style="margin-bottom:10px">
         各專案期間內的應收款項與應付款項合計 (未稅金額)，營收金額 ＝ 應收 － 應付，利潤% ＝ 營收 ÷ 應收 (無應收款以「—」表示)。
         未填專案編號的單據 (營業費用/薪資) 不列入本頁，仍計入「營收結算」。${ACCT_DATE_HINT}
       </div>
       <div id="ppArea"><div class="empty">請選擇年份與月份起迄期間後按「查詢」</div></div>`;
    document.getElementById('ppSearch').onclick = () => this.loadProfit();
    document.getElementById('ppCsv').onclick = () => this.exportProfitCSV();
    this.loadProfit();
  },
  async loadProfit() {
    const { year, from, to } = readPeriod('pp');
    if (from > to) { alert('起始月份不可大於結束月份。'); return; }
    const area = document.getElementById('ppArea');
    area.innerHTML = '<div class="empty">查詢中...</div>';
    try {
      this._proj = await api(`/api/accounting/project-profit?year=${year}&from=${from}&to=${to}`);
      this.paintProfit();
    } catch (e) {
      this._proj = null;
      area.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    }
  },
  paintProfit() {
    const { period: p, rows, summary: s } = this._proj;
    const card = (label, value, cls = '') =>
      `<div class="sum-card ${cls}"><div class="k">${esc(label)}</div><div class="v">${money(value)}</div></div>`;
    const profitCell = (v) => `<span class="${Number(v) < 0 ? 'neg-num' : ''}">${money(v)}</span>`;
    // 利潤% = 營收 ÷ 應收；無應收款時不計算
    const pctCell = (v) => (v === null || v === undefined || v === '') ? '—'
      : `<span class="${Number(v) < 0 ? 'neg-num' : ''}">${Number(v).toFixed(1)}%</span>`;

    const table = tableHtml([
      // 有專案權限才做成連結，否則純文字 (避免點了被擋)
      { key: 'proj_id', label: '專案編號', render: r =>
        (USER.perm_admin || USER.perm_project)
          ? `<a class="link" onclick="MODULES.project.detail('${r.proj_id}')">${esc(r.proj_id)}</a>`
          : esc(r.proj_id) },
      { key: 'proj_name', label: '專案名稱' },
      { key: 'cust_name', label: '客戶' },
      { key: 'proj_status', label: '專案狀態' },
      { key: 'ar_amount', label: '應收款項', num: true, render: r => money(r.ar_amount) },
      { key: 'ap_amount', label: '應付款項', num: true, render: r => money(r.ap_amount) },
      { key: 'profit', label: '營收金額', num: true, render: r => profitCell(r.profit) },
      { key: 'profit_pct', label: '利潤%', num: true, render: r => pctCell(r.profit_pct) },
      { key: 'sys_status', label: '狀態', render: r => r.sys_status ? statusBadge(r.sys_status) : '' },
    ], rows, ['合計', `${s.count} 筆`, '', '',
      money(s.ar_amount), money(s.ap_amount), profitCell(s.profit), pctCell(s.profit_pct), '']);

    document.getElementById('ppArea').innerHTML = `
      <div class="section-title">結算期間：${p.year} 年 ${p.from} 月 ～ ${p.to} 月</div>
      <div class="sum-grid">
        ${card('應收款項合計', s.ar_amount)}
        ${card('應付款項合計', s.ap_amount)}
        ${card('營收金額（應收－應付）', s.profit, 'hl ' + (s.profit < 0 ? 'neg' : ''))}
        <div class="sum-card ${s.profit_pct < 0 ? 'neg' : ''}"><div class="k">利潤%（營收÷應收）</div>
          <div class="v">${pctCell(s.profit_pct)}</div></div>
      </div>
      <div class="card" id="ppTable">${table}</div>`;
  },
  exportProfitCSV() {
    if (!this._proj) { alert('請先查詢報表。'); return; }
    const { period: p } = this._proj;
    const table = document.querySelector('#ppTable table');
    if (!table) { alert('目前沒有可匯出的明細。'); return; }
    const lines = [`"專案獲利","${p.year} 年 ${p.from} 月 ～ ${p.to} 月"`, '', ...tableToCsvLines(table)];
    downloadCSV(lines, `專案獲利_${p.year}年${p.from}-${p.to}月.csv`);
  },

  /* ── 分頁三：營業稅申報 401 (每 2 個月一期，依發票日期) ── */
  _vat: null,
  renderVat() {
    const now = new Date();
    const thisYear = now.getFullYear();
    const curTerm = Math.ceil((now.getMonth() + 1) / 2);
    const years = [];
    for (let y = thisYear + 1; y >= thisYear - 6; y--) years.push(y);
    const termOpts = [1, 2, 3, 4, 5, 6].map(t =>
      `<option value="${t}" ${t === curTerm ? 'selected' : ''}>第${t}期（${t * 2 - 1}-${t * 2}月）</option>`).join('');
    document.getElementById('rpBody').innerHTML = `
      <div class="toolbar">
        <span class="tb-label">年份</span>
        <select id="vtYear">${years.map(y => `<option ${y === thisYear ? 'selected' : ''}>${y}</option>`).join('')}</select>
        <span class="tb-label">期別</span>
        <select id="vtTerm">${termOpts}</select>
        <button class="btn" id="vtSearch">查詢</button>
        <button class="btn ghost" id="vtCsv" style="margin-left:auto">匯出CSV</button>
      </div>
      <div class="hint" style="margin-bottom:10px">
        依「發票日期」歸期：銷項＝應收款有發票號碼者（作廢發票列出但不計金額）；進項＝憑證類別為「三聯式發票／電子發票(含統編)」者。
        未填發票日期的單據不會納入，請先補齊。金額供對帳參考，申報請以記帳士核算為準。
      </div>
      <div id="vtArea"><div class="empty">請選擇期別後按「查詢」</div></div>`;
    document.getElementById('vtSearch').onclick = () => this.loadVat();
    document.getElementById('vtCsv').onclick = () => this.exportVatCSV();
    this.loadVat();
  },
  async loadVat() {
    const year = Number(document.getElementById('vtYear').value);
    const term = Number(document.getElementById('vtTerm').value);
    const area = document.getElementById('vtArea');
    area.innerHTML = '<div class="empty">查詢中...</div>';
    try {
      this._vat = await api(`/api/accounting/vat-return?year=${year}&term=${term}`);
      this.paintVat();
    } catch (e) { this._vat = null; area.innerHTML = `<div class="empty">${esc(e.message)}</div>`; }
  },
  paintVat() {
    const { period: p, sales, purchases, summary: s } = this._vat;
    const card = (label, value, cls = '') =>
      `<div class="sum-card ${cls}"><div class="k">${esc(label)}</div><div class="v">${money(value)}</div></div>`;
    const salesTable = tableHtml([
      { key: 'invoice_date', label: '發票日期', render: r => fmtDate(r.invoice_date) },
      { key: 'invoice_no', label: '發票號碼' },
      { key: 'ar_id', label: '收款單號' },
      { key: 'cust_name', label: '買受人' },
      { key: 'item', label: '項目' },
      { key: 'amount', label: '銷售額', num: true, render: r => r.invoice_void ? '—' : money(r.amount) },
      { key: 'tax', label: '稅額', num: true, render: r => r.invoice_void ? '—' : money(r.tax) },
      { key: '_v', label: '狀態', render: r => r.invoice_void ? '<span class="badge red">作廢</span>' : '<span class="badge green">開立</span>' },
    ], sales, ['合計', `${s.sales_count} 筆${s.void_count ? '（另作廢 ' + s.void_count + ' 筆）' : ''}`, '', '', '',
      money(s.sales_amount), money(s.sales_tax), '']);
    const purTable = tableHtml([
      { key: 'invoice_date', label: '發票日期', render: r => fmtDate(r.invoice_date) },
      { key: 'invoice_no', label: '發票號碼' },
      { key: 'doc_type', label: '憑證類別' },
      { key: 'ap_id', label: '付款單號' },
      { key: 'payee_name', label: '營業人/對象' },
      { key: 'item', label: '項目', render: r => esc(r.item || r.expense_category || '') },
      { key: 'amount', label: '金額', num: true, render: r => money(r.amount) },
      { key: 'tax_deduct', label: '可扣抵稅額', num: true, render: r => money(r.tax_deduct) },
    ], purchases, ['合計', `${s.purchase_count} 筆`, '', '', '', '',
      money(s.purchase_amount), money(s.purchase_tax)]);
    document.getElementById('vtArea').innerHTML = `
      <div class="section-title">申報期別：${p.year} 年（民國 ${p.roc_year} 年）第 ${p.term} 期（${p.months}）</div>
      <div class="sum-grid">
        ${card('銷項銷售額', s.sales_amount)}
        ${card('銷項稅額', s.sales_tax)}
        ${card('進項金額（可扣抵）', s.purchase_amount)}
        ${card('進項稅額', s.purchase_tax)}
        ${card(s.net_tax >= 0 ? '應納稅額（銷項－進項）' : '溢付稅額（銷項－進項）', s.net_tax, 'hl ' + (s.net_tax < 0 ? 'neg' : ''))}
      </div>
      ${s.other_purchase_count ? `<div class="hint" style="color:var(--warn);margin-bottom:10px">
        本期另有 ${s.other_purchase_count} 筆不可扣抵或未選憑證類別的應付憑證，未列入進項。</div>` : ''}
      <div class="section-title">銷項發票明細（${s.sales_count + s.void_count} 筆）</div>
      <div class="card" id="vtSales">${salesTable}</div>
      <div class="section-title">進項憑證明細（${s.purchase_count} 筆）</div>
      <div class="card" id="vtPur">${purTable}</div>`;
  },
  exportVatCSV() {
    if (!this._vat) { alert('請先查詢報表。'); return; }
    const { period: p, summary: s } = this._vat;
    const q = (v) => '"' + String(v).replace(/"/g, '""') + '"';
    const lines = [
      [q('營業稅申報(401)彙總'), q(`${p.year} 年(民國 ${p.roc_year} 年) 第 ${p.term} 期(${p.months})`)].join(','),
      '',
      [q('銷項銷售額'), q(s.sales_amount)].join(','),
      [q('銷項稅額'), q(s.sales_tax)].join(','),
      [q('進項金額(可扣抵)'), q(s.purchase_amount)].join(','),
      [q('進項稅額'), q(s.purchase_tax)].join(','),
      [q(s.net_tax >= 0 ? '應納稅額' : '溢付稅額'), q(s.net_tax)].join(','),
      '', [q('銷項發票明細')].join(','),
    ];
    const st = document.querySelector('#vtSales table');
    lines.push(...(st ? tableToCsvLines(st) : [q('查無資料')]));
    lines.push('', [q('進項憑證明細')].join(','));
    const pt = document.querySelector('#vtPur table');
    lines.push(...(pt ? tableToCsvLines(pt) : [q('查無資料')]));
    downloadCSV(lines, `營業稅401_${p.year}年第${p.term}期.csv`);
  },
};

// 員工薪資維護：實發金額 ＝ 應發 − 勞保自付 − 健保自付 − 所得稅扣繳
function calcSalaryNet() {
  const f = document.getElementById('modalForm');
  if (!f || !f.querySelector('[name=paid_amount]')) return;
  const n = (name) => Math.round(Number(f.querySelector(`[name=${name}]`)?.value)) || 0;
  f.querySelector('[name=paid_amount]').value =
    (window.__salGross || 0) - n('labor_ins') - n('health_ins') - n('salary_tax');
}

/* ── 帳號管理 ─────────────────────────────────────────── */
const PERM_LIST = [
  ['perm_admin', '系統管理者'], ['perm_customer', '客戶基本資料表'], ['perm_quote', '報價單'],
  ['perm_project', '專案管理資料表'], ['perm_vendor', '廠商基本資料表'], ['perm_payable', '應付款項'],
  ['perm_receivable', '應收款項'], ['perm_accounting', '會計'],
];
MODULES.account = {
  title: '帳號管理', perm: 'perm_admin',
  render() {
    renderListPage({ searchable: true, placeholder: '搜尋 員工代號 / 姓名 / 職務' });
    setTopAction('＋ 新增帳號', () => this.form());
    this.load('');
    document.getElementById('searchBtn').onclick = () => this.load(document.getElementById('searchInput').value.trim());
    document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key === 'Enter') this.load(e.target.value.trim()); });
  },
  async load(q) {
    const rows = await api('/api/accounts?q=' + encodeURIComponent(q || ''));
    document.getElementById('listArea').innerHTML = pagedTable([
      { key: 'emp_id', label: '員工代號', render: r => `<a class="link" onclick="MODULES.account.detail('${r.emp_id}')">${esc(r.emp_id)}</a>` },
      { key: 'name', label: '姓名' },
      { key: 'title', label: '職務名稱' },
      { key: 'salary', label: '薪資', num: true, render: r => money(r.salary) },
      { key: 'status', label: '狀態', render: r => statusBadge(r.status) },
      { key: 'last_login', label: '最後登入', render: r => fmtDT(r.last_login) },
      { key: '_', label: '操作', render: r => `<div class="row-actions">
          <button class="btn sm" onclick="MODULES.account.form('${r.emp_id}')">修改</button>
          <button class="btn danger sm" onclick="MODULES.account.remove('${r.emp_id}')">刪除</button>
        </div>` },
    ], rows);
  },
  async detail(id) {
    const a = await api('/api/accounts/' + id);
    const perms = PERM_LIST.filter(([k]) => a[k]).map(([, l]) => l).join('、') || '（無）';
    openModal('帳號明細 ' + a.emp_id, `<dl class="dl">
      <dt>員工代號</dt><dd>${esc(a.emp_id)}</dd>
      <dt>姓名</dt><dd>${esc(a.name)}</dd>
      <dt>職務名稱</dt><dd>${esc(a.title)}</dd>
      <dt>薪資</dt><dd>${money(a.salary)}</dd>
      <dt>入職日期</dt><dd>${fmtDate(a.hire_date)}</dd>
      <dt>離職日期</dt><dd>${fmtDate(a.resign_date)}</dd>
      <dt>最後登入</dt><dd>${fmtDT(a.last_login)}</dd>
      <dt>狀態</dt><dd>${statusBadge(a.status)}</dd>
      <dt>權限</dt><dd>${esc(perms)}</dd>
    </dl>${a.status === '鎖住' ? '<div class="hint" style="margin-top:12px;color:var(--danger)">此帳號目前被鎖住,如需解鎖請按「修改」將狀態改為「正常」。</div>' : ''}`,
      `<button class="btn ghost" onclick="closeModal()">關閉</button>
      <button class="btn" onclick="MODULES.account.form('${a.emp_id}')">修改</button>
      <button class="btn danger" onclick="MODULES.account.remove('${a.emp_id}')">刪除</button>`);
  },
  async form(id) {
    const a = id ? await api('/api/accounts/' + id) : {};
    const permFields = PERM_LIST.map(([k, l]) => ({ name: k, label: '', type: 'checkbox', checkLabel: l, value: a[k] }));
    openForm({
      title: id ? '修改帳號 ' + id : '新增帳號',
      fields: [
        { name: 'name', label: '姓名', required: true, value: a.name },
        { name: 'title', label: '職務名稱', value: a.title },
        { name: 'salary', label: '薪資', type: 'number', step: '1', value: (id ? a.salary : 28000) },
        { name: 'password', label: '密碼', type: 'password', required: !id, hint: id ? '留空表示不變更' : '新帳號必填', value: '' },
        { name: 'hire_date', label: '入職日期', type: 'date', value: fmtDate(a.hire_date) },
        { name: 'resign_date', label: '離職日期', type: 'date', value: fmtDate(a.resign_date) },
        { name: 'status', label: '狀態', type: 'select', options: ['正常', '已離職', '鎖住'].map(s => `<option ${a.status === s ? 'selected' : ''}>${s}</option>`).join(''), hint: '被鎖住的帳號改為「正常」即完成解鎖(並歸零錯誤次數)' },
        ...permFields,
      ],
      extraHtml: `<div class="hint">勾選權限欄位 = 該帳號可使用該功能（"V"）。</div>`,
      onSubmit: async (v) => {
        if (!v.password) delete v.password;
        if (id) await api('/api/accounts/' + id, { method: 'PUT', body: v });
        else await api('/api/accounts', { method: 'POST', body: v });
        MODULES.account.render();
      },
    });
  },
  remove(id) {
    confirmDelete('確定刪除帳號 ' + id + '？', async () => {
      try { await api('/api/accounts/' + id, { method: 'DELETE' }); closeModal(); MODULES.account.render(); }
      catch (e) { alert(e.message); }
    });
  },
};

/* ── 項目維護 (與「會計維護」相同權限：會計) ────────── */
const OPTION_EDITORS = [
  { cat: 'vendor_business', title: '廠商資料－營業項目', hint: '廠商「營業項目」複選清單' },
  { cat: 'vendor_payment', title: '廠商資料－結帳方式', hint: '廠商「結帳方式」單選清單' },
  { cat: 'receivable_item', title: '應收款項－項目', hint: '應收款項「項目」下拉清單' },
  { cat: 'receivable_receive_method', title: '應收款項－收款方式', hint: '應收款項「收款方式」下拉清單' },
  { cat: 'payable_item', title: '應付款項－項目', hint: '應付款項「項目」下拉清單' },
  { cat: 'payable_pay_method', title: '應付款項－付款方式', hint: '應付款項「付款方式」下拉清單' },
  { cat: 'expense_category', title: '應付款項－費用類別', hint: '非專案營業費用 (房租/水電…) 的類別清單' },
  { cat: 'project_status', title: '專案管理－專案狀態', hint: '專案「專案狀態」下拉清單' },
];
MODULES.sysmaint = {
  title: '項目維護', perm: 'perm_accounting',
  _data: {}, _meta: {},
  // 第一層：可維護的清單目錄，點進去才顯示內容
  render() {
    clearTopAction();
    document.getElementById('content').innerHTML = `
      <div class="hint" style="margin-bottom:16px">選擇要維護的清單，點「維護」進入後可新增／修改／刪除。</div>
      <div class="card"><table>
        <thead><tr><th>可維護清單</th><th>說明</th><th></th></tr></thead>
        <tbody>${OPTION_EDITORS.map(e => `<tr>
          <td><a class="link" onclick="MODULES.sysmaint.open('${e.cat}')">${esc(e.title)}</a></td>
          <td>${esc(e.hint)}</td>
          <td class="right"><button class="btn sm" onclick="MODULES.sysmaint.open('${e.cat}')">維護</button></td>
        </tr>`).join('')}</tbody>
      </table></div>`;
  },
  // 第二層：進入某清單的編輯畫面
  async open(cat) {
    const e = OPTION_EDITORS.find(x => x.cat === cat);
    const values = await api('/api/options/' + cat);
    this._data[cat] = values.slice();
    this._meta[cat] = e;
    document.getElementById('content').innerHTML = `
      <div class="toolbar"><button class="btn ghost" onclick="MODULES.sysmaint.render()">← 返回清單目錄</button></div>
      <div id="opt_${cat}"></div>`;
    this.paint(cat);
  },
  paint(cat) {
    const e = this._meta[cat];
    const values = this._data[cat];
    const rows = values.length
      ? values.map((v, i) => `<tr>
          <td><input value="${esc(v)}" oninput="MODULES.sysmaint.edit('${cat}',${i},this.value)"
              style="width:100%;padding:6px 8px;border:1px solid var(--border);border-radius:6px"></td>
          <td class="right"><button class="btn danger sm" onclick="MODULES.sysmaint.del('${cat}',${i})">刪除</button></td></tr>`).join('')
      : `<tr><td colspan="2" class="empty">尚無選項，請於下方新增</td></tr>`;
    document.getElementById('opt_' + cat).innerHTML = `
      <div class="section-title">${esc(e.title)}</div>
      <div class="card" style="padding:14px">
        <div class="hint" style="margin-bottom:8px">${esc(e.hint)}。可直接在欄位內修改文字。修改／新增／刪除後請按「儲存」。</div>
        <table class="subtable"><tbody>${rows}</tbody></table>
        <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
          <input id="add_${cat}" placeholder="輸入新選項..." style="flex:1;min-width:180px;padding:8px 10px;border:1px solid var(--border);border-radius:8px"
            onkeydown="if(event.key==='Enter'){event.preventDefault();MODULES.sysmaint.add('${cat}');}">
          <button class="btn ghost" onclick="MODULES.sysmaint.add('${cat}')">＋ 新增</button>
          <button class="btn" onclick="MODULES.sysmaint.save('${cat}')">儲存</button>
        </div>
      </div>`;
  },
  edit(cat, i, val) { this._data[cat][i] = val; },   // 就地修改，不重繪以保留游標
  add(cat) {
    const inp = document.getElementById('add_' + cat);
    const v = inp.value.trim();
    if (!v) return;
    if (this._data[cat].some(x => x.trim() === v)) { alert('「' + v + '」已存在。'); return; }
    this._data[cat].push(v);
    this.paint(cat);
  },
  del(cat, i) { this._data[cat].splice(i, 1); this.paint(cat); },
  async save(cat) {
    // 去除空白與重複
    const clean = [];
    for (const v of this._data[cat].map(s => String(s).trim())) {
      if (v && !clean.includes(v)) clean.push(v);
    }
    try {
      await api('/api/options/' + cat, { method: 'PUT', body: { values: clean } });
      this._data[cat] = clean;
      this.paint(cat);
      alert('「' + this._meta[cat].title + '」已儲存。');
    } catch (e) { alert(e.message); }
  },
};

/* ── 首頁 (所有登入者皆可看；圖上各區塊可點選對應功能) ── */
// 依 home.png (1315x1196) 各卡片位置換算的百分比熱區
const HOME_SPOTS = [
  { key: 'customer',   l: 8.2,  t: 11.5, w: 36.5, h: 16.8 },   // 客戶資料
  { key: 'vendor',     l: 55.0, t: 11.5, w: 36.0, h: 16.8 },   // 廠商資料
  { key: 'quote',      l: 32.0, t: 34.0, w: 35.5, h: 14.5 },   // 報價資料
  { key: 'project',    l: 23.8, t: 51.5, w: 52.5, h: 18.2 },   // 專案管理
  { key: 'receivable', l: 8.2,  t: 75.5, w: 33.0, h: 16.0 },   // 應收帳款
  { key: 'payable',    l: 57.0, t: 75.5, w: 32.0, h: 16.0 },   // 應付帳款
];
// 從首頁圖點選功能：有權限才進入
function goFromHome(key) {
  if (canSee(key)) go(key);
  else alert('您的帳號沒有「' + (MENU.find(m => m[0] === key)?.[1] || '') + '」的權限，請聯絡系統管理者。');
}
MODULES.home = {
  title: '', always: true,
  render() {
    clearTopAction();
    document.getElementById('content').innerHTML =
      `<div id="homeReminders"></div>
      <div class="home-wrap"><div class="home-map">
        <img src="/img/home.png" alt="專案管理系統流程" class="home-img">
        ${HOME_SPOTS.map(s => `<a class="home-spot" title="前往${esc(MENU.find(m => m[0] === s.key)?.[1] || '')}"
          style="left:${s.l}%;top:${s.t}%;width:${s.w}%;height:${s.h}%"
          onclick="goFromHome('${s.key}')"></a>`).join('')}
      </div></div>`;
    this.loadReminders();
  },
  // 待辦提醒：依權限顯示 應收/應付到期、支票、階段逾期、驗收中、保固到期
  async loadReminders() {
    const box = document.getElementById('homeReminders');
    try {
      const r = await api('/api/reminders');
      const groups = [];
      const item = (icon, text, key) =>
        `<a class="rem-item" onclick="goFromHome('${key}')">${icon} ${text}</a>`;
      const d = (v) => fmtDate(v) || '—';
      const m = (v) => (v === null || v === undefined) ? '' : '，' + money(v) + ' 元';
      if (canSee('receivable')) {
        r.ar_overdue.forEach(x => groups.push(item('🔴', `應收逾期：${esc(x.name || '')}「${esc(x.item || '')}」應收日 ${d(x.due_date)}${m(x.amt)}`, 'receivable')));
        r.ar_soon.forEach(x => groups.push(item('🟡', `應收將到期：${esc(x.name || '')}「${esc(x.item || '')}」${d(x.due_date)}${m(x.amt)}`, 'receivable')));
      }
      if (canSee('payable')) {
        r.ap_overdue.forEach(x => groups.push(item('🔴', `應付逾期：${esc(x.name || '')}「${esc(x.item || '')}」應付日 ${d(x.due_date)}${m(x.amt)}`, 'payable')));
        r.ap_soon.forEach(x => groups.push(item('🟡', `應付將到期：${esc(x.name || '')}「${esc(x.item || '')}」${d(x.due_date)}${m(x.amt)}`, 'payable')));
        r.check_due.forEach(x => groups.push(item('🟠', `支票到期：${esc(x.name || '')} 票號 ${esc(x.item || '')} 到期 ${d(x.due_date)}${m(x.amt)}`, 'payable')));
      }
      if (canSee('project')) {
        r.stage_overdue.forEach(x => groups.push(item('🔴', `階段逾期：${esc(x.name || '')}「${esc(x.item || '')}」預定 ${d(x.due_date)}`, 'project')));
        r.accepting.forEach(x => groups.push(item('🔵', `驗收中：${esc(x.name || '')}（${esc(x.id)}）`, 'project')));
        r.warranty_due.forEach(x => groups.push(item('🟠', `保固將到期：${esc(x.name || '')} 到期 ${d(x.due_date)}`, 'project')));
      }
      if (!groups.length) { box.innerHTML = ''; return; }
      box.innerHTML = `<div class="card rem-card">
        <div class="rem-head">📌 待辦提醒（${groups.length} 項）</div>
        <div class="rem-list">${groups.join('')}</div></div>`;
    } catch { box.innerHTML = ''; }
  },
};

/* ── 系統還原 (僅系統管理者，危險操作，多重保護) ────── */
function downloadJSON(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 100);
}
MODULES.restore = {
  title: '系統還原', perm: 'perm_admin',
  render() {
    clearTopAction();
    document.getElementById('content').innerHTML = `
      <div class="card" style="padding:22px;max-width:660px;margin-bottom:16px">
        <div style="font-weight:700;font-size:16px;margin-bottom:10px">☁️ 雲端硬碟自動備份</div>
        <div class="hint" style="line-height:1.7;margin-bottom:12px">
          系統會依排程自動把資料庫匯出並上傳到你設定的 Google 雲端硬碟資料夾。<br>
          按下面按鈕可以手動立即備份一次，用來確認雲端硬碟設定是否正確。
        </div>
        <button class="btn" id="backupNowBtn">立即備份到雲端硬碟</button>
        <div class="hint" id="backupMsg" style="margin-top:10px"></div>
      </div>
      <div class="card" style="padding:22px;max-width:660px">
        <div style="color:var(--danger);font-weight:700;font-size:17px;margin-bottom:10px">⚠️ 系統還原（危險操作）</div>
        <div class="hint" style="line-height:1.7;margin-bottom:16px">
          還原會<b style="color:var(--danger)">清空目前所有資料</b>，換成你選擇的備份檔內容。<br>
          備份「之後」新增或修改的資料將<b>全部遺失且無法復原</b>。<br>
          為安全起見，按下還原前系統會<b>自動下載一份「目前資料」的備份</b>到你的電腦(檔名 before-restore_…)，萬一還錯檔可用它救回。
        </div>
        <div class="field"><label>1. 選擇要還原的備份檔（.json）</label>
          <input type="file" id="restoreFile" accept="application/json,.json"></div>
        <div class="field"><label>2. 請輸入「確定還原」四個字以確認</label>
          <input type="text" id="restoreConfirm" placeholder="確定還原"></div>
        <button class="btn danger" id="restoreBtn">執行還原</button>
        <div class="hint" id="restoreMsg" style="margin-top:12px"></div>
      </div>`;
    document.getElementById('restoreBtn').onclick = () => this.doRestore();
    document.getElementById('backupNowBtn').onclick = () => this.backupNow();
  },
  async backupNow() {
    const btn = document.getElementById('backupNowBtn');
    const msg = document.getElementById('backupMsg');
    btn.disabled = true; btn.textContent = '備份中...';
    msg.textContent = '';
    try {
      const r = await api('/api/admin/backup-now', { method: 'POST' });
      msg.innerHTML = `<span style="color:var(--success)">✓ 已上傳：${esc(r.name)}</span>`;
    } catch (e) {
      msg.innerHTML = `<span style="color:var(--danger)">${esc(e.message)}</span>`;
    } finally {
      btn.disabled = false; btn.textContent = '立即備份到雲端硬碟';
    }
  },
  async doRestore() {
    const fileInput = document.getElementById('restoreFile');
    const confirmTxt = document.getElementById('restoreConfirm').value.trim();
    const msg = document.getElementById('restoreMsg');
    if (confirmTxt !== '確定還原') { alert('請輸入「確定還原」四個字以確認。'); return; }
    if (!fileInput.files.length) { alert('請先選擇要還原的備份檔。'); return; }
    if (!window.confirm('最後確認：這會清空目前所有資料，並還原到備份檔的狀態。確定要執行嗎？')) return;
    const btn = document.getElementById('restoreBtn');
    btn.disabled = true; btn.textContent = '處理中...';
    try {
      msg.textContent = '① 正在下載「目前資料」備份到你的電腦…';
      const cur = await api('/api/admin/export');
      downloadJSON(cur, 'before-restore_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json');
      msg.textContent = '② 正在讀取備份檔…';
      const data = JSON.parse(await fileInput.files[0].text());
      msg.textContent = '③ 正在還原資料庫…';
      await api('/api/admin/restore', { method: 'POST', body: { confirm: confirmTxt, data } });
      alert('✅ 還原完成！系統將登出，請用「備份當時」的帳號密碼重新登入。');
      await api('/api/logout', { method: 'POST' });
      location.href = '/';
    } catch (e) {
      msg.textContent = '';
      alert('還原失敗：' + e.message);
      btn.disabled = false; btn.textContent = '執行還原';
    }
  },
};

/* ── 導覽 / 啟動 ─────────────────────────────────────── */
// 「系統說明」(home) 不在左側選單：登入後為預設頁，點 LOGO 可回到該頁
const MENU = [
  ['customer', '客戶資料'], ['vendor', '廠商資料'], ['quote', '報價資料'],
  ['project', '專案管理'], ['repair', '維修工單'],
  ['receivable', '應收款項'], ['payable', '應付款項'],
  ['accounting', '會計維護'], ['acctreport', '公司報表'],
  ['account', '帳號管理'], ['sysmaint', '項目維護'],
  ['audit', '操作紀錄'], ['restore', '系統還原'],
];
function setTopAction(label, fn) {
  const el = document.getElementById('topActions');
  el.innerHTML = `<button class="btn" id="topActionBtn">${esc(label)}</button>`;
  document.getElementById('topActionBtn').onclick = fn;
}
// 在既有的頂端按鍵旁再加一顆 (不清掉 setTopAction 已放的按鍵)
function addTopAction(label, fn, cls) {
  const el = document.getElementById('topActions');
  const btn = document.createElement('button');
  btn.className = cls || 'btn ghost';
  btn.textContent = label;
  btn.onclick = fn;
  el.appendChild(btn);
}
function clearTopAction() { document.getElementById('topActions').innerHTML = ''; }

// 變更密碼：輸入舊密碼 + 兩次新密碼，成功後自動登出回登入頁
function openChangePassword() {
  openForm({
    title: '變更密碼',
    fields: [
      { name: 'old_password', label: '舊密碼', type: 'password', required: true },
      { name: 'new_password', label: '新密碼', type: 'password', required: true },
      { name: 'new_password2', label: '確認新密碼', type: 'password', required: true },
    ],
    onSubmit: async (v) => {
      if (v.new_password !== v.new_password2) throw new Error('兩次輸入的新密碼不一致。');
      if (v.old_password === v.new_password) throw new Error('新密碼不可與舊密碼相同。');
      await api('/api/change-password', { method: 'POST', body: { old_password: v.old_password, new_password: v.new_password } });
      alert('密碼已變更，請使用新密碼重新登入。');
      await api('/api/logout', { method: 'POST' });
      location.href = '/';
    },
  });
}

function go(key) {
  const mod = MODULES[key];
  if (!mod) return;
  document.querySelector('.sidebar')?.classList.remove('open');   // 手機版：切頁時收起選單
  document.querySelectorAll('#nav a').forEach(a => a.classList.toggle('active', a.dataset.key === key));
  document.getElementById('pageTitle').textContent = mod.title;
  // 系統說明(首頁)：隱藏上方標題列、內容不留白
  document.querySelector('.main').classList.toggle('home-view', key === 'home');
  clearTopAction();
  mod.render();
}

async function boot() {
  try {
    const { user } = await api('/api/me');
    USER = user;
  } catch { location.href = '/'; return; }

  document.getElementById('uName').textContent = USER.name + ' (' + USER.emp_id + ')';
  document.getElementById('changePwBtn').onclick = openChangePassword;

  // 系統管理者擁有全部功能；其他人依各自權限顯示選單
  const nav = document.getElementById('nav');
  const visible = MENU.filter(([key]) => canSee(key));
  nav.innerHTML = visible.map(([key, label]) =>
    `<a href="#" data-key="${key}" onclick="go('${key}');return false;"><span>${esc(label)}</span></a>`).join('');

  document.getElementById('logoutBtn').onclick = async () => { await api('/api/logout', { method: 'POST' }); location.href = '/'; };

  go('home');   // 登入後預設顯示系統說明頁 (點 LOGO 可隨時回到此頁)
}
// 是否有權限使用某功能 (首頁熱區與選單共用)
function canSee(key) {
  return MODULES[key].always || USER.perm_admin || USER[MODULES[key].perm];
}
boot();
