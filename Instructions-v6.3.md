# SlotPlanner Pro — Web 版 Project Instructions（v6.3，完整版）

> **v6.3 = Q4 中獎線自動產生 + Q3 倍數/金幣併入符號 + Q2 副盤三型跨分頁深化**
> 本版延續 v6.2，集中完成路線圖三大待辦：
> 1. **Q4**：06_Paylines 中獎線「自動產生」（一般線 / 相鄰≤1）＋清空全部＋docgen 條數。
> 2. **Q3**：符號自帶「倍數（×N）/ 彩金倍數（N×）/ 金幣面額」陣列；progress 階梯移入模式；
>    新增權威分頁 `15b_Symbol_Mults`、續寫 legacy 15/16；一次性遷移；移除舊兩分頁。
> 3. **Q2**：滾動副盤獨立權重 UI 收尾、蒐集副盤 ↔ COLLECT 型 JP 雙向連動、
>    觸發副盤 → 自動產生規則。
> 規則 1–62、勘誤 1–34、其餘架構同 v6.2（見前版）。本版**未新增 JS 檔**，
> 全部改在既有檔；A.xlsx **新增 1 分頁（15b_Symbol_Mults）**、02b_Panels 再加 2 欄。

---

## 專案簡介
同 v6.2。純前端、零 build、**必須用 HTTP server 執行**：
```
cd slotplanner
python -m http.server 8000
```
開啟 http://localhost:8000/app.html ；正式部署走 GitHub Pages。

---

## v6.3 變更清單（本版重點）

### Q4. 中獎線自動產生（06_Paylines）
- **`helpers.js`**：新增純函式 `generatePaylinePoints(opts)`（無 Vue 依賴、可單測；已掛入匯出物件）。
  - `opts = { reelCount, rows[], method, count, lineMode }`；`rows[i]` = 各輪 `max_rows`。
  - 演算法：DFS 列舉「相鄰輪列差 ≤ maxStep」的平滑線 → niceness 排序 → 「保證集」強制排最前 → LINE 前 3 格去重 → 取前 N。
  - `method='general'` → `maxStep=2`；`method='adjacent'` → `maxStep=1`（例 5 輪：`12321` 可、`12421` 不可）。
  - 保證集順序：水平 **top→down**、V、倒 V(Λ)、對角下(Z)、對角上(N)（過濾掉違反當前 maxStep 者）。
  - niceness = 總垂直位移 + 單步×2 + 非對稱×6 + 轉折×2（越低越前）。
  - 回傳 `{ points, available, capped, reason }`；`available` = 此盤面在當前方式下的可用上限。
- **`setup.js`**：`paylineGenOpen / paylineGenMethod / paylineGenCount(10–50) / paylineGenMode('replace'|'append')`；
  `paylineBoardUniform`（等高盤面判定）、`paylineGenAvailable`、`runPaylineGen()`、`clearAllPaylines()`。
  - **決策（已定）**：(a) 一般線 `maxStep=2`；水平 top→down；**不規則盤面先擋**（僅等高盤面可產生）。
  - 寫入：取代全部（有既有線時 confirm）/ 追加（以 path 去重、續號）。`direction` 沿用 `curScanDir`。
- **`template.js`**：左欄「新增中獎線」下方「⚙ 自動產生」面板（方式 chips / 線數 stepper / 寫入模式 / 產生鈕；
  不規則盤面顯示阻擋提示）；列表工具列加「🗑 清空」鈕。
- **`theme_additions.css`**：自動產生面板與清空鈕樣式。
- **`docgen.js`**：Excel「中獎線 / 路徑（共 N 條）」帶數量；企劃 Markdown「連線/計分規則」於非全路徑且有線時加「- 中獎線數：N 條」。

### Q3. 倍數 / 彩金倍數 / 金幣面額併入符號（四步）
語義：**「倍數」= ×N（× 在數字前）= 一般得分倍數**；**「彩金倍數」= N×（× 在數字後）= 彩金/面額**（與金幣面額合併）。皆**存陣列**（可複數、可加權隨機）。

