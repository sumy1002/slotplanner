# 新增模式精靈 + 模式卡片區段化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「新增模式」改成三步精靈（共通／左勾右編／預覽），並讓模式卡片「玩法設定」只顯示 `enabled_sections`，其餘用「新增設定」補開。

**Architecture:** 新增純函式模組 `mode-sections.js`（區段 registry + `sectionsForKind` / `defaultEnabledSections` / `resolveEnabledSections`）。精靈與卡片共用同一份 registry。Dialog 用 `modeAddDlg.step`（1–3）與 draft 欄位；觸發條件複用既有 `modeCond`（掛在 draft mode 物件上）。卡片以 `v-if="modeSectionOn(m,'pay_type')"` 包既有表單區塊。

**Tech Stack:** Vue 3（ConfigEditor setup／template）、`window.SlotPlanner.ConfigEditor.ModeSections`、Node `assert` 單元測試、既有 `cfg-modedlg`／拼圖 builder／`cfg-chip` 視覺語言。

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-mode-add-wizard-sections-design.md`
- 固定 3 步；僅步驟 3 可「建立模式」
- 步驟 2 版面 **B**：左勾選、點列聚焦、右一次一區
- `mode.enabled_sections: string[]`；取消勾選只隱藏、值保留
- 舊檔無清單 → `resolveEnabledSections` 回該 kind 全部可用 id；首次增刪前先物化
- 觸發條件用完整拼圖 builder；觸發給付僅 SPIN 且非 NG
- 承接 OTHER／紅星／五選一既有行為
- 註釋繁體中文；CSS 禁 `transition: all`
- 本輪不做盤面／Megaways／引擎新行為／xlsx 欄位（modes 既有專案儲存即可）

## File Map

| File | Responsibility |
|------|----------------|
| `js/config-editor/mode-sections.js` | 區段 registry + 純函式 |
| `js/config-editor/mode-sections_test.js` | Node assert 單元測試 |
| `app.html` | 載入 `mode-sections.js`（在 `mode-kind.js` 之後） |
| `js/config-editor/setup.js` | 精靈 step／draft；卡片區段增刪；confirm 寫入 |
| `js/config-editor/template.js` | 三步彈窗；卡片 `v-if` +「新增設定」 |
| `css/theme_additions.css` | 精靈寬版、左右欄、步驟標、子選單 |

---

### Task 1: `mode-sections.js` registry + 單元測試

**Files:**
- Create: `js/config-editor/mode-sections.js`
- Create: `js/config-editor/mode-sections_test.js`
- Modify: `app.html`（script 載入）

**Interfaces:**
- Consumes: 無
- Produces: `window.SlotPlanner.ConfigEditor.ModeSections`：
  - `MODE_SETTING_SECTIONS: { id, label, kinds, fields, defaultFor }[]`
    - `kinds`: `string[]`；含 `'*'` 表示全部玩法
    - `defaultFor`: `string[]`（哪些 kind 預設勾）
  - `sectionsForKind(kind) → Section[]`
  - `defaultEnabledSections(kind) → string[]`
  - `resolveEnabledSections(m) → string[]` — `Array.isArray(m.enabled_sections)` 則回淺拷貝；否則回 `sectionsForKind(m.mode_kind).map(s => s.id)`
  - `materializeEnabledSections(m) → string[]` — 若尚非陣列，寫入 `m.enabled_sections = resolveEnabledSections(m)` 後回傳

- [ ] **Step 1: 寫失敗測試**

建立 `js/config-editor/mode-sections_test.js`：

```javascript
#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'mode-sections.js'), 'utf8'));
const MS = window.SlotPlanner.ConfigEditor.ModeSections;

const ids = s => s.map(x => x.id);
assert.ok(ids(MS.sectionsForKind('SPIN')).includes('pay_type'));
assert.ok(!ids(MS.sectionsForKind('SPIN')).includes('wheel'));
assert.ok(ids(MS.sectionsForKind('WHEEL')).includes('bonus_items'));
assert.ok(ids(MS.sectionsForKind('COLLECTION')).includes('collect'));

assert.deepStrictEqual(
  MS.defaultEnabledSections('SPIN').sort(),
  ['pay_type'].sort()
);
const col = MS.defaultEnabledSections('COLLECTION').sort();
assert.deepStrictEqual(col, ['bonus_items', 'collect', 'collect_target', 'hold_win'].sort());

