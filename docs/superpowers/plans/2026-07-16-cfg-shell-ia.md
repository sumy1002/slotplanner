# Config Editor Shell IA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重構 A 設定檔編輯器左側分頁列為「結構／機制／機率／輸出」工作流 IA，並加深殼層視覺（topbar／tab rail／content 外殼）。

**Architecture:** Metadata 單一來源仍是 `helpers.js` 的 `TAB_GROUPS` + `TABS` → `TABS_BY_GROUP`。`docgen` 納入 `TABS`（`group: 'output'`），template 刪除硬編碼文件群組。殼層 CSS 只動 `theme_additions.css`（必要時暗色補丁）。不改 sheet 內部與 tab id。

**Tech Stack:** Vue 3 options API（既有 ConfigEditor）、純 CSS、PowerShell `Select-String` 驗證。

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-16-cfg-shell-ia-design.md`
- Tab `id` 字串不變；hidden tabs 不重新曝光
- Peer active（rules／reel_weights）行為不變
- 不改 Symbol 獨立頁、各 sheet 內部、頂欄 overflow、匯出／驗證業務邏輯
- 註釋繁體中文；transitions 列屬性（禁 `transition: all`）
- 吃既有共用 token（`--space-*`／`--fs-*`／`--r-*`／`--hover`／`--press`）

## File Map

| File | Responsibility |
|------|----------------|
| `js/config-editor/helpers.js` | `TAB_GROUPS`／`TABS` group 與順序；新增 `docgen` metadata |
| `js/config-editor/template.js` | 分頁列只渲染 `visibleTabGroups`；移除硬編碼文件區塊 |
| `js/config-editor/setup.js` | 僅在 `activeTab`／`FIT_TABS`／reset 條件因 docgen 入 `TABS` 需要時做最小修正 |
| `css/theme_additions.css` | 殼層視覺加深 |

---

### Task 1: Tab metadata IA (`helpers.js`)

**Files:**
- Modify: `js/config-editor/helpers.js`（`TAB_GROUPS`／`TABS`／`TABS_BY_GROUP` 區塊，約 L35–91）
- Verify: PowerShell 對 helpers 的 Select-String

**Interfaces:**
- Consumes: 無
- Produces: 新 `TAB_GROUPS` ids：`structure`／`mechanic`／`weight`／`output`；可見 tab 順序如 spec；`TABS` 含 `docgen`

- [ ] **Step 1: 失敗基準（舊群組仍在）**

```powershell
Select-String -Path js/config-editor/helpers.js -Pattern "id: 'base'|label: '基礎設定'|label: '賠付'"
```

Expected: 有命中。

- [ ] **Step 2: 替換 `TAB_GROUPS`**

```javascript
  const TAB_GROUPS = [
    // P1 shell IA:工作流分組(結構 → 機制 → 機率 → 輸出)
    { id: 'structure', label: '結構', icon: '🏗' },
    { id: 'mechanic',  label: '機制', icon: '🎯' },
    { id: 'weight',    label: '機率', icon: '🎲' },
    { id: 'output',    label: '輸出', icon: '📄' },
  ];
