# Rule Action 座標選格小視窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在規則動作的 `pos`／`positions` 參數旁加「選格」小視窗，點選盤面格子後系統寫回既有 0-based 座標字串。

**Architecture:** 抽出純函式模組 `pos-picker.js`（解析／格式化／建格／選取）供 node 測試與 Vue setup 共用。`setup.js` 只管 picker 狀態與寫回 `setActParam`；`template.js` 在兩處參數表單加按鈕＋共用 modal；CSS 只加最小選格樣式。不碰資料模型與 lint 語意。

**Tech Stack:** Vue 3（既有 ConfigEditor setup／template 字串）、瀏覽器 script 載入（`SP.ConfigEditor.PosPicker`）、Node `assert` 單元測試、既有 `cfg-modedlg` 視覺語言。

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-rule-pos-cell-picker-design.md`
- 只服務 `param.type === 'pos'` 與 `param.key === 'positions'`
- 寫回格式：`pos` → `[reel,row]`；`positions` → `[[reel,row],…]`；皆 0-based；`reel 0` = `reel_id 1`
- 保留文字欄；哨兵手填；套用才寫回；取消不改字
- 洞格不可選；第一版只選主輪格；不改 `02d`／`SPAWN.cell`／xlsx schema
- 註釋用繁體中文；CSS 禁 `transition: all`

## File Map

| File | Responsibility |
|------|----------------|
| `js/config-editor/pos-picker.js` | 純函式：解析、格式化、建格、單／多選 toggling |
| `js/config-editor/pos-picker_test.js` | Node assert 單元測試 |
| `app.html` | 在 helpers 之後載入 `pos-picker.js` |
| `js/config-editor/setup.js` | `posPicker` 狀態、open／toggle／clear／apply、導出給 template |
| `js/config-editor/template.js` | 「選格」鈕（主畫面＋ruleDlg）＋共用 modal |
| `css/theme_additions.css` | `.cfg-pos-picker-*` 最小樣式 |

---

### Task 1: 純函式模組 `pos-picker.js` + 測試

**Files:**
- Create: `js/config-editor/pos-picker.js`
- Create: `js/config-editor/pos-picker_test.js`
- Modify: `app.html`（script 載入順序）

**Interfaces:**
- Consumes: 無（不依賴 Vue／Helpers）
- Produces: `window.SlotPlanner.ConfigEditor.PosPicker` 含：
  - `reelActiveRows(reel) → number[]` — 主輪活格 local row（0-based）
  - `buildCells(layout) → { reel0, row0, reelId, hole, label }[]`
  - `parsePos(raw) → [reel,row] | null`
  - `parsePositions(raw) → [reel,row][] | null`
  - `formatPos(coord | null) → string` — 未選回 `''`；有值回 `'[0,1]'`
  - `formatPositions(coords) → string` — 空陣列回 `''`；否則 `'[[0,1],[2,3]]'`
  - `toggleMulti(selected, coord) → [reel,row][]` — 已存在則移除，否則 append
  - `setSingle(_selected, coord) → [reel,row][]` — 回傳單元素陣列
  - `coordKey(coord) → string` — `'0,1'` 比對用
  - `pickerMode(param) → 'single' | 'multi' | null` — `type==='pos'` → single；`key==='positions'` → multi；否則 null
  - `hasHoleInSelection(cells, selected) → boolean`

- [ ] **Step 1: 寫失敗測試**

建立 `js/config-editor/pos-picker_test.js`：

```javascript
#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'pos-picker.js'), 'utf8'));
const P = window.SlotPlanner.ConfigEditor.PosPicker;

const layoutSolid = [
  { reel_id: 1, y_offset: 0, max_rows: 3, cells: null },
  { reel_id: 2, y_offset: 0, max_rows: 3, cells: null },
];

// 洞格：R1 只留 local row 0,2
const layoutHole = [
  { reel_id: 1, y_offset: 0, max_rows: 3, cells: ['0,0', '0,2'] },
];

assert.strictEqual(P.pickerMode({ type: 'pos' }), 'single');
assert.strictEqual(P.pickerMode({ type: 'text', key: 'positions' }), 'multi');
assert.strictEqual(P.pickerMode({ type: 'text', key: 'cell' }), null);