assert.deepStrictEqual(
  MS.resolveEnabledSections({ mode_kind: 'SPIN', enabled_sections: ['cascade'] }),
  ['cascade']
);
const allSpin = ids(MS.sectionsForKind('SPIN')).sort();
assert.deepStrictEqual(
  MS.resolveEnabledSections({ mode_kind: 'SPIN' }).sort(),
  allSpin
);

const m = { mode_kind: 'PICK' };
const mat = MS.materializeEnabledSections(m);
assert.ok(Array.isArray(m.enabled_sections));
assert.deepStrictEqual(mat.sort(), ids(MS.sectionsForKind('PICK')).sort());

console.log('mode-sections_test: OK');
```

- [ ] **Step 2: 跑測試確認失敗**

```powershell
node js/config-editor/mode-sections_test.js
```

Expected: FAIL（找不到檔案或 `ModeSections` undefined）

- [ ] **Step 3: 寫最小實作**

建立 `js/config-editor/mode-sections.js`（catalog 對齊 spec 表格）：

```javascript
/* 模式玩法設定區段 registry（精靈第 2 步／卡片共用） */
(function () {
  'use strict';
  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const CE = (SP.ConfigEditor = SP.ConfigEditor || {});

  const ALL = '*';
  const MODE_SETTING_SECTIONS = [
    { id: 'pay_type', label: '賠付模型覆寫', kinds: ['SPIN', 'OTHER'], defaultFor: ['SPIN'],
      fields: ['pay_type_override'] },
    { id: 'multipliers', label: '倍數／封頂', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['reset_scope', 'stack_mode', 'cap_enabled', 'cap_value'] },
    { id: 'choice_group', label: '玩家擇一', kinds: [ALL], defaultFor: [],
      fields: ['choice_group'] },
    { id: 'hold_win', label: '鎖點重轉 Hold&Win', kinds: [ALL], defaultFor: ['COLLECTION'],
      fields: ['respin_base', 'respin_reset_on', 'respin_stop_cond'] },
    { id: 'collect', label: 'Hold&Win 收集設定', kinds: [ALL], defaultFor: ['COLLECTION'],
      fields: ['collect_enabled', 'respin_reset_symbol', 'grid_expand_in_collect', 'allow_persistent'] },
    { id: 'cascade', label: '消除連鎖', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['cascade_enabled', 'cascade_max_depth'] },
    { id: 'mult_compose', label: '倍數複合覆寫', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['mult_compose_override'] },
    { id: 'refill_track', label: '補盤路徑覆寫', kinds: ['SPIN', 'OTHER'], defaultFor: [],
      fields: ['refill_track_override'] },
    { id: 'wheel', label: '輪盤設定', kinds: ['WHEEL'], defaultFor: ['WHEEL'],
      fields: ['wheel_upgrade_to'] },
    { id: 'pick', label: '點點樂設定', kinds: ['PICK'], defaultFor: ['PICK'],
      fields: ['pick_count'] },
    { id: 'collect_target', label: '收集目標', kinds: ['COLLECTION'], defaultFor: ['COLLECTION'],
      fields: ['collect_target'] },
    { id: 'bonus_items', label: '獎項／分段／獎勵', kinds: ['WHEEL', 'PICK', 'COLLECTION'],
      defaultFor: ['WHEEL', 'PICK', 'COLLECTION'], fields: ['items'] },
  ];

  function kindMatch(kinds, kind) {
    return kinds.indexOf(ALL) >= 0 || kinds.indexOf(kind) >= 0;
  }

  function sectionsForKind(kind) {
    const k = kind || 'SPIN';
    return MODE_SETTING_SECTIONS.filter(s => kindMatch(s.kinds, k));
  }

  function defaultEnabledSections(kind) {
    const k = kind || 'SPIN';
    return sectionsForKind(k).filter(s => s.defaultFor.indexOf(k) >= 0).map(s => s.id);
  }

  function resolveEnabledSections(m) {
    if (m && Array.isArray(m.enabled_sections)) return m.enabled_sections.slice();
    return sectionsForKind(m && m.mode_kind).map(s => s.id);
  }

  function materializeEnabledSections(m) {
    if (!m) return [];
    if (!Array.isArray(m.enabled_sections)) {
      m.enabled_sections = resolveEnabledSections(m);
    }
    return m.enabled_sections;
  }

  CE.ModeSections = {
    MODE_SETTING_SECTIONS,
    sectionsForKind,
    defaultEnabledSections,
    resolveEnabledSections,
    materializeEnabledSections,
  };
})();
```

在 `app.html`、`mode-kind.js` 之後插入：

```html
<script defer src="js/config-editor/mode-sections.js"></script>
```

- [ ] **Step 4: 跑測試確認通過**

```powershell
node js/config-editor/mode-sections_test.js
```

Expected: `mode-sections_test: OK`

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/mode-sections.js js/config-editor/mode-sections_test.js app.html
git commit -m "feat(cfg): add mode-sections registry for enabled gameplay sections"
```

