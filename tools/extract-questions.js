const fs = require('fs');
const path = require('path');
const vm = require('vm');

const siteDir = path.join(__dirname, '..');   // 這個腳本放在 tools/ 底下，網站根目錄是上一層

function extractCfg(file) {
  const html = fs.readFileSync(path.join(siteDir, file), 'utf8');
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const target = scripts.find(s => s.includes('Study.initQuiz('));
  if (!target) throw new Error('no Study.initQuiz found in ' + file);

  let captured = null;
  const sandbox = {
    Study: { initQuiz: function (cfg) { captured = cfg; } }
  };
  vm.createContext(sandbox);
  vm.runInContext(target, sandbox, { filename: file });

  if (!captured) throw new Error('initQuiz not called in ' + file);
  return captured;
}

function buildWeek(files, outVar, outFile) {
  const data = {};
  for (const f of files) {
    const cfg = extractCfg(f);
    const key = String(cfg.day);
    data[key] = {
      dayTitle: cfg.dayTitle,
      questions: cfg.questions.map(q => ({ q: q.q, o: q.o, a: q.a, src: q.src, e: q.e }))
    };
    console.log(f, '->', key, cfg.questions.length, 'questions');
  }
  const out = '/* 自動從各頁面的 Study.initQuiz() 設定抽出，供錯題複習頁使用。\n' +
    ' * 這份資料本身不會被日常測驗頁引用，只有 review 頁面會讀取。\n' +
    ' * 之後改題目：先改對應的 dayN.html，再從網站根目錄執行\n' +
    ' *   node tools/extract-questions.js\n' +
    ' * 重新產生這個檔案（不要手動改這裡）。 */\n' +
    'var ' + outVar + ' = ' + JSON.stringify(data, null, 2) + ';\n';
  fs.writeFileSync(path.join(siteDir, 'assets', outFile), out, 'utf8');
  console.log('wrote', outFile);
}

buildWeek(
  ['day1.html', 'day2.html', 'day3.html', 'day4.html', 'day5.html', 'w1-test.html'],
  'W1_QUESTIONS', 'data-w1.js'
);
buildWeek(
  ['day6.html', 'day7.html', 'day8.html', 'day9.html', 'day10.html', 'w2-test.html'],
  'W2_QUESTIONS', 'data-w2.js'
);
buildWeek(
  ['day11.html', 'day12.html', 'day13.html', 'day14.html', 'day15.html', 'w3-test.html'],
  'W3_QUESTIONS', 'data-w3.js'
);
buildWeek(
  ['day16.html', 'day17.html', 'day18.html', 'day19.html', 'day20.html', 'w4-test.html'],
  'W4_QUESTIONS', 'data-w4.js'
);