assert.deepStrictEqual(P.parsePos('[0,1]'), [0, 1]);
assert.strictEqual(P.parsePos('SELF'), null);
assert.deepStrictEqual(P.parsePositions('[[0,1],[2,3]]'), [[0, 1], [2, 3]]);
assert.strictEqual(P.parsePositions('RANDOM(2)'), null);

assert.strictEqual(P.formatPos([0, 1]), '[0,1]');
assert.strictEqual(P.formatPos(null), '');
assert.strictEqual(P.formatPositions([[0, 1], [2, 3]]), '[[0,1],[2,3]]');
assert.strictEqual(P.formatPositions([]), '');

const cells = P.buildCells(layoutSolid);
assert.ok(cells.length === 6);
assert.deepStrictEqual(cells[0], { reel0: 0, row0: 0, reelId: 1, hole: false, label: 'R0·0' });

const holes = P.buildCells(layoutHole);
assert.strictEqual(holes.find(c => c.row0 === 1).hole, true);
assert.strictEqual(holes.find(c => c.row0 === 0).hole, false);

assert.deepStrictEqual(P.setSingle([], [1, 2]), [[1, 2]]);
assert.deepStrictEqual(P.toggleMulti([[0, 1]], [0, 1]), []);
assert.deepStrictEqual(P.toggleMulti([[0, 1]], [2, 3]), [[0, 1], [2, 3]]);

assert.strictEqual(P.hasHoleInSelection(holes, [[0, 1]]), true);
assert.strictEqual(P.hasHoleInSelection(holes, [[0, 0]]), false);

console.log('pos-picker_test: OK');
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```powershell
node js/config-editor/pos-picker_test.js
```

Expected: FAIL（找不到 `pos-picker.js` 或 `PosPicker` undefined）

- [ ] **Step 3: 實作 `pos-picker.js`**

```javascript
// ============================================================
//  config-editor/pos-picker.js — 規則動作座標選格純函式
//  語意對齊 setup.js 的 _reelActiveRows / _coordIssue / _parsePositions
// ============================================================
(function () {
  'use strict';
  window.SlotPlanner = window.SlotPlanner || {};
  const SP = window.SlotPlanner;
  SP.ConfigEditor = SP.ConfigEditor || {};

  function reelActiveRows(reel) {
    const n = Math.max(0, Number(reel.max_rows) || 0);
    if (!Array.isArray(reel.cells) || reel.cells.length === 0) {
      const all = [];
      for (let i = 0; i < n; i++) all.push(i);
      return all;
    }
    const seen = new Set(), out = [];
    for (const s of reel.cells) {
      const m = /^\s*(-?\d+)\s*,\s*(-?\d+)\s*$/.exec(String(s));
      if (!m) continue;
      const dx = +m[1], dy = +m[2];
      if (dx !== 0) continue;
      if (dy >= 0 && dy < n && !seen.has(dy)) { seen.add(dy); out.push(dy); }
    }
    out.sort((a, b) => a - b);
    return out;
  }

  function buildCells(layout) {
    const out = [];
    const reels = Array.isArray(layout) ? layout : [];
    for (const reel of reels) {
      const reelId = Number(reel.reel_id) || 0;
      const reel0 = reelId - 1;
      const yoff = Number(reel.y_offset) || 0;
      const n = Math.max(0, Number(reel.max_rows) || 0);
      const active = new Set(reelActiveRows(reel));
      for (let local = 0; local < n; local++) {
        const row0 = yoff + local;
        const hole = !active.has(local);
        out.push({
          reel0, row0, reelId, hole,
          label: 'R' + reel0 + '·' + row0,
        });
      }
    }
    return out;
  }

  function parsePos(raw) {
    if (raw == null || raw === '') return null;
    if (typeof raw !== 'string') {
      if (Array.isArray(raw) && raw.length >= 2) return [Number(raw[0]), Number(raw[1])];
      return null;
    }
    const s = raw.trim();
    try {
      const v = JSON.parse(s.startsWith('[') ? s : '[' + s + ']');
      if (!Array.isArray(v) || v.length < 2) return null;
      const a = Number(v[0]), b = Number(v[1]);
      if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
      return [a, b];
    } catch (e) { return null; }
  }

  function parsePositions(raw) {
    if (raw == null || raw === '') return null;
    try {
      const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!Array.isArray(v) || !v.every(c => Array.isArray(c) && c.length >= 2)) return null;
      return v.map(c => [Number(c[0]), Number(c[1])]);
    } catch (e) { return null; }
  }

  function formatPos(coord) {
    if (!coord || !Array.isArray(coord) || coord.length < 2) return '';
    return '[' + Number(coord[0]) + ',' + Number(coord[1]) + ']';
  }

  function formatPositions(coords) {
    if (!Array.isArray(coords) || coords.length === 0) return '';
    return '[' + coords.map(c => '[' + Number(c[0]) + ',' + Number(c[1]) + ']').join(',') + ']';
  }

  function coordKey(coord) {
    return Number(coord[0]) + ',' + Number(coord[1]);
  }

  function setSingle(_selected, coord) {
    return [[Number(coord[0]), Number(coord[1])]];
  }

  function toggleMulti(selected, coord) {
    const key = coordKey(coord);
    const cur = Array.isArray(selected) ? selected.slice() : [];
    const idx = cur.findIndex(c => coordKey(c) === key);
    if (idx >= 0) cur.splice(idx, 1);
    else cur.push([Number(coord[0]), Number(coord[1])]);
    return cur;
  }

  function pickerMode(param) {
    if (!param) return null;
    if (param.type === 'pos') return 'single';
    if (param.key === 'positions') return 'multi';
    return null;
  }

  function hasHoleInSelection(cells, selected) {
    if (!Array.isArray(cells) || !Array.isArray(selected)) return false;
    const holeKeys = new Set(cells.filter(c => c.hole).map(c => c.reel0 + ',' + c.row0));
    return selected.some(c => holeKeys.has(coordKey(c)));
  }

  SP.ConfigEditor.PosPicker = {
    reelActiveRows, buildCells, parsePos, parsePositions,
    formatPos, formatPositions, coordKey, setSingle, toggleMulti,
    pickerMode, hasHoleInSelection,
  };
})();
```

