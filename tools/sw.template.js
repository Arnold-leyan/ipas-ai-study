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
var VERSION = '__VERSION__';
var CACHE = 'ipas-offline-' + VERSION;
var FILES = __FILES__;

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
