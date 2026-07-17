# 新增模式彈窗 OTHER + UI 微調 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 調整「新增模式」彈窗：必填改紅 `*`、玩法大方向五選一單排，並支援 `OTHER`（自訂玩法必填寫入 `notes`）。

**Architecture:** 抽出極小純函式模組 `mode-kind.js`（`isBonusKind` / `modeAddCanConfirm` / `applyModeAddKind` + 選項常數）供 Node 測試與 Vue setup 共用。`setup.js` 接線 dialog 狀態；`template.js` 改 label／chip／OTHER 輸入；CSS 加紅星與單排 chip。

**Tech Stack:** Vue 3（既有 ConfigEditor setup／template）、`window.SlotPlanner.ConfigEditor.ModeKind`、Node `assert` 單元測試、既有 `cfg-modedlg`／`cfg-chip` 視覺語言。

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-mode-add-dlg-other-kind-design.md`
- `mode_kind='OTHER'`；自訂文字寫入既有 `m.notes`（不新增 schema 欄位）
- OTHER 不當 bonus；觸發給付僅 `kind === 'SPIN'` 顯示
- OTHER 玩法描述必填；空值時「建立模式」disabled
- 彈窗按鈕文案：SPIN、輪盤、點點樂、收集、其他
- 註釋用繁體中文；CSS 禁 `transition: all`
- 不改引擎模擬／xlsx 新欄位／模式卡片大改版

## File Map

| File | Responsibility |
|------|----------------|
| `js/config-editor/mode-kind.js` | 純函式＋`MODE_KIND_OPTIONS`／`MODE_KIND_LABEL` |
| `js/config-editor/mode-kind_test.js` | Node assert 單元測試 |
| `app.html` | 在 helpers 之後、template 之前載入 `mode-kind.js` |
| `js/config-editor/setup.js` | 改用 ModeKind；dialog `otherText`；confirm／canConfirm |
| `js/config-editor/template.js` | 紅 `*`、單排 chip、OTHER 輸入欄、confirm disabled |
| `css/theme_additions.css` | `.cfg-req`、`.cfg-modedlg-kind-row` |

---

### Task 1: 純函式模組 `mode-kind.js` + 測試

**Files:**
- Create: `js/config-editor/mode-kind.js`
- Create: `js/config-editor/mode-kind_test.js`
- Modify: `app.html`（script 載入）

**Interfaces:**
- Consumes: 無（不依賴 Vue／Helpers）
- Produces: `window.SlotPlanner.ConfigEditor.ModeKind` 含：
  - `MODE_KIND_OPTIONS: { v, label }[]` — 含 OTHER；label 為短文案
  - `MODE_KIND_LABEL: Record<string,string>`
  - `isBonusKind(m) → boolean` — 僅 WHEEL／PICK／COLLECTION
  - `modeAddCanConfirm({ name, nameTaken, kind, otherText }) → boolean`
  - `applyModeAddKind(m, kind, otherText) → m` — 設 `mode_kind`；OTHER 時設 `notes`

- [ ] **Step 1: 寫失敗測試**

建立 `js/config-editor/mode-kind_test.js`：

```javascript
#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'mode-kind.js'), 'utf8'));
const MK = window.SlotPlanner.ConfigEditor.ModeKind;

assert.ok(MK.MODE_KIND_OPTIONS.some(o => o.v === 'OTHER' && o.label === '其他'));
assert.strictEqual(MK.MODE_KIND_LABEL.PICK, '點點樂');
assert.strictEqual(MK.MODE_KIND_LABEL.WHEEL, '輪盤');

assert.strictEqual(MK.isBonusKind({ mode_kind: 'SPIN' }), false);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'OTHER' }), false);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'WHEEL' }), true);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'PICK' }), true);
assert.strictEqual(MK.isBonusKind({ mode_kind: 'COLLECTION' }), true);

assert.strictEqual(MK.modeAddCanConfirm({ name: '', nameTaken: false, kind: 'SPIN', otherText: '' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'FG', nameTaken: true, kind: 'SPIN', otherText: '' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'FG', nameTaken: false, kind: 'SPIN', otherText: '' }), true);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'BG', nameTaken: false, kind: 'OTHER', otherText: '' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'BG', nameTaken: false, kind: 'OTHER', otherText: '  ' }), false);
assert.strictEqual(MK.modeAddCanConfirm({ name: 'BG', nameTaken: false, kind: 'OTHER', otherText: '消除' }), true);