```

- [ ] **Step 3: 重排／重指派 `TABS`（含 hidden 跟隨邏輯群組；`docgen` 新增）**

將 `TABS` 陣列改為下列順序與 `group`（保留每個 tab 既有 `sheet`／`name`／`icon`／`done`／`desc`／`kind`／`hidden` 語意；只改 `group` 與陣列順序，並新增 docgen）：

```javascript
  const TABS = [
    // ── 結構 ──
    { id: 'layout',            sheet: '02_Layout',             name: '盤面結構',     icon: '🎰', done: true, group: 'structure',
      desc: '設定轉輪數、每輪格數與盤面尺寸' },
    { id: 'symbols',           sheet: '03_Symbols',            name: '符號清單',     icon: '🎨', done: true, group: 'structure',
      kind: 'fullpane', desc: '管理圖示、賠付倍數與符號屬性' },

    // ── 機制 ──
    { id: 'rules',             sheet: '09 + 10 + 01 + 11',     name: '規則',         icon: '🧩', done: true, group: 'mechanic',
      desc: '機制、模式切換與盤面圖示判定規則的建立入口' },
    { id: 'bet_config',        sheet: '14_Bet_Config',         name: '押注',         icon: '🎰', done: true, group: 'mechanic',
      desc: '押注面額、加押 / 購買與比倍設定' },
    { id: 'constraints',       sheet: '07_Constraints',        name: '硬約束',       icon: '🚫', done: true, group: 'mechanic',
      desc: '盤面產生時必須遵守的限制條件' },
    { id: 'global',            sheet: '01_Global',             name: '全域設定',     icon: '⚙️', done: true, group: 'mechanic', hidden: true,
      desc: '賠付類型、計分方向與起始模式' },
    { id: 'paylines',          sheet: '06_Paylines',           name: '中獎線',       icon: '➰', done: true, group: 'mechanic', hidden: true,
      desc: '設定中獎線路徑與計分方式' },
    { id: 'jackpots',          sheet: '13_Jackpots',           name: 'JP 彩金',      icon: '💰', done: true, group: 'mechanic', hidden: true,
      desc: '彩金等級與中獎機率設定' },
    { id: 'gamble',            sheet: '18_Gamble',             name: '比倍',         icon: '🎴', done: true, group: 'mechanic', hidden: true,
      desc: '比倍(Gamble)加倍玩法設定' },

    // ── 機率 ──
    { id: 'reel_weights',      sheet: '04_Reel_Weights',       name: '權重',         icon: '🎲', done: true, group: 'weight',
      desc: '輪帶與符號出現機率設定' },
    { id: 'reel_strips',       sheet: '04b_Reel_Strips',       name: '真實輪帶',     icon: '🎞️', done: true, group: 'weight', hidden: true,
      desc: '實際輪帶符號排列順序' },
    { id: 'grid_size_weights', sheet: '05_Grid_Size_Weights',  name: '格數權重',     icon: '📏', done: true, group: 'weight', hidden: true,
      desc: '不同盤面格數的出現機率' },
    { id: 'distribution_bins', sheet: '12_Distribution_Bins',  name: '分佈區間',     icon: '📊', done: true, group: 'weight', hidden: true,
      desc: '中獎倍數的分佈區間設定' },
    { id: 'multipliers',       sheet: '15_Multipliers',        name: '倍數系統',     icon: '✖️', done: true, group: 'weight', hidden: true,
      desc: '中獎倍數加成規則' },
    { id: 'coin_values',       sheet: '16_Coin_Values',        name: '金幣面額',     icon: '🪙', done: true, group: 'weight', hidden: true,
      desc: '金幣符號的面額設定' },

    // ── 輸出（無 A.xlsx sheet；跨分頁文件步驟）──
    { id: 'docgen',            sheet: '—',                     name: '文件生成',     icon: '📋', done: true, group: 'output',
      kind: 'fullpane', desc: '把設定匯出成 Excel 或 Markdown 文件' },
  ];
```

`TABS_BY_GROUP` 計算式維持不變（仍 `filter !hidden`）。

- [ ] **Step 4: 驗證新 IA 字串**

```powershell
Select-String -Path js/config-editor/helpers.js -Pattern "id: 'structure'|id: 'mechanic'|label: '機率'|id: 'docgen'|group: 'structure'|group: 'mechanic'"
Select-String -Path js/config-editor/helpers.js -Pattern "id: 'base'|label: '基礎設定'|label: '賠付'"
```

Expected: 第一行有命中；第二行無命中（註釋歷史除外）。

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/helpers.js
git commit -m @"
feat(cfg): restructure tab rail IA into workflow groups

"@
```

---

### Task 2: Template rail — remove hardcoded 文件 group

**Files:**
- Modify: `js/config-editor/template.js`（分頁列約 L414–459）
- Modify: `js/config-editor/setup.js`（僅若 `activeTab`／reset／FIT 因 docgen 入 TABS 需要）
- Verify: Select-String + 手動點擊清單

**Interfaces:**
- Consumes: Task 1 的 `TABS`／`TABS_BY_GROUP`（含 `docgen`）
- Produces: 分頁列只靠 `visibleTabGroups`；`active === 'docgen'` 內容路由仍可用

- [ ] **Step 1: 刪除硬編碼文件群組**

在 `template.js` 刪除這整段（約 L444–459）：

```html
      <!-- 📄 文件群組（不在 TABS 內：跨分頁輸出步驟，不對應 A.xlsx sheet）-->
      <div class="cfg-tab-group">
        ...
      </div>
```

保留上方 `v-for="grp in visibleTabGroups"` 迴圈。`docgen` 會經由 `output` 群組自動渲染。

