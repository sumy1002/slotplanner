# SlotPlanner Pro · Web 版

> 老虎機數值規劃 / 模擬工具箱(瀏覽器版,免安裝)

## 🎯 給使用者(同仁)

**直接打開網址就能用,不用安裝任何東西。**

部署後的網址會像這樣(依實際部署為準):
```
https://你的帳號.github.io/slotplanner/app.html
```

把這個網址加入瀏覽器書籤就好。

### 功能總覽

| 頁面 | 用途 |
|---|---|
| 📄 TXT → XLSX | 轉換工具 |
| 🎨 Symbol 管理 | 編輯符號清單 |
| ⚙️ 設定檔編輯器 | 10 分頁編輯 A.xlsx 全部內容 |
| 🎲 模擬引擎 | 跑模擬產 B.xlsx 結果報告 |

### 系統需求

- **任何主流瀏覽器**(Chrome / Edge / Firefox / Safari)
- 第一次進入「模擬引擎」會背景下載 Pyodide(~6 MB,只下載一次,之後瀏覽器快取)
- 所有資料**只存在自己電腦的瀏覽器中**,不會上傳到任何地方

---

## 🛠️ 給維護者

### 本機開發

```bash
cd slotplanner
python3 -m http.server 8000
# 開啟 http://localhost:8000/app.html
```

**為什麼一定要用 HTTP server?**
Pyodide worker 的 `importScripts` 在 `file://` 協定下會被瀏覽器擋,還有 `fetch` Python 檔也需要 http 協定。

### 目錄結構

```
slotplanner/
├── app.html                  主檔
├── css/
│   ├── theme.css                  設計 token
│   ├── theme_additions.css        v3.0-3.3 樣式(凍結)
│   └── modules/
│       ├── theme_v34.css          v3.4 樣式(暗色模式等)
│       └── theme_v37.css          v3.7 樣式
├── js/
│   ├── registry.js                SymbolRegistry
│   ├── parser.js                  TXT 解析
│   ├── xlsx.js                    ExcelJS 包裝
│   ├── symbol.js                  Symbol 頁
│   ├── slotplanner.js             Pyodide worker + SimPage
│   ├── filter-modal.js            篩選 modal
│   ├── aconfig-xlsx.js            A.xlsx I/O 層
│   ├── config-editor/             設定檔編輯器(v3.4 起 4 檔)
│   │   ├── helpers.js                純常數 + LS I/O
│   │   ├── template.js               Vue template
│   │   ├── setup.js                  Vue setup function
│   │   └── index.js                  組裝點
│   └── app.js                     主 Vue app
└── py/                          Python 模擬引擎(v3.5 改為獨立檔)
    ├── core/                       核心邏輯
    ├── iolayer/                    A/B xlsx 讀寫
    └── stats/                      統計收集
```

### 部署到 GitHub Pages(3 分鐘)

#### 1. 推上 GitHub

```bash
cd slotplanner
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<你的帳號>/slotplanner.git
git push -u origin main
```

#### 2. 啟用 GitHub Pages

1. 進 repo 的 **Settings → Pages**
2. **Source**: 選 `Deploy from a branch`
3. **Branch**: 選 `main`,資料夾選 `/ (root)`
4. 按 Save

#### 3. 等 1-3 分鐘

GitHub 會在 Settings → Pages 頁面上方顯示綠勾與網址:

```
✓ Your site is live at https://<你的帳號>.github.io/slotplanner/
```

訪問 `https://<你的帳號>.github.io/slotplanner/app.html` 就能用了。

#### 4. 更新

之後改了任何檔案,推上 git 即可,GitHub Pages 會自動部署:

```bash
git add .
git commit -m "更新某功能"
git push
# 等 1-2 分鐘就生效
```

### 替代部署方式

| 方式 | 適用情境 |
|---|---|
| **GitHub Pages**(推薦) | 公開可接受;免費;自動 HTTPS |
| **Cloudflare Pages** | 想私有但免費;CDN 全球加速 |
| **Netlify** | 拖拉資料夾就部署;支援密碼保護(付費) |
| **公司內網 Nginx/Caddy** | 不能上雲;需自管伺服器 |

無論哪個,**使用者都不用裝任何軟體**,點連結就用。

---

## 版本歷程

完整變更請見原 Project Instructions。重點摘要:

- **v3.6**(矩陣編輯體感與按需載入):
  - 15 個矩陣 cell 加上 `v-memo`(04 reel weights / 05 grid_size_weights / 08 combo weights,共編輯+對比共 8 種 cell 模板)
    - 改別列、改別 cell 時,本 cell 不會 re-render
    - 大表格(例如 30 reel × 20 symbol × 3 step = 1800 cell)的編輯體感大幅改善
  - `theme_v37.css` 改為 lazy-load(只有進 SimPage 才動態 inject `<link>`)
    - 首頁初始載入再省 9 KB
    - SimPage 第一次進入時補載,進過一次就 cache 不再重複載
  - **保留決定:沒有改 shallowReactive**
    - 原本評估會做,但實作後發現現有 reactive 內部的 `.weights` 物件需要 deep reactivity(v-model 直接動 cell),改成 shallow 會破編輯
    - 收益小但風險高,保留現狀更穩
    - v-memo 已涵蓋 80% 的矩陣效能瓶頸,差異感受不到

- **v3.5**(本次優化):
  - 移除已凍結的 `reel.js` 與 page 2 入口
  - `config-editor.js` 拆為 4 檔(`helpers/template/setup/index`)
  - Pyodide Python 原始碼從內嵌字串改為 `py/` 資料夾 + fetch
    - `slotplanner.js` 從 290 KB 砍到 124 KB
    - 主頁載入更快,記憶體佔用更低
  - 加入 GitHub Pages 部署設定(`.nojekyll`、`.gitignore`、本 README)
  - app.html 加 CDN preconnect 提示
- v3.4:暗色模式、tab 驗證徽章、範本載入 diff、CSS 拆檔
- v3.3:規則白話翻譯卡、矩陣強化、Layout 範本、Constraints 兩欄
- v3.2:Paylines 兩欄極簡版面 + LINE 模式智能引導
- v3.1:Tab 整合(11→1, 09+10→1),減為 10 分頁 / 3 群組
- v3.0:整合「盤面設計」進設定檔編輯器
