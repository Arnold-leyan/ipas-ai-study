/**
 * iPAS AI應用規劃師 考取衝刺班 — 學習網站後端
 *
 * 這是一份「獨立」的後端，與鑑別測驗的那組 Apps Script 無關，
 * 之後讀書會要新增的功能都往這裡加。
 *
 * 部署方式：綁在一份新的 Google 試算表上（擴充功能 → Apps Script），
 * 部署為網頁應用程式，把網址貼到 assets/config.js。詳見 SETUP.md。
 *
 * ─────────────────────────────────────────────
 * 怎麼擴充：整份檔案只有 SPECS 需要動。
 *
 * 每一種要記錄的資料 = SPECS 裡的一個項目，包含三件事：
 *   sheet   要寫到哪個工作表
 *   header  第一列的欄位名稱
 *   row     把送過來的 payload 轉成一列資料
 *
 * 前端送出時 payload 帶 type，後端就會自動找到對應的項目。
 * 新增一種類型不需要改 doPost，只要在 SPECS 加一個項目、重新部署新版本。
 * 檔案最下方有一個「打卡」的範例，需要時把註解拿掉就能用。
 * ─────────────────────────────────────────────
 */

var SPECS = {

  /* 每日測驗 —— 前端 assets/quiz.js 送出 */
  daily: {
    sheet: '每日測驗結果',
    header: [
      '提交時間', '姓名', '週次', '天數', '主題',
      '得分(%)', '答對題數', '總題數', '答錯題號', '作答明細(JSON)'
    ],
    row: function (d) {
      return [
        new Date(),
        d.name || '未具名',
        d.week || '',
        d.day ? 'Day ' + d.day : '',
        d.dayTitle || '',
        d.percent,
        d.correct,
        d.total,
        d.wrongList || '（全對）',
        JSON.stringify(d.detail || {})
      ];
    }
  }

};

/* ══════════════════════════════════════════════
   以下不用改
   ══════════════════════════════════════════════ */

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

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // 多位同仁可能同時交卷，appendRow() 會互撞；用鎖讓寫入排隊而不是失敗。
    lock.waitLock(15000);

    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut_({ status: 'error', message: 'no payload' });
    }

    var data = JSON.parse(e.postData.contents);
    var spec = SPECS[data.type || 'daily'];

    if (!spec) {
      return jsonOut_({ status: 'error', message: 'unknown type: ' + data.type });
    }

    getOrCreateSheet_(spec.sheet, spec.header).appendRow(spec.row(data));

    return jsonOut_({ status: 'ok' });
  } catch (err) {
    return jsonOut_({ status: 'error', message: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/**
 * 健康檢查用。刻意「不」回傳任何同仁的成績——
 * 這個網址是「所有人可存取」，回傳資料等於公開全班分數。
 */
function doGet(e) {
  return jsonOut_({
    status: 'ok',
    message: 'iPAS 考取衝刺班學習網站後端運作中',
    types: Object.keys(SPECS)
  });
}

/* ── 試算表選單：每日達成率 ───────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('讀書會')
    .addItem('產生每日達成率摘要', 'buildDailySummary')
    .addSeparator()
    .addItem('測試後端是否正常', 'selfTest')
    .addToUi();
}

function buildDailySummary() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spec = SPECS.daily;
  var src = ss.getSheetByName(spec.sheet);

  if (!src || src.getLastRow() < 2) {
    ui.alert('「' + spec.sheet + '」還沒有資料。');
    return;
  }

  var rows = src.getRange(2, 1, src.getLastRow() - 1, spec.header.length).getValues();
  var stats = {};

  rows.forEach(function (r) {
    var key = (r[2] || '?') + ' ' + (r[3] || '?');   // 週次 + 天數
    if (!stats[key]) {
      stats[key] = { title: r[4], people: {} };
    }
    stats[key].title = r[4];
    stats[key].people[r[1]] = Number(r[5]);          // 同一人重複作答只留最後一次
  });

  var out = [['週次/天數', '主題', '作答人數', '平均分數', '未達 70 分人數', '未達 70 分名單']];

  Object.keys(stats).sort().forEach(function (key) {
    var s = stats[key];
    var names = Object.keys(s.people);
    var scores = names.map(function (n) { return s.people[n]; });
    var avg = scores.length
      ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)
      : 0;
    var low = names.filter(function (n) { return s.people[n] < 70; });
    out.push([key, s.title, names.length, avg, low.length, low.join('、')]);
  });

  var dst = ss.getSheetByName('每日達成率');
  if (!dst) dst = ss.insertSheet('每日達成率');
  dst.clear();
  dst.getRange(1, 1, out.length, out[0].length).setValues(out);
  dst.getRange(1, 1, 1, out[0].length).setFontWeight('bold');
  dst.setFrozenRows(1);
  dst.autoResizeColumns(1, out[0].length);

  ui.alert('已更新「每日達成率」工作表。');
}

/**
 * 從試算表選單直接模擬一次前端送出，確認寫入正常。
 * 會寫入一列姓名為「（測試）」的資料，確認完請自行刪除該列。
 */
function selfTest() {
  var fake = {
    postData: {
      contents: JSON.stringify({
        type: 'daily',
        name: '（測試）',
        week: 'W1',
        day: 1,
        dayTitle: '後端連線測試',
        percent: 100,
        correct: 1,
        total: 1,
        wrongList: '',
        detail: { Q1: 'A' }
      })
    }
  };
  var res = JSON.parse(doPost(fake).getContent());
  SpreadsheetApp.getUi().alert(
    res.status === 'ok'
      ? '後端正常，已在「每日測驗結果」寫入一列測試資料（姓名為「（測試）」），確認後請自行刪除該列。'
      : '後端有問題：' + res.message
  );
}

/* ══════════════════════════════════════════════
   擴充範例：週五打卡
   之後想讓同仁直接在網站上打卡，把下面的註解拿掉，
   加進上面的 SPECS 裡，重新部署新版本即可。

  checkin: {
    sheet: '週五打卡',
    header: ['提交時間', '姓名', '週次', '學到的觀念', '易混淆題型', '下週想加強'],
    row: function (d) {
      return [new Date(), d.name || '未具名', d.week || '', d.learned || '', d.confused || '', d.next || ''];
    }
  }

   前端送出時 payload 就寫：
   { type: 'checkin', name: '王小明', week: 'W1', learned: '...', confused: '...', next: '...' }
   ══════════════════════════════════════════════ */
