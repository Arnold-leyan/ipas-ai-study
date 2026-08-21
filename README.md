# iPAS AI 應用規劃師 考取衝刺班 — 每日學習網站

公司內部讀書會用的靜態學習網站。每天一頁，各附一份小測驗，作答成績自動回傳 Google 試算表。

對應 iPAS 115 年度第四次「初級 AI 應用規劃師」（考試日 2026/11/7）。

## 目前內容

**W1（8/17–8/21）** — 學習指引 科目一 3.1、3.2 節，p.3-1～3-32

| 頁面 | 主題 | 範圍 | 題數 |
|---|---|---|---|
| `index.html` | 本週總覽、易混淆對照、官方勘誤 | — | — |
| `day1.html` | AI 定義、分類與應用領域 | p.3-1～3-2 | 6 |
| `day2.html` | AI 三層架構與資料處理四步驟 | p.3-3～3-7 | 6 |
| `day3.html` | 四種資料分析與常見演算法 | p.3-7～3-12 | 6 |
| `day4.html` | 機器學習、深度學習與生成式 AI | p.3-12～3-19 | 6 |
| `day5.html` | 統計量與假設檢定 | p.3-24～3-32 | 10 |
| `w1-test.html` | W1 總測驗（Day 1～Day 5 整週） | p.3-1～3-32 | 20 |

共 34 題，其中 **19 題是學習指引的官方原題**（每題都標示出處頁碼），15 題依指引內容自編，
題目卡片上會標「官方原題」或「自編練習題」。

內容已比對 **114.04 版學習指引勘誤表**，本週範圍內 5 處更正全部採用更正後版本。

## 檔案結構

```
.
├── index.html              週總覽
├── day1.html … day5.html   每日頁面
├── w1-test.html            W1 總測驗（整週 20 題）
├── assets/
│   ├── style.css           共用樣式（深淺主題）
│   ├── config.js           ★ 只有這個檔案需要改設定
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

## 下一週要加內容時

1. 複製 `day1.html` 改成新的一天
2. 改最下面 `Study.initQuiz({...})` 裡的 `day`、`dayTitle` 和 `questions`
3. `index.html` 加一張 `daycard`，`data-day` 要跟 `initQuiz` 的 `day` 一致
4. 每一頁的 `.daynav` 加上新的連結
5. `assets/config.js` 的 `WEEK_INFO.week` 改成 `W2`（成績表才會標對週次）

`day` 是進度記錄的唯一鍵，跨週請不要重複（W2 用 6～10，以此類推）。

**總測驗這種不是「第幾天」的頁面**，`day` 可以直接給字串（W1 總測驗用 `'w1test'`），
另外三個設定要一起給，否則會出錯或寫進奇怪的資料：

| 設定 | 作用 | 不給會怎樣 |
| --- | --- | --- |
| `dayLabel` | 試算表「天數」欄直接寫這個字串 | 會寫成 `Day w1test` |
| `pageFile` | AI 提問裡附的網址檔名 | 會湊成 `dayw1test.html`（404） |
| `scopeWord` | AI 提問裡的稱呼，例如 `'這一週'` | 會講成「今天」 |

後端 `SPECS.daily.row` 是 `d.dayLabel ? d.dayLabel : (d.day ? 'Day ' + d.day : '')`，
所以**改了這三個設定不用動後端**；但當初加 `dayLabel` 那次有重新部署過新版本（2 版）。

## 已知限制

- 每日進度存在瀏覽器 localStorage，換裝置就要重做。成績以試算表為準。
- 網站沒有身分驗證，姓名是同仁自行輸入。
- 需要網路連線才能回傳成績；離線時仍可作答與看解析。
