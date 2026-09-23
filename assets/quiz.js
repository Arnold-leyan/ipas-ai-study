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

  /* 考古題在這台裝置上暫存的作答進度，回傳已答幾題（沒有就 0） */
  function localDraftCount(d) {
    try {
      var info = JSON.parse(lsGet(dayKey(d) + '_draft') || 'null');
      return info && info.answers ? Object.keys(info.answers).length : 0;
    } catch (e) { return 0; }
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
        var draftN = res ? 0 : localDraftCount(d);
        if (res) {
          badge.textContent = '已完成';
          badge.classList.add('ok');
        } else {
          badge.textContent = draftN ? '作答中 · 已答 ' + draftN + ' 題' : '未作答';
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

  /* 考古題頁：官方只公告答案、沒有解析，所以提問的重點是「請 AI 把答錯的題目講解清楚」。
   * 答錯的題目連四個選項一起附上，AI 不用讀網頁也能講解。 */
  function buildExamPrompt(cfg) {
    var p = [
      '我正在準備台灣 iPAS「初級 AI 應用規劃師」能力鑑定，' + cfg.subject + '。',
      '我剛做完「' + cfg.dayTitle + '」的官方公告試題（' + cfg.questions.length + ' 題單選題）。',
      '官方只公告答案、沒有解析，想請你幫我講解。',
      ''
    ];
    var res = getDayResult(cfg.day);
    if (!res || !res.answers || res.answers.length !== cfg.questions.length) {
      p.push('（我還沒做完這份考古題。）請先用繁體中文，幫我整理這一科最常考的 10 個觀念，');
      p.push('每個觀念附一個台灣職場情境的例子，以及一題四選一的練習題（先只給題目，等我回答再講解）。');
      return p.join('\n');
    }
    var wrong = [], wrongCount = 0;
    res.answers.forEach(function (pick, i) {
      var q = cfg.questions[i];
      if (pick === q.a) return;
      wrongCount++;
      wrong.push('第 ' + (i + 1) + ' 題：' + q.q);
      q.o.forEach(function (text, j) { wrong.push('(' + KEYS[j] + ') ' + text); });
      wrong.push('我選了：' + (pick === null ? '未作答' : KEYS[pick]) + '　官方答案：' + KEYS[q.a]);
      wrong.push('');
    });
    if (!wrong.length) {
      p.push('我 ' + res.total + ' 題全對。請針對這一科再出 10 題難度更高的四選一題目考我，');
      p.push('先只給題目，等我回答完再一題一題講解。');
      return p.join('\n');
    }
    if (wrong[wrong.length - 1] === '') wrong.pop();
    p.push('我答錯了 ' + wrongCount + ' 題，題目、選項、我的答案與官方答案如下：');
    p.push('');
    p.push.apply(p, wrong);
    p.push('');
    p.push('請用繁體中文，一題一題幫我：');
    p.push('1. 說明官方答案為什麼對，用白話講背後的觀念。');
    p.push('2. 說明我選的選項錯在哪裡，跟正確答案差在哪個關鍵字。');
    p.push('3. 如果其他選項也有容易混淆的名詞，順便對照一下。');
    p.push('全部講完後，幫我歸納這些錯題集中在哪幾個主題，並建議考前優先複習的順序。');
    p.push('');
    p.push('注意：一律以官方公告答案為準。如果你認為某題答案有爭議，可以說明理由，但不要自行改答案。');
    return p.join('\n');
  }

  function buildAiPrompt(cfg) {
    if (cfg.exam) return buildExamPrompt(cfg);
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

  /* ---------- 考古題計時器 ----------
   * cfg.minutes 有值時才啟用（考古題頁 = 正式考試的 75 分鐘）。
   * 記的是「已經用掉幾秒」而不是開始時間，所以可以暫停：按一下暫停、再按一下繼續；
   * 關掉頁面期間不算時間，下次打開是暫停狀態，按「繼續計時」接著算。
   * 已用秒數存在 localStorage，也會跟著作答進度一起暫存到後端，換裝置也接得上。
   * 時間到只提醒、不強制交卷。 */
  function initTimer(cfg, onChange) {
    var noop = { stop: function () {}, elapsed: function () { return 0; }, setElapsed: function () {}, pause: function () {} };
    var btn = document.getElementById('timer-btn');
    var floatTime = document.getElementById('float-time');
    if (!cfg.minutes || !btn) return noop;

    var key = dayKey(cfg.day) + '_timer';
    var limit = cfg.minutes * 60;
    var elapsed = 0, running = false, tick = null, last = 0, stopped = false;

    var saved = Number(lsGet(key));
    if (saved > 0 && saved < 24 * 3600) elapsed = saved;   // 舊版存的是開始時間（很大的數字），直接忽略

    function fmt(sec) {
      sec = Math.max(0, Math.floor(sec));
      var m = Math.floor(sec / 60), s = sec % 60;
      return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }
    function paint() {
      if (stopped) return;
      var left = limit - elapsed;
      var clock = left > 0 ? '剩 ' + fmt(left) : '時間到（可繼續作答）';
      if (running) btn.textContent = '⏸ ' + clock + '（按一下暫停）';
      else if (elapsed > 0) btn.textContent = '▶ 繼續計時（' + clock + '）';
      else btn.textContent = '⏱ 開始計時 ' + fmt(limit);
      btn.classList.toggle('late', left <= 0);
      if (floatTime) {
        floatTime.hidden = elapsed <= 0;
        floatTime.textContent = (running ? '' : '⏸ ') + (left > 0 ? fmt(left) : '時間到');
      }
    }
    function step() {
      var now = Date.now();
      // 背景分頁的計時器會被瀏覽器放慢，按實際經過時間補；但手機鎖屏、電腦睡眠這種
      // 一口氣跳很久的，視為中斷，最多只補 90 秒。
      elapsed += Math.min((now - last) / 1000, 90);
      last = now;
      lsSet(key, String(Math.round(elapsed)));
      paint();
    }
    function play() {
      if (running || stopped) return;
      running = true;
      last = Date.now();
      tick = global.setInterval(step, 1000);
      paint();
    }
    function pause() {
      if (!running) return;
      step();
      running = false;
      global.clearInterval(tick);
      paint();
      if (onChange) onChange();
    }
    btn.addEventListener('click', function () {
      if (running) pause();
      else { play(); if (onChange) onChange(); }
    });
    paint();

    return {
      elapsed: function () { if (running) step(); return Math.round(elapsed); },
      setElapsed: function (sec) {
        elapsed = Math.max(0, Number(sec) || 0);
        lsSet(key, String(Math.round(elapsed)));
        paint();
      },
      pause: pause,
      stop: function () {
        if (running) step();
        running = false;
        global.clearInterval(tick);
        stopped = true;
        if (elapsed > 0) btn.textContent = '⏱ 這次用了約 ' + Math.max(1, Math.round(elapsed / 60)) + ' 分鐘';
        btn.disabled = true;
        lsDel(key);
        if (floatTime) floatTime.hidden = true;
      }
    };
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
    var floatCount = document.getElementById('float-count');   // 考古題頁右下角的浮動進度，其他頁沒有
    var draft = null;   // 考古題的中斷接續（initDraft 在下面建立），其他頁是 null
    var timer = initTimer(cfg, function () { if (draft) draft.changed(); });

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
      // 換了裝置的人是打開頁面「之後」才填姓名，這時候再去後端查一次有沒有做過／做到一半
      nameInput.addEventListener('change', function () {
        if (!graded && !answeredCount() && nameValue()) restoreFromBackend();
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
          paintPick(i);
          refresh();
          if (draft) draft.changed(i);
        });
        opts.appendChild(btn);
      });

      box.appendChild(opts);
      box.appendChild(exp);
      list.appendChild(box);
      boxes.push({ box: box, opts: opts, exp: exp, item: item });
    });

    function paintPick(i) {
      Array.prototype.forEach.call(boxes[i].opts.children, function (o, oi) {
        o.classList.toggle('picked', oi === picked[i]);
      });
    }

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
      if (floatCount) floatCount.textContent = n + ' / ' + total;
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
        if (b.item.e) b.exp.appendChild(document.createTextNode('　' + b.item.e));
        b.exp.hidden = false;
      });
      if (submitBtn) submitBtn.hidden = true;
      if (retakeBtn) retakeBtn.hidden = false;
      var pill = document.getElementById('float-pill');
      if (pill) pill.hidden = true;
      if (scoreEl) scoreEl.textContent = '已作答';
    }

    function showResult(data) {
      if (resultBox) resultBox.hidden = false;
      if (scoreBig) scoreBig.textContent = cfg.passLine ? data.percent + ' 分' : data.percent + '%';
      if (scoreSub) {
        scoreSub.textContent = data.name
          ? data.name + '　答對 ' + data.correct + ' / ' + data.total + ' 題'
          : '答對 ' + data.correct + ' / ' + data.total + ' 題';
        if (cfg.passLine) {
          scoreSub.textContent += data.percent >= cfg.passLine
            ? '　✓ 達單科及格線 ' + cfg.passLine + ' 分'
            : '　距離單科及格線 ' + cfg.passLine + ' 分還差 ' + (cfg.passLine - data.percent) + ' 分';
        }
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
        timer.stop();
        if (draft) draft.finish();
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
        // 標記「這次重新整理不要自動還原」，不然後端還查得到舊紀錄，
        // 頁面重載後 restoreFromBackend() 會馬上把剛清掉的答案又還原回來，
        // 使用者會看到「按了重做，畫面卻立刻跳回已完成」。
        lsSet(dayKey(cfg.day) + '_skiprestore', '1');
        lsDel(dayKey(cfg.day) + '_timer');
        lsDel(dayKey(cfg.day) + '_draft');
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

    /* 換裝置、換瀏覽器時本機沒有紀錄——如果之前填過名字，向後端查這一天有沒有作答過，
     * 有的話直接還原成「已作答、看解析」，不用重新回答一次。 */
    function restoreFromBackend() {
      var skipKey = dayKey(cfg.day) + '_skiprestore';
      if (lsGet(skipKey)) { lsDel(skipKey); return; }   // 剛按過「重做」，這次不要自動還原
      var url = global.GAS_WEB_APP_URL;
      var name = lsGet(NAME_KEY);
      if (!url || !name) return;
      fetch(url + '?name=' + encodeURIComponent(name))
        .then(function (res) { return res.json(); })
        .then(function (res) {
          if (!res || res.status !== 'ok' || !res.days) return;
          var hit = res.days[String(cfg.day)];
          if (!hit || !hit.detail) {
            if (draft && res.drafts) draft.fromBackend(res.drafts[String(cfg.day)]);
            return;
          }

          var answers = new Array(total).fill(null);
          for (var i = 0; i < total; i++) {
            var letter = hit.detail['Q' + (i + 1)];
            var idx = letter ? KEYS.indexOf(letter) : -1;
            if (idx > -1) answers[i] = idx;
          }
          if (answers.indexOf(null) !== -1) return;   // 題目對不起來（例如題目後來改過），不強行還原

          var data = {
            name: res.name,
            week: cfg.week || hit.week || '',
            day: cfg.day,
            dayLabel: cfg.dayLabel || '',
            dayTitle: cfg.dayTitle,
            correct: hit.correct,
            total: hit.total || total,
            percent: hit.percent,
            wrongList: hit.wrongList || '',
            detail: hit.detail,
            answers: answers,
            date: '',
            submitted: true
          };
          lsSet(dayKey(cfg.day), JSON.stringify(data));
          picked = answers.slice();
          reveal(picked, true);
          showResult(data);
          setSync(syncEl, '✓ 已從後端還原你之前的作答紀錄（' + res.name + '）', 'ok');
        })
        .catch(function () { /* 還原失敗就當作沒查到，維持空白測驗，不影響正常作答 */ });
    }

    /* ---------- 考古題中斷接續 ----------
     * 作答進度（選了哪些選項＋計時器用掉的秒數）：
     *   - 每點一個選項就存進這台裝置的 localStorage（關掉分頁再開，原地接續）
     *   - 有填姓名時，停手 15 秒、按「暫存進度」、或切走分頁／關閉頁面時，
     *     送到後端「考古題作答進度」工作表（一人一份一列，覆蓋更新），換裝置也能接續
     * 打開頁面時先套用本機進度，再跟後端比「最後更新時間」，後端比較新就改用後端的。 */
    function initDraft() {
      var key = dayKey(cfg.day) + '_draft';
      var btn = document.getElementById('save-btn');
      var statusEl = document.getElementById('draft-status');
      var dirty = false;        // 有還沒送到後端的變更
      var touched = false;      // 這次打開頁面後自己動過（就不拿後端的舊進度蓋掉）
      var timerId = null;
      var sending = false;
      var local = null;
      var lastAt = null;        // 最後作答的題目（0-based），「回到上次暫停處」用
      var resumeBtn = document.getElementById('resume-btn');

      /* 上次暫停處＝最後作答那一題的下一題；舊資料沒記 at 的話，用第一題還沒答的 */
      function resumeTarget() {
        if (lastAt !== null && lastAt + 1 < total) return lastAt + 1;
        var first = picked.indexOf(null);
        return first > -1 ? first : (lastAt !== null ? lastAt : -1);
      }
      function paintResume() {
        if (!resumeBtn) return;
        var t = resumeTarget();
        resumeBtn.hidden = graded || t < 0;
        resumeBtn.textContent = '📍 回到第 ' + (t + 1) + ' 題';
      }
      if (resumeBtn) {
        resumeBtn.addEventListener('click', function () {
          var t = resumeTarget();
          if (t < 0) return;
          var box = boxes[t].box;
          box.scrollIntoView({ behavior: 'smooth', block: 'center' });
          box.classList.remove('flash');
          void box.offsetWidth;   // 重新觸發動畫
          box.classList.add('flash');
        });
      }

      var noteEl = document.getElementById('float-note');   // 右下角浮動框裡的短訊息
      function say(text, cls, short) {
        if (statusEl) {
          statusEl.textContent = text;
          statusEl.className = 'sync ' + (cls || 'idle');
        }
        if (noteEl) {
          noteEl.textContent = short || '';
          noteEl.className = 'pill-note ' + (cls || 'idle');
        }
      }
      function hhmm(ts) {
        var d = new Date(ts);
        return (d.getMonth() + 1) + '/' + d.getDate() + ' ' +
          (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
      }
      function answersObj() {
        var o = {};
        picked.forEach(function (p, i) { if (p !== null) o['Q' + (i + 1)] = KEYS[p]; });
        return o;
      }
      function saveLocal() {
        lsSet(key, JSON.stringify({ answers: answersObj(), at: lastAt, elapsed: timer.elapsed(), updated: Date.now() }));
      }
      function apply(info, from) {
        if (!info || !info.answers) return false;
        var n = 0;
        picked = new Array(total).fill(null);
        Object.keys(info.answers).forEach(function (q) {
          var i = parseInt(q.slice(1), 10) - 1, j = KEYS.indexOf(info.answers[q]);
          if (i >= 0 && i < total && j > -1) { picked[i] = j; n++; }
        });
        for (var i = 0; i < total; i++) paintPick(i);
        timer.setElapsed(info.elapsed);
        refresh();
        if (!n && !info.elapsed) return false;
        lastAt = typeof info.at === 'number' && info.at >= 0 && info.at < total ? info.at : null;
        paintResume();
        say('✓ 已接續' + from + '的作答進度（' + (info.updated ? hhmm(info.updated) + ' 存的，' : '') +
          '已答 ' + n + ' / ' + total + ' 題' + (info.elapsed ? '，已用 ' + Math.round(info.elapsed / 60) + ' 分鐘' : '') +
          '）。按右下角「📍 回到第 ' + (resumeTarget() + 1) + ' 題」直接跳到上次停下來的地方。' +
          (cfg.minutes ? '計時器是暫停的，準備好再按「繼續計時」。' : ''), 'ok', '✓ 已接續進度');
        return true;
      }

      function send(keepalive) {
        var url = global.GAS_WEB_APP_URL;
        var name = nameValue();
        if (!url || !name || graded || sending) return;
        if (!answeredCount() && !timer.elapsed()) return;
        sending = true;
        dirty = false;
        var payload = {
          type: 'draft', status: '作答中', name: name,
          week: cfg.week || '', dayLabel: cfg.dayLabel || '', dayTitle: cfg.dayTitle,
          answered: answeredCount(), total: total, elapsed: timer.elapsed(), answers: answersObj(), at: lastAt
        };
        if (!keepalive) say('正在暫存進度…', 'idle', '暫存中…');
        fetch(url, { method: 'POST', body: JSON.stringify(payload), keepalive: !!keepalive })
          .then(function (r) { return r.json(); })
          .then(function (r) {
            if (!r || r.status !== 'ok') throw new Error('backend');
            if (graded) return;
            var t = hhmm(Date.now());
            say('✓ 進度已暫存到雲端（' + t + '，已答 ' + payload.answered + ' / ' + total +
              ' 題）。換手機或電腦，打開這一頁、填同一個姓名就能接著做。', 'ok', '✓ 已暫存 ' + t.split(' ')[1]);
          })
          .catch(function () {
            dirty = true;
            if (!graded) say('⚠ 雲端暫存失敗（這台裝置上的進度還在）。可以稍後再按「暫存」。', 'warn', '⚠ 暫存失敗');
          })
          .then(function () { sending = false; });
      }

      if (btn) {
        btn.addEventListener('click', function () {
          if (graded) return;
          timer.pause();
          saveLocal();
          if (!global.GAS_WEB_APP_URL) { say('✓ 已存在這台裝置（本站沒有啟用雲端記錄，換裝置無法接續）。', 'ok', '✓ 已存在本機'); return; }
          if (!nameValue()) {
            say('✓ 已存在這台裝置。要換裝置接續的話，請先在上面填姓名再按一次。', 'warn', '請先填姓名');
            if (nameInput) nameInput.scrollIntoView({ block: 'center' });
            if (nameInput) { nameInput.classList.add('needed'); nameInput.focus(); }
            return;
          }
          send(false);
        });
      }
      // 切到別的 App、關分頁、手機鎖屏時，把還沒送的進度送出去
      document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden' && dirty) send(true);
      });

      // 打開頁面：先接本機的進度（已經交卷的就不用）
      try { local = JSON.parse(lsGet(key) || 'null'); } catch (e) { local = null; }
      if (local && !getDayResult(cfg.day)) apply(local, '這台裝置上');

      return {
        changed: function (i) {
          if (graded) return;
          if (typeof i === 'number') {
            lastAt = i;
            if (resumeBtn && !resumeBtn.hidden) paintResume();   // 接續後邊做邊更新「上次停在哪」
          }
          touched = true;
          dirty = true;
          saveLocal();
          global.clearTimeout(timerId);
          timerId = global.setTimeout(function () { if (dirty) send(false); }, 15000);
        },
        fromBackend: function (remote) {
          if (!remote || touched || graded) return;
          if (local && local.updated && remote.updated && local.updated >= remote.updated - 5000) return;
          if (apply(remote, '雲端上')) saveLocal();
        },
        finish: function () {
          global.clearTimeout(timerId);
          dirty = false;
          lsDel(key);
          say('', 'idle');
          var url = global.GAS_WEB_APP_URL;
          var name = nameValue();
          if (!url || !name) return;
          // 狀態改成「已交卷」，換裝置時就不會再跳出「接續作答」
          fetch(url, { method: 'POST', body: JSON.stringify({
            type: 'draft', status: '已交卷', name: name,
            week: cfg.week || '', dayLabel: cfg.dayLabel || '', dayTitle: cfg.dayTitle,
            answered: answeredCount(), total: total, elapsed: 0, answers: answersObj()
          }) }).catch(function () {});
        }
      };
    }

    if (cfg.exam) draft = initDraft();

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
      restoreFromBackend();
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

    // 每次查詢都是「換一個人」，所以查詢結果要完全取代畫面上的狀態——
    // 不能只疊加命中的天數，不然換了名字查，上一個人查到的「已完成」會殘留在畫面上。
    // 這包含兩組獨立畫的 UI：本週卡片的 badge，跟導覽列的 ♥ 記號（markNav() 畫的，
    // 原本只認這台裝置自己的 localStorage，查詢別人時一樣要蓋過去，不然導覽列還是顯示
    // 「這台裝置自己」做過的天數，看起來就像查詢結果抓到別人的舊紀錄。
    function resetBadges() {
      var cards = document.querySelectorAll('.daycard[data-day]');
      var totalDays = 0;
      Array.prototype.forEach.call(cards, function (card) {
        if (/^\d+$/.test(card.getAttribute('data-day'))) totalDays++;
        var badge = card.querySelector('.badge');
        if (badge) {
          badge.textContent = '未作答';
          badge.classList.remove('ok');
        }
      });
      var prog = document.getElementById('week-progress');
      if (prog && totalDays) prog.textContent = '本週進度 0 / ' + totalDays + ' 天';

      var navLinks = document.querySelectorAll('.daynav a[data-day]');
      Array.prototype.forEach.call(navLinks, function (a) { a.classList.remove('done'); });
    }

    function applyResult(days, drafts) {
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
            badge.textContent = '已完成';
            badge.classList.add('ok');
          }
          if (isNumberDay) doneCount++;
        } else if (drafts && drafts[d]) {
          var db = card.querySelector('.badge');
          if (db) db.textContent = '作答中 · 已答 ' + drafts[d].answered + ' / ' + drafts[d].total + ' 題';
        }
      });
      var prog = document.getElementById('week-progress');
      if (prog && totalDays) prog.textContent = '本週進度 ' + doneCount + ' / ' + totalDays + ' 天';

      var navLinks = document.querySelectorAll('.daynav a[data-day]');
      Array.prototype.forEach.call(navLinks, function (a) {
        if (days[a.getAttribute('data-day')]) a.classList.add('done');
      });
    }

    function runQuery(name) {
      var url = global.GAS_WEB_APP_URL;
      if (!url) { say('本站尚未啟用自動記錄，無法查詢。', 'idle'); return; }
      resetBadges();   // 先清掉畫面上可能殘留的上一個人的查詢結果，避免舊資料混進新的一次查詢
      say('查詢中…', 'idle');
      fetch(url + '?name=' + encodeURIComponent(name))
        .then(function (res) { return res.json(); })
        .then(function (res) {
          if (!res || res.status !== 'ok') throw new Error('bad response');
          if (!Object.keys(res.days || {}).length && !Object.keys(res.drafts || {}).length) {
            say('查無「' + res.name + '」的作答紀錄——姓名打法不同的話可以換暱稱試試，或者還沒開始作答。', 'warn');
            return;
          }
          applyResult(res.days || {}, res.drafts);
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

  /* ---------- 錯題複習頁：輸入姓名，把這週答錯的題目連解析一起列出來 ---------- */
  function initReview(cfg) {
    var bar = document.getElementById('lookup-bar');
    if (!bar) return;

    var input = document.getElementById('lookup-name');
    var btn = document.getElementById('lookup-btn');
    var statusEl = document.getElementById('lookup-status');
    var summaryEl = document.getElementById('review-summary');
    var listEl = document.getElementById('review-list');

    function say(text, cls) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.className = 'sync ' + (cls || 'idle');
    }

    // 後端的「答錯題號」是像 '1、3、5' 或 '（全對）' 這樣的字串，轉成題號陣列。
    function parseWrongNums(wrongList) {
      if (!wrongList || wrongList.indexOf('全對') > -1) return [];
      return wrongList.split(/[、,，]/)
        .map(function (s) { return parseInt(s.trim(), 10); })
        .filter(function (n) { return !isNaN(n); });
    }

    function renderQuestionCard(dayTitle, qNum, qItem, myLetter) {
      var box = document.createElement('div');
      box.className = 'q';

      var stem = document.createElement('div');
      stem.className = 'stem';
      var qn = document.createElement('span');
      qn.className = 'qn';
      qn.textContent = '第 ' + qNum + ' 題';
      var qt = document.createElement('span');
      qt.textContent = qItem.q;
      stem.appendChild(qn);
      stem.appendChild(qt);
      box.appendChild(stem);

      if (qItem.src) {
        var src = document.createElement('p');
        src.className = 'src';
        src.textContent = qItem.src;
        box.appendChild(src);
      }

      var opts = document.createElement('div');
      opts.className = 'opts';
      var myIdx = myLetter ? KEYS.indexOf(myLetter) : -1;
      qItem.o.forEach(function (text, j) {
        var optEl = document.createElement('div');
        optEl.className = 'opt';
        if (j === qItem.a) optEl.classList.add('right');
        else if (j === myIdx) optEl.classList.add('wrong');
        var k = document.createElement('span');
        k.className = 'k';
        k.textContent = '(' + KEYS[j] + ')';
        var t = document.createElement('span');
        t.textContent = text;
        optEl.appendChild(k);
        optEl.appendChild(t);
        opts.appendChild(optEl);
      });
      box.appendChild(opts);

      var exp = document.createElement('div');
      exp.className = 'exp';
      exp.hidden = false;
      var head = document.createElement('b');
      head.textContent = 'Ans（' + KEYS[qItem.a] + '）';
      exp.appendChild(head);
      if (qItem.e) exp.appendChild(document.createTextNode('　' + qItem.e));
      box.appendChild(exp);

      return box;
    }

    function runQuery(name) {
      var url = global.GAS_WEB_APP_URL;
      if (!url) { say('本站尚未啟用自動記錄，無法查詢。', 'idle'); return; }
      say('查詢中…', 'idle');
      if (summaryEl) summaryEl.innerHTML = '';
      if (listEl) listEl.innerHTML = '';

      fetch(url + '?name=' + encodeURIComponent(name))
        .then(function (res) { return res.json(); })
        .then(function (res) {
          if (!res || res.status !== 'ok') throw new Error('bad response');

          var dayKeys = Object.keys(cfg.data);
          var doneCount = 0, wrongTotal = 0;
          var undone = [];
          var frag = document.createDocumentFragment();

          dayKeys.forEach(function (key) {
            var dayInfo = cfg.data[key];
            var hit = res.days ? res.days[key] : null;
            if (!hit) { undone.push(dayInfo.dayTitle); return; }
            doneCount++;

            var wrongNums = parseWrongNums(hit.wrongList);
            if (!wrongNums.length) return;

            var section = document.createElement('div');
            var h3 = document.createElement('h3');
            h3.textContent = dayInfo.dayTitle + '　錯了 ' + wrongNums.length + ' 題';
            section.appendChild(h3);

            wrongNums.forEach(function (n) {
              var qItem = dayInfo.questions[n - 1];
              if (!qItem) return;
              var myLetter = hit.detail ? hit.detail['Q' + n] : null;
              section.appendChild(renderQuestionCard(dayInfo.dayTitle, n, qItem, myLetter));
              wrongTotal++;
            });
            frag.appendChild(section);
          });

          var msg = '已依「' + res.name + '」查到 ' + doneCount + ' / ' + dayKeys.length + ' 天的作答紀錄';
          if (wrongTotal) msg += '，共 ' + wrongTotal + ' 題答錯，整理如下：';
          else if (doneCount) msg += '，這幾天全對，沒有錯題可以複習！';
          else msg += '，還沒有任何一天的資料。';
          say('✓ ' + msg, 'ok');

          if (undone.length && summaryEl) {
            var note = document.createElement('p');
            note.className = 'lede';
            note.textContent = '還沒作答：' + undone.join('、');
            summaryEl.appendChild(note);
          }
          if (listEl) listEl.appendChild(frag);
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
    initReview: initReview,
    getDayResult: getDayResult,
    buildAiPrompt: buildAiPrompt
  };

  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    markNav();
    paintDayCards();
  });
})(window);
