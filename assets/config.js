/* 全站設定 — 只有這個檔案需要改。
 *
 * GAS_WEB_APP_URL：Google Apps Script 部署後的「網頁應用程式」網址。
 * 下面預填的是鑑別測驗已在用的那一組。只要你把 apps-script-backend.gs
 * 的新版貼回同一個 Apps Script 專案並「部署新版本」，網址不會變，
 * 這裡就不用動。若你另外開了新專案，把新網址換上來即可。
 *
 * 留成空字串（''）的話，網站照常運作，只是不會回傳成績到試算表。
 */
var GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyCVc_xM8eai7HDLhAAwZvCJ-zKk2qYfFA-CfAlYjCJJY-iVZvB6myCgarjgvRkpfw/exec';

/* 本週資訊（顯示用） */
var WEEK_INFO = {
  week: 'W1',
  range: '8/17 – 8/21',
  pages: 'p.3-1 ～ 3-32',
  days: [
    { n: 1, date: '8/17（一）', title: 'AI 定義、分類與應用領域', pages: 'p.3-1～3-2' },
    { n: 2, date: '8/18（二）', title: 'AI 三層架構與資料處理四步驟', pages: 'p.3-3～3-7' },
    { n: 3, date: '8/19（三）', title: '四種資料分析與常見演算法', pages: 'p.3-7～3-12' },
    { n: 4, date: '8/20（四）', title: '機器學習、深度學習與生成式 AI', pages: 'p.3-12～3-19' },
    { n: 5, date: '8/21（五）', title: '統計量與假設檢定', pages: 'p.3-24～3-32' }
  ]
};