- **Step 1 資料地基**
  - **`registry.js`**：符號新增 `mult_values: [{mult, weight}]`、`prize_values: [{value, weight, link_jackpot, weight_by_mode}]`；
    加 `_normMultValues`/`_normPrizeValues`；**同步到 5 處白名單**（createSymbol/cloneSymbol/toJSON/fromJSON/_loadFromLocalStorage，守則 #52）。
  - **`helpers.js`**：`makeMode` +`progress_ladder: []` +`progress_reset: true`（progress 階梯由 15_Multipliers 移入模式）；
    `loadModes` 各路徑併入 `makeMode` 確保欄位存在；新增 `makeMultValueEntry`/`makePrizeValueEntry`、
    `migrateSymbolMults(symbols, multipliers, coinValues, modes)`（一次性遷移）；`defaultMultipliers` +`migrated_to_symbols: false`。
- **Step 2 符號頁 UI（`symbol.js`）**
  - `form` 加兩欄；read/write（write 經整理去重：倍數須>0、面額須有值或連結 JP）；
    `modeNames`/`jackpotOptions`（onMounted 載入 + ⟳ 重讀）；`addMultValue/removeMultValue`、`addPrizeValue/removePrizeValue`。
  - 賠付表下方新增「倍數 / 彩金」區：**倍數 ×N**（倍數 + 權重）、**彩金倍數 / 面額 N×**（面額 + JP 下拉 + 基礎權重 + 各模式權重 `W_<mode>`）。
- **Step 3 匯出（`aconfig-xlsx.js`）**
  - `_deriveSymbolMults(syms, modes)`：由符號/模式反推。
  - **新增 `15b_Symbol_Mults` 權威分頁**：`Symbol_ID / Kind(MULT|PRIZE) / Value / Weight / Link_JP / W_<各模式>`。
  - **續寫 legacy `15_Multipliers` / `16_Coin_Values`**：來源改為反推；符號/模式無資料時 fallback 舊物件（遷移前後皆正確）。格式不變。
  - README 分頁清單 +`15b_Symbol_Mults`。
- **Step 4 接線 + 移除舊分頁 + docgen**
  - **`app.js`**：啟動時 `migrateQ3()`（冪等：`migrated_to_symbols` 旗標；有變更才 `registry.applyAll` + `saveModes`；失敗僅警告）。
  - **`helpers.js`**：`TABS` 的 `multipliers`/`coin_values` 標 `hidden: true`；`TABS_BY_GROUP` 過濾 `!t.hidden`（兩分頁從導覽消失；template/setup 不可達區塊休眠保留）。
  - **`docgen.js`**：企劃 Markdown 新增「## 倍數 / 彩金」摘要（`×N（權重）`、`N×→JP`）。

### Q2. 副盤三型跨分頁深化（a/b/c）
- **(a) 滾動副盤獨立權重 UI 收尾**（核心 v4.8 已存在於 04_Reel_Weights「🧩 副盤權重」區）
  - **`setup.js`**：`scrollingPanels`（排除 `panel_type==='COLLECT'`）；`hasAuxWeightRows` 改用它。
  - **`template.js`**：04 副盤權重列 `v-for` 改 `scrollingPanels`（COLLECT 不滾動圖示，不列入；提示加註）。
- **(b) 蒐集副盤 ↔ COLLECT 型 JP 雙向連動**
  - **`helpers.js`**：`makePanel` +`collect_target_jp: ''`。
  - **`setup.js`**：`collectJpOptions`（只列 COLLECT 型 JP）、`panelsFeedingJp(jpId)`（反查）、`panelCollectJpWarn(p)`（驗證不擋）。
  - **`template.js`**：COLLECT 副盤詳情「餵入 JP」下拉；JP 分頁 COLLECT 區反查顯示「餵入副盤：…」。
  - **`aconfig-xlsx.js`**：02b_Panels +`Collect_Target_JP`。
- **(c) 觸發副盤 → 自動產生規則**（決策：可指定輪、直接寫入 rules）
  - **`helpers.js`**：`makePanel` +`trigger_reel: 0`（0=任意輪）。
  - **`setup.js`**：`genTriggerRule(p)` → 直接 push 到 `rules`（即時更新 + 自動存）。
    - `trigger: ON_SYMBOL_LANDED`、`condition: symbol_count.<符號> >= 1`（引擎合法）、
      `action: EMIT_EVENT` 廣播 `activate_<panel_id>`；**輪資訊記於 payload + 描述**（引擎無逐輪 condition / 無「啟用 panel」動作型，故以事件承載）。重複偵測（以事件名）。
  - **`template.js`**：TRIGGER 副盤詳情「觸發輪」下拉（任意 / R1..Rn）+「產生對應規則」鈕。
  - **`aconfig-xlsx.js`**：02b_Panels +`Trigger_Reel`。