---

### Task 2: 卡片區段 API（setup）+ 物化增刪

**Files:**
- Modify: `js/config-editor/setup.js`（`_ensureModeGameplayFields` 旁、return 匯出）
- Modify: `js/config-editor/mode-sections_test.js`（可選：不動；本 task 以 setup 接線為主，延伸測 materialize 已在 Task 1）

**Interfaces:**
- Consumes: `ModeSections.*`
- Produces（setup scope／return）：
  - `modeSectionOn(m, id) → boolean`
  - `modeSectionList(m) → Section[]` — 該 kind 可用
  - `modeSectionAdd(m, id)` / `modeSectionRemove(m, id)` — 先 `materializeEnabledSections`
  - `modeSectionsAvailableToAdd(m) → Section[]` — 尚未在清單者

- [ ] **Step 1: 在 setup 取用 ModeSections 並實作 helpers**

在 `MODE_KIND_*`／`MK` 區塊附近（約 mode gameplay 區）加入：

```javascript
const MS = (window.SlotPlanner && window.SlotPlanner.ConfigEditor &&
            window.SlotPlanner.ConfigEditor.ModeSections) || {};

function modeSectionOn(m, id) {
  const list = MS.resolveEnabledSections ? MS.resolveEnabledSections(m) : [];
  return list.indexOf(id) >= 0;
}
function modeSectionList(m) {
  return MS.sectionsForKind ? MS.sectionsForKind(m && m.mode_kind) : [];
}
function modeSectionsAvailableToAdd(m) {
  const all = modeSectionList(m);
  const on = new Set(MS.resolveEnabledSections ? MS.resolveEnabledSections(m) : []);
  return all.filter(s => !on.has(s.id));
}
function modeSectionAdd(m, id) {
  if (!m || !id) return;
  const arr = MS.materializeEnabledSections
    ? MS.materializeEnabledSections(m)
    : (m.enabled_sections || (m.enabled_sections = []));
  if (arr.indexOf(id) < 0) arr.push(id);
}
function modeSectionRemove(m, id) {
  if (!m || !id) return;
  const arr = MS.materializeEnabledSections
    ? MS.materializeEnabledSections(m)
    : (m.enabled_sections || (m.enabled_sections = []));
  const i = arr.indexOf(id);
  if (i >= 0) arr.splice(i, 1);
  // 不清欄位值（spec）
}
```

**不要** 在 `_ensureModeGameplayFields` 裡強制寫 `enabled_sections = []`（缺省必須維持「全開」語意）。

- [ ] **Step 2: return 匯出**

在 return 物件與 mode 相關匯出旁加入：
`modeSectionOn`, `modeSectionList`, `modeSectionsAvailableToAdd`, `modeSectionAdd`, `modeSectionRemove`, 以及若 template 需要：`MS` 不直接匯出，用函式即可。

- [ ] **Step 3: 回歸既有 mode-kind 測試**

```powershell
node js/config-editor/mode-kind_test.js
node js/config-editor/mode-sections_test.js
```

Expected: 兩者 OK

- [ ] **Step 4: Commit**

```powershell
git add js/config-editor/setup.js
git commit -m "feat(cfg): wire mode section enable/disable helpers for mode cards"
```

---

### Task 3: 模式卡片 template — 只顯示已啟用區段 +「新增設定」

**Files:**
- Modify: `js/config-editor/template.js`（玩法設定卡約 L5489–5760）
- Modify: `css/theme_additions.css`（新增設定選單樣式）

**Interfaces:**
- Consumes: Task 2 helpers
- Produces: 無新 API

- [ ] **Step 1: 包 `v-if="modeSectionOn(m, …)"`**