- [ ] **Step 4: 在 `app.html` 加入 script（helpers 之後、template 之前）**

```html
<script defer src="js/config-editor/helpers.js"></script>
<script defer src="js/config-editor/pos-picker.js"></script>
<script defer src="js/config-editor/template.js"></script>
```

- [ ] **Step 5: 跑測試確認通過**

Run:

```powershell
node js/config-editor/pos-picker_test.js
```

Expected: `pos-picker_test: OK`

- [ ] **Step 6: Commit**

```powershell
git add js/config-editor/pos-picker.js js/config-editor/pos-picker_test.js app.html
git commit -m "feat(cfg): add pure pos-picker helpers for rule cell selection"
```

---

### Task 2: `setup.js` picker 狀態與寫回

**Files:**
- Modify: `js/config-editor/setup.js`（靠近 `ruleDlg`／action param helpers；以及 return 導出區）

**Interfaces:**
- Consumes: `SP.ConfigEditor.PosPicker`（Task 1）
- Produces（導出至 template）:
  - `posPicker` — reactive `{ open, mode, paramKey, actRef, selected, cells, holeWarn }`
  - `openPosPicker(act, param)`
  - `posPickerToggle(cell)`
  - `posPickerClear()`
  - `posPickerCancel()`
  - `posPickerApply()`
  - `posPickerIsSelected(cell)`
  - `posPickerModeOf(param)` — 薄包 `PosPicker.pickerMode`

- [ ] **Step 1: 在 setup 內取得 PosPicker（檔案前段 Helpers 解構附近）**

```javascript
      const PosPicker = (SP.ConfigEditor && SP.ConfigEditor.PosPicker) || null;
```

若 `PosPicker` 為 null，後續 open 函式應直接 return（防呆），但正常載入順序下不會發生。

- [ ] **Step 2: 新增 reactive 狀態與操作函式（建議放在 `ruleDlg` 區塊附近）**

