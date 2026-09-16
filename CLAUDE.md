# 專案管理系統 — 開發須知

裝修工程公司的內部 ERP：客戶、廠商、報價、專案、維修、應收應付、會計與台灣稅務報表。
介面全繁體中文。使用者導向的說明請看 `首次設定指南.md`。

## 架構

| 路徑 | 說明 |
|---|---|
| `server.js` | Express 設定、session、稽核中介層、掛載路由 |
| `src/store.js` | 資料層。單一 JSON 檔 `data/db.json`，寫入用 tmp + rename 原子替換 |
| `src/util.js` | 型別轉換、權限中介層、關聯名稱查詢、scrypt 密碼雜湊 |
| `src/seed.js` | 首次啟動建立管理者與八組下拉清單預設值 |
| `src/routes/*.js` | 各模組 API，依模組拆檔 |
| `src/googleDrive.js` | 純 fetch 呼叫 Google Drive REST API 上傳備份，不引入 googleapis 套件 |
| `public/` | 前端。原生 JS 單頁應用，未經打包，可直接搜尋與修改 |
| `data/` | 執行時產生，不在版控內 |
| `get-token.js` | 一次性工具：本機執行取得 Google 的 refresh token，不在版控內 |

無原生模組、無絕對路徑，只依賴 `express` 與 `express-session`。

## 前端

`public/js/app.js`（約 2960 行）是整個 SPA，結構是一個 `MODULES` 物件，
每個模組有 `title`、`perm`、`render()`，清單與表單都用共用的
`renderListPage()` / `pagedTable()` / `openForm()` 產生。

**後端 API 是依前端實際送出與讀取的欄位設計的。**
要改後端行為前，先在 `public/js/app.js` 搜尋對應的 `api('/api/...')` 呼叫，
確認前端到底送了什麼、讀了哪些欄位名稱，不要憑空猜測。

## 慣例

- 單據編號由 `store.nextCode()` 掃描現有最大值產生：
  `V0001` 廠商、`P0001` 專案、`Q0001` 報價（改版加 `-1`）、
  `AR0001` 應收、`AP0001` 應付、`RO0001` 維修、`A0000` 帳號。
  客戶編號格式較特殊：`C0001-202609`（`C` + 流水號4碼 + `-` + 建檔當下西元年月），
  流水號本身仍是 `nextCode()` 掃描 `^C(\d{4})` 取得，日期後綴不影響流水號遞增
  （見 `src/routes/customers.js` 的 `newCustId()`）。
- 金額一律整數（`util.num()` 四捨五入）；日期存 `YYYY-MM-DD` 字串，空值存 `null`。
- 權限八種，`perm_admin` 自動擁有全部（見 `util.hasPerm`）。
- 每次請求都從 DB 重讀權限（`routes/auth.js` 的 `router.use`），權限調整立即生效。
- 所有非 GET 的 `/api/` 請求都會寫入操作紀錄，密碼與檔案內容以 `***` 遮蔽。

## 容易踩到的商業邏輯

- **薪資／獎金單存在 `payables`，以 `emp_id` 有值區分**，且**必須排除在 `/api/payables` 之外**，
  只有「會計維護 → 員工薪資」查得到。
- **會計歸期**：應收「已收款」依收款日、「待收款」依應收日；
  應付「已付款」依付款日、「待付款」依建立日。
  改報表前先讀 `src/routes/reports.js` 開頭的 `arAcctDate` / `apAcctDate`。
- **損益表**：工程成本＝有掛 `proj_id` 的應付；營業費用＝沒掛專案的應付（含薪資獎金），
  依 `expense_category` 分組。
- **進項稅額**只有憑證類別為「三聯式發票」「電子發票(含統編)」可扣抵，
  其餘一律歸零（`payables.isDeductible`）。
- **401 申報依發票日期歸期**，不是應收應付日期；沒填發票日期的單據不會納入。
- **支票到期提醒不看付款狀態**——遠期支票一定已登錄為「已付款」，錢是到期日才扣。
- **首頁熱區** `HOME_SPOTS` 是對準 `public/img/home.png` 的百分比座標，
  換圖必須同步檢查，否則點擊區會錯位。
- **自動備份 (`POST /api/admin/backup-now`) 不能只靠 `server.js` 裡的內部計時器**：
  部署在 Render 免費方案時，服務閒置會睡著，睡著時計時器不會觸發。
  主要觸發來源是外部排程服務 (如 cron-job.org) 定時呼叫這支 API，
  帶 `X-Backup-Secret` 標頭而非登入 session；內部計時器只是「行程剛好醒著」時的保險，別以為它一定會準時跑。

## 環境相依的注意事項

`啟動系統.bat` 是 **CP950(Big5) 編碼 + CRLF 換行**。
這兩點都不能改成 UTF-8 或 LF——在繁體中文 Windows 上，
UTF-8 會讓訊息變亂碼，LF 會讓 cmd 誤判多行區塊導致視窗直接關閉。
批次檔內用 `goto` 標籤而非多行 `if (...)` 區塊，也是為了同一個原因。

## 修改後的驗證

改動後請跑一次完整流程：登入 → 各模組新增修改刪除 → 報價改版 →
專案階段與變更單 → 結案附件上傳下載 → 收付款登錄 → 發薪 →
五種報表 → 備份還原 → 權限隔離（用非管理者帳號確認看不到不該看的功能）。