對齊 registry id，把既有區塊包起來（保持控件不動，只加條件）：

| 區塊 | section id |
|------|------------|
| `pay_type_override` 欄 | `pay_type` |
| `reset_scope` / `stack_mode` / `cap_*`（在 spin-fields 內） | `multipliers` |
| `choice_group` | `choice_group` |
| Hold&Win respin 列 | `hold_win` |
| `collect_*` 網格 | `collect` |
| cascade | `cascade` |
| `mult_compose_override` | `mult_compose` |
| `refill_track_override` | `refill_track` |
| `wheel_upgrade_to` | `wheel` |
| `pick_count` | `pick` |
| `collect_target` | `collect_target` |
| `items` 獎項表（minigame 內） | `bonus_items` |

注意：`trigger_pays` 在卡片上屬 spin-fields，**不**進 registry（觸發給付屬步驟 1／觸發區語意；卡片維持既有顯示邏輯，或僅在 SPIN 且非 bonus 時顯示——沿用現況即可，本 task 不把 `trigger_pays` 塞進 `enabled_sections`）。

每個區段標題旁可加小型「移除」按鈕：`@click="modeSectionRemove(m, 'pay_type')"`（title：從卡片隱藏，值保留）。

- [ ] **Step 2: 「＋ 新增設定」子選單**

在玩法設定 `cfg-card-body` 底部（minigame 之後）：

```html
<div class="cfg-mode-add-section" v-if="modeSectionsAvailableToAdd(m).length">
  <button type="button" class="cfg-mode-add-btn cfg-btn-inline"
          @click="m._addSecOpen = !m._addSecOpen">
    <span style="font-size:14px">+</span> 新增設定
  </button>
  <div v-if="m._addSecOpen" class="cfg-mode-add-sec-menu">
    <button v-for="sec in modeSectionsAvailableToAdd(m)" :key="'addsec'+sec.id"
            type="button" class="cfg-mode-add-sec-item"
            @click="modeSectionAdd(m, sec.id); m._addSecOpen = false">
      {{ sec.label }}
    </button>
  </div>
</div>
```

（`_addSecOpen` 為 UI-only；不進匯出。若不想掛在 mode 上，改用 `reactive({})` keyed by mode name——優先用 setup 的 `modeAddSecOpen = reactive({})` 避免污染資料。）

**偏好實作：** setup 加 `const modeAddSecMenu = reactive({});`  
`function isModeAddSecOpen(m){ return !!modeAddSecMenu[modeCardKey(m)]; }`  
`function toggleModeAddSec(m){ const k=modeCardKey(m); modeAddSecMenu[k]=!modeAddSecMenu[k]; }`  
選完後關選單。

- [ ] **Step 3: CSS**

```css
#app .cfg-mode-add-sec-menu {
  margin-top: 8px;
  border: 1px dashed var(--border, #ccc);
  border-radius: 8px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 280px;
}
#app .cfg-mode-add-sec-item {
  text-align: left;
  background: transparent;
  border: 0;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  font: inherit;
}
#app .cfg-mode-add-sec-item:hover {
  background: var(--surface-2, #f3f3f3);
}
```

- [ ] **Step 4: 手動煙霧**

