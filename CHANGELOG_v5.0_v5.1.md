# SlotPlanner Pro — v5.0 / v5.1 變更詳述(2026-06-12)

**改動檔案(10 個,無新檔)**:
`js/symbol.js`、`js/aconfig-xlsx.js`、`js/docgen.js`、
`js/config-editor/helpers.js`、`js/config-editor/template.js`、`js/config-editor/setup.js`、
`css/theme_additions.css`、`py/schemas.py`、`py/a_loader.py`、`py/reel_generator.py`
(app.html / app.js / index.js / bcompare.js **未動**;script 載入順序不變)

---

## v5.0-a:排版根因修補(CSS + symbol.js)

- **CJK 防直排批次**:`.cfg-chip` / 各按鈕 / 各標籤統一 `white-space:nowrap`、
  標籤 `word-break:keep-all`;01/06/07 等頁文字擠成直排的共同根因一次解掉。
- **符號頁「外觀/識別」壓縮**:色票改單條 `swatch-strip`(自動換行)、
  編號/名稱/Symbol_ID 改三欄 `sym-id-grid` 並排、套 v4.9-c 寬度 token
  (`input-w-num` / `input-w-id`),文字欄取消置中。
- `.cfg-mode-grid3 { align-items:start }` 修按鈕錯位。
- 暗色補洞:`.sym-*` / `.docgen-*` / `.bcmp-*` 主要容器補 `[data-theme=dark]` 覆寫。

## v5.0-b:主題單源化

- **刪除 setup.js 的 C12 重複實作**(themeMode / cycleThemeMode / watcher 全段)
  與 template.js 的 `cfg-theme-toggle` 浮動鈕。
- 亮暗切換唯一入口 = sidebar 按鈕(app.js 既有實作),全站同步、標籤不再脫鉤。
- **勘誤**:舊說明書「C12 暗色模式(編輯器內切換)」條目作廢。

## v5.0-c:矩陣互動重做 + 效能

- **互動模型(spreadsheet 式)**:`toggleMatrixCell` 移除,改
  `onMatrixCellPointerDown` / `onMatrixCellPointerEnter` + 全域 pointerup:
  - 點 cell(含 input 本體)= 選取該格 + 直接編輯;td 邊緣 4px 死區消失
  - Shift+點 = 矩形範圍;Ctrl/⌘+點 = 多選(皆不進入編輯)
  - **按住拖曳跨格 = 框選**(自動 blur 離開編輯;`is-dragging` 時整表禁選字)
  - 範圍一律以**視覺列序**計算(`sortedReels` 現序),修正列排序後框選錯格
- **熱力底色改 class bucket**(`cfg-heat-zero` / `cfg-heat-1..9`):
  取代每格 inline style;暗色直接覆寫,移除 theme_v34 的 `[style*="rgba(140"]` hack 依賴。
- **效能**:活躍模式列/欄合計改 computed 快取(`_reelActiveTotals` / `_gridActiveTotals`),
  `cellPercent` / 合計欄 O(1) 查表;矩陣 cell `transition` 只留 hover。
- 修 bug:`applyMatrixSelOp` 空選取時不再塞無意義 undo。
- 開發守則新增:**矩陣 cell 一律走 pointer 模型,不得再掛 click 選取**。

## v5.0-d:結構改版

- **01 模式清單 accordion**:預設收合成摘要列(名稱 · 起始 badge · 局數 ·
  trigger 預覽 · ⚠),點擊展開;同時間最多一張;新增模式自動展開。
  (`modeExpandedKey` / `isModeExpanded` / `toggleModeExpanded`)
- **06 中獎線**:path / 備註自 topbar 移到棋盤下方(`cfg-paylines-v2-fields-under`),
  棋盤位置不再被欄位換行推擠;topbar 改兩欄(meta / actions)。
- **07/09 拼圖列**:允許換行 + 合理 min-width(var 150 / subkey ≥110 /
  op 92 / value ≥110),select/input 撐滿 piece。

## v5.1:契約加法(需同步外部模擬器)

### SubReel_Symbol_Set(02_Layout 選用欄)
- **網頁端**:`makeReel` 增 `subreel_symbol_set:''`;02_Layout 副盤區新增
  「副盤符號集」下拉(03b 符號集);拖曳互換 attrs 已涵蓋;匯出附在 02_Layout 列尾。
- **引擎端**:`schemas.ReelLayout` 增欄;`a_loader` 容錯解析(缺欄→空)+
  交叉驗證(引用必須存在於 03b,否則 ConfigValidationError);
  `reel_generator._fill_subreel` 優先序更新:
  **04 副盤專屬池 → SubReel_Symbol_Set 等權池(lazy 快取) → 沿用主輪**。
  舊檔無此欄 → 行為與 v4.9 完全一致(已驗證)。

### 13_Jackpots(新選用分頁,引擎忽略)
- **新 LS key**:`slotplanner.aconfig.jackpots.v1`
  (列結構 `{jp_id, name, mult, trigger_desc, mode_scope, notes}`)。
