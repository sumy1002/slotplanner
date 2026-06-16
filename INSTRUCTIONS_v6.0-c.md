# SlotPlanner Pro — Web 版 Project Instructions（v6.0-c，完整版）

## 專案簡介
PyQt6 桌面版「SlotPlanner Pro 工具箱」的網頁版重寫。
純前端，零 build step。**必須用 HTTP server 執行**（不能雙擊 app.html）。
```
cd slotplanner
python -m http.server 8000
```
開啟 http://localhost:8000/app.html

**為什麼必須 HTTP server：**
- v3.5 起 Python 原始碼改為 `py/` 資料夾，py/ 僅供外部模擬器使用，網頁端已不 fetch。
- 部分 CDN 資源（ExcelJS / html2canvas）需要 http 協定。

**正式部署**：GitHub Pages（public repo → Settings → Pages → main / root）。

---

## 資料夾結構（v5.2）

> **v6.0-c = Bonus 小遊戲 17_Bonus_Games（契約加法，無新檔，改 8 檔）**。
> 三型 WHEEL 輪盤 / PICK 選獎 / COLLECTION 收集;統一 items 陣列 + 連結 13_Jackpots;
> 新 bonus_games 分頁;新 LS key bonusgames.v1;docgen 帶入;
> py schemas/a_loader 同步（向後相容舊檔）。路線圖全部結清。
>
> **v6.0-b = 真實輪帶 04b_Reel_Strips（契約加法，無新檔，改 8 檔）**。
> 實體輪帶序列（取代/並存虛擬權重）;啟用時引擎視窗抽樣 → 自然 stacking;
> 權重↔輪帶雙向轉換器;新 reel_strips 分頁;新 LS key reelstrips.v1;
> py schemas/a_loader/reel_generator 同步（向後相容舊檔）。
>
> **v6.0-a = bcompare 設定檔目標對照（純前端，零契約變動，改 2 檔）**。
> A/B 比較表新增「目標」欄:讀 LS 全域 return_pct + Buy Feature 各模式 rtp_target,
> 自動標達標（綠）/ 偏低（紅）/ 偏高（橘）;容差可調;⟳ 重讀按鈕。
>
> **v5.6 = docgen 強化（純呈現層，零契約變動，改 1 檔）**。
> 動態賠付表（依實際 pay_rows 連線數建欄，不再寫死 5/4/3）;新增「數值機制」
> sheet 與 Markdown 章節，帶入投注結構 / 倍數系統 / 金幣面額;collectConfig 擴充。
>
> **v5.5 = 即時 RTP 計算器（純前端，零契約變動，改 3 檔）**。
> LINE 玩法閉式 RTP 計算（權重×賠付，含 wild 替代）;topbar 常駐徽章 +
> 04_Reel_Weights 面板（目標對比 / 各線貢獻 / 未計入機制提醒）;改權重即時重算。
> 經 200 萬 spins Monte Carlo 交叉驗證（差 < 0.05pp）。順手修 migratePayRows 解構遺漏。
>
> **v5.4 = 倍數系統 + 金幣面額（契約加法，無新檔，改 7 檔）**。
> 倍數系統 15_Multipliers（Wild/Progress/Random 三段，各自開關 + 權重表 + 期望值）；
> 金幣面額 16_Coin_Values（Hold&Win;分模式權重 + 連結 13_Jackpots 固定獎）；
> 新增 multipliers / coin_values 兩分頁；新 LS key multipliers.v1 / coinvalues.v1；
> py schemas/a_loader 同步（含 cross-validate；向後相容舊檔）。
>
> **v5.3 = 賠付表彈性 + 投注結構（契約加法，無新檔，改 8 檔）**。
> 動態賠付表 03c_Paytable（每符號 pay_rows，支援 2–20 連，舊 pay_Nx 自動遷移）；
> 投注結構 14_Bet_Config（Ante Bet + Buy Feature）；新增 bet_config 分頁；
> 新 LS key betconfig.v1；py schemas/a_loader 同步（向後相容舊檔）。
>
> **v5.2 = JP 完整化 + 剩餘 UI 優化（無新檔，改 5 檔）**。
> JP schema 擴欄(kind/increment_pct/must_hit_by)；04 aux 列「⇆集」快捷；
> 搜尋目錄補 JP + starting_mode；驗證補 JP cross-check 與 02 副盤符號集引用；
> 範本 diff counts 補 jackpots；06 空中獎線自動進點選模式。
>
> **v5.1 = 契約加法（SubReel_Symbol_Set + 13_Jackpots）（無新檔，改 8 檔）**。
> 02_Layout 新增選用欄 `SubReel_Symbol_Set`；新增 `slotplanner.aconfig.jackpots.v1` LS key；
> 13_Jackpots 選用分頁（引擎忽略）；01_Global 新增 JP 定義區塊；
> docgen 自動帶入設定檔 JP；py 端 schemas/a_loader/reel_generator 同步支援。
>
> **v5.0 = UI 全面優化 + 矩陣重做 + 主題單源化（無新檔，改 10 檔）**。
> v5.0-a: 排版根因修補（CJK nowrap 批次 / 符號頁外觀壓縮 / 暗色補洞）。
> v5.0-b: 刪除 setup.js C12 重複主題實作；sidebar 按鈕成為唯一全站切換入口。
> v5.0-c: 矩陣互動重做（pointer 模型 / 拖曳框選 / 視覺序範圍 / computed 合計快取）；
>         熱力底色改 class bucket（cfg-heat-0..9）取代 inline style；效能優化。
> v5.0-d: 01 模式清單改 accordion；06 path/備註移到棋盤下方；07/09 拼圖列欄寬固定。
>
> **v4.9-c = UI 排版全面優化（無新檔，改 2 檔）**。
> **v4.9-b = 模擬引擎下架 + A/B 結果比較（新增 1 檔，改 6 檔）**。
> **v4.9-a = 內建示範範本（無新檔，改 4 檔）**。
> **v4.8 = 全面修復（無新檔，改 6 檔）**。
> v4.7/v4.6/v4.5/v4.4/v4.3 詳見各版變更詳述。