開啟既有專案模式卡：應仍看到全部區段（舊檔全開）。關掉「賠付模型」→ 隱藏且值還在；「新增設定」可加回。

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/template.js js/config-editor/setup.js css/theme_additions.css
git commit -m "feat(cfg): show only enabled mode sections with add-setting menu"
```

---

### Task 4: 精靈狀態機（setup）— step／draft／confirm

**Files:**
- Modify: `js/config-editor/setup.js`（`modeAddDlg` 區塊約 L1724–1801）

**Interfaces:**
- Consumes: `ModeKind`、`ModeSections`、`modeCond`、`makeMode`
- Produces:
  - `modeAddDlg` 擴充：`step`, `triggerOn`, `end_condition`, `unlock_requires`, `enabled_sections`, `focusSection`, `draftMode`, 以及各區段欄位暫存（見下）
  - `modeAddDlgNext` / `modeAddDlgBack` / `modeAddCanNext`
  - `modeAddDlgToggleSection(id)` / `modeAddDlgFocusSection(id)`
  - `modeAddDlgSections` computed、`modeAddDlgPreview` computed
  - `confirmAddModeDlg` 僅在 `step===3` 生效並寫入全部

- [ ] **Step 1: 擴充 `modeAddDlg` 與 reset**

```javascript
const modeAddDlg = reactive({
  open: false,
  step: 1,
  name: '',
  kind: 'SPIN',
  otherText: '',
  triggerOn: false,
  tpEnabled: false,
  tpRows: [],
  end_condition: '',
  unlock_requires: [],
  enabled_sections: [],
  focusSection: '',
  // 步驟 2 欄位暫存（建立時抄到 mode）
  pay_type_override: '',
  reset_scope: '',
  stack_mode: '',
  cap_enabled: '',
  cap_value: '',
  choice_group: '',
  respin_base: 0,
  respin_reset_on: '',
  respin_stop_cond: '',
  collect_enabled: false,
  respin_reset_symbol: '',
  grid_expand_in_collect: false,
  allow_persistent: false,
  cascade_enabled: false,
  cascade_max_depth: 0,
  mult_compose_override: '',
  refill_track_override: '',
  wheel_upgrade_to: '',
  pick_count: 0,
  collect_target: 0,
  items: [],
  draftMode: null, // { mode:'__MODE_ADD__', trigger_condition:'', … } 供 modeCond
});

function modeAddDlgResetDraftMode() {
  modeAddDlg.draftMode = {
    mode: '__MODE_ADD__',
    trigger_condition: '',
  };
  if (modeCond && modeCond.ensure) modeCond.ensure(modeAddDlg.draftMode);
}

function openAddModeDlg() {
  modeAddDlg.open = true;
  modeAddDlg.step = 1;
  modeAddDlg.name = '';
  modeAddDlg.kind = 'SPIN';
  modeAddDlg.otherText = '';
  modeAddDlg.triggerOn = false;
  modeAddDlg.tpEnabled = false;
  modeAddDlg.tpRows = [];
  modeAddDlg.end_condition = '';
  modeAddDlg.unlock_requires = [];
  modeAddDlg.enabled_sections = MS.defaultEnabledSections
    ? MS.defaultEnabledSections('SPIN') : ['pay_type'];
  modeAddDlg.focusSection = modeAddDlg.enabled_sections[0] || '';
  // 其餘欄位重設為空／0／false／[]
  modeAddDlg.pay_type_override = '';
  modeAddDlg.reset_scope = '';
  modeAddDlg.stack_mode = '';
  modeAddDlg.cap_enabled = '';
  modeAddDlg.cap_value = '';
  modeAddDlg.choice_group = '';
  modeAddDlg.respin_base = 0;
  modeAddDlg.respin_reset_on = '';
  modeAddDlg.respin_stop_cond = '';
  modeAddDlg.collect_enabled = false;
  modeAddDlg.respin_reset_symbol = '';
  modeAddDlg.grid_expand_in_collect = false;
  modeAddDlg.allow_persistent = false;
  modeAddDlg.cascade_enabled = false;
  modeAddDlg.cascade_max_depth = 0;
  modeAddDlg.mult_compose_override = '';
  modeAddDlg.refill_track_override = '';
  modeAddDlg.wheel_upgrade_to = '';
  modeAddDlg.pick_count = 0;
  modeAddDlg.collect_target = 0;
  modeAddDlg.items = [];
  modeAddDlgResetDraftMode();
  Vue.nextTick(() => {
    try { document.querySelector('.cfg-modedlg-name')?.focus(); } catch (e) { /* no-op */ }
  });
}
```

- [ ] **Step 2: 導覽與區段勾選**

```javascript
const modeAddCanNext = computed(() => {
  if (modeAddDlg.step === 1) return modeAddCanConfirm.value;
  return true; // 步驟 2 不強制勾選
});

function modeAddDlgApplyKindDefaults() {
  const kind = modeAddDlg.kind;
  modeAddDlg.enabled_sections = MS.defaultEnabledSections
    ? MS.defaultEnabledSections(kind) : [];
  modeAddDlg.focusSection = modeAddDlg.enabled_sections[0] || '';
}

function modeAddDlgNext() {
  if (!modeAddCanNext.value) return;
  if (modeAddDlg.step === 1) {
    modeAddDlgApplyKindDefaults();
    modeAddDlg.step = 2;
    return;
  }
  if (modeAddDlg.step === 2) modeAddDlg.step = 3;
}