const m1 = { mode_kind: 'SPIN', notes: '' };
MK.applyModeAddKind(m1, 'WHEEL', '忽略');
assert.strictEqual(m1.mode_kind, 'WHEEL');
assert.strictEqual(m1.notes, '');

const m2 = { mode_kind: 'SPIN', notes: '' };
MK.applyModeAddKind(m2, 'OTHER', '  點點樂變體  ');
assert.strictEqual(m2.mode_kind, 'OTHER');
assert.strictEqual(m2.notes, '點點樂變體');

console.log('mode-kind_test: OK');
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```powershell
node js/config-editor/mode-kind_test.js
```

Expected: FAIL（找不到 `mode-kind.js` 或 `ModeKind` undefined）

- [ ] **Step 3: 寫最小實作**

建立 `js/config-editor/mode-kind.js`：

```javascript
/* 玩法種類常數與新增模式彈窗純邏輯（可 Node 測試） */
(function () {
  'use strict';
  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const CE = (SP.ConfigEditor = SP.ConfigEditor || {});

  const MODE_KIND_OPTIONS = [
    { v: 'SPIN',       label: 'SPIN' },
    { v: 'WHEEL',      label: '輪盤' },
    { v: 'PICK',       label: '點點樂' },
    { v: 'COLLECTION', label: '收集' },
    { v: 'OTHER',      label: '其他' },
  ];
  const MODE_KIND_LABEL = Object.fromEntries(MODE_KIND_OPTIONS.map(o => [o.v, o.label]));
  const BONUS_KINDS = { WHEEL: 1, PICK: 1, COLLECTION: 1 };

  function isBonusKind(m) {
    return !!(m && BONUS_KINDS[m.mode_kind]);
  }

  function modeAddCanConfirm(dlg) {
    const name = String((dlg && dlg.name) || '').trim();
    if (!name || (dlg && dlg.nameTaken)) return false;
    if ((dlg && dlg.kind) === 'OTHER' && !String((dlg && dlg.otherText) || '').trim()) return false;
    return true;
  }

  function applyModeAddKind(m, kind, otherText) {
    m.mode_kind = kind;
    if (kind === 'OTHER') m.notes = String(otherText || '').trim();
    return m;
  }

  CE.ModeKind = {
    MODE_KIND_OPTIONS,
    MODE_KIND_LABEL,
    isBonusKind,
    modeAddCanConfirm,
    applyModeAddKind,
  };
})();
```

在 `app.html`、helpers 之後、template 之前插入：

```html
<script defer src="js/config-editor/mode-kind.js"></script>
```

- [ ] **Step 4: 跑測試確認通過**

Run:

```powershell
node js/config-editor/mode-kind_test.js
```

Expected: `mode-kind_test: OK`

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/mode-kind.js js/config-editor/mode-kind_test.js app.html
git commit -m "feat(cfg): add mode-kind helpers for OTHER and confirm rules"
```

---

### Task 2: 接線 `setup.js`（dialog 狀態 + confirm）

**Files:**
- Modify: `js/config-editor/setup.js`（`MODE_KIND_*`、`isBonusKind`、`modeAddDlg`、`confirmAddModeDlg`、return 匯出）

**Interfaces:**
- Consumes: `window.SlotPlanner.ConfigEditor.ModeKind`
- Produces:
  - `modeAddDlg` 多 `otherText: ''`
  - `modeAddCanConfirm` computed（包 `ModeKind.modeAddCanConfirm` + `modeAddDlgNameTaken`）
  - `confirmAddModeDlg` 經 `applyModeAddKind` 寫入
  - 既有匯出名 `MODE_KIND_OPTIONS`／`MODE_KIND_LABEL`／`isBonusKind` 改指向 ModeKind（template 不改呼叫名）

- [ ] **Step 1: 寫失敗測試（行為契約 — 延伸 Task 1 既有 assert 即可；本 task 以 setup 接線為主）**

先確認 Task 1 測試仍綠：

```powershell
node js/config-editor/mode-kind_test.js
```

Expected: PASS

本 task 無新純函式；以手動／後續 UI 驗收為主。若要加回歸，可在 `mode-kind_test.js` 再加一筆「非 OTHER 不覆寫 notes」——Task 1 已含。

- [ ] **Step 2: 改 `setup.js` 取用 ModeKind**

在 `MODE_KIND_OPTIONS`／`MODE_KIND_LABEL`／`isBonusKind` 定義處（約 L4284–4291）改為：

```javascript
const MK = (window.SlotPlanner && window.SlotPlanner.ConfigEditor &&
            window.SlotPlanner.ConfigEditor.ModeKind) || {};