---

## 資料夾結構（v6.3）

> 同 v6.2；本版**無新增檔案**。受影響檔（★ v6.3 改）：

```
slotplanner/
├── app.js                  ★ v6.3（Q3 一次性遷移 migrateQ3 接線）
├── css/theme_additions.css ★ v6.3（Q4 自動產生面板 / 清空鈕）
├── js/
│   ├── registry.js         ★ v6.3（符號 mult_values/prize_values；5 處白名單）
│   ├── symbol.js           ★ v6.3（倍數/彩金 UI 區、讀寫、modes/JP 載入）
│   ├── aconfig-xlsx.js     ★ v6.3（15b_Symbol_Mults、legacy 15/16 反推、02b +2 欄）
│   ├── docgen.js           ★ v6.3（中獎線條數、倍數/彩金摘要）
│   └── config-editor/
│       ├── helpers.js      ★ v6.3（generatePaylinePoints、makeMode progress、makePanel +2 欄、
│       │                        migrateSymbolMults、TABS hidden 過濾、entry-maker）
│       ├── template.js     ★ v6.3（中獎線自動產生面板、倍數/彩金、副盤連動 UI）
│       └── setup.js        ★ v6.3（中獎線產生/清空、scrollingPanels、Q2b/Q2c 連動）
└── py/                     本版**未動**（契約向後相容；15b 為選用分頁、02b 加欄以欄名讀取）
```

---

## script 載入順序（app.html）
**與 v6.2 完全相同**（本版無新增 JS 檔）。CSS 仍只兩條 link、`theme_additions.css` 頂端 3 條 @import 不變。

---

## 側邊欄路由 / 跨頁意圖
同 v6.2（`SP.goConfig(intent)` → `SP.pendingConfigIntent` → config-page `onMounted` 消費）。
> 註：Q2(c) 產生規則為**直接寫入 `rules`**，不走跨頁意圖。

---

## 開發規則（v6.3 新增，接續 #62）

> 規則 1–62 同 v6.2。

63. **中獎線自動產生守則**（v6.3 / Q4）：批次產生一律走純函式 `generatePaylinePoints`
    （單一真相、可單測）。**不規則盤面（各輪 max_rows 不一致）先擋**，僅等高盤面可產生；
    線數夾 10–50；LINE 模式強制「前 3 格不重複」（對齊 a_loader 與重疊偵測）；
    保證集（水平 top→down + V + Λ + 對角）排最前。寫入提供取代/追加；另有「清空全部」。

64. **符號倍數/彩金守則**（v6.3 / Q3）：符號 `mult_values`（×N）/ `prize_values`（N×/面額）
    為**符號權威欄**，任何持久化都要同步 registry 五處白名單（守則 #52）。
    progress 累積階梯移入**模式**（`progress_ladder`/`progress_reset`）。
    `prize_values` 保留 `weight_by_mode` 與 `link_jackpot`（不丟 Hold&Win 能力）。

65. **倍數匯出守則**（v6.3 / Q3）：`15b_Symbol_Mults` 為**權威分頁**（無損、選用、py 忽略）；
    legacy `15_Multipliers` / `16_Coin_Values` 改由 `_deriveSymbolMults(syms, modes)` 反推
    （best-effort：首個 wild→WILD、首個非 wild→RANDOM、首個帶 prize→COIN、各模式階梯→PROGRESS），
    符號/模式無資料時 fallback 舊物件。格式與欄位不可變動（py 契約）。

66. **倍數遷移守則**（v6.3 / Q3）：`migrateSymbolMults` 一次性、**冪等**（`multipliers.migrated_to_symbols` 旗標）、
    **只在目標符號/模式欄位為空時寫入**（不覆蓋使用者新資料）；於 `app.js` 啟動接線，失敗僅警告不影響啟動。
    舊 LS key 保留不刪。

67. **副盤連動守則**（v6.3 / Q2b）：COLLECT 副盤 `collect_target_jp` ↔ COLLECT 型 JP **雙向**；
    panel 端下拉只列 COLLECT 型 JP、JP 端反查顯示餵入副盤；驗證（JP 不存在 / 非 COLLECT 型）**警告但不擋**。
    02b_Panels 加欄向後相容。