```
slotplanner/
├── app.html              主檔（HTML 殼、側邊欄、頁面路由、modal mount point）
├── README.md
├── .gitignore
├── .nojekyll
├── css/
│   ├── theme.css
│   ├── theme_additions.css        ★ v5.2 改（JP/aux/暗色 CSS）
│   │                              ★ v5.0 改（v5.0-a~d 批次：CJK/symbol/heat/accordion/
│   │                                payline-fields/puzzle-grid/JP/docgen/dark-patch）
│   │                              ★ v4.9-c 改（排版批次：token/sticky/footer）
│   │                              ★ v4.9-b 改（停用 sim-page @import；bcompare/builtin badge）
│   └── modules/
│       ├── scrollbar.css
│       ├── theme_v34.css
│       ├── glass-overrides.css
│       └── sim-page.css           （v4.9-b 起已無引用；可自 repo 移除）
├── js/
│   ├── registry.js
│   ├── parser.js
│   ├── xlsx.js
│   ├── symbol.js                  ★ v5.0-a 改（外觀/識別區壓縮：swatch-strip + sym-id-grid）
│   ├── filter-modal.js
│   ├── aconfig-xlsx.js            ★ v5.2 改（13_Jackpots 擴欄至 9 欄）
│   │                              ★ v5.1 改（SubReel_Symbol_Set 欄 / 13_Jackpots sheet /
│   │                                snapshot keys 補 jackpots）
│   │                              ★ v4.9-a 改（內建範本 builder / builtin-* API / 快照修復）
│   ├── docgen.js                  ★ v5.2 改（JACKPOT 表補類型/抽成/必開列）
│   │                              ★ v5.1 改（_jackpotRowsFromConfig / syncJpFromConfig）
│   ├── bcompare.js                （v4.9-b 新增；v5.x 未改）
│   ├── config-editor/
│   │   ├── helpers.js             ★ v5.2 改（makeJackpot 擴欄：kind/increment_pct/must_hit_by）
│   │   │                          ★ v5.1 改（LS_JACKPOTS_KEY / makeJackpot / loadJackpots /
│   │   │                            saveJackpots；makeReel 補 subreel_symbol_set）
│   │   │                          ★ v5.0-a 改（—）
│   │   ├── template.js            ★ v5.2 改（JP row：kind chips / 條件欄 / 動態標籤；
│   │   │                            04 aux 列加「⇆集」按鈕）
│   │   │                          ★ v5.1 改（02 副盤符號集下拉；01_Global JP 定義區塊）
│   │   │                          ★ v5.0-d 改（模式 accordion；payline-fields 移到棋盤下；
│   │   │                            拼圖列 flex-wrap）
│   │   │                          ★ v5.0-c 改（矩陣 td：pointer 事件 / heat class；
│   │   │                            矩陣 table：is-dragging class；移除 toggleMatrixCell）
│   │   │                          ★ v5.0-b 改（移除 cfg-theme-toggle）
│   │   │                          ★ v4.9-c 改（23 處 token 套用；sticky bar 兩列；移除 inline style）
│   │   ├── setup.js               ★ v5.2 改（auxFillFromSet；GLOBAL_FIELDS 補 starting_mode/JP；
│   │   │                            JP cross-check + 02 副盤符號集驗證；counts 補 jackpots；
│   │   │                            空中獎線 watch 自動開點選模式）
│   │   │                          ★ v5.1 改（jackpots reactive / CRUD / scheduleSave / watch /
│   │   │                            reset；匯出 modeExpanded / JP fns）
│   │   │                          ★ v5.0-d 改（modeExpandedKey / isModeExpanded /
│   │   │                            toggleModeExpanded；addMode 自動展開）
│   │   │                          ★ v5.0-c 改（onMatrixCellPointerDown /
│   │   │                            onMatrixCellPointerEnter / matrixDrag / _onMatrixPointerUp；
│   │   │                            _selectRange 視覺序；heat bucket fns；totals computed cache；
│   │   │                            applyMatrixSelOp undo 時序修正）
│   │   │                          ★ v5.0-b 改（刪除 C12 重複主題實作；onMounted 清理）
│   │   │                          ★ v4.9-a/b 改（filteredSortedTemplates / userTemplateCount）
│   │   └── index.js               （v5.x 未改）
│   └── app.js                     （v4.9-b 改；v5.x 未改）
└── py/                   Python 模擬引擎（僅供外部程式，網頁端已不載入）
    ├── schemas.py                 ★ v5.1 改（ReelLayout 補 subreel_symbol_set 欄位）
    ├── a_loader.py                ★ v5.1 改（SubReel_Symbol_Set 容錯解析 + 交叉驗證）
    ├── reel_generator.py          ★ v5.1 改（_fill_subreel 優先序更新；_subreel_set_pool lazy 快取）
    ├── grid_engine.py
    ├── pay_resolver.py
    ├── combo_engine.py
    ├── condition_parser.py
    ├── logic_parser.py
    ├── b_writer.py
    ├── collector.py
    └── ...
```

---

## script 載入順序（app.html，不可更動）

```html
<!-- CDN -->
<script defer src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js"></script>
<script defer src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>

<!-- 本地 -->
<script defer src="js/registry.js"></script>
<script defer src="js/parser.js"></script>
<script defer src="js/xlsx.js"></script>
<script defer src="js/symbol.js"></script>
<!-- filter-modal 必須在 app.js 之前 -->
<script defer src="js/filter-modal.js"></script>
<!-- aconfig-xlsx 必須在 config-editor 之前 -->
<script defer src="js/aconfig-xlsx.js"></script>
<!-- config-editor 拆 4 檔，順序不可更動 -->
<script defer src="js/config-editor/helpers.js"></script>
<script defer src="js/config-editor/template.js"></script>
<script defer src="js/config-editor/setup.js"></script>
<script defer src="js/config-editor/index.js"></script>
<!-- docgen 必須在 app.js 之前 -->
<script defer src="js/docgen.js"></script>
<!-- bcompare 必須在 app.js 之前（app.js 要註冊 b-compare-page）-->
<script defer src="js/bcompare.js"></script>
<script defer src="js/app.js"></script>
```

### CSS 引入（app.html 只兩條 link）
```html
<link rel="stylesheet" href="css/theme.css">
<link rel="stylesheet" href="css/theme_additions.css">
```

`theme_additions.css` 頂端 **3 條有效 @import**（v4.9-b 停用 sim-page）：
```css
@import url('modules/scrollbar.css');
@import url('modules/theme_v34.css');
@import url('modules/glass-overrides.css');
/* v4.9-b: sim-page.css 已停用（模擬引擎下架） */
```

---

## 側邊欄路由（app.html）

```
page 0 → 數據文件相關（含子分頁容器）
  └─ 'txt2xlsx'  → TXT → XLSX 轉換
  └─ 'bcompare'  → A/B 結果比較（v4.9-b，接手原 page 6 的比較功能）
  └─ 'more'      → 更多功能（占位）
page 1 → Symbol 管理（symbol-page）
page 3 → A 設定檔編輯器（config-page）
page 4 → 批次處理（開發中）
page 5 → 資料比對（開發中）
```

