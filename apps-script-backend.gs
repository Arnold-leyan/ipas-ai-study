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
        d.dayLabel ? d.dayLabel : (d.day ? 'Day ' + d.day : ''),
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
   統計設定 —— 改這裡就好
   ══════════════════════════════════════════════ */

/* 填答時用的暱稱 → 本名。同仁換名字填答時加在這裡。 */
var NAME_MAP = {
  'Fanny': '陳詩婷',
  'Emily': '黃敬淳',
  '派瑞斯': '黃靖雯',
  'EMMA': '連于萱'
};

/* 每一週在網站上對應的全站唯一 day 編號範圍（跟每天頁面 initQuiz 裡的 day 一致）。
 * 網站畫面上每一天都叫「Day 1～Day 5」（比較好讀），但 day 編號跨週不能重複，
 * 所以 W2 的 day6～day10 頁面會把 dayLabel 設回「Day 1」～「Day 5」給試算表看，
 * queryStatus_() 再用這張表把「這週第幾天」換算回全站唯一的 day 編號。
 * 之後加新的一週，這裡補一行就好。 */
var WEEK_RANGES = {
  'W1': [1, 5],
  'W2': [6, 10]
};

/* 不列入統計的填答者（家長、下一梯次、測試資料等） */
var IGNORE = [
  '呂水鈺',                        // 同仁家長，非參加同仁
  '連于萱', '張淑娟', '77',         // 報名下一梯次，提前跟讀
  '（測試）', '（連線測試，請刪除）'   // 測試資料
];

/* 同一人同一天重複作答時保留哪一次：'first' 最早、'last' 最晚 */
var KEEP = 'first';

/* 本梯次名單，用來算未完成名單 */
var ROSTER = [
  '邱璽', '李建德', '徐佩鈴', '洪益祥', '黃靖雯', '蘇詠哲', '韋懿慈', '鄧名媛',
  '陳詩婷', '黃湘雰', '黃敬淳', '呂佳柔', '施怡如', '陳宜君', '楊昱峰', '陳冠汝',
  '溫增宜', '林俊宏', '張靖欣', '黃偉晉', '邱品潔', '張家祥', '邱珞', '陳信宏',
  '吳宗達'
];

function normName_(n) {
  n = String(n || '').trim();
  return NAME_MAP[n] || n;
}

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
 * 沒帶 name 參數時是健康檢查，不回傳任何同仁的成績。
 * 帶了 name 參數時，回傳「這個人自己」每一天的完成狀態（給網站的登入/查詢進度功能用）——
 * 只回傳查詢者自己那筆，不會一次吐出全班成績。
 * 這個網址仍是「所有人可存取」，只要知道／猜到姓名就能查到那個人的完成度，
 * 這是刻意的取捨（跟送出測驗時姓名沒有身分驗證是同一個道理），不是拿來放高敏感資料的地方。
 */
function doGet(e) {
  var name = e && e.parameter && e.parameter.name;
  if (name) return queryStatus_(name);

  return jsonOut_({
    status: 'ok',
    message: 'iPAS 考取衝刺班學習網站後端運作中',
    types: Object.keys(SPECS)
  });
}

/**
 * 依姓名（含暱稱，會透過 NAME_MAP 轉換成本名）查這個人每一天的完成狀態。
 * 同一天重複作答時，取試算表裡「最後一次」送出的那筆。
 *
 * 回傳格式：{ status:'ok', name:'本名', days:{ '6':{percent,dayTitle,week,correct,total,wrongList,detail}, 'w2test':{...} } }
 * key 是數字字串時對應每日頁的 data-day；'w1test'/'w2test' 對應各週總測驗。
 * detail 是每題選了哪個選項（{"Q1":"B",...}），前端用它把換裝置後空白的測驗頁
 * 還原成「已作答，看解析」的狀態，不用重新回答。
 */
function queryStatus_(rawName) {
  var name = normName_(rawName);
  var spec = SPECS.daily;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(spec.sheet);
  var days = {};

  if (sheet && sheet.getLastRow() >= 2) {
    var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, spec.header.length).getValues();
    rows.forEach(function (r) {
      if (normName_(r[1]) !== name) return;

      var week = String(r[2] || '');
      var label = String(r[3] || '');
      var dayMatch = label.match(/^Day\s+(\d+)$/);
      var key = null;
      if (dayMatch) {
        var n = parseInt(dayMatch[1], 10);
        var range = WEEK_RANGES[week];
        // n 落在這一週原本的全站編號範圍內，代表是還沒套用 dayLabel 之前寫入的舊資料，
        // 直接當全站編號用；否則就是「這週第幾天」，換算成全站編號。
        if (range && (n < range[0] || n > range[1])) n = range[0] + n - 1;
        key = String(n);
      } else if (/總測驗/.test(label) && week) {
        key = week.toLowerCase() + 'test';
      }
      if (!key) return;

      var detail = null;
      try { detail = r[9] ? JSON.parse(r[9]) : null; } catch (err) { detail = null; }

      // 列序即送出順序，後面的列會覆蓋前面的，等於自動取最後一次作答。
      days[key] = {
        percent: Number(r[5]),
        dayTitle: String(r[4] || ''),
        week: week,
        correct: Number(r[6]),
        total: Number(r[7]),
        wrongList: String(r[8] || ''),
        detail: detail
      };
    });
  }

  return jsonOut_({ status: 'ok', name: name, days: days });
}