- **UI**:01_Global 新增「區塊 4:JP 定義」(JP_ID / 名稱 / 倍數 / 觸發說明 /
  適用模式 chips);隨 01_Global 分頁重設一併清除;範本快照
  (`_snapshotAllLS` / `_restoreAllLS`)已補納此 key。
- **匯出**:A.xlsx 新增 `13_Jackpots` sheet(無 JP 仍寫表頭);README 分頁列表同步。
- **docgen**:JACKPOT 表改為**優先自動帶入設定檔 JP**(無 JP 才退回通用四級樣板);
  區塊加「⇆ 從設定檔帶入」重新同步鈕,docmeta 退為可覆寫副本。
- py 端 a_loader 只讀已知 sheet,13_Jackpots 自然忽略,**B 端契約零變動**。

---

## 驗證(本次全部通過)

- 全 JS `node --check`;config-editor TEMPLATE + symbol + docgen 模板以
  `@vue/compiler-dom` 實編譯 0 error。
- **ConfigPage 真 mount(Vue 3 + happy-dom)**:內建示範範本載入 →
  10/10 分頁逐一切換渲染,console.error = 0;拖曳框選 2×2 → 4 格 ✓。
- **端到端 XLSX**:`buildAxlsxBufferFromLS` → **16 sheets**(含 13_Jackpots)→
  ExcelJS 重讀驗 02_Layout 尾欄 = SubReel_Symbol_Set、JP 兩列資料正確。
- **py**:`py_compile` 全過;a_loader 讀回上述 A.xlsx 成功;
  引用不存在符號集 → 正確拋 ConfigValidationError;
  ReelGenerator 300 spins 取樣:設 HWSET → 副盤只出 HWSET 成員;
  清空 set → 回到沿用主輪(向後相容)✓。

## 待你決定 / 已知事項

- 13_Jackpots 與 SubReel_Symbol_Set 為**契約加法**:外部模擬器更新 py/ 後生效;
  未更新的舊模擬器讀新 A.xlsx 不受影響(忽略新 sheet;02_Layout 舊程式按欄名取值不受尾欄影響)。
- localStorage 清單請在說明書補:`slotplanner.aconfig.jackpots.v1`。
- Ctrl+K 搜尋目錄(GLOBAL_FIELDS)尚未收錄 JP 欄位,需要的話下版補。

---

# v5.2 追加(同日):剩餘優化 + JP 完整化

**改動檔(在 v5.0/v5.1 基礎上)**:`helpers.js`、`setup.js`、`template.js`、`aconfig-xlsx.js`、`docgen.js`(py 不變,13_Jackpots 引擎本就忽略)

## JP 完整化(博弈企劃版)
- **schema 擴欄**:`kind`(FIXED 固定 / PROGRESSIVE 累積)、`increment_pct`
  (累積 JP 注金抽成 %)、`must_hit_by`(必開上限 ×注額,0=無);
  `mult` 在累積 JP 語義 = 起始彩池 seed。舊資料載入自動補預設(FIXED)。
- **UI**:JP 列加「固定/累積」chips;選累積才顯示抽成 % 與必開上限;
  倍數標籤隨類型切換(倍數 / 起始彩池)。
- **13_Jackpots 欄位**:`JP_ID, Name, Kind, Multiplier, Increment_Pct,
  Must_Hit_By, Trigger_Desc, Mode_Scope, Notes`(較 v5.1 多 3 欄;引擎忽略此分頁,無相容問題)。
- **docgen**:JACKPOT 表自動補「類型」列;存在累積 JP 時再補「抽成 %/注」
  「必開上限」列(XLSX 與 Markdown 皆同步);手填舊資料無 kind → 維持原兩列。
- **驗證(01_Global)**:JP_ID 重複→error;倍數/起始彩池=0→warn;
  累積 JP 抽成 0→warn、>100→error;必開上限<起始彩池→error;
  mode_scope 引用不存在模式→error。

## 其餘收尾
- **04「⇆集」快捷**:副盤列與 Panel 列的操作鈕新增「依 02 指定符號集帶入」
  (成員 100/其餘 0,含 undo);未指定符號集會提示先到 02 設定。
- **02 驗證**:副盤符號集引用不存在/為空 → error(網頁端先攔,對齊 py a_loader)。
- **Ctrl+K 搜尋**:GLOBAL_FIELDS 補 starting_mode 與 JP 定義;每個 JP 個別入索引
  (💰,顯示類型與倍數)。
- **範本 diff**:counts 補 jackpots(存/載範本預覽會顯示 JP 數)。
- **06 UX**:切到 path 為空的中獎線自動開啟點選模式,直接在棋盤畫線。

## 驗證
- 模板編譯 0 error;ConfigPage mount 10/10、console.error=0、拖曳框選 ✓;
- E2E XLSX:16 sheets、13_Jackpots 9 欄含 Kind=FIXED 驗證通過。