68. **觸發規則產生守則**（v6.3 / Q2c）：`genTriggerRule` 一律用既有
    `ON_SYMBOL_LANDED` + `symbol_count.<符號> >= 1` + `EMIT_EVENT(activate_<panel_id>)`
    （引擎無「啟用 panel」動作型、無逐輪符號 condition 變數）；指定輪資訊記於 **payload + 描述**；
    以事件名做重複偵測。

69. **副盤權重顯示守則**（v6.3 / Q2a）：04_Reel_Weights 副盤權重矩陣只列「會滾動圖示」的副盤
    （`scrollingPanels`，排除 COLLECT）；獨立副輪列匯出 `Reel.sub`，Panel 列全 0 = 走 fallback。

---

## ⚠️ 對既有說明書的勘誤（v6.3 新增，接續 #34）

35. **「倍數系統 / 金幣面額」兩分頁已移除**（v6.3）：資料併入**符號頁「倍數 / 彩金」區**與**模式（progress）**。
    舊分頁於 TABS 標 `hidden:true`（導覽不顯示）；舊 template/setup 區塊休眠保留（不可達）。

36. **15_Multipliers / 16_Coin_Values 改為衍生**（v6.3）：不再由獨立分頁編輯，改由符號/模式反推匯出；
    新增 `15b_Symbol_Mults` 為前端權威。三者由 `aconfig-xlsx._deriveSymbolMults` 一致產生。

37. **06_Paylines 可批次自動產生**（v6.3）：除既有單條範本外，新增「⚙ 自動產生」（一般線 / 相鄰≤1）與「清空全部」。

38. **02b_Panels 再加 2 欄**（v6.3）：`Collect_Target_JP`（Q2b）、`Trigger_Reel`（Q2c）。皆選用、向後相容。

---

## A.xlsx Sheet 清單（v6.3，共 **20 sheets**；本版新增 1 分頁 + 加欄）

| Sheet | v6.3 異動 |
|---|---|
| `02b_Panels` | **+Collect_Target_JP（Q2b）/ +Trigger_Reel（Q2c）**（延續 v6.2 的 +Panel_Type/+Trigger_Symbol） |
| `15_Multipliers` | 改為**由符號/模式反推**（格式不變；WILD/RANDOM 取首個、PROGRESS 取各模式階梯） |
| `15b_Symbol_Mults` | **★ 本版新增**：符號倍數/彩金權威表（Kind=MULT/PRIZE；選用；前端權威；py 忽略） |
| `16_Coin_Values` | 改為**由符號 prize_values 反推**（格式不變） |

其餘 sheet 同 v6.2（00_README / 01_Global / 02_Layout / 03_Symbols / 03b_Symbol_Sets /
03c_Paytable / 04_Reel_Weights / 04b_Reel_Strips / 05_Grid_Size_Weights / 06_Paylines /
07_Constraints / 08_Combo_Weights / 09_Puzzle_Rules / 10_Discard_Rules / 11_Mode_Config /
12_Distribution_Bins / 14_Bet_Config / 17_Bonus_Games）。

> **py 契約**：15b 為 a_loader 必要清單外、未被 `sheets.get` 讀取的選用分頁 → 忽略；
> 02b 加欄以欄名讀取（`r.get`）→ 忽略未知欄；15/16 格式不變。**py 本版未改。**

---

## localStorage（v6.3）
**未新增 LS key**。
- 倍數遷移旗標 `migrated_to_symbols` 為 `slotplanner.aconfig.multipliers.v1` 物件**內的欄位**（非新 key）。
- 符號倍數/彩金存於既有 `slotplanner.registry.v1`；progress 階梯存於既有 `slotplanner.aconfig.modes.v1`。

---

## 型別定義（v6.3 異動部分）

### SymbolDef（v6.3 擴充）
```typescript
interface SymbolDef {
  // ...v6.2 既有（number / subreel_limit / can_expand / pay_rows / ...）...
  mult_values:  Array<{ mult: number; weight: number }>;            // v6.3：「倍數」×N（加權隨機）
  prize_values: Array<{                                             // v6.3：「彩金倍數」N× / 金幣面額
    value: number; weight: number;
    link_jackpot: string;                 // 連結 13_Jackpots 的 jp_id（空=純面額）
    weight_by_mode: { [mode: string]: number };  // 各模式權重（保留 Hold&Win 能力）
  }>;
}
```