> `goPage(2)` 自動遷移到 `goPage(3)`。
> `goPage(6)` 自動遷移到 page 0 / bcompare（v4.9-b）。

---

## app.js Component 註冊

```js
app.component('symbol-page',    SP.SymbolPage);
app.component('config-page',    SP.ConfigPage);
app.component('b-compare-page', SP.BComparePage);   // v4.9-b
app.component('doc-gen-page',   SP.DocGenPage);
app.mount('#app');
```

---

## 開發規則（嚴格遵守）

（規則 1–23 與 v4.8 完全相同，略）

24. **盤面副盤雙軌規則**（v4.7）：同 v4.8。
25. **panel 連線參與規則**（v4.7）：同 v4.8。
26. **副盤權重 LS 結構守則**（v4.8）：同 v4.8。
27. **a_loader 欄名容錯守則**（v4.8）：同 v4.8。
28. **setup return 底線前綴守則**（v4.8）：同 v4.8。
29. **內建範本保留字守則**（v4.9-a）：`aconfig-xlsx.js` 的 `builtin-` 開頭為
    內建範本保留字 slug；`saveTemplate` / `importTemplateJSON` 已擋下撞名。
    `Templates.list()` 回傳「內建置頂 + LS 使用者範本」；
    `Templates.getData(slug)` 同時支援內建與 LS 範本（diff/預覽共用）。
    `userTemplateCount`（setup return）只算使用者範本，不含內建。
30. **模擬參數 UI 下架守則**（v4.9-b）：`simulation_count`/`random_seed`/
    `output_prefix`/`max_chain_depth`/`max_chain_per_rule`/`big_win_thresholds`/
    `dead_spin_buckets` 已自 01_Global UI 移除，但 `DEFAULT_GLOBAL` 與
    `aconfig-xlsx.js` 匯出契約一字不動（外部模擬器仍能讀到正確值）。
    新增任何 UI 時不得重新暴露上述欄位，如需修改預設值請直接改 `DEFAULT_GLOBAL`。
31. **數據文件相關子分頁擴充規則**（v4.2 起，v4.9-b 更新）：
    新工具加入 `dataTabs`（`app.js`）+ `app.html` 加 `v-else-if` panel
    + `app.js` 元件註冊。B 結果比較工具（`bcompare.js`）是此模式的範例。
32. **B 結果解析契約守則**（v4.9-b）：`SP.BCompare.parseBFile(file)` 解析
    外部模擬器產出的 XLSX，格式契約對齊 `py/iolayer/b_writer.py`（01–04 sheet）。
    若 b_writer.py 新增 sheet 或欄位，需同步更新 `bcompare.js` 的解析器與
    `CORE_METRICS` 清單。
33. **input 寬度 token 守則**（v4.9-c）：`template.js` 的所有輸入框寬度透過
    CSS token class 控制，不得使用 inline `style="width/max-width"` 覆蓋。
    三個保留 token（全站適用，不限 config-editor）：
    - `.input-w-num`（max-width 110px）：2–4 位數字，如 y_offset / max_rows /
      priority / threshold / spin_count / jp.mult / jp.increment_pct。
    - `.input-w-id`（max-width 200px）：短 ID / 模式名，如 C001 / P001 /
      panel_id / NG / jp_id。
    - `.input-w-name`（max-width 340px）：名稱 / 短備註。
    全站護欄：`.cfg-form input[type=number].input { max-width:140px }`，
    token 在護欄之後宣告且選擇器權重 ≥ 護欄，可正確覆寫。
    矩陣 cell（`.cfg-matrix-cell`，不帶 `.input`）與 `cfg-mqb-value`（固定 74px）
    不受護欄影響，不需加 token。
    Symbol 頁、docgen、bcompare 的輸入框同樣適用此三個 token。
34. **sticky bar 兩列規則**（v4.9-c）：04_Reel_Weights 與 05_Grid_Size_Weights
    的 `cfg-sticky-mode-bar` 加 `cfg-smb-stacked`，內部拆兩個 div：
    `cfg-smb-row cfg-smb-row-modes`（模式 chips + Max）、
    `cfg-smb-row cfg-smb-row-tools`（顯示切換 + 跨模式檢視 + undo/redo + 模式操作）。
    工具列的 `cfg-matrix-menu-host` 加 `margin-left:auto` 靠右。
    08_Combo_Weights（`cfg-sticky-mode-bar-combo`）為直排設計，不需改此規則。
    新增矩陣類分頁時照此規則建 bar。
35. **主題單源守則**（v5.0-b）：亮暗切換唯一入口 = `app.js` 的 `cycleTheme()`
    + sidebar 按鈕。setup.js / 任何子元件不得自行持有 `themeMode` ref 或
    呼叫 `document.documentElement.dataset.theme`。C12 重複實作已刪除，
    不得重建。
36. **矩陣 cell 互動守則**（v5.0-c）：矩陣 cell 一律使用
    `@pointerdown="onMatrixCellPointerDown(...)"` +
    `@pointerenter="onMatrixCellPointerEnter(...)"` 綁定，
    **不得再掛 `@click` / `@click.stop` 進行選取**。
    範圍選取（`_selectRange`）以 `sortedReels` 的**視覺列序**計算，
    不得用 reel_id 數值區間。
    拖曳框選期間整表 `.is-dragging` class 讓 input pointer-events:none。
37. **熱力底色守則**（v5.0-c）：矩陣格子底色一律使用
    CSS class `cfg-heat-zero` / `cfg-heat-1`…`cfg-heat-9`（9 級 bucket）。
    不得在 td 上掛 `:style="{ backgroundColor: … }"` 的 inline 熱力色。
    計算函式：`reelHeatClass(mode, w)` / `gridHeatClass(mode, w)` /
    `comboHeatClass(mode, step, w)`；`_heatBucket(w, mx)` 為底層。
    暗色模式覆寫在 `theme_additions.css` 的 `[data-theme="dark"] .cfg-heat-N`。
38. **模式卡 accordion 守則**（v5.0-d）：01_Global 的模式清單使用
    `modeExpandedKey` ref 控制開/收；`isModeExpanded(m)` / `toggleModeExpanded(m)`
    為唯一開關入口。同一時間最多一張展開。新增模式（`addMode`）
    自動展開最後一張。移除或重設模式清單時不需手動清 key（自動 miss）。