function modeAddDlgBack() {
  if (modeAddDlg.step > 1) modeAddDlg.step -= 1;
}

function modeAddDlgToggleSection(id) {
  const arr = modeAddDlg.enabled_sections;
  const i = arr.indexOf(id);
  if (i >= 0) {
    arr.splice(i, 1);
    if (modeAddDlg.focusSection === id) {
      modeAddDlg.focusSection = arr[0] || '';
    }
  } else {
    arr.push(id);
    modeAddDlg.focusSection = id;
  }
}

function modeAddDlgFocusSection(id) {
  if (modeAddDlg.enabled_sections.indexOf(id) >= 0) {
    modeAddDlg.focusSection = id;
  }
}

const modeAddDlgSections = computed(() =>
  MS.sectionsForKind ? MS.sectionsForKind(modeAddDlg.kind) : []
);

const modeAddDlgPreview = computed(() => {
  const lines = [];
  lines.push(`名稱: ${modeAddDlg.name.trim() || '—'}`);
  lines.push(`玩法: ${modeAddDlg.kind}${modeAddDlg.kind === 'OTHER' ? ' / ' + modeAddDlg.otherText.trim() : ''}`);
  if (modeAddDlg.triggerOn) {
    const dsl = (modeAddDlg.draftMode && modeAddDlg.draftMode.trigger_condition) || '（空）';
    lines.push(`觸發條件: ${dsl}`);
    if (modeAddDlgTpVisible.value && modeAddDlg.tpEnabled) {
      lines.push(`觸發給付: ${modeAddDlg.tpRows.length} 列`);
    }
    if (modeAddDlg.end_condition) lines.push(`結束條件: ${modeAddDlg.end_condition}`);
    if (modeAddDlg.unlock_requires.length) {
      lines.push(`解鎖前提: ${modeAddDlg.unlock_requires.join(', ')}`);
    }
  } else {
    lines.push('觸發條件: 關');
  }
  lines.push('已啟用設定: ' + (modeAddDlg.enabled_sections.join(', ') || '（無）'));
  return lines;
});
```

玩法 chip 變更時：若仍在 step 1，可只更新 kind；進入 step 2 時再套預設（避免 step 2 中途改 kind——步驟 1 才選玩法，步驟 2 不提供改 kind）。

解鎖前提：步驟 1 用既有 `modeNames` chip 切換（暫存於 `modeAddDlg.unlock_requires`），邏輯可抄 `modeUnlockToggle` 但作用在 dlg 陣列。

- [ ] **Step 3: 改寫 `confirmAddModeDlg`**

```javascript
function confirmAddModeDlg() {
  if (modeAddDlg.step !== 3) return;
  if (!modeAddCanConfirm.value) return;
  const name = modeAddDlg.name.trim();
  if (name.includes('#')) {
    emit('status', { type: 'err', msg: `模式名稱不可含「#」(輪帶變體保留字元)` });
    return;
  }
  const m = makeMode(name);
  modes.push(m);
  _ensureModeGameplayFields(m);
  if (MK.applyModeAddKind) MK.applyModeAddKind(m, modeAddDlg.kind, modeAddDlg.otherText);
  else {
    m.mode_kind = modeAddDlg.kind;
    if (modeAddDlg.kind === 'OTHER') m.notes = modeAddDlg.otherText.trim();
  }

  if (modeAddDlg.triggerOn && modeAddDlg.draftMode) {
    m.trigger_condition = modeAddDlg.draftMode.trigger_condition || '';
    m.end_condition = modeAddDlg.end_condition || '';
    m.unlock_requires = modeAddDlg.unlock_requires.slice();
  }
  if (modeAddDlgTpVisible.value && modeAddDlg.tpEnabled) {
    m.trigger_pays = modeAddDlg.tpRows.map(r => ({
      scatter_count: Number(r.scatter_count) || 0,
      pay: Number(r.pay) || 0,
      grants_spins: Number(r.grants_spins) || 0,
    }));
    if (m.trigger_pays.length === 0) {
      m.trigger_pays.push({ scatter_count: 0, pay: 0, grants_spins: 0 });
    }
  }

  // 步驟 2 欄位：依 enabled_sections 對應 fields 從 dlg 抄到 m（未啟用也可抄，值保留策略；簡化：全部抄）
  const copyKeys = [
    'pay_type_override','reset_scope','stack_mode','cap_enabled','cap_value',
    'choice_group','respin_base','respin_reset_on','respin_stop_cond',
    'collect_enabled','respin_reset_symbol','grid_expand_in_collect','allow_persistent',
    'cascade_enabled','cascade_max_depth','mult_compose_override','refill_track_override',
    'wheel_upgrade_to','pick_count','collect_target',
  ];
  for (const k of copyKeys) m[k] = modeAddDlg[k];
  m.items = (modeAddDlg.items || []).map(it => Object.assign({}, it));
  m.enabled_sections = modeAddDlg.enabled_sections.slice();

  modeExpandedKey.value = modeCardKey(m);
  modeAddDlg.open = false;
  emit('status', { type: 'ok', msg: `已新增模式 ${name}` });
  Vue.nextTick(() => {
    try {
      const cards = document.querySelectorAll('.cfg-mode-card');
      const last = cards[cards.length - 1];
      if (last) last.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) { /* no-op */ }
  });
}
```

- [ ] **Step 4: return 匯出新函式／computed**

匯出：`modeAddDlgNext`, `modeAddDlgBack`, `modeAddCanNext`, `modeAddDlgToggleSection`, `modeAddDlgFocusSection`, `modeAddDlgSections`, `modeAddDlgPreview`, 以及步驟 1 解鎖 toggle（若有）。

- [ ] **Step 5: 跑單元測試 + Commit**

```powershell
node js/config-editor/mode-sections_test.js
node js/config-editor/mode-kind_test.js
```

```powershell
git add js/config-editor/setup.js
git commit -m "feat(cfg): multi-step mode-add dialog state and confirm write path"
```

---

### Task 5: 精靈 template + CSS（三步 UI）

**Files:**
- Modify: `js/config-editor/template.js`（`cfg-modedlg` 新增模式區塊約 L5773–5850）
- Modify: `css/theme_additions.css`

**Interfaces:**
- Consumes: Task 4 API、`modeCond`、既有 puzzle 控件模式（對齊規則彈窗／模式卡拼圖）

- [ ] **Step 1: 標題加步驟；依 `step` 切內容**

```html
<div class="cfg-modedlg-title">
  新增模式
  <span class="cfg-ruledlg-step">步驟 {{ modeAddDlg.step }} / 3</span>
