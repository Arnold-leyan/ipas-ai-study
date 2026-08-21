/* iPAS 考取衝刺班 — 共用前端邏輯
 * 主題切換、姓名記憶、每日測驗、成績回傳 Google Apps Script。
 * 後端寫入方式與鑑別測驗網站相同：fetch POST、不設 Content-Type
 * （瀏覽器送 text/plain，避開 CORS preflight）。
 */
(function (global) {
  'use strict';

  var KEYS = ['A', 'B', 'C', 'D'];
  var NAME_KEY = 'ipas_w1_name';
  var THEME_KEY = 'ipas_theme';

  /* ---------- localStorage 安全存取 ---------- */
  function lsGet(k) {
    try { return localStorage.getItem(k); } catch (e) { return null; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* 無痕模式等，忽略 */ }
  }
  function lsDel(k) {
    try { localStorage.removeItem(k); } catch (e) {}
  }
  function dayKey(n) { return 'ipas_w1_day' + n; }

  function getDayResult(n) {
    var raw = lsGet(dayKey(n));
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }

  /* ---------- 主題 ---------- */
  function initTheme() {
    var saved = lsGet(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved);
    }
    var btn = document.querySelector('.theme-btn');
    if (!btn) return;
    // 預設淺色，不跟隨系統深色設定；只有 data-theme="dark" 才是深色。
    function paint() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = isDark ? '☀' : '☾';
      btn.setAttribute('aria-label', isDark ? '切換為淺色主題' : '切換為深色主題');
    }
    paint();
    btn.addEventListener('click', function () {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var next = isDark ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      lsSet(THEME_KEY, next);
      paint();
    });
  }

  /* ---------- 導覽列標記已完成的天 ---------- */
  function markNav() {
    var links = document.querySelectorAll('.daynav a[data-day]');
    Array.prototype.forEach.call(links, function (a) {
      if (getDayResult(a.getAttribute('data-day'))) a.classList.add('done');
    });
  }

  /* ---------- 首頁的每日卡片狀態 ---------- */
  function paintDayCards() {
    var cards = document.querySelectorAll('.daycard[data-day]');
    var doneCount = 0, totalDays = 0;
    Array.prototype.forEach.call(cards, function (card) {
      var d = card.getAttribute('data-day');
      var res = getDayResult(d);
      var badge = card.querySelector('.badge');
      if (badge) {
        if (res) {
          badge.textContent = '已完成 ' + res.percent + '%';
          badge.classList.add('ok');
        } else {
          badge.textContent = '未作答';
          badge.classList.remove('ok');
        }
      }
      // 只有數字 day（不是 'w1test' 這種總測驗）才算進本週五天的進度。
      if (/^\d+$/.test(d)) {
        totalDays++;
        if (res) doneCount++;
      }
    });
    var prog = document.getElementById('week-progress');
    if (prog && totalDays) {
      prog.textContent = '本週進度 ' + doneCount + ' / ' + totalDays + ' 天';
    }
  }

  /* ---------- 後端回傳 ---------- */
  function setSync(el, text, cls) {
    if (!el) return;
    el.textContent = text;
    el.className = 'sync ' + (cls || 'idle');
  }

  function submitResult(data, syncEl) {
    var url = global.GAS_WEB_APP_URL;
    if (!url) {
      setSync(syncEl, '已完成作答（本站尚未啟用自動記錄，成績只留在這台裝置）', 'idle');
      return;
    }
    if (data.submitted) {
      setSync(syncEl, '✓ 已完成，成績已記錄', 'ok');
      return;
    }
    setSync(syncEl, '正在回傳成績…', 'idle');

    var payload = {
      type: 'daily',
      name: data.name || '未具名',
      week: data.week || (global.WEEK_INFO && global.WEEK_INFO.week) || 'W1',
      day: data.day,
      dayLabel: data.dayLabel || '',   // 有值時後端直接用它當「天數」欄
      dayTitle: data.dayTitle,
      percent: data.percent,
      correct: data.correct,
      total: data.total,
      wrongList: data.wrongList,
      detail: data.detail
    };

    fetch(url, { method: 'POST', body: JSON.stringify(payload) })
      .then(function (res) { return res.json(); })
      .then(function (res) {
        if (res && res.status === 'ok') {
          data.submitted = true;
          lsSet(dayKey(data.day), JSON.stringify(data));
          setSync(syncEl, '✓ 已完成，成績已記錄', 'ok');
        } else {
          throw new Error('backend error');
        }
      })
      .catch(function () {
        setSync(syncEl, '⚠ 成績回傳失敗（不影響你的作答）。請截圖此畫面回報召集人，或稍後按「重新回傳」。', 'warn');
        var retry = document.getElementById('retry-btn');
        if (retry) retry.hidden = false;
      });
  }

  /* ---------- 帶去自己的 AI 繼續問 ---------- */

  function buildAiPrompt(cfg) {
    var ai = cfg.ai || {};
    var base = global.SITE_BASE || (location.origin + location.pathname.replace(/[^/]*$/, ''));
    // 一般每日頁是 dayN.html；總測驗這類頁面用 cfg.pageFile 指定自己的檔名。
    var pageUrl = base + (cfg.pageFile || ('day' + cfg.day + '.html'));
    // 每日頁講「今天」，總測驗講「這一週」。
    var when = cfg.scopeWord || '今天';

    var subject = cfg.subject || '科目一「人工智慧基礎概論」';
    var p = [
      '我正在準備台灣 iPAS「初級 AI 應用規劃師」能力鑑定，' + subject + '。',
      '',
      when + '的教材在這個網頁：',
      pageUrl,
      '',
      '如果你可以開啟網址，請先讀過整頁的教材內容（表格、重點整理、補充說明）再回答。',
      '網頁上的測驗題目是由程式動態產生的，一般的網頁擷取讀不到，這是正常的，',
      '不用特別說明，也不用試圖找出原題——我答錯的題目會直接列在下面。',
      '如果你連教材內容都讀不到，就依照下面的主題描述回答，並在開頭告訴我。',
      '',
      when + '讀的範圍是官方學習指引 ' + (ai.pages || '') + '，主題是：',
      ai.topics || cfg.dayTitle,
      '',
      '請用繁體中文，幫我做這四件事：',
      '',
      '1. 用白話把上面的主題重講一次，每個關鍵名詞都給一個台灣職場情境的例子。',
      '2. 整理這個範圍最容易混淆的名詞對照表，說明怎麼一眼分辨。',
      '3. 出 5 題選擇題（四選一）考我。先只給題目，等我回答完再一題一題講解。',
      '4. 給我 2-3 個好記的口訣或記憶法。',
      '',
      '注意：請以官方學習指引的定義為準。如果你不確定某個說法是否符合 iPAS 的教材，',
      '請直接說「這點請回查指引」，不要自己編。'
    ];

    var res = getDayResult(cfg.day);
    if (res && res.answers && res.answers.length === cfg.questions.length) {
      var wrong = [], wrongCount = 0;
      res.answers.forEach(function (pick, i) {
        var q = cfg.questions[i];
        if (pick !== q.a) {
          var mine = pick === null
            ? '未作答'
            : KEYS[pick] + ' ' + q.o[pick];
          wrongCount++;
          wrong.push('- 第 ' + (i + 1) + ' 題：' + q.q);
          wrong.push('  我選了：' + mine);
          wrong.push('  正確答案：' + KEYS[q.a] + ' ' + q.o[q.a]);
          wrong.push('');
        }
      });
      if (wrongCount) {
        p.push('');
        p.push('另外，我剛做完' + when + '的自我測驗，' + res.total + ' 題中答錯了 ' + wrongCount + ' 題：');
        p.push('');
        if (wrong[wrong.length - 1] === '') wrong.pop();
        p.push.apply(p, wrong);
        p.push('');
        p.push('請針對上面這幾題背後的觀念，多花一點篇幅解釋我為什麼會選錯。');
      } else {
        p.push('');
        p.push('補充：我剛做完' + when + '的自我測驗 ' + res.total + ' 題全對，請把題目出難一點。');
      }
    }

    return p.join('\n');
  }

  function initAiCopy(cfg) {
    var btn = document.getElementById('copy-ai-btn');
    if (!btn) return;
    var status = document.getElementById('copy-status');
    var fallback = document.getElementById('ai-fallback');

    function say(msg, cls) {
      if (!status) return;
      status.textContent = msg;
      status.className = 'copy-status ' + (cls || '');
    }

    function showFallback(text) {
      if (!fallback) return;
      fallback.value = text;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      say('這個瀏覽器不給自動複製，請長按下面的文字全選後複製。', 'warn');
    }

    btn.addEventListener('click', function () {
      var text = buildAiPrompt(cfg);
      if (global.navigator && navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          say('✓ 已複製！貼到 ChatGPT／Claude／Gemini 都可以', 'ok');
          if (fallback) fallback.hidden = true;
        }).catch(function () {
          showFallback(text);
        });
      } else {
        showFallback(text);
      }
    });
  }

  /* ---------- 每日測驗 ---------- */
  function initQuiz(cfg) {
    initAiCopy(cfg);

    var list = document.getElementById('quiz-list');
    if (!list) return;

    var nameInput = document.getElementById('name-input');
    var scoreEl = document.getElementById('quiz-progress');
    var submitBtn = document.getElementById('submit-btn');
    var retakeBtn = document.getElementById('retake-btn');
    var retryBtn = document.getElementById('retry-btn');
    var syncEl = document.getElementById('sync-status');
    var resultBox = document.getElementById('result-box');
    var scoreBig = document.getElementById('result-score');
    var scoreSub = document.getElementById('result-sub');

    var total = cfg.questions.length;
    var picked = new Array(total).fill(null);
    var graded = false;

    function nameValue() {
      return nameInput ? nameInput.value.trim() : '';
    }

    var savedName = lsGet(NAME_KEY);
    if (savedName && nameInput) nameInput.value = savedName;
    if (nameInput) {
      nameInput.addEventListener('input', function () {
        lsSet(NAME_KEY, nameValue());
        refresh();
      });
    }

    var boxes = [];

    cfg.questions.forEach(function (item, i) {
      var box = document.createElement('div');
      box.className = 'q';

      var stem = document.createElement('div');
      stem.className = 'stem';
      var qn = document.createElement('span');
      qn.className = 'qn';
      qn.textContent = (i + 1 < 10 ? '0' : '') + (i + 1);
      var qt = document.createElement('span');
      qt.textContent = item.q;
      stem.appendChild(qn);
      stem.appendChild(qt);
      box.appendChild(stem);

      if (item.src) {
        var src = document.createElement('p');
        src.className = 'src';
        src.textContent = item.src;
        box.appendChild(src);
      }

      var opts = document.createElement('div');
      opts.className = 'opts';
      var exp = document.createElement('div');
      exp.className = 'exp';
      exp.hidden = true;

      item.o.forEach(function (text, j) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'opt';
        var k = document.createElement('span');
        k.className = 'k';
        k.textContent = '(' + KEYS[j] + ')';
        var t = document.createElement('span');
        t.textContent = text;
        btn.appendChild(k);
        btn.appendChild(t);
        btn.addEventListener('click', function () {
          if (graded) return;
          picked[i] = j;
          Array.prototype.forEach.call(opts.children, function (o) { o.classList.remove('picked'); });
          btn.classList.add('picked');
          refresh();
        });
        opts.appendChild(btn);
      });

      box.appendChild(opts);
      box.appendChild(exp);
      list.appendChild(box);
      boxes.push({ box: box, opts: opts, exp: exp, item: item });
    });

    function answeredCount() {
      return picked.filter(function (p) { return p !== null; }).length;
    }

    function refresh() {
      if (graded) return;
      var n = answeredCount();
      var hasName = nameValue().length > 0;

      if (scoreEl) {
        scoreEl.textContent = '已選 ' + n + ' / ' + total + ' 題' +
          (hasName ? '' : '　·　請先填姓名');
      }
      if (submitBtn) submitBtn.disabled = n < total || !hasName;
      // 題目都選完了卻還沒填姓名，把姓名欄標紅提醒
      if (nameInput) {
        if (!hasName && n === total) nameInput.classList.add('needed');
        else nameInput.classList.remove('needed');
      }
    }

    function reveal(answers, showPicked) {
      graded = true;
      boxes.forEach(function (b, i) {
        var mine = answers[i];
        Array.prototype.forEach.call(b.opts.children, function (o, oi) {
          o.disabled = true;
          o.classList.remove('picked');
          if (oi === b.item.a) o.classList.add('right');
          else if (showPicked && oi === mine) o.classList.add('wrong');
        });
        b.exp.innerHTML = '';
        var head = document.createElement('b');
        head.textContent = 'Ans（' + KEYS[b.item.a] + '）';
        b.exp.appendChild(head);
        b.exp.appendChild(document.createTextNode('　' + b.item.e));
        b.exp.hidden = false;
      });
      if (submitBtn) submitBtn.hidden = true;
      if (retakeBtn) retakeBtn.hidden = false;
      if (scoreEl) scoreEl.textContent = '已作答';
    }

    function showResult(data) {
      if (resultBox) resultBox.hidden = false;
      if (scoreBig) scoreBig.textContent = data.percent + '%';
      if (scoreSub) {
        scoreSub.textContent = data.name
          ? data.name + '　答對 ' + data.correct + ' / ' + data.total + ' 題'
          : '答對 ' + data.correct + ' / ' + data.total + ' 題';
      }
    }

    function grade() {
      var correct = 0;
      var wrong = [];
      var detail = {};
      picked.forEach(function (p, i) {
        detail['Q' + (i + 1)] = p === null ? '-' : KEYS[p];
        if (p === cfg.questions[i].a) correct++;
        else wrong.push(i + 1);
      });
      var data = {
        name: nameValue() || '未具名',   // 送出鈕已擋空白，這裡只是保險
        week: cfg.week || '',
        day: cfg.day,
        dayLabel: cfg.dayLabel || '',
        dayTitle: cfg.dayTitle,
        correct: correct,
        total: total,
        percent: Math.round((correct / total) * 100),
        wrongList: wrong.join('、'),
        detail: detail,
        answers: picked.slice(),
        date: new Date().toLocaleString('zh-TW'),
        submitted: false
      };
      lsSet(dayKey(cfg.day), JSON.stringify(data));
      return data;
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        if (answeredCount() < total) return;
        if (!nameValue()) {
          if (nameInput) {
            nameInput.classList.add('needed');
            nameInput.focus();
            nameInput.scrollIntoView({ block: 'center' });
          }
          return;
        }
        var data = grade();
        reveal(data.answers, true);
        showResult(data);
        submitResult(data, syncEl);
        markNav();
        if (resultBox) resultBox.scrollIntoView({ block: 'nearest' });
      });
    }

    if (retakeBtn) {
      retakeBtn.addEventListener('click', function () {
        lsDel(dayKey(cfg.day));
        global.location.reload();
      });
    }

    if (retryBtn) {
      retryBtn.addEventListener('click', function () {
        var saved = getDayResult(cfg.day);
        if (saved) {
          saved.submitted = false;
          retryBtn.hidden = true;
          submitResult(saved, syncEl);
        }
      });
    }

    /* 已作答過：直接顯示結果與解析 */
    var prev = getDayResult(cfg.day);
    if (prev && prev.answers && prev.answers.length === total) {
      picked = prev.answers.slice();
      reveal(picked, true);
      showResult(prev);
      if (prev.submitted) {
        setSync(syncEl, '✓ 已完成，成績已記錄', 'ok');
      } else {
        setSync(syncEl, '成績尚未回傳成功，可按「重新回傳」再試一次。', 'warn');
        if (retryBtn) retryBtn.hidden = false;
      }
    } else {
      refresh();
    }
  }

  /* ---------- 週總覽頁：輸入姓名，向後端查這個人的完成進度 ---------- */
  function initWeekLookup() {
    var bar = document.getElementById('lookup-bar');
    if (!bar) return;

    var input = document.getElementById('lookup-name');
    var btn = document.getElementById('lookup-btn');
    var statusEl = document.getElementById('lookup-status');

    function say(text, cls) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = 'sync ' + (cls || 'idle');
    }

    // 後端有資料的天數才升級成「已完成」，沒有的天數維持 paintDayCards() 已經畫好的狀態
    // （本機 localStorage 沒回傳成功時還是能看到自己剛做完的那天），不會被查詢結果打回「未作答」。
    function applyResult(days) {
      var cards = document.querySelectorAll('.daycard[data-day]');
      var doneCount = 0, totalDays = 0;
      Array.prototype.forEach.call(cards, function (card) {
        var d = card.getAttribute('data-day');
        var isNumberDay = /^\d+$/.test(d);
        if (isNumberDay) totalDays++;
        var hit = days[d];
        if (hit) {
          var badge = card.querySelector('.badge');
          if (badge) {
            badge.textContent = '已完成 ' + hit.percent + '%';
            badge.classList.add('ok');
          }
          if (isNumberDay) doneCount++;
        } else if (isNumberDay && getDayResult(d)) {
          doneCount++;
        }
      });
      var prog = document.getElementById('week-progress');
      if (prog && totalDays) prog.textContent = '本週進度 ' + doneCount + ' / ' + totalDays + ' 天';
    }

    function runQuery(name) {
      var url = global.GAS_WEB_APP_URL;
      if (!url) { say('本站尚未啟用自動記錄，無法查詢。', 'idle'); return; }
      say('查詢中…', 'idle');
      fetch(url + '?name=' + encodeURIComponent(name))
        .then(function (res) { return res.json(); })
        .then(function (res) {
          if (!res || res.status !== 'ok') throw new Error('bad response');
          if (!Object.keys(res.days || {}).length) {
            say('查無「' + res.name + '」的作答紀錄——姓名打法不同的話可以換暱稱試試，或者還沒開始作答。', 'warn');
            return;
          }
          applyResult(res.days);
          say('✓ 已依「' + res.name + '」的作答紀錄更新完成狀態', 'ok');
        })
        .catch(function () {
          say('⚠ 查詢失敗，可能是網路問題，稍後再試一次。', 'warn');
        });
    }

    if (btn) {
      btn.addEventListener('click', function () {
        var name = input ? input.value.trim() : '';
        if (!name) {
          if (input) { input.classList.add('needed'); input.focus(); }
          return;
        }
        if (input) input.classList.remove('needed');
        lsSet(NAME_KEY, name);
        runQuery(name);
      });
    }
    if (input) {
      input.addEventListener('keydown', function (ev) {
        if (ev.key === 'Enter') { ev.preventDefault(); if (btn) btn.click(); }
      });
    }

    // 之前在某一天測驗頁填過姓名的話，這裡自動帶入並直接查一次，不用重打。
    var saved = lsGet(NAME_KEY);
    if (saved) {
      if (input) input.value = saved;
      runQuery(saved);
    }
  }

  global.Study = {
    initTheme: initTheme,
    markNav: markNav,
    paintDayCards: paintDayCards,
    initQuiz: initQuiz,
    initWeekLookup: initWeekLookup,
    getDayResult: getDayResult,
    buildAiPrompt: buildAiPrompt
  };

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    markNav();
    paintDayCards();
  });
})(window);