39. **副盤符號集守則**（v5.1）：附掛副盤（`SubReel_Kind` 四型）的符號集
    由 02_Layout 的 `SubReel_Symbol_Set` 欄指定（選用，舊檔無此欄→空字串）。
    引擎優先序：04 副盤專屬權重 → `SubReel_Symbol_Set` 等權池 → `subreel_inherit_weight` 沿用主輪。
    UI 驗證：符號集名稱引用不存在或為空 → error（對齊 py `a_loader` 的 ConfigValidationError）。
    04 aux 列操作按鈕「⇆集」可依 02 指定的符號集自動帶入（成員 100 / 其餘 0）。
40. **JP 定義守則**（v5.1–v5.2）：JP 資料存於 `slotplanner.aconfig.jackpots.v1`，
    型別 `Array<JackpotDef>`。
    `JackpotDef` 欄位：`jp_id`（string）、`name`、`kind`（`'FIXED'`|`'PROGRESSIVE'`）、
    `mult`（×注額；PROGRESSIVE 為起始彩池 seed）、`increment_pct`（0–100）、
    `must_hit_by`（×注額；0=無）、`trigger_desc`、`mode_scope`（`'ALL'` 或逗號分隔模式名）、`notes`。
    UI 在 01_Global「區塊 4：JP 定義」；重設 01_Global 時一併清空。
    匯出至 A.xlsx 13_Jackpots（9 欄，引擎忽略此分頁）。
    docgen 優先自動帶入設定檔 JP，docmeta.jackpot.rows 為可覆寫副本。
    驗證：JP_ID 重複 → error；倍數/種子為 0 → warn；累積 JP 抽成 0 → warn；
    抽成 > 100 → error；必開上限 < 起始彩池 → error；
    mode_scope 引用不存在模式 → error。
    範本快照（`_snapshotAllLS` / `_restoreAllLS`）已涵蓋此 LS key。
41. **動態賠付表守則**（v5.3）：符號賠付存於 `pay_rows: Array<{count, pay}>`，
    取代固定 pay_3x–6x。`SP.migratePayRows(sym)` 為唯一遷移入口（舊 pay_Nx →
    pay_rows）；`writeForm` 寫回時以 pay_rows 為主、同步更新 pay_3x–6x 向後兼容。
    匯出 `03c_Paytable`（Symbol_ID / Count / Pay 三欄，每連線數一列）。
    py `a_loader._parse_paytable_03c` 以 03c 覆蓋 `pay_table` 字典（優先於 Pay_Nx）。
    新增賠付相關 UI 一律走 pay_rows，不得回退固定四格。
42. **投注結構守則**（v5.3）：投注設定存於 `slotplanner.aconfig.betconfig.v1`
    （物件，非陣列），結構見「BetConfig 型別定義」。
    UI 在獨立 `bet_config` 分頁（dirty label「投注結構」）。
    匯出 `14_Bet_Config`（KV 區 + Buy Feature 子表，引擎讀取）。
    py `schemas.BetConfig` / `BuyFeatureDef`；`SlotConfig.bet_config`（舊檔→預設）。
    `a_loader._parse_bet_config` 以 `header=None` 位置解析（前 5 列 KV、第 7 列起 BF）。
    範本快照已涵蓋此 key。新增投注參數請擴 `defaultBetConfig` / `makeBuyFeature`。
43. **倍數系統守則**（v5.4）：倍數存於 `slotplanner.aconfig.multipliers.v1`
    （物件），三段獨立:WILD（wild_mult_values 權重表 + wild_mult_fixed）、
    PROGRESS（progress_ladders 逐模式階梯，UI 以逗號字串 progressLadderStr 編輯、
    `commitProgressLadder` 寫回）、RANDOM（random_symbol_id + random_values 權重表）。
    UI 在 `multipliers` 分頁。匯出 `15_Multipliers`（Section/Key/Value/Weight/Notes 長表）。
    py `schemas.Multipliers` / `MultValue`；`a_loader._parse_multipliers`。
    新增倍數來源請擴 `defaultMultipliers` 並同步匯出/解析。
44. **金幣面額守則**（v5.4）：金幣面額存於 `slotplanner.aconfig.coinvalues.v1`
    （物件），結構見「CoinValues 型別定義」。每筆面額 `weight_by_mode` 分模式權重，
    `link_jackpot` 連結 13_Jackpots（連結後面額由 JP 倍數決定）。
    UI 在 `coin_values` 分頁。匯出 `16_Coin_Values`（KV 頭 + 面額表，各模式權重展開
    為 `W_<mode>` 欄）。py `schemas.CoinValues` / `CoinDenom`;
    `a_loader._parse_coin_values`（header=None 位置解析）+ cross-validate
    （金幣符號存在、link_jackpot 合法）。modeNames watch 會自動補新模式的 weight_by_mode。
45. **即時 RTP 計算器守則**（v5.5）：RTP 由 `rtpResult` computed 提供（純前端閉式，
    非模擬）。僅 LINE 玩法有效（pay_type !== LINE 回傳 ok:false + 說明）。
    演算法:每線每符號每長度「恰好 N 連」機率 × pay_table，除以線數得每注 RTP;
    wild 替代以「非 wild 符號命中含 wild 權重」處理。
    匯出:`rtpResult`（{ok, isLine, total, perLine, note, target, mode, lineCount}）、
    `rtpPct`、`rtpVsTarget`。UI:topbar `cfg-rtp-badge` + 04 面板 `cfg-rtp-panel`。
    **不計入** 倍數/金幣/JP/scatter/cascade/ways（面板會列出未納入清單）。
    新增會影響 base LINE RTP 的機制時，需同步更新此計算或在 note 補充未計入項。
46. **docgen 自動帶入守則**（v5.6）：文件產生器（`buildPlanXlsxBuffer` /
    `buildMechMarkdown`）的內容來源一律走 `collectConfig()`;新增 A.xlsx 分頁/
    LS 結構後，若要在文件呈現，需 (1) collectConfig 補讀該 LS、(2) 在 XLSX 與
    Markdown 兩處都加對應輸出。賠付表用 `_symPayRows(s)`（優先 pay_rows、
    回退 pay_Nx）取得動態連線數，不可再寫死 5/4/3 欄。數值機制 sheet/章節
    僅在有對應設定時才輸出（避免空白頁）。
47. **bcompare 目標對照守則**（v6.0-a）：目標來源一律走 `readConfigTargets()`
    （讀 global.return_pct + betconfig buy_features 的 rtp_target 覆寫 target_mode）;
    設定檔無目標 → 回 null、UI 隱藏對照欄。達標判定 `_hitStatus(value, target, tol)`
    回 'ok'|'low'|'high'。新增可對照的目標（如波動度、hit rate）時擴 readConfigTargets
    回傳物件 + 對應 computed row 的 target/aHit/bHit 欄。B 結果解析契約（規則 32）不受影響。