const MODE_KIND_OPTIONS = MK.MODE_KIND_OPTIONS || [
  { v: 'SPIN', label: 'SPIN' },
  { v: 'WHEEL', label: '輪盤' },
  { v: 'PICK', label: '點點樂' },
  { v: 'COLLECTION', label: '收集' },
  { v: 'OTHER', label: '其他' },
];
const MODE_KIND_LABEL = MK.MODE_KIND_LABEL || {
  SPIN: 'SPIN', WHEEL: '輪盤', PICK: '點點樂', COLLECTION: '收集', OTHER: '其他',
};
function isBonusKind(m) {
  return MK.isBonusKind ? MK.isBonusKind(m)
    : !!(m && (m.mode_kind === 'WHEEL' || m.mode_kind === 'PICK' || m.mode_kind === 'COLLECTION'));
}
```

刪除舊的四選一常數與 `mode_kind !== 'SPIN'` 版 `isBonusKind`。

- [ ] **Step 3: 擴充 `modeAddDlg` + confirm**

`modeAddDlg` reactive：

```javascript
const modeAddDlg = reactive({
  open: false, name: '', kind: 'SPIN', otherText: '', tpEnabled: false, tpRows: [],
});
```

`openAddModeDlg` 重置時加 `modeAddDlg.otherText = '';`。

新增 computed（放在 `modeAddDlgNameTaken` 附近）：

```javascript
const modeAddCanConfirm = computed(() => {
  const fn = MK.modeAddCanConfirm;
  if (!fn) {
    const n = modeAddDlg.name.trim();
    if (!n || modeAddDlgNameTaken.value) return false;
    if (modeAddDlg.kind === 'OTHER' && !modeAddDlg.otherText.trim()) return false;
    return true;
  }
  return fn({
    name: modeAddDlg.name,
    nameTaken: modeAddDlgNameTaken.value,
    kind: modeAddDlg.kind,
    otherText: modeAddDlg.otherText,
  });
});
```

`confirmAddModeDlg` 開頭改為：

```javascript
if (!modeAddCanConfirm.value) return;
```

寫入種類處（原 `m.mode_kind = modeAddDlg.kind`）改為：

```javascript
if (MK.applyModeAddKind) {
  MK.applyModeAddKind(m, modeAddDlg.kind, modeAddDlg.otherText);
} else {
  m.mode_kind = modeAddDlg.kind;
  if (modeAddDlg.kind === 'OTHER') m.notes = modeAddDlg.otherText.trim();
}
```

`_ensureModeGameplayFields` 註解可改為含 OTHER；邏輯維持空值才預設 SPIN（不碰已是 OTHER 的值）。

- [ ] **Step 4: return 匯出 `modeAddCanConfirm`**

在 return 物件約 L12386 附近，與 `modeAddDlgNameTaken` 同區加上 `modeAddCanConfirm`。

- [ ] **Step 5: 再跑單元測試 + Commit**

```powershell
node js/config-editor/mode-kind_test.js
```

Expected: PASS

```powershell
git add js/config-editor/setup.js
git commit -m "feat(cfg): wire mode-add dialog OTHER kind and confirm gate"
```

---

### Task 3: Template + CSS（紅星、單排、OTHER 輸入）

**Files:**
- Modify: `js/config-editor/template.js`（新增模式彈窗區塊約 L5777–5843）
- Modify: `css/theme_additions.css`（`#3 新增模式彈窗` 區塊附近）