```javascript
      // 規則動作座標選格小視窗（spec 2026-07-17）
      const posPicker = reactive({
        open: false,
        mode: 'single',      // 'single' | 'multi'
        paramKey: '',
        actRef: null,        // 指向正在編輯的 action 物件
        selected: [],        // [reel,row][]
        cells: [],
        holeWarn: false,
      });

      function posPickerModeOf(param) {
        return PosPicker ? PosPicker.pickerMode(param) : null;
      }

      function openPosPicker(act, param) {
        if (!PosPicker || !act || !param) return;
        const mode = PosPicker.pickerMode(param);
        if (!mode) return;
        const raw = (act.params && act.params[param.key] != null) ? act.params[param.key] : '';
        let selected = [];
        if (mode === 'single') {
          const one = PosPicker.parsePos(raw);
          if (one) selected = [one];
        } else {
          const many = PosPicker.parsePositions(raw);
          if (many) selected = many.slice();
        }
        const cells = PosPicker.buildCells(layout);
        posPicker.open = true;
        posPicker.mode = mode;
        posPicker.paramKey = param.key;
        posPicker.actRef = act;
        posPicker.selected = selected;
        posPicker.cells = cells;
        posPicker.holeWarn = PosPicker.hasHoleInSelection(cells, selected);
      }

      function posPickerIsSelected(cell) {
        const key = cell.reel0 + ',' + cell.row0;
        return posPicker.selected.some(c => (Number(c[0]) + ',' + Number(c[1])) === key);
      }

      function posPickerToggle(cell) {
        if (!PosPicker || !cell || cell.hole) return;
        const coord = [cell.reel0, cell.row0];
        if (posPicker.mode === 'single') {
          posPicker.selected = PosPicker.setSingle(posPicker.selected, coord);
        } else {
          posPicker.selected = PosPicker.toggleMulti(posPicker.selected, coord);
        }
        posPicker.holeWarn = PosPicker.hasHoleInSelection(posPicker.cells, posPicker.selected);
      }

      function posPickerClear() {
        posPicker.selected = [];
        posPicker.holeWarn = false;
      }

      function posPickerCancel() {
        posPicker.open = false;
        posPicker.actRef = null;
        posPicker.paramKey = '';
        posPicker.selected = [];
        posPicker.cells = [];
        posPicker.holeWarn = false;
      }

      function posPickerApply() {
        if (!PosPicker || !posPicker.actRef || !posPicker.paramKey) {
          posPickerCancel();
          return;
        }
        const text = posPicker.mode === 'single'
          ? PosPicker.formatPos(posPicker.selected[0] || null)
          : PosPicker.formatPositions(posPicker.selected);
        setActParam(posPicker.actRef, posPicker.paramKey, text);
        posPickerCancel();
      }
```

注意：`setActParam` 必須已在同一 setup 作用域定義；若定義順序在後，把這組函式放到 `setActParam` 之後。

- [ ] **Step 3: 在 setup `return { ... }` 導出**

於既有導出清單加入：

```javascript
        posPicker, openPosPicker, posPickerToggle, posPickerClear,
        posPickerCancel, posPickerApply, posPickerIsSelected, posPickerModeOf,
```

- [ ] **Step 4: 靜態確認導出存在**

```powershell
Select-String -Path js/config-editor/setup.js -Pattern "openPosPicker|posPickerApply|posPickerModeOf"
```

Expected: 至少 3 處命中（定義＋return）。

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/setup.js
git commit -m "feat(cfg): wire rule pos-picker state and apply/cancel handlers"
```

---

### Task 3: Template 按鈕＋modal＋CSS

**Files:**
- Modify: `js/config-editor/template.js`（主畫面 action params 約 L4476；ruleDlg params 約 L5119；並在檔案末段／其他 dialog 旁加一處共用 modal）
- Modify: `css/theme_additions.css`（檔案末尾追加）

**Interfaces:**
- Consumes: Task 2 導出的 `posPicker*` API
- Produces: 可點的選格 UI

- [ ] **Step 1: 主畫面 `pos` 輸入改為「文字＋選格」**

將（約 L4476）的：

```html
                    <!-- pos:格式 [reel,row] -->
                    <input v-else-if="param.type === 'pos'"
                           class="input cfg-mono input-w-id"
                           type="text"
                           :value="actParamValue(act, param.key)"
                           @input="setActParam(act, param.key, $event.target.value)"
                           :placeholder="param.placeholder || '[0,1]'">
