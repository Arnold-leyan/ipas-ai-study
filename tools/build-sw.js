/* 產生 sw.js（離線版的 Service Worker）。
 *
 * 用法：在網站根目錄執行 `node tools/build-sw.js`
 *
 * 會把根目錄所有 .html 與 assets/ 底下的檔案列進預先下載清單，
 * 版號用這些檔案內容的雜湊值——內容有改，版號就跟著變，
 * 同仁下次連網打開網站時會自動換成新版。
 * 新增頁面、改了任何頁面或 assets 之後都要重跑一次再 commit。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const pages = fs.readdirSync(root).filter(f => f.endsWith('.html')).sort();
const assets = fs.readdirSync(path.join(root, 'assets')).sort().map(f => 'assets/' + f);
// index.html 排第一，'./' 對應網址只打到資料夾（…/ipas-ai-study/）的情況
const files = ['./', 'index.html'].concat(pages.filter(f => f !== 'index.html'), assets);

const hash = crypto.createHash('sha1');
files.slice(1).forEach(f => hash.update(f).update(fs.readFileSync(path.join(root, f))));
const version = hash.digest('hex').slice(0, 10);

const template = fs.readFileSync(path.join(__dirname, 'sw.template.js'), 'utf8');
const out = template
  .replace('__VERSION__', version)
  .replace('__FILES__', JSON.stringify(files, null, 2));
fs.writeFileSync(path.join(root, 'sw.js'), out);

console.log('sw.js 已更新：版號 ' + version + '，共 ' + files.length + ' 個網址（' + pages.length + ' 頁）');