- [ ] **Step 2: 對齊 tab click／active class（docgen 走一般路徑）**

確認 `v-for` 內 `.cfg-tab` 的 `@click` 對非 `rules` tab 為 `active = t.id`（既有邏輯已涵蓋 docgen）。  
`docgen` **不要**套用 rules／reel_weights 的 peer active 複雜 class；既有表達式僅在 `t.id === 'rules'`／`reel_weights` 時擴張，docgen 維持 `active: active === t.id` 路徑即可（檢查 class binding：當 `t.id === 'docgen'` 時 peer 條件為 false，結果應為 `active === 'docgen'`）。

若 class binding 過於複雜導致誤判，改為可讀寫法（行為等價）：

```javascript
:class="{
  active: t.id === 'rules'
    ? (active === 'rules' || active === 'paylines')
    : (t.id === 'reel_weights'
        ? (active === 'reel_weights' || active === 'reel_strips' || active === 'grid_size_weights' || active === 'distribution_bins')
        : active === t.id),
  'cfg-tab-rules-parent': t.id === 'rules',
  'cfg-tab-dirty': dirtyTabs[t.id],
  'cfg-tab-na': tabNotApplicable(t.id)
}"
```

（可選重構；若現況對 docgen 已正確，允許只刪硬編碼區塊。）

- [ ] **Step 3: `setup.js` 最小相容**

因 `activeTab = TABS.find(...) || TABS[0]`，docgen 入 TABS 後 `activeTab.id === 'docgen'` 且 `kind: 'fullpane'`。

確認／調整：

1. Reset FAB：`v-if="active !== 'docgen' && activeTab.kind !== 'fullpane'"` — fullpane 已隱藏 FAB，可簡化為 `v-if="activeTab.kind !== 'fullpane'"`（等價對 symbols＋docgen），或保留雙條件。
2. `FIT_TABS`：**不要**把 `docgen` 加進去（fullpane 自有 host）。
3. 任何假設「TABS[0] 永遠是 rules」的程式：Task 1 後 `TABS[0]` 是 `layout`。搜尋並修正：

```powershell
Select-String -Path js/config-editor/setup.js -Pattern "TABS\[0\]"
```

若有 fallback 語意依賴「預設進規則頁」，改為 `TABS.find(t => t.id === 'rules') || TABS[0]`，或保持 `active` 初始值（查 `active = ref(...)` 預設是否已是某 tab id）。**不要改變開站預設 active**，除非它依賴 `TABS[0]`。

- [ ] **Step 4: 驗證**

```powershell
Select-String -Path js/config-editor/template.js -Pattern "cfg-tab-group-label\">文件|active = 'docgen'"
Select-String -Path js/config-editor/helpers.js -Pattern "id: 'docgen'"
Select-String -Path js/config-editor/setup.js -Pattern "TABS\[0\]"
```

Expected: template 不再有硬編碼「文件」群組標籤；helpers 有 docgen；記錄任何 `TABS[0]` 並確認語意安全。

手動清單（寫進 report）：結構／機制／機率／輸出順序；點 docgen 開文件頁；rules caret／peer；reel_weights peer。

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/template.js js/config-editor/setup.js
git commit -m @"
feat(cfg): render docgen from tab metadata rail

