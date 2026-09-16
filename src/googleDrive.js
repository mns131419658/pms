/* ── Google 雲端硬碟上傳 (純 fetch 呼叫 REST API，不引入 googleapis 套件) ──
   需要 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN / GOOGLE_FOLDER_ID
   四個環境變數都有值才會啟用；refresh token 用 get-token.js 一次性取得。 */

function isConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    && process.env.GOOGLE_REFRESH_TOKEN && process.env.GOOGLE_FOLDER_ID);
}

// 用 refresh token 換一個短效 access token (每次上傳前現換，不快取，省去過期判斷)
async function getAccessToken() {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error('Google 授權換發 access token 失敗：' + (data.error_description || data.error || r.status));
  return data.access_token;
}

// 上傳一個 JSON 檔到指定資料夾 (multipart：metadata + 內容一起送)
async function uploadJSON(filename, jsonText) {
  const accessToken = await getAccessToken();
  const boundary = 'pmsbackup' + Date.now();
  const metadata = { name: filename, parents: [process.env.GOOGLE_FOLDER_ID] };
  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: application/json\r\n\r\n` +
    `${jsonText}\r\n` +
    `--${boundary}--`;

  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,size', {
    method: 'POST',
    headers: {
      'authorization': 'Bearer ' + accessToken,
      'content-type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });
  const data = await r.json();
  if (!r.ok) throw new Error('上傳 Google 雲端硬碟失敗：' + (data.error?.message || r.status));
  return data;
}

module.exports = { isConfigured, uploadJSON };
