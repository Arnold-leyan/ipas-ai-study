# iPAS AI 應用規劃師 考取衝刺班 — 每日學習網站

公司內部讀書會用的靜態學習網站。每天一頁，各附一份小測驗，作答成績自動回傳 Google 試算表。

對應 iPAS 115 年度第四次「初級 AI 應用規劃師」（考試日 2026/11/7）。

## 目前內容

`index.html` 是週次總覽的入口頁（首頁），每一週各自有一份 `wN-index.html` 當作那一週的總覽頁，
架構完全一樣：五天內容頁 + 每天小測驗 + 週末總測驗。已完成／進行中的週次不會被覆蓋，
同仁隨時可以回頭補之前週次的進度。

**W1（8/17–8/21）** — 學習指引 科目一 3.1、3.2 節，p.3-1～3-32

| 頁面 | 主題 | 範圍 | 題數 |
|---|---|---|---|
| `w1-index.html` | 第一週總覽、易混淆對照、官方勘誤 | — | — |
| `day1.html` | AI 定義、分類與應用領域 | p.3-1～3-2 | 6 |
| `day2.html` | AI 三層架構與資料處理四步驟 | p.3-3～3-7 | 6 |
| `day3.html` | 四種資料分析與常見演算法 | p.3-7～3-12 | 6 |
| `day4.html` | 機器學習、深度學習與生成式 AI | p.3-12～3-19 | 6 |
| `day5.html` | 統計量與假設檢定 | p.3-24～3-32 | 10 |
| `w1-test.html` | W1 總測驗（Day 1～Day 5 整週） | p.3-1～3-32 | 20 |

共 34 題，其中 19 題是學習指引的官方原題（每題都標示出處頁碼），15 題依指引內容自編。
內容已比對 114.04 版學習指引勘誤表，本週範圍內 5 處更正全部採用更正後版本。

**W2（8/24–8/28）** — 學習指引 科目二 3.1 節，p.3-1～3-15

| 頁面 | 主題 | 範圍 | 題數 |
|---|---|---|---|
| `w2-index.html` | 第二週總覽、易混淆對照 | — | — |
| `day6.html` | No Code、Low Code 是什麼？跟生成式 AI 怎麼結合 | p.3-1～3-2 | 6 |
| `day7.html` | 生成式 AI 在各行各業的應用 | p.3-2～3-4 | 6 |
| `day8.html` | 怎麼選平台？結合生成式 AI 又會遇到什麼問題 | p.3-4～3-7 | 6 |
| `day9.html` | No Code / Low Code 的市場價值與未來趨勢 | p.3-8～3-10 | 6 |
| `day10.html` | 對 AI 民主化的影響 | p.3-10～3-15 | 10 |
| `w2-test.html` | W2 總測驗（Day 1～Day 5 整週） | p.3-1～3-15 | 20 |

共 34 題，其中 10 題是學習指引的官方原題，24 題依指引內容自編。
本週範圍在 114.04 版勘誤表中沒有相關更正（科目二勘誤僅一處，位於 p.3-32，不在本週範圍內）。

題目卡片上都會標「官方原題」或「自編練習題」。

## 檔案結構

```
.
├── index.html               課程首頁（週次列表）
├── w1-index.html             第一週總覽
├── day1.html … day5.html     第一週每日頁面
├── w1-test.html              W1 總測驗（整週 20 題）
├── w2-index.html              第二週總覽
├── day6.html … day10.html    第二週每日頁面
├── w2-test.html               W2 總測驗（整週 20 題）
├── assets/
│   ├── style.css           共用樣式（深淺主題）
│   ├── config.js           ★ 只有這個檔案需要改後端設定
│   └── quiz.js             測驗引擎與後端回傳
├── apps-script-backend.gs  Google Apps Script 後端（獨立一份，與鑑別測驗分開）
├── SETUP.md                後端設定步驟
└── .nojekyll               讓 GitHub Pages 不要跑 Jekyll
```

## 部署到 GitHub Pages

```bash
git init
git add .
git commit -m "W1 每日學習網站"
git branch -M main
git remote add origin https://github.com/<你的帳號>/<repo 名稱>.git
git push -u origin main
```