```

換成：

```html
                    <!-- pos:格式 [reel,row] + 選格 -->
                    <div v-else-if="param.type === 'pos'" class="cfg-pos-picker-field">
                      <input class="input cfg-mono input-w-id" type="text"
                             :value="actParamValue(act, param.key)"
                             @input="setActParam(act, param.key, $event.target.value)"
                             :placeholder="param.placeholder || '[0,1]'">
                      <button type="button" class="btn-pill cfg-pos-picker-btn"
                              @click="openPosPicker(act, param)" title="點選盤面格子">選格</button>
                    </div>
```

- [ ] **Step 2: 主畫面一般 text 中，對 `positions` 同樣加鈕**

在主畫面「text / auto」分支（約 L4504）改成先判斷 `positions`：

```html
                    <!-- positions:清單 + 選格 -->
                    <div v-else-if="param.key === 'positions'" class="cfg-pos-picker-field">
                      <input class="input cfg-mono" type="text"
                             :value="actParamValue(act, param.key)"
                             @input="setActParam(act, param.key, $event.target.value)"
                             :placeholder="param.placeholder">
                      <button type="button" class="btn-pill cfg-pos-picker-btn"
                              @click="openPosPicker(act, param)" title="點選盤面格子">選格</button>
                    </div>

                    <!-- text / auto -->
                    <input v-else
                           class="input cfg-mono"
                           type="text"
                           :value="actParamValue(act, param.key)"
                           @input="setActParam(act, param.key, $event.target.value)"
                           :placeholder="param.placeholder">
```

注意：`param.dyn`／`number` 分支順序不要打亂；`positions` 判斷必須在最終 `v-else` text 之前。

- [ ] **Step 3: ruleDlg 內同樣改 `pos` 與 `positions`（約 L5119 起）**

對 `ruleDlg.action` 做與 Step 1–2 相同結構，呼叫改為：

```html
@click="openPosPicker(ruleDlg.action, param)"
```

以及對應的 `actParamValue(ruleDlg.action, …)`／`setActParam(ruleDlg.action, …)`（維持既有寫法）。

- [ ] **Step 4: 在 template 加共用選格 modal（建議放在 `ruleDlg` mask 區塊之後）**

```html
        <!-- 規則動作座標選格小視窗 -->
        <div v-if="posPicker.open" class="cfg-modedlg-mask"
             @click.self="posPickerCancel()"
             @keydown.esc="posPickerCancel()">
          <div class="cfg-modedlg cfg-pos-picker-dlg" role="dialog"
               :aria-label="posPicker.mode === 'single' ? '選取位置' : '選取位置清單'">
            <div class="cfg-modedlg-title">
              {{ posPicker.mode === 'single' ? '選取位置' : '選取位置清單' }}
            </div>
            <div v-if="posPicker.holeWarn" class="cfg-warn cfg-warn-inline">
              既有座標含洞格；請改選後套用
            </div>
            <div v-if="!posPicker.cells.length" class="cfg-hint">尚未定義盤面結構，無法選格。</div>
            <div v-else class="cfg-pos-picker-grid" role="group" aria-label="盤面格子">
              <button v-for="cell in posPicker.cells"
                      :key="cell.reel0 + '-' + cell.row0"
                      type="button"
                      class="cfg-pos-picker-cell"
                      :class="{ selected: posPickerIsSelected(cell), hole: cell.hole }"
                      :disabled="cell.hole"
                      :title="cell.hole ? (cell.label + '（洞格）') : cell.label"
                      @click="posPickerToggle(cell)">
                {{ cell.label }}
              </button>
            </div>
            <div class="cfg-modedlg-actions">
              <button type="button" class="btn-pill" @click="posPickerCancel()">取消</button>
              <button type="button" class="btn-pill" @click="posPickerClear()">清除</button>
              <button type="button" class="btn-pill cfg-modedlg-confirm" @click="posPickerApply()">套用</button>
            </div>
          </div>
        </div>
