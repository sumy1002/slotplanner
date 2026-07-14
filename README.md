# SlotPlanner Pro — 完整專案打包（2026-07-14）

純前端 Vue 3 CDN、無 build 的「**規格描述 + A.xlsx 傳輸 + docgen 產出**」工具。
**本工具不執行任何玩法邏輯、不計算 RTP**（交由外部下游模擬工具）。

---

## ⚠️ 資料夾層級（務必照放，這是上一版出錯的地方）

有**兩個容易漏掉的巢狀子資料夾**，放錯會抓不到檔：

1. **`slotplanner/js/config-editor/`** ← 上次就是漏了這層
   `helpers.js` / `template.js` / `setup.js` / `index.js` **一定要在 `js/config-editor/` 裡**，
   不能和其他 js 平放在 `js/` 根。`app.html` 是用 `js/config-editor/helpers.js` 這種路徑載入的。

2. **`slotplanner/css/modules/`** ← 另一個巢狀層
   `scrollbar.css` / `theme_v34.css` / `glass-overrides.css` **一定要在 `css/modules/` 裡**，
   因為 `theme_additions.css` 內是用 `@import url('modules/scrollbar.css')` 載入它們的。

只要這兩層放對，整個 app 就能正常載入。

---

## 完整目錄結構

```
slotplanner_full_2026-07-14/
├─ README.md                       ← 本檔
│
├─ slotplanner/                    ★ 網頁 App —— 用靜態伺服器開這個資料夾
│  ├─ app.html                     （入口；用 http server 開，勿 file:// 直開）
│  ├─ css/
│  │   ├─ theme.css                （token :root，獨立無 @import）
│  │   ├─ theme_additions.css      （新 CSS 都 append 在此；@import 下面 3 個 module）
│  │   └─ modules/                 ← ★ 巢狀層
│  │       ├─ scrollbar.css
│  │       ├─ theme_v34.css        （暗色模式）
│  │       └─ glass-overrides.css  （#app 前綴結構覆蓋）
│  └─ js/
│      ├─ registry.js              （符號註冊表；最先載）
│      ├─ mobile-gestures.js
│      ├─ game-spec.js
│      ├─ parser.js
│      ├─ xlsx.js
│      ├─ symbol.js                （圖示頁 SP.SymbolPage）
│      ├─ filter-modal.js
│      ├─ aconfig-xlsx.js          （A.xlsx 匯出 buildAxlsxBufferFromLS）
│      ├─ docgen.js                （企劃書 / 公司格式產生器 + VBA blob）
│      ├─ bcompare.js              （A/B 結果比較）
│      ├─ config-compare.js        （設定檔比對）
│      ├─ app.js                   （頂層 goPage/goConfig/goSymbols）
│      └─ config-editor/           ← ★ 巢狀層（上次漏掉的）
│          ├─ helpers.js           （純函式 + ACTION_CATALOG + TAB 常數）
│          ├─ template.js          （config 元件 template）
│          ├─ setup.js             （config 元件 setup，主戰場 ~12,300 行）
│          └─ index.js             （元件註冊）
│
└─ engine/                         Python 引擎 —— 給外部下游模擬工具用（網頁 App 不載）
   ├─ (頂層扁平 10 模組)            schemas / a_loader / b_writer / collector /
   │                               condition_parser / grid_engine / combo_engine /
   │                               pay_resolver / logic_parser / reel_generator .py
   ├─ core/                        ← 可 import 的套件（from core.X）
   │   ├─ __init__.py
   │   └─ (同上 10 模組)
   └─ tests/                       全套自動化測試 + package.json
       ├─ r1_roundtrip_test.js         （主 A.xlsx round-trip）
       ├─ r1b_tierB_test.js            （欄序免疫，含 05b / enabled 斷言）
       ├─ layerC_cellsToReels_test.js  （14 案洞格迴歸）
       ├─ mode_grid_range_test.py      （05b Megaways 逐模式金測試）
       ├─ type_normal_test.py / type_export_map_test.js
       ├─ dsl_golden_js.js / dsl_golden_py.py / dsl_golden_cases.json（DSL 金測試 108 案）
       ├─ docgen_zerodiff.js           （docgen 輸出零 diff 護欄）
       ├─ layerC_smoke_test.sh
       └─ package.json / package-lock.json （exceljs 等）
```

---

## 如何部署網頁 App

網頁 App = `slotplanner/` 資料夾。因為用了 fetch / module 載入，**要用靜態 HTTP 伺服器開，不能 file:// 直接開檔**。

任選一種：
- Python：`cd slotplanner && python3 -m http.server 8080` → 瀏覽器開 `http://localhost:8080/app.html`
- Node：`npx serve slotplanner` 或任何靜態伺服器
- 或丟到任何靜態網站主機（GitHub Pages / Netlify 等），入口是 `app.html`

外部相依（app.html 由 CDN 載，需連網）：Vue 3、ExcelJS 4.4、fflate 0.8.2、html2canvas 1.4.1。

---

## Python 引擎（engine/）說明

- 網頁端的 Pyodide / 模擬引擎**已下架**（v4.9-b），所以**網頁 App 完全不載 Python**。
- `engine/` 這套是給**外部下游模擬工具**讀 A.xlsx 匯出、跑模擬用的。
- **`engine/core/` 是可直接 import 的套件**：在 `engine/` 目錄下 `from core.schemas import ...`、`from core.a_loader import ...` 皆可運作（套件內部混用 `from core.X` 絕對與 `from .X` 相對，以 `core.` 為根 import 時都能解析）。
- `engine/` 根的扁平 10 模組是 core/ 的**同步鏡像來源**（依交接慣例「兩處同步」）。若你的外部工具用扁平佈局，把 `core/*.py` 覆蓋到對應位置即可；用 `core.` 套件則開箱即用。
- 跑測試：`engine/tests/` 內先 `npm install`（裝 exceljs 等），JS 測試 `node r1_roundtrip_test.js` 等；Python 測試需能 import `core`（從 `engine/` 執行、或設好 PYTHONPATH）。`dsl_golden_py.py` 另需一個 `sp` 套件別名與 `dsl_golden_cases.json` 的相對路徑（開發期 harness，非 App 執行所需）。

---

## 目前狀態

**工具是完整、可用的**——所有頁面（盤面 / 圖示 / 押注 / 規則 / 中獎線 / 產牌 / 權重 / 輸出 DocGen / 設定檔比對 / 結果比較 / txt→xlsx）都已達到或超前規格，沒有半成品。

本次打包內含的最新調整見同批附上的 Instructions 文件（版本紀錄）。本 session 幾批 UI（圖示分模式外觀、輸出頁三卡、盤面 v2、進場/滾動、機制篩選）都通過自動閘門（node --check、div/template 平衡、headless 測試、docgen 輸出零 diff、VBA blob md5 不變、r1/r1b/layerC/dsl golden 全綠），惟尚未在你的實機上目視驗收，請於瀏覽器實際點過一遍。