"@
```

---

### Task 3: Shell visual polish (CSS)

**Files:**
- Modify: `css/theme_additions.css`（`.cfg-source-bar`、`.cfg-tabs`、`.cfg-tab*`、`.cfg-tab-group*`、`.cfg-content` 外殼）
- Modify: `css/modules/theme_v34.css`（僅當暗色對比不足時）

**Interfaces:**
- Consumes: 共用 token（已 polish）
- Produces: 殼層呼吸感／層級／hover-press

- [ ] **Step 1: Source bar**

```css
.cfg-source-bar {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  height: 52px;
  padding: 0 var(--space-5);
  background: var(--glass-2);
  border-bottom: 1px solid var(--glass-brd);
  flex-shrink: 0;
}
.cfg-source-text {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
}
```

- [ ] **Step 2: Tab rail + groups**

```css
.cfg-tabs {
  width: 200px;
  flex-shrink: 0;
  background: var(--left-pane-bg);
  border-right: 0.5px solid var(--glass-edge);
  padding: var(--space-4) var(--space-3);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.cfg-tab-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
.cfg-tab-group:last-child { margin-bottom: 0; }
.cfg-tab-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px 6px;
  font-size: var(--fs-xs);
  font-weight: 800;
  letter-spacing: 0.10em;
  color: var(--text-muted);
  text-transform: uppercase;
  user-select: none;
  border-bottom: 1px dashed var(--glass-brd);
  margin-bottom: var(--space-2);
}
.cfg-tab {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 10px 12px;
  border-radius: var(--r-md);
  cursor: pointer;
  background: transparent;
  border: 1.5px solid transparent;
  border-left: 2px solid transparent;
  transition: background var(--t-fast), border-color var(--t-fast),
              transform 120ms var(--ease-ios), box-shadow var(--t-fast);
  position: relative;
}
.cfg-tab:hover {
  background: var(--glass-3);
  border-color: transparent;
  transform: translateY(-1px);
}
.cfg-tab:active {
  background: var(--press);
  transform: scale(0.98);
}
.cfg-tab.active {
  background: var(--accent);
  border-color: var(--accent-brd);
  border-left-color: var(--accent-hex);
  box-shadow: none;
  transform: none;
}
.cfg-tab-name {
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--text);
  line-height: 1.3;
}
```

保留既有 `.cfg-tab.active .cfg-tab-name` 字重 700／accent 色。收合態 media query 若寫死 px，只在明顯破版時微調，不做大改。

- [ ] **Step 3: Content shell**

```css
.cfg-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: var(--space-6) var(--space-7) var(--space-8);
}
```

- [ ] **Step 4: 驗證**

```powershell
Select-String -Path css/theme_additions.css -Pattern "\.cfg-source-bar \{|\.cfg-tab-group \{|\.cfg-tab:active|\.cfg-content \{" -Context 0,6
```

Expected: source-bar height 52px／token padding；tab hover/active；content padding 用 `--space-*`。

- [ ] **Step 5: Commit**

```powershell
git add css/theme_additions.css css/modules/theme_v34.css
git commit -m @"
polish(cfg): deepen shell spacing and tab rail hierarchy

"@
```

---

### Task 4: End-to-end verification

**Files:** none required（或僅文件修正）

- [ ] **Step 1: 靜態檢查清單**

```powershell
# 可見群組標籤
Select-String -Path js/config-editor/helpers.js -Pattern "label: '結構'|label: '機制'|label: '機率'|label: '輸出'"
# 無舊群組
Select-String -Path js/config-editor/helpers.js -Pattern "label: '基礎設定'|label: '賠付'|label: '權重表'"
# 無硬編碼文件群組
Select-String -Path js/config-editor/template.js -Pattern "文件生成"
# tab ids 仍在
Select-String -Path js/config-editor/helpers.js -Pattern "id: 'rules'|id: 'layout'|id: 'constraints'|id: 'reel_weights'|id: 'docgen'"
```

Expected: 新標籤存在；舊可見標籤「基礎設定／賠付／權重表」不存在；template 仍可提及「文件生成」於 tab name 渲染（來自 metadata），但不可有獨立硬編碼 `cfg-tab-group-label">文件`。

- [ ] **Step 2: 瀏覽器煙測（寫入 report）**

開啟 `app.html` → A 設定檔編輯器：

1. 左側四群組順序正確  
2. 各可見 tab 可開  
3. 規則 peer／權重 peer  
4. 文件生成  
5. dirty／issue badge  
6. 暗色模式  

- [ ] **Step 3: Commit（僅當有修正時）**

若煙測發現小修，commit；否則報告「無新 commit」。

---

## Spec Coverage Checklist

| Spec | Task |
|------|------|
| New groups structure／mechanic／weight／output | Task 1 |
| Visible order layout→symbols；rules→bet→constraints；weights；docgen | Task 1 |
| docgen in metadata；remove hardcoded 文件 | Task 1–2 |
| Hidden tabs stay hidden；ids unchanged | Task 1 |
| Peer active unchanged | Task 2 |
| Shell visual source-bar／tabs／content | Task 3 |
| No sheet internals／Symbol page／overflow | Global |

## Self-Review Notes

- `distribution_bins` 改掛 `weight`（peer 於權重頁），符合「hidden 跟隨邏輯宿主」  
- `TABS[0]` 變為 `layout`：Task 2 強制檢查 fallback  
- CSS 驗證用 Select-String；瀏覽器煙測在 Task 4
