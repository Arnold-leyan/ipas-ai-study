/* 離線版：把全站預先存進同仁的手機／電腦（Service Worker）。
 *
 * ⚠ 這個檔案由 tools/build-sw.js 產生，不要直接改 sw.js——
 *   要改邏輯改 tools/sw.template.js，再跑 `node tools/build-sw.js`。
 *
 * 做法：第一次連網打開任何一頁時，背景把 FILES 全部下載存好；
 * 之後同站的網頁一律先拿存好的版本（飛機上、網路很爛時一樣秒開）。
 * 寫入成績的 Apps Script、iPAS 官網這些別的網域不經過這裡，照常走網路。
 * 版號跟著內容變，有新版時瀏覽器會在連網時自動下載、換掉舊的。
 */
var VERSION = '5bc5527610';
var CACHE = 'ipas-offline-' + VERSION;
var FILES = [
  "./",
  "index.html",
  "day1.html",
  "day10.html",
  "day11.html",
  "day12.html",
  "day13.html",
  "day14.html",
  "day15.html",
  "day16.html",
  "day17.html",
  "day18.html",
  "day19.html",
  "day2.html",
  "day20.html",
  "day21.html",
  "day22.html",
  "day23.html",
  "day24.html",
  "day25.html",
  "day26.html",
  "day27.html",
  "day28.html",
  "day29.html",
  "day3.html",
  "day30.html",
  "day4.html",
  "day5.html",
  "day6.html",
  "day7.html",
  "day8.html",
  "day9.html",
  "exam-114-4-1.html",
  "exam-114-4-2.html",
  "exam-115-1-1.html",
  "exam-115-1-2.html",
  "exam-115-2-1.html",
  "exam-115-2-2.html",
  "exam-index.html",
  "exam-review.html",
  "w1-index.html",
  "w1-review.html",
  "w1-test.html",
  "w2-index.html",
  "w2-review.html",
  "w2-test.html",
  "w3-index.html",
  "w3-review.html",
  "w3-test.html",
  "w4-index.html",
  "w4-review.html",
  "w4-test.html",
  "w5-index.html",
  "w5-review.html",
  "w5-test.html",
  "w6-index.html",
  "w6-review.html",
  "w6-test.html",
  "assets/config.js",
  "assets/data-exam.js",
  "assets/data-w1.js",
  "assets/data-w2.js",
  "assets/data-w3.js",
  "assets/data-w4.js",
  "assets/data-w5.js",
  "assets/data-w6.js",
  "assets/quiz.js",
  "assets/style.css"
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) {
        // cache:'reload' 跳過瀏覽器自己的 HTTP 快取，確保存進來的是最新版
        return cache.addAll(FILES.map(function (f) { return new Request(f, { cache: 'reload' }); }));
      })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) {
          return k.indexOf('ipas-offline-') === 0 && k !== CACHE;
        }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      // ignoreSearch：頁面引用的是 assets/quiz.js?v=8 這種帶版號的網址，存的是不帶版號的
      return cache.match(req, { ignoreSearch: true, ignoreVary: true }).then(function (hit) {
        if (hit) return hit;
        return fetch(req).catch(function () {
          // 沒網路又沒存到的頁面：開網頁的話退回首頁，至少不是一片空白
          if (req.mode === 'navigate') return cache.match('index.html');
          throw new Error('offline');
        });
      });
    })
  );
});
