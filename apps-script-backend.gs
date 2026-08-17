/**
 * iPAS AI應用規劃師 考取衝刺班 — 後端記錄腳本（v2）
 *
 * 這一版在原本的鑑別測驗後端上，多加了「每日測驗」的路由：
 *   - payload 沒有 type 或 type === 'diagnostic' → 寫入「測驗結果」（原本的鑑別測驗，行為不變）
 *   - payload 的 type === 'daily'                → 寫入「每日測驗結果」
 *
 * 所以你可以直接把這份內容覆蓋回原本的 Apps Script 專案、部署新版本，
 * 鑑別測驗網站不用改任何東西，網址也不會變。
 *
 * 部署步驟詳見 SETUP.md。
 */

var SHEET_DIAG = '測驗結果';
var SHEET_DAILY = '每日測驗結果';

var HEADER_DIAG = [
  '提交時間', '姓名', '總分(%)', '答對題數', '總題數',
  '科目一得分', '科目一總題', '科目二得分', '科目二總題',
  '建議分組', '待加強主題', '各主題正確率(JSON)'
];

var HEADER_DAILY = [
  '提交時間', '姓名', '週次', '天數', '主題',
  '得分(%)', '答對題數', '總題數', '答錯題號', '作答明細(JSON)'
];

function getOrCreateSheet_(name, header) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(header);
    sheet.getRange(1, 1, 1, header.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function appendDiagnostic_(data) {
  var sheet = getOrCreateSheet_(SHEET_DIAG, HEADER_DIAG);
  sheet.appendRow([
    new Date(),
    data.name || '未具名',
    data.percent,
    data.totalCorrect,
    data.total,
    data.subj1Correct,
    data.subj1Total,
    data.subj2Correct,
    data.subj2Total,
    data.group,
    data.weakTopics || '',
    JSON.stringify(data.topicDetail || {})
  ]);
}

function appendDaily_(data) {
  var sheet = getOrCreateSheet_(SHEET_DAILY, HEADER_DAILY);
  sheet.appendRow([
    new Date(),
    data.name || '未具名',
    data.week || 'W1',
    'Day ' + data.day,
    data.dayTitle || '',
    data.percent,
    data.correct,
    data.total,
    data.wrongList || '（全對）',
    JSON.stringify(data.detail || {})
  ]);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 多位同仁可能同時交卷，appendRow() 會互撞；用鎖讓寫入排隊而不是失敗。
    lock.waitLock(15000);

    var data = JSON.parse(e.postData.contents);

    if (data.type === 'daily') {
      appendDaily_(data);
    } else {
      appendDiagnostic_(data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: 'ok' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: 'error', message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'iPAS 考取衝刺班後端運作中（支援 diagnostic / daily）'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * 選用：在試算表選單加一個「每日測驗」→「產生每日達成率摘要」。
 * 會在「每日達成率」工作表列出每天有幾人作答、平均分數。
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('每日測驗')
    .addItem('產生每日達成率摘要', 'buildDailySummary')
    .addToUi();
}

function buildDailySummary() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var src = ss.getSheetByName(SHEET_DAILY);
  if (!src || src.getLastRow() < 2) {
    SpreadsheetApp.getUi().alert('「每日測驗結果」還沒有資料。');
    return;
  }

  var rows = src.getRange(2, 1, src.getLastRow() - 1, HEADER_DAILY.length).getValues();
  var stats = {};

  rows.forEach(function (r) {
    var key = r[2] + ' ' + r[3];          // 週次 + 天數
    if (!stats[key]) {
      stats[key] = { title: r[4], people: {}, sum: 0, count: 0 };
    }
    // 同一人重複作答只算最後一次
    stats[key].people[r[1]] = r[5];
    stats[key].title = r[4];
  });

  var out = [['週次/天數', '主題', '作答人數', '平均分數', '未達 70 分人數']];
  Object.keys(stats).sort().forEach(function (key) {
    var s = stats[key];
    var scores = Object.keys(s.people).map(function (n) { return Number(s.people[n]); });
    var avg = scores.length
      ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)
      : 0;
    var low = scores.filter(function (v) { return v < 70; }).length;
    out.push([key, s.title, scores.length, avg, low]);
  });

  var dst = ss.getSheetByName('每日達成率');
  if (!dst) dst = ss.insertSheet('每日達成率');
  dst.clear();
  dst.getRange(1, 1, out.length, out[0].length).setValues(out);
  dst.getRange(1, 1, 1, out[0].length).setFontWeight('bold');
  dst.setFrozenRows(1);
  dst.autoResizeColumns(1, out[0].length);

  SpreadsheetApp.getUi().alert('已更新「每日達成率」工作表。');
}