```

- [ ] **Step 5: 追加 CSS 至 `css/theme_additions.css` 末尾**

```css
/* 規則動作座標選格小視窗 */
.cfg-pos-picker-field {
  display: flex;
  align-items: center;
  gap: var(--space-2, 6px);
  flex-wrap: wrap;
}
.cfg-pos-picker-btn {
  flex: 0 0 auto;
  white-space: nowrap;
}
.cfg-pos-picker-dlg {
  max-width: min(520px, 92vw);
}
.cfg-pos-picker-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2, 6px);
  max-height: 50vh;
  overflow: auto;
  padding: var(--space-2, 6px) 0;
}
.cfg-pos-picker-cell {
  min-width: 3.2rem;
  min-height: 2.4rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--border, #ccc);
  border-radius: var(--r-sm, 4px);
  background: var(--surface, #fff);
  color: var(--text, #222);
  font-family: var(--font-mono, ui-monospace, monospace);
  font-size: var(--fs-sm, 12px);
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
.cfg-pos-picker-cell:hover:not(:disabled) {
  background: var(--hover, rgba(0, 0, 0, 0.06));
}
.cfg-pos-picker-cell:active:not(:disabled) {
  background: var(--press, rgba(0, 0, 0, 0.1));
}
.cfg-pos-picker-cell.selected {
  border-color: var(--accent, #2a6);
  background: color-mix(in srgb, var(--accent, #2a6) 22%, transparent);
  font-weight: 600;
}
.cfg-pos-picker-cell.hole,
.cfg-pos-picker-cell:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  text-decoration: line-through;
}
@media (prefers-reduced-motion: reduce) {
  .cfg-pos-picker-cell { transition: none; }
}
```

- [ ] **Step 6: 靜態確認 template 含關鍵標記**

```powershell
Select-String -Path js/config-editor/template.js -Pattern "openPosPicker|cfg-pos-picker-grid|選取位置清單"
Select-String -Path css/theme_additions.css -Pattern "cfg-pos-picker-cell"
```

Expected: 皆有命中。

- [ ] **Step 7: Commit**

```powershell
git add js/config-editor/template.js css/theme_additions.css
git commit -m "feat(cfg): add rule action cell picker UI and styles"
```

---

### Task 4: 手動驗證（對照 spec Verification）

**Files:** 無碼更（僅驗證）

- [ ] **Step 1: 開啟 app，進入 A 設定檔編輯器 → 規則**

確認盤面結構已有至少 5×3 主輪（或載入既有專案）。

- [ ] **Step 2: `pos` 單選**

新增／編輯含 `MOVE` 或 `SWAP` 的規則 → 點 `from`／`a` 旁「選格」→ 選一格 → 套用 → 欄位為 `[r,c]`。

- [ ] **Step 3: `positions` 多選**

編輯 `BOARD_FILL`／`STICKY` 等 → 點「選格」→ 多選兩格、取消一格 → 套用 → `[[…],…]` 順序正確。

- [ ] **Step 4: 預選與哨兵**

欄位先填 `[0,1]` 再開 → 該格反白。改填 `SELF` 再開 → 不預選；取消後仍為 `SELF`；再選格套用後覆寫為座標。

- [ ] **Step 5: 洞格**

若 layout 有洞：洞格 disabled；若舊座標落洞 → 出現警示文案。

- [ ] **Step 6: 雙入口**

規則主畫面參數列與「新增規則」對話框兩邊「選格」皆可用。

- [ ] **Step 7: Dark theme**

切暗色：modal／選中態可讀。

- [ ] **Step 8: 確認無回歸**

瀏覽器 console 無相關錯誤；既有座標 lint（越界／落洞）行為與改前一致。

（本 task 無額外 commit；若驗證中有小修，另開 fix commit。）

---

## Spec Coverage Checklist

| Spec 需求 | Task |
|-----------|------|
| `pos`／`positions` 旁選格鈕 | Task 3 |
| 單選／多選 | Task 1 + 2 |
| 文字欄＋選格；哨兵手填 | Task 3 |
| 開啟反白；套用才寫回 | Task 2 |
| layout 幾何；洞格不可選；主輪 only | Task 1 `buildCells` |
| 0-based 寫回格式 | Task 1 format* |
| 不改 02d／SPAWN／schema | 全域約束（無 task 觸及） |
| 主畫面＋ruleDlg | Task 3 |
| holeWarn | Task 2 + 3 |
| 驗證清單 | Task 4 |

## Self-Review Notes

- 無 TBD／placeholder
- `PosPicker.*` 名稱在 Task 1–3 一致
- `setActParam` 必須已存在於 setup（既有）；實作時注意函式宣告順序
- 不規則 `y_offset`：`row0 = yoff + local`，與 `_coordIssue` 一致