推上去之後，到 repo 的 **Settings → Pages**：

- **Source** 選 `Deploy from a branch`
- **Branch** 選 `main`、資料夾選 `/ (root)`
- 按 Save，等一兩分鐘

網址會是 `https://<你的帳號>.github.io/<repo 名稱>/`。

> **repo 要設 Public**，GitHub Pages 在免費方案不支援 Private repo。
> 網站上沒有分數資料（分數都在 Google 試算表），公開的只有教材內容與題目，
> 但公開前還是確認一下沒有寫進公司內部資訊。

## 成績記錄

見 [SETUP.md](SETUP.md)。簡單說：開一份新的 Google 試算表 →
貼上 `apps-script-backend.gs` → 部署為網頁應用程式 →
把網址填進 `assets/config.js`。

這是讀書會網站**自己的**後端，跟鑑別測驗那份 Apps Script 是分開的兩套，
之後要加的功能都往這一份加。成績寫進「每日測驗結果」工作表。

要擴充時只需要改 `apps-script-backend.gs` 最上面的 `SPECS`：
每種要記錄的資料就是一個項目（寫到哪個工作表、欄位、怎麼轉成一列），
新增類型不用改 `doPost`。檔案最下方附了「週五打卡」的現成範例。

> 改完程式碼一定要「部署 → 管理部署作業 → 版本選新版本 → 部署」，
> 只按 Ctrl+S 儲存不會生效。

## 下一週要加內容時（例如 W3）

第一週、第二週都已經開通、可以隨時回頭補進度，所以**不要**覆蓋既有的 `wN-index.html` 或
`dayN.html`——新週次一律用新檔名（W3 就用 `w3-index.html`、`day11.html`…`day15.html`、`w3-test.html`）。

1. 複製上一週的 `dayN.html` 改成新的一天（複製 `w2-index.html`、`w2-test.html` 當範本）
2. 改最下面 `Study.initQuiz({...})` 裡的 `day`、`dayTitle`、`questions`，**還有這兩個容易漏掉的**：
   - `week: 'W3'` —— 沒給的話成績表週次欄會錯標成 W1
   - `subject: '科目二「生成式AI應用與規劃」'`（或對應科目）—— 沒給的話「帶去 AI 繼續問」的提示文字會錯講成科目一
3. 新週次自己的 `wN-index.html` 裡加齊 `daycard`，`data-day` 要跟 `initQuiz` 的 `day` 一致
4. 每一頁的 `.daynav` 加上新的連結，記得把「總覽」指到自己這週的 `wN-index.html`（不是課程首頁 `index.html`）
5. `index.html`（課程首頁）加一張新的週次卡片，把上一週卡片的「本週」badge 改回一般樣式
6. 舊週次 `wN-index.html` 的 mast-meta 可以補一個「下一週 →」的 `<a class="tag">` 連結

`day` 是進度記錄的唯一鍵，跨週請不要重複（W1 用 1～5、W2 用 6～10、W3 用 11～15，以此類推）。

**總測驗這種不是「第幾天」的頁面**，`day` 可以直接給字串（例如 `'w3test'`），
另外三個設定要一起給，否則會出錯或寫進奇怪的資料：

| 設定 | 作用 | 不給會怎樣 |
| --- | --- | --- |
| `dayLabel` | 試算表「天數」欄直接寫這個字串 | 會寫成 `Day w3test` |
| `pageFile` | AI 提問裡附的網址檔名 | 會湊成 `dayw3test.html`（404） |
| `scopeWord` | AI 提問裡的稱呼，例如 `'這一週'` | 會講成「今天」 |

後端 `SPECS.daily.row` 是 `d.dayLabel ? d.dayLabel : (d.day ? 'Day ' + d.day : '')`，
所以**改了這三個設定不用動後端**；`week`／`subject` 也是純前端設定，同樣不用動後端或重新部署。

## 已知限制

- 每日進度存在瀏覽器 localStorage，換裝置就要重做。成績以試算表為準。
- 網站沒有身分驗證，姓名是同仁自行輸入。
- 需要網路連線才能回傳成績；離線時仍可作答與看解析。