48. **真實輪帶守則**（v6.0-b）：輪帶存於 `slotplanner.aconfig.reelstrips.v1`
    （`{enabled, strips:{mode:{reelId:[sym,...]}}}`）。UI 在 reel_strips 分頁,
    編輯以逗號字串（stripStr 快取）呈現,`commitStrip` 寫回。雙向轉換：
    `weightsToStrip(weightMap, len, stacked)`（Hamilton 分配;stacked=聚段 / 否=round-robin 打散）、
    `stripToWeights(strip)`（計次）。匯出 04b_Reel_Strips（Mode_Scope/Reel_ID/Enabled/Strip_Sequence）。
    引擎（reel_generator）：啟用且該 (mode,reel) 有輪帶 → 視窗抽樣
    `strip[(stop+row)%len]`（自然 stacking）;否則回退權重池。
    驗證:長度 < 顯示列數 → error、含未知符號 → error。
    **stacked symbol 由此達成**,不需另設機制。
49. **Bonus 小遊戲守則**（v6.0-c）：存於 `slotplanner.aconfig.bonusgames.v1`
    （`{games:[BonusGame]}`）。三型 WHEEL/PICK/COLLECTION,統一 `items` 陣列
    （label/value/weight/is_end/link_jackpot）+ 型別專屬純量
    （wheel_upgrade_to / pick_count / collect_target）。UI 在 bonus_games 分頁。
    匯出 17_Bonus_Games（每 game 首列帶欄位 + items 列,a_loader carry-forward 還原）。
    py `schemas.BonusGame`/`BonusItem`;`a_loader._parse_bonus_games`。
    docgen Markdown 帶入。驗證:ID 重複/模式不存在/權重 0/PICK 無結束項/
    COLLECTION 無目標/WHEEL 升級目標不存在/項目連結 JP 不存在。
    新增 Bonus 型別請擴 `makeBonusGame` 的 type + UI 型別專屬欄位 + a_loader 解析。

---

## ⚠️ 對既有說明書的勘誤

（1–12 同 v4.8；13–17 同 v4.9-c；以下為新增）

18. **主題切換雙入口已解除**（v5.0-b）：setup.js 的 C12 重複實作（themeMode /
    cycleThemeMode / _setupThemeWatcher）與 template.js 的 `cfg-theme-toggle`
    浮動按鈕已全部刪除。切換主題只能透過 sidebar 按鈕（app 層）。

19. **矩陣 cell 選取互動全面改寫**（v5.0-c）：舊的 `toggleMatrixCell` 已刪除，
    所有 matrix td 改用 `onMatrixCellPointerDown` / `onMatrixCellPointerEnter`。
    點 cell（含 input）= 選取並直接編輯；按住拖曳 = 框選；Shift = 範圍；
    Ctrl/⌘ = 多選 toggle。拖曳框選期間 input pointer-events:none，
    整表禁止文字選取（`.is-dragging`）。

20. **熱力底色 inline style 已清除**（v5.0-c）：04/05/08 的跨模式檢視表、
    aux 表（sub_weights / panel_weights）全部改用 `cfg-heat-N` class。
    `theme_v34.css` 的 `[style*="rgba(140"]` hack 可在下版清除。

21. **符號頁外觀/識別改版**（v5.0-a）：`.sym-edit-row` + `.swatch-grid` +
    `.sym-id-fields` 已廢棄；改用 `.sym-appearance-row` + `.swatch-strip`
    + `.sym-id-grid`。新增符號相關 UI 請用新 class。

22. **06 中獎線 topbar 欄位已移動**（v5.0-d）：path 與備註輸入框
    從 `cfg-paylines-v2-topbar-fields` 移到棋盤下方的
    `cfg-paylines-v2-fields-under`，topbar 改兩欄（meta / actions）。
    新增 payline 相關 UI 時請把欄位掛在 `cfg-paylines-v2-fields-under`，
    而非 topbar。

23. **07_Constraints footer**（v4.9-c，勘誤保留）：「套用模式 + 備註」改為
    `cfg-constraints-v2-footer`（flex-column），不再是兩欄 grid。

24. **範本 diff counts**（v5.2）：`_computeCurrentCounts()` 已補 `jackpots`
    欄位（讀 `slotplanner.aconfig.jackpots.v1`）。存/載範本的 diff 預覽
    會顯示 JP 數量變化。

25. **06 空中獎線行為**（v5.2）：切換 `selectedPaylineIdx` 到一條 path
    為空的中獎線時，`paylineClickMode` 自動設為 true。新增工具不應
    覆蓋此 watcher。
26. **賠付表 UI 改版**（v5.3）：符號頁 `.sym-pay-grid`（固定四格）已廢棄，
    改用 `.sym-pay-dynamic` + `.sym-pay-drow`（可加/刪列）。form 新增
    `pay_rows` 欄位；pay_3x–6x 保留僅為向下兼容（由 pay_rows 同步產生）。
27. **docgen 賠付表限制**（v5.3，已知）：文件生成的「圖示賠付明細」仍為
    固定 5/4/3 連三欄（取 pay_Nx 同步值），不會顯示 2 連 / 7+ 連。
    完整動態賠付表渲染列為 v5.5 docgen 強化項。

---

## v5.x 變更詳述

### v5.2：JP 完整化 + 剩餘 UI 優化

**改動範圍**：`helpers.js`（makeJackpot 擴欄）、`setup.js`（auxFillFromSet /
搜尋 / 驗證 / counts / payline watcher）、`template.js`（JP row 重構 / aux 按鈕）、
`aconfig-xlsx.js`（13_Jackpots 擴 9 欄）、`docgen.js`（JACKPOT 表補列）。

**JP 完整化（博弈企劃版）**：
- Schema 擴欄：`kind`（FIXED / PROGRESSIVE）、`increment_pct`（抽成 %）、
  `must_hit_by`（必開上限 ×注額）。`mult` 在 PROGRESSIVE 語義為起始彩池 seed。
- UI：JP 列加「固定/累積」chips；選累積才顯示抽成 % 與必開上限；
  倍數標籤隨類型切換。
- A.xlsx 13_Jackpots 欄位：`JP_ID / Name / Kind / Multiplier / Increment_Pct /
  Must_Hit_By / Trigger_Desc / Mode_Scope / Notes`（共 9 欄）。