/* ── 試算表選單：每日達成率 ───────────────────── */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('讀書會')
    .addItem('產生每日達成率摘要', 'buildDailySummary')
    .addSeparator()
    .addItem('清除重複作答（保留最早一次）', 'dedupeDaily')
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
  var ignored = 0, deduped = 0;

  // 列序即送出順序，所以 first 就是最早、last 就是最晚
  rows.forEach(function (r) {
    var name = normName_(r[1]);
    if (IGNORE.indexOf(name) > -1) { ignored++; return; }

    var key = r[2] + ' ' + r[3];
    if (!stats[key]) stats[key] = { title: r[4], people: {} };
    stats[key].title = r[4];

    if (stats[key].people[name]) {
      deduped++;
      if (KEEP === 'first') return;   // 已有較早的，跳過
    }
    stats[key].people[name] = Number(r[5]);
  });

  var out = [[
    '週次/天數', '主題', '作答人數', '平均分數',
    '未達 70 分人數', '未達 70 分名單', '尚未作答人數', '尚未作答名單'
  ]];

  Object.keys(stats).sort().forEach(function (key) {
    var s = stats[key];
    var names = Object.keys(s.people);
    var scores = names.map(function (n) { return s.people[n]; });
    var avg = scores.length
      ? Math.round(scores.reduce(function (a, b) { return a + b; }, 0) / scores.length)
      : 0;
    var low = names.filter(function (n) { return s.people[n] < 70; });
    var todo = ROSTER.filter(function (n) { return names.indexOf(n) < 0; });
    out.push([key, s.title, names.length, avg, low.length, low.join('、'), todo.length, todo.join('、')]);
  });

  out.push([]);
  out.push(['說明', '重複作答取' + (KEEP === 'first' ? '最早' : '最晚') + '一次，已忽略 ' +
    ignored + ' 筆非本梯次紀錄、合併 ' + deduped + ' 筆重複作答；名單共 ' + ROSTER.length + ' 人']);

  var dst = ss.getSheetByName('每日達成率');
  if (!dst) dst = ss.insertSheet('每日達成率');
  dst.clear();
  dst.getRange(1, 1, out.length, out[0].length).setValues(
    out.map(function (r) {
      while (r.length < out[0].length) r.push('');
      return r;
    })
  );
  dst.getRange(1, 1, 1, out[0].length).setFontWeight('bold');
  dst.setFrozenRows(1);
  dst.autoResizeColumns(1, out[0].length);

  ui.alert('已更新「每日達成率」工作表。忽略 ' + ignored + ' 筆非本梯次紀錄，合併 ' +
    deduped + ' 筆重複作答（取' + (KEEP === 'first' ? '最早' : '最晚') + '）。');
}

/**
 * 清除「每日測驗結果」中同一人同一天的重複作答，只保留最早那一次。
 * 保留最早＝那是還沒看過解析時作答的結果，才有鑑別意義。
 *
 * 刪除前會先把要移除的列完整複製到「重複作答備份」工作表，不會真的消失。
 */
function dedupeDaily() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var spec = SPECS.daily;
  var sheet = ss.getSheetByName(spec.sheet);

  if (!sheet || sheet.getLastRow() < 2) {
    ui.alert('「' + spec.sheet + '」還沒有資料。');
    return;
  }

  var n = spec.header.length;
  var rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, n).getValues();

  // 列序即送出順序：第一次出現的就是最早那次
  var seen = {}, toDelete = [];
  rows.forEach(function (r, i) {
    var key = normName_(r[1]) + '|' + r[2] + '|' + r[3];
    if (seen[key]) toDelete.push({ sheetRow: i + 2, data: r });
    else seen[key] = true;
  });

  if (!toDelete.length) {
    ui.alert('沒有重複作答，不需要清理。');
    return;
  }

  var resp = ui.alert(
    '清除重複作答',
    '找到 ' + toDelete.length + ' 筆重複作答（同一人同一天做第二次以後）。' +
    '\n\n將保留每個人每天最早的那一次，其餘移到「重複作答備份」工作表後刪除。' +
    '\n\n要繼續嗎？',
    ui.ButtonSet.YES_NO);
  if (resp !== ui.Button.YES) return;

  // 先備份
  var bak = ss.getSheetByName('重複作答備份');
  if (!bak) {
    bak = ss.insertSheet('重複作答備份');
    bak.appendRow(['刪除時間'].concat(spec.header));
    bak.getRange(1, 1, 1, n + 1).setFontWeight('bold');
    bak.setFrozenRows(1);
  }
  var stamp = new Date();
  bak.getRange(bak.getLastRow() + 1, 1, toDelete.length, n + 1)
     .setValues(toDelete.map(function (d) { return [stamp].concat(d.data); }));

  // 由下往上刪，列號才不會位移
  toDelete.slice().sort(function (a, b) { return b.sheetRow - a.sheetRow; })
    .forEach(function (d) { sheet.deleteRow(d.sheetRow); });

  ui.alert('完成：已刪除 ' + toDelete.length + ' 筆重複作答，備份在「重複作答備份」工作表。' +
    '目前剩下 ' + (sheet.getLastRow() - 1) + ' 筆紀錄。');
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