</div>
```

**步驟 1：** 既有名稱／玩法／OTHER；其後：

```html
<div class="cfg-modedlg-field">
  <label class="cfg-label">觸發條件</label>
  <div class="cfg-chip-row">
    <button class="cfg-chip" :class="{ active: !modeAddDlg.triggerOn }"
            @click="modeAddDlg.triggerOn = false">關</button>
    <button class="cfg-chip" :class="{ active: modeAddDlg.triggerOn }"
            @click="modeAddDlg.triggerOn = true">開</button>
  </div>
  <template v-if="modeAddDlg.triggerOn && modeAddDlg.draftMode">
    <!-- 複用模式卡拼圖列：modeCond.*(modeAddDlg.draftMode) -->
    <!-- 觸發給付：沿用既有 modeAddDlgTpVisible / tpEnabled / tpRows -->
    <!-- end_condition input；unlock_requires chips（modeNames） -->
  </template>
</div>
```

拼圖 markup 從模式卡／`ruleDlg` 精簡複製（無釘選測試檢查器）。`modeCond.addRow(modeAddDlg.draftMode, 'AND')` 等。

**步驟 2：**

```html
<div class="cfg-modedlg-split" v-if="modeAddDlg.step === 2">
  <aside class="cfg-modedlg-sec-nav">
    <div class="cfg-label">可用設定</div>
    <label v-for="sec in modeAddDlgSections" :key="'mas'+sec.id"
           class="cfg-modedlg-sec-item"
           :class="{ focused: modeAddDlg.focusSection === sec.id && modeAddDlg.enabled_sections.includes(sec.id) }">
      <input type="checkbox"
             :checked="modeAddDlg.enabled_sections.includes(sec.id)"
             @change="modeAddDlgToggleSection(sec.id)">
      <span @click.prevent="modeAddDlgFocusSection(sec.id)">{{ sec.label }}</span>
    </label>
  </aside>
  <div class="cfg-modedlg-sec-pane">
    <div v-if="!modeAddDlg.focusSection" class="cfg-hint">勾選左側設定後在此編輯</div>
    <!-- 依 focusSection 顯示對應表單，v-model 綁 modeAddDlg.* -->
    <template v-if="modeAddDlg.focusSection === 'pay_type'">…pay_type_override…</template>
    <!-- multipliers / choice_group / hold_win / collect / … / bonus_items -->
  </div>