- docgen：JACKPOT 表自動補「類型」列；存在累積 JP 時再補「抽成 %/注」
  「必開上限」列（XLSX 與 Markdown 同步）。
- 驗證（01_Global）：完整 JP cross-check（見規則 40）。

**其餘優化**：
- 04 aux 列「⇆集」快捷：依 02 指定的副盤符號集帶入（成員 100 / 其餘 0），
  含 undo，未指定時給出提示。
- 02 副盤符號集驗證：網頁端先攔，對齊 py `a_loader`。
- Ctrl+K 搜尋目錄：GLOBAL_FIELDS 補 `starting_mode` + `jackpots`；
  每個 JP 個別入索引（💰 圖示，顯示類型與倍數）。
- 範本 diff counts 補 jackpots。
- 06 空中獎線自動進點選模式。

**驗證**：Vue 編譯器模板 0 error；ConfigPage mount 10/10；拖曳框選 ✓；
E2E XLSX 16 sheets（13_Jackpots 9 欄含 Kind=FIXED）通過。

---

### v5.1：契約加法（SubReel_Symbol_Set + 13_Jackpots）

**SubReel_Symbol_Set（02_Layout 選用欄）**：
- 網頁端：`makeReel` 補 `subreel_symbol_set: ''`；02_Layout 副盤區
  新增「副盤符號集」下拉（從 03b 符號集選）；
  拖曳互換 attrs 已涵蓋（`subreel_symbol_set` 加入 swap 清單）；
  匯出附在 02_Layout 每列尾欄。
- 引擎端：`schemas.ReelLayout` 補欄；`a_loader` 容錯解析（缺欄→空）+
  交叉驗證（引用名稱必須存在於 03b_Symbol_Sets）；
  `reel_generator._fill_subreel` 優先序更新：
  **04 副盤專屬池 → `_subreel_set_pool`（lazy 快取）→ 沿用主輪**。
  舊檔（無此欄）行為不變，已驗證。

**13_Jackpots（新選用分頁，引擎忽略）**：
- 新 LS key：`slotplanner.aconfig.jackpots.v1`。
- UI：01_Global 新增「區塊 4：JP 定義」。
- 快照：`_snapshotAllLS` / `_restoreAllLS` 補納 `jackpots` key。
- 匯出：A.xlsx 新增 13_Jackpots（無 JP 仍寫表頭）；README 分頁列表同步。
- docgen：JACKPOT 表優先自動帶入設定檔 JP；
  「⇆ 從設定檔帶入」按鈕可手動重新同步。

---

### v5.0：UI 全面優化 + 矩陣重做 + 主題單源化

#### v5.0-a：排版根因修補（CSS + symbol.js）
- CJK 防直排批次：`.cfg-chip` / 各按鈕 / 各標籤 `white-space:nowrap`；
  標籤 `word-break:keep-all`（一次解掉 01/06/07 等多頁直排文字問題）。
- 符號頁「外觀/識別」壓縮：色票改 `swatch-strip`（單條）、
  編號/名稱/Symbol_ID 改三欄 `sym-id-grid` 並排靠左（見勘誤 21）。
- `.cfg-mode-grid3 { align-items:start }` 修按鈕錯位。
- 暗色補洞：`.sym-*` / `.docgen-*` / `.bcmp-*` 主要容器補 `[data-theme=dark]`。

#### v5.0-b：主題單源化
- 刪除 setup.js C12 重複實作（~60 行）與 template.js 的 `cfg-theme-toggle`。
- 亮暗切換唯一入口 = `app.js` sidebar 按鈕（見規則 35）。

#### v5.0-c：矩陣互動重做 + 效能
- **互動模型**（spreadsheet 式）：見規則 36。
  - 死區消失（點 td 任何位置 = 選取並編輯）
  - 按住拖曳跨格 = 框選（`matrixDrag` reactive state）
  - 範圍以視覺列序計算（修排序後 Shift 選錯格）
- **熱力底色**改 class bucket（見規則 37）；暗色直接覆寫。
- **效能**：`_reelActiveTotals` / `_gridActiveTotals` computed 快取；
  `cellPercent` / `reelTotalForRow` / `gridTotalForRow` 等活躍模式 O(1) 查表；
  矩陣 cell `transition` 只在 hover 觸發。
- 修 bug：`applyMatrixSelOp` 空選取不再塞 undo。

#### v5.0-d：結構改版
- **01 模式清單 accordion**（見規則 38）：預設收合，新增自動展開。
- **06 中獎線**：path/備註移到棋盤下方（見勘誤 22）。
- **07/09 拼圖列**：`flex-wrap` + 合理 `min-width`（var 150 / op 92 / value ≥110）。

---

## A.xlsx Sheet 清單（v5.2）

| Sheet | 內容 |
|---|---|
| `00_README` | 說明（含 13_Jackpots 列目） |
| `01_Global` | 全域 + 模式定義（含模擬執行參數欄位，UI 已隱藏但匯出保留） |
| `02_Layout` | 主輪盤面結構（含 `SubReel_Kind` / **`SubReel_Symbol_Set`** ← v5.1 新增） |
| `02b_Panels` | 自由副盤定義 |
| `03_Symbols` | 符號定義 |
| `03b_Symbol_Sets` | 符號集 |
| **`03c_Paytable`** | **動態賠付表（v5.3；Symbol_ID/Count/Pay；優先於 Pay_Nx）** |
| `04_Reel_Weights` | Reel 權重（三段定址） |
| **`04b_Reel_Strips`** | **真實輪帶（v6.0-b;實體序列;啟用時引擎視窗抽樣;選用）** |
| `05_Grid_Size_Weights` | Megaways 格數權重 |
| `06_Paylines` | 中獎線 |
| `07_Constraints` | 硬約束 |
| `08_Combo_Weights` | 連爆權重（round-trip，無 UI） |
| `09_Puzzle_Rules` | 腳本規則 |
| `10_Discard_Rules` | 棄牌規則 |
| `11_Mode_Config` | 模式設定 |
| `12_Distribution_Bins` | 分佈區間 |
| **`13_Jackpots`** | **JP 定義（v5.1 新增；選用分頁；引擎忽略；供文件/前端使用）** |
| **`14_Bet_Config`** | **投注結構（v5.3 新增；Ante Bet + Buy Feature；引擎讀取）** |
| **`15_Multipliers`** | **倍數系統（v5.4 新增；Wild/Progress/Random；引擎讀取）** |
| **`16_Coin_Values`** | **金幣面額（v5.4 新增；Hold&Win；引擎讀取）** |
| **`17_Bonus_Games`** | **Bonus 小遊戲（v6.0-c;輪盤/選獎/收集;引擎讀取）** |