**Interfaces:**
- Consumes: `MODE_KIND_OPTIONS`、`modeAddDlg.otherText`、`modeAddCanConfirm`
- Produces: 無新 API

- [ ] **Step 1: 改 template 彈窗**

模式名稱 label：

```html
<label class="cfg-label">模式名稱 <span class="cfg-req" aria-hidden="true">*</span></label>
```

玩法大方向區塊改為：

```html
<div class="cfg-modedlg-field">
  <label class="cfg-label">玩法大方向 <span class="cfg-key">mode_kind</span></label>
  <div class="cfg-chip-row cfg-modedlg-kind-row">
    <button v-for="opt in MODE_KIND_OPTIONS" :key="opt.v"
            class="cfg-chip" :class="{ active: modeAddDlg.kind === opt.v }"
            @click="modeAddDlg.kind = opt.v">{{ opt.label }}</button>
  </div>
  <div v-if="modeAddDlg.kind === 'OTHER'" class="cfg-modedlg-other" style="margin-top:10px;">
    <label class="cfg-label">玩法描述 <span class="cfg-req" aria-hidden="true">*</span></label>
    <input class="input" type="text" v-model.trim="modeAddDlg.otherText"
           placeholder="例：消除 / 過關" maxlength="80"
           @keyup.enter="confirmAddModeDlg">
  </div>
  <div class="cfg-hint">確認後主畫面的模式卡片會依此顯示對應內容;之後仍可在卡片內調整。</div>
</div>
```

建立按鈕 disabled：

```html
<button class="btn-pill cfg-modedlg-confirm"
        :disabled="!modeAddCanConfirm"
        @click="confirmAddModeDlg">建立模式</button>
```

- [ ] **Step 2: 加 CSS**

在 `#app .cfg-modedlg-actions` 區塊附近加入：

```css
#app .cfg-req {
  color: var(--danger-text);
  font-weight: 700;
  margin-left: 2px;
}
#app .cfg-modedlg-kind-row {
  flex-wrap: nowrap;
  gap: 6px;
}
#app .cfg-modedlg-kind-row .cfg-chip {
  padding: 6px 10px;
  white-space: nowrap;
  flex: 0 0 auto;
}
#app .cfg-modedlg-other .input {
  width: 100%;
  max-width: 100%;
}
```

必要時略增 `#app .cfg-modedlg` 寬度上限（例如 `min(600px, 100%)`）以免五顆 chip 擠壓。

- [ ] **Step 3: 手動煙霧驗收（瀏覽器）**

開啟 Config Editor → 規則／模式 → 新增模式：

1. 「模式名稱」旁為紅 `*`，無灰底「必填」
2. 五顆按鈕單排：SPIN、輪盤、點點樂、收集、其他
3. 選其他 → 出現必填輸入；空白時建立鈕 disabled
4. 填「消除」→ 可建立；新卡 `mode_kind=OTHER`、notes「消除」、無 bonus 獎項表
5. 選 SPIN／輪盤等 → OTHER 輸入消失；建立後 kind 正確

- [ ] **Step 4: Commit**

```powershell
git add js/config-editor/template.js css/theme_additions.css
git commit -m "feat(cfg): mode-add dialog red asterisk, one-row kinds, OTHER input"
```

---

## Spec Coverage Checklist

| Spec 項目 | Task |
|-----------|------|
| 必填紅 `*` | Task 3 |
| 按鈕文案五選一 | Task 1 常數 + Task 3 |
| 單排 chip | Task 3 CSS |
| OTHER → mode_kind + notes | Task 1 + Task 2 |
| OTHER 描述必填／disabled | Task 1 + Task 2 + Task 3 |
| isBonusKind 不含 OTHER | Task 1 + Task 2 |
| 觸發給付僅 SPIN | 既有 `modeAddDlgTpVisible`（不變） |
| 卡片下拉含 OTHER | Task 1 `MODE_KIND_OPTIONS` 經 setup 匯出 |
| 單元測試 | Task 1 |

## Self-Review Notes

- 無 TBD／placeholder。
- `modeAddCanConfirm`／`applyModeAddKind` 簽名在 Task 1–3 一致。
- Fallback 分支（MK 未載入）僅防呆，正式路徑靠 `app.html` script 順序。