</div>
```

**步驟 3：**

```html
<div v-if="modeAddDlg.step === 3" class="cfg-modedlg-preview">
  <pre class="cfg-modedlg-preview-text">{{ modeAddDlgPreview.join('\n') }}</pre>
</div>
```

**底部 actions：**

```html
<div class="cfg-modedlg-actions">
  <button class="btn-pill" @click="modeAddDlg.open = false">取消</button>
  <button v-if="modeAddDlg.step > 1" class="btn-pill" @click="modeAddDlgBack">上一步</button>
  <button v-if="modeAddDlg.step < 3" class="btn-pill cfg-modedlg-confirm"
          :disabled="!modeAddCanNext" @click="modeAddDlgNext">下一步</button>
  <button v-else class="btn-pill cfg-modedlg-confirm"
          :disabled="!modeAddCanConfirm" @click="confirmAddModeDlg">建立模式</button>
</div>
```

彈窗外殼加 `cfg-modedlg-wide`（步驟 2 需要寬度）。

- [ ] **Step 2: CSS**

```css
#app .cfg-modedlg.cfg-modedlg-mode-add { width: min(720px, 100%); }
#app .cfg-modedlg-split {
  display: flex;
  gap: 12px;
  min-height: 280px;
  align-items: stretch;
}
#app .cfg-modedlg-sec-nav {
  width: 38%;
  flex: 0 0 38%;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 10px;
  overflow: auto;
  max-height: 420px;
}
#app .cfg-modedlg-sec-pane {
  flex: 1;
  border: 1px solid var(--border, #ddd);
  border-radius: 8px;
  padding: 12px;
  overflow: auto;
  max-height: 420px;
}
#app .cfg-modedlg-sec-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 6px;
  cursor: pointer;
}
#app .cfg-modedlg-sec-item.focused {
  background: var(--surface-2, #e8f0fe);
}
#app .cfg-modedlg-preview-text {
  white-space: pre-wrap;
  font-family: ui-monospace, monospace;
  font-size: 13px;
  margin: 0;
  padding: 12px;
  background: var(--surface-2, #fafafa);
  border-radius: 8px;
}
```

- [ ] **Step 3: 手動煙霧驗收**

1. 新增模式 → 步驟 1/3；開觸發 → 拼圖可編；下一步  
2. SPIN → 左有賠付模型預設勾；右編 pay_type；下一步  
3. 預覽文字正確；建立 → 卡片只顯示已勾區段  
4. 收集玩法 → 預設 Hold&Win／collect／目標／獎項  
5. OTHER 空白描述 → 下一步 disabled  

- [ ] **Step 4: Commit**

```powershell
git add js/config-editor/template.js css/theme_additions.css
git commit -m "feat(cfg): mode-add three-step wizard UI with section focus pane"
```

---

## Spec Coverage Checklist

| Spec 項目 | Task |
|-----------|------|
| 三步精靈／僅末頁建立 | Task 4–5 |
| 步驟 1 觸發巢狀＋完整拼圖 | Task 4–5 |
| 步驟 2 版面 B | Task 5 |
| registry catalog／預設勾 | Task 1 |
| `enabled_sections` 明確清單 | Task 1–4 |
| 取消勾選保留值 | Task 2–3 |
| 舊檔全開＋首次物化 | Task 1–2 |
| 卡片只顯示＋新增設定 | Task 3 |
| OTHER／紅星／tp 可見條件 | Task 4–5（沿用） |
| 單元測試 | Task 1（+ 回歸 kind） |
| xlsx 欄位 | **不做**（Global Constraints） |

## Self-Review Notes

- 無 TBD；xlsx 明確排除以免與「能加則加」歧義打架。
- `resolveEnabledSections` / `materializeEnabledSections` 簽名在 Task 1–4 一致。
- 步驟 2 欄位暫存掛在 `modeAddDlg` 上（非另造 schema）；confirm 一次抄入 mode。
- 拼圖掛 `draftMode` + 既有 `modeCond`，避免重寫 builder。

---

## Execution Handoff

Plan 完成後請選擇執行方式（見下則訊息）。