### 13_Jackpots 欄位（v5.2，9 欄）
`JP_ID | Name | Kind | Multiplier | Increment_Pct | Must_Hit_By | Trigger_Desc | Mode_Scope | Notes`

- `Kind`：`FIXED`（固定倍數）或 `PROGRESSIVE`（累積彩池）
- `Multiplier`：FIXED = 倍數；PROGRESSIVE = 起始彩池 seed（均為 ×注額）
- `Increment_Pct`：PROGRESSIVE 專用，每注注金抽成 %
- `Must_Hit_By`：PROGRESSIVE 專用，必開上限（×注額；0=無上限）

---

## localStorage 完整清單（v5.2）

| Key | 說明 |
|-----|------|
| `slotplanner.registry.v1` | SymbolRegistry |
| `slotplanner.aconfig.global.v1` | 01_Global |
| `slotplanner.aconfig.modes.v1` | 模式定義 |
| `slotplanner.aconfig.layout.v1` | 02_Layout（含 subreel_symbol_set）|
| `slotplanner.aconfig.panels.v1` | 02b_Panels（v4.7） |
| `slotplanner.aconfig.symbolsets.v1` | 03b_Symbol_Sets（v4.7） |
| `slotplanner.aconfig.layoutMech.v1` | 機制旗標（純 UX） |
| `slotplanner.aconfig.bins.v1` | 12_Distribution_Bins |
| `slotplanner.aconfig.paylines.v1` | 06_Paylines |
| `slotplanner.aconfig.constraints.v1` | 07_Constraints |
| `slotplanner.aconfig.reelweights.v1` | 04_Reel_Weights（含 sub_weights/panel_weights） |
| **`slotplanner.aconfig.reelstrips.v1`** | **真實輪帶（v6.0-b;`{enabled, strips}`）** |
| **`slotplanner.aconfig.bonusgames.v1`** | **Bonus 小遊戲（v6.0-c;`{games:[BonusGame]}`）** |
| `slotplanner.aconfig.gridweights.v1` | 05_Grid_Size_Weights |
| `slotplanner.aconfig.comboweights.v1` | 08_Combo_Weights |
| `slotplanner.aconfig.discards.v1` | 10_Discard_Rules |
| `slotplanner.aconfig.rules.v1` | 09_Puzzle_Rules |
| **`slotplanner.aconfig.jackpots.v1`** | **JP 定義（v5.1 新增；Array\<JackpotDef\>）** |
| **`slotplanner.aconfig.betconfig.v1`** | **投注結構（v5.3 新增；BetConfig 物件）** |
| **`slotplanner.aconfig.multipliers.v1`** | **倍數系統（v5.4 新增；Multipliers 物件）** |
| **`slotplanner.aconfig.coinvalues.v1`** | **金幣面額（v5.4 新增；CoinValues 物件）** |
| `slotplanner.docmeta.v1` | 文件生成手填敘述 |
| `slotplanner.filterSettings.v1` | TXT→XLSX 篩選設定 |
| `slotplanner.templates.list.v1` / `slotplanner.template.<slug>.v1` | 範本索引 / 內容 |
| `slotplanner.uiTheme.v1` | 暗色模式偏好 |
| `slotplanner.changes.baseline.v1` | 變更回顧 baseline 快照 |

> 範本快照（`_snapshotAllLS` / `_restoreAllLS`）涵蓋以上所有 `aconfig.*` 及 `registry` key，
> 包含 v5.1 新增的 `jackpots.v1`。

---

## JackpotDef 型別定義（v5.2）

```typescript
interface JackpotDef {
  jp_id:         string;  // 短識別，如 "JP1"（建議全大寫英數）
  name:          string;  // 顯示名，如 "GRAND" / "MAJOR"
  kind:          'FIXED' | 'PROGRESSIVE';  // 預設 'FIXED'
  mult:          number;  // FIXED: ×注額倍數；PROGRESSIVE: 起始彩池 seed(×注額)
  increment_pct: number;  // PROGRESSIVE 專用：注金抽成 %（0–100）
  must_hit_by:   number;  // PROGRESSIVE 專用：必開上限(×注額)；0=無
  trigger_desc:  string;  // 觸發說明（自由文字，供文件生成使用）
  mode_scope:    string;  // 'ALL' 或逗號分隔的模式名，如 'NG,FG'
  notes:         string;  // 備註
}
```

`makeJackpot(jp_id)` 回傳以上結構，所有欄位帶安全預設值。
舊版資料（無 `kind` 欄）透過 `{ ...makeJackpot(''), ...rawData }` 自動補 `'FIXED'`。

---

## BetConfig / BuyFeatureDef 型別定義（v5.3）

```typescript
interface BuyFeatureDef {
  bf_id:        string;   // 短識別，如 "BF_FG"
  target_mode:  string;   // 購買後進入的模式名
  cost_mult:    number;   // 成本（×注額），如 80 / 100
  rtp_target:   number;   // 此功能獨立 RTP 目標 %
  enabled:      boolean;
  notes:        string;
}

interface BetConfig {
  ante_bet_enabled:      boolean;  // 是否啟用 Ante Bet
  ante_bet_mult:         number;   // 成本倍數（×注額），預設 1.25
  ante_bet_trigger_mult: number;   // 觸發機率乘數，預設 2.0
  ante_bet_desc:         string;   // 企劃說明（供文件生成）
  buy_features:          BuyFeatureDef[];
}
```

`defaultBetConfig()` / `makeBuyFeature(mode)` 回傳帶安全預設的結構。
LS 為單一物件（非陣列）；`loadBetConfig` 對 buy_features 逐筆套 `makeBuyFeature` 補欄。

---

## Multipliers 型別定義（v5.4）

```typescript
interface MultValue { mult: number; weight: number; }  // 權重表單列
interface Multipliers {
  // WILD
  wild_mult_enabled:      boolean;
  wild_mult_fixed:        number;       // 權重表為空時的固定倍數
  wild_mult_values:       MultValue[];  // 隨機 Wild 倍數權重表
  // PROGRESS（cascade/連爆階梯）
  progress_enabled:       boolean;
  progress_reset_on_mode: boolean;      // 切模式是否重置（FG 累積=false）
  progress_ladders:       { [mode: string]: number[] };  // {NG:[1,2,3,5]}
  // RANDOM（隨機倍數符號）
  random_enabled:         boolean;
  random_symbol_id:       string;       // 承載符號 Symbol_ID
  random_values:          MultValue[];  // 倍數權重表
}
```
`parseLadder(str)`：將 "1,2,3,5" 解析成合法正數陣列。UI 以 `progressLadderStr`
（逐模式逗號字串）編輯，`commitProgressLadder(mode)` 寫回 progress_ladders。