### PanelDef（v6.3 擴充）
```typescript
interface PanelDef {
  // ...v6.2 既有（panel_type / scroll / trigger_symbol / symbol_set / inherit_weight / join_payline / ...）...
  collect_target_jp: string;   // v6.3 / Q2b：COLLECT 型副盤餵入的 JP（限 COLLECT 型）
  trigger_reel: number;        // v6.3 / Q2c：TRIGGER 觸發輪（0=任意；1..n=指定）
}
```

### ModeDef（v6.3 擴充）
```typescript
interface ModeDef {
  mode: string; trigger_condition: string; spin_count: number;
  inherit_globals: boolean; on_enter_reset_vars: string; notes: string;
  progress_ladder: number[];   // v6.3：cascade 累積倍數階梯（由 15_Multipliers PROGRESS 移入）
  progress_reset: boolean;     // v6.3：進入此模式是否重置階梯
}
```

### Multipliers（v6.3 加旗標欄）
```typescript
interface Multipliers {
  // ...v5.4 既有（wild_* / progress_* / random_*）...
  migrated_to_symbols: boolean;  // v6.3：是否已把資料併入符號/模式（一次性遷移旗標）
}
```

### 中獎線產生器（純函式）
```typescript
function generatePaylinePoints(opts: {
  reelCount: number; rows: number[];
  method: 'general' | 'adjacent';     // general=maxStep2 / adjacent=maxStep1
  count: number; lineMode?: boolean;
}): { points: Array<{ points: {reel:number;row:number}[]; name:string; seq:number }>;
      available: number; capped: boolean; reason: string };
```

---

## docgen 文件輸出（v6.3 增補）
- 同 v6.2 + 以下：
  - **中獎線**：Excel「中獎線 / 路徑（共 N 條）」標題帶數量；企劃 Markdown 加「中獎線數：N 條」（非全路徑且有線時）。
  - **倍數 / 彩金**：企劃 Markdown 新增「## 倍數 / 彩金」摘要（由符號 `mult_values`/`prize_values` 帶入：`×N（權重）`、`N×→JP`）。

---

## 待實作 / 路線圖（v6.3 後）

### v6.3 已完成
- **Q4** 中獎線自動產生（一般線 / 相鄰≤1 / 清空 / docgen 條數）。
- **Q3** 倍數·彩金·金幣併入符號（symbol 兩陣列 + 模式 progress + 15b 權威 + legacy 反推 + 一次性遷移 + 移除舊兩分頁 + docgen 摘要）。
- **Q2** 副盤三型深化（a 獨立權重收尾 / b 蒐集↔COLLECT JP 雙向 / c 觸發→自動產生規則）。

### 待做
- **docgen 補完**：中獎線示意 SVG（需先定：Excel 圖 / 獨立 .svg / Markdown 內嵌）＋ 合規機率披露表（需先定披露欄位：RTP / 命中率 / 最大贏分 / 波動度…）。
- **盤面 #2**：更深的「滾動式視覺」預覽（需先定義靜態變高 or 動態滾動）。
- **盤面 #5**：符號集定義入口（符號清單能定義符號集）。
- **引擎運算對接**：目前 15/15b/16 與 progress 為「定義/匯出」層，py 引擎尚未實際運算倍數/彩金；
  未來讓引擎優先讀 `15b_Symbol_Mults`。
- **Q2 後續**：滾動副盤獨立權重的更細 UI；蒐集/觸發副盤與規則/JP 的進一步自動化。
- 多市場 RTP profile；Gamble 比倍（18_Gamble）。

---

## 版本摘要（新增）
- **v6.3**（2026-06）：Q4 中獎線自動產生 + Q3 倍數/金幣併入符號（新 15b_Symbol_Mults；
  legacy 15/16 反推；一次性遷移 migrateSymbolMults；移除倍數系統/金幣面額分頁）+ Q2 副盤三型深化
  （獨立權重收尾 / 蒐集↔COLLECT JP 雙向 / 觸發→自動產生規則；02b_Panels +2 欄）。**py 未改、契約向後相容。**
- **v6.2**（2026-06）：跨分頁連動層 + 八大區 UI/語意修正（見前版）。
- v6.1 及更早：見前版說明書。

---
*v6.3 整理自延續 v6.2 的開發對話。本版 py 未動且向後相容；前端所有改動皆經 `node --check`
語法檢查、div/template 標籤平衡與重點邏輯單測（中獎線產生器、遷移、反推、觸發規則建構）。*