---

## CoinValues 型別定義（v5.4，Hold&Win）

```typescript
interface CoinDenom {
  label:          string;   // 顯示名（固定獎填 GRAND 等;可空）
  value:          number;   // 面額（×注額）;link_jackpot 非空時由 JP 倍數覆蓋
  weight_by_mode: { [mode: string]: number };  // 各模式權重
  link_jackpot:   string;   // 對應 13_Jackpots 的 jp_id（空=純面額）
}
interface CoinValues {
  enabled:        boolean;
  coin_symbol_id: string;        // 金幣符號 Symbol_ID
  denominations:  CoinDenom[];
}
```
`makeCoinDenom(label, value)` / `defaultCoinValues()` 回傳帶安全預設的結構。
新增模式時，modeNames watch 會替每筆面額補 `weight_by_mode[newMode] = 0`。

---

## SymbolDef 賠付欄位（v5.3）

```typescript
interface PayRow { count: number; pay: number; }   // count: 連線數/出現數
// 符號的賠付以 pay_rows 為主；pay_3x–6x 為向下兼容欄位（由 pay_rows 同步產生）
interface SymbolPayFields {
  pay_rows: PayRow[];      // v5.3 主要欄位，支援 2–20 連
  pay_3x: number; pay_4x: number; pay_5x: number; pay_6x: number;  // 兼容
}
```

`SP.migratePayRows(sym)`：有 pay_rows 直接回傳；否則從 pay_2x–9x 遷移；
全空則回傳 `[{count:3,pay:0},{count:4,pay:0},{count:5,pay:0}]`。

---

## 待實作 / 路線圖

以下為公版工具的已知缺口，依優先度排列：

### 高優先（v5.3–v5.5，需你拍板欄位設計後動工）

1. ~~**賠付表彈性（v5.3）**~~ ✅ 已完成（03c_Paytable，動態 pay_rows）。
2. ~~**投注結構（v5.3）**~~ ✅ 已完成（14_Bet_Config，Ante Bet + Buy Feature）。
3. **倍數系統結構化（v5.4）**：Wild 倍數、cascade 進度倍數、
   隨機倍數符號（2x–500x 權重表）。現在只能用 09 規則 DSL 湊，
   企劃改數字很難讀。建議 `15_Multipliers`。
4. **金幣面額系統（v5.4）**：Hold&Win 核心——COIN 符號面額表 +
   面額權重（分模式/分輪），與 13_Jackpots 串接。
   建議 `16_Coin_Values`。
5. **即時 RTP 計算器（v5.5）**：LINE 玩法可由 權重×賠付 閉式計算 base RTP；
   改一格權重 → 右上角數字立即跳動。純前端，不需外部模擬器。

### 中優先（v6.0）

6. **真實輪帶（v6.0）**：`04b_Reel_Strips` + 權重↔strip 雙向轉換；
   同時解決 stacked symbol 問題。
7. **Bonus 小遊戲框架（v6.0）**：輪盤/Pick/Collection/Trail；
   建議 `17_Bonus_Games`。
8. **bcompare 改進**：目標值疊加（自動標紅綠）、多份歷史結果清單。

### 低優先（後續版本）

9. 多市場 RTP profile（92/94/96% 多套切換）。
10. 設定檔版本歷史（時間軸式，超越現有 baseline diff）。
11. docgen 補賠付表全表 + 中獎線示意 SVG + 合規機率披露表。
12. Gamble 比倍（開關 + 上限 + 賠率）。

---

## 版本摘要

- **v6.0-c**（2026-06-13）：**Bonus 小遊戲 17_Bonus_Games（契約加法，無新檔，改 8 檔）**。
- **v6.0-b**（2026-06-13）：**真實輪帶 04b_Reel_Strips（契約加法，無新檔，改 8 檔）**。
- **v6.0-a**（2026-06-13）：**bcompare 設定檔目標對照（純前端，零契約變動，改 2 檔）**。
- **v5.6**（2026-06-13）：**docgen 強化（純呈現層，零契約變動，改 1 檔）**。
- **v5.5**（2026-06-13）：**即時 RTP 計算器（純前端，零契約變動，改 3 檔）**。
- **v5.4**（2026-06-13）：**倍數系統 + 金幣面額（契約加法，無新檔，改 7 檔）**。
- **v5.3**（2026-06-13）：**賠付表彈性 + 投注結構（契約加法，無新檔，改 8 檔）**。
- **v5.2**（2026-06-12）：**JP 完整化 + 剩餘 UI 優化（無新檔，改 5 檔）**。
- **v5.1**（2026-06-12）：**契約加法：SubReel_Symbol_Set + 13_Jackpots（無新檔，改 8 檔）**。
- **v5.0**（2026-06-12）：**UI 全面優化 + 矩陣重做 + 主題單源化（無新檔，改 10 檔）**。
- **v4.9-c**（2026-06-12）：UI 排版全面優化（無新檔，改 2 檔）。
- **v4.9-b**（2026-06-12）：模擬引擎下架 + A/B 結果比較（新增 1 檔，改 6 檔）。
- **v4.9-a**（2026-06-12）：內建示範範本（無新檔，改 4 檔）。
- **v4.8**（2026-06-12）：全面修復（無新檔，改 6 檔）。
- **v4.7**（2026-06-11）：自由副盤 Panel。
- **v4.6**（2026-06-11）：副輪四型。
- **v4.5**（2026-06-11）：UI 色調統一。
- **v4.4**（2026-06-10）：效能優化。
- **v4.3**（2026-06-09）：文件生成工具。

## docgen 文件輸出（v5.6）

**企劃文件（Excel，`buildPlanXlsxBuffer`）sheets**:
企劃總覽 / 圖示賠付明細（動態連線數欄）/ 模式明細 / 機制備註 /
**數值機制**（v5.6:投注結構 + 倍數系統 + 金幣面額;僅有設定時才出現）。

**機制文件（Markdown，`buildMechMarkdown`）章節**:
基本規格 / 模式與觸發 / 圖示定義 / 賠付表（動態欄）/ 連線計分 /
特殊圖示行為 / JACKPOT / FREE GAME / **投注結構 / 倍數系統 / 金幣面額**（v5.6）/
**Bonus 小遊戲**（v6.0-c）。

---

*最後更新：2026-06-13（v6.0-c）*
