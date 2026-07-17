# 設定範本管理改彈窗 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把「設定範本管理」從工具列下方整欄面板改成遮罩 + 中央彈窗；功能語意不變。

**Architecture:** 以既有 `cfg-diff-overlay` 模式包住 `cfg-tpl-panel`。抽出極小純函式處理 Esc 關閉優先序（巢狀 modal → 範本彈窗），供 Node assert 測試與 `setup.js` 共用。CSS 只改呈現層。

**Tech Stack:** Vue 3（既有 ConfigEditor template／setup）、既有 overlay modal 視覺語言、Node `assert` 單元測試。

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-template-panel-modal-design.md`
- Approach 1：不 Teleport、不拆獨立 Vue 元件
- 關閉：✕ / Esc / 點遮罩；Esc 優先關巢狀（`tplLoadPreviewOpen` → `diffOpen` → `showTemplatePanel`）
- 沿用 `showTemplatePanel`；不新增開關 flag
- 關閉不清除 `templateSearch` / `tplSaveOpen`
- 註釋用繁體中文；CSS 禁 `transition: all`
- 不改 Templates API、存／載／匯入匯出／搜尋排序邏輯

## File Map

| File | Responsibility |
|------|----------------|
| `js/config-editor/template-ui.js` | Esc 關閉優先序純函式 |
| `js/config-editor/template-ui_test.js` | Node assert 測試 |
| `app.html` | 在 `helpers.js` 之後載入 `template-ui.js` |
| `js/config-editor/template.js` | overlay 包住 panel；遮罩 `@click.self` |
| `css/theme_additions.css` | `.cfg-tpl-overlay` + panel 改 modal 尺寸 |
| `js/config-editor/setup.js` | 全域 Esc 呼叫純函式並套用結果 |

---

### Task 1: Esc 優先序純函式 + 測試

**Files:**
- Create: `js/config-editor/template-ui.js`
- Create: `js/config-editor/template-ui_test.js`
- Modify: `app.html`（script 載入）

**Interfaces:**
- Consumes: 無（不依賴 Vue）
- Produces: `window.SlotPlanner.ConfigEditor.TemplateUi.resolveTemplateEsc(state) → nextState`
  - 輸入／輸出皆為 plain object：`{ showTemplatePanel, diffOpen, tplLoadPreviewOpen }`（boolean）
  - 語意：若範本彈窗未開 → 原樣回傳；否則依序關 `tplLoadPreviewOpen` → `diffOpen` → `showTemplatePanel`（一次只關一層）

- [ ] **Step 1: 寫失敗測試**

建立 `js/config-editor/template-ui_test.js`：

```javascript
#!/usr/bin/env node
'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

global.window = {};
eval(fs.readFileSync(path.join(__dirname, 'template-ui.js'), 'utf8'));
const TU = window.SlotPlanner.ConfigEditor.TemplateUi;

const base = { showTemplatePanel: false, diffOpen: false, tplLoadPreviewOpen: false };
assert.deepStrictEqual(TU.resolveTemplateEsc(base), base);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: false }),
  { showTemplatePanel: false, diffOpen: false, tplLoadPreviewOpen: false }
);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: true, tplLoadPreviewOpen: false }),
  { showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: false }
);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: true, tplLoadPreviewOpen: true }),
  { showTemplatePanel: true, diffOpen: true, tplLoadPreviewOpen: false }
);

assert.deepStrictEqual(
  TU.resolveTemplateEsc({ showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: true }),
  { showTemplatePanel: true, diffOpen: false, tplLoadPreviewOpen: false }
);

console.log('template-ui_test: OK');
```

- [ ] **Step 2: 跑測試確認失敗**

Run:

```powershell
node js/config-editor/template-ui_test.js
```

Expected: FAIL（找不到檔案或 `TemplateUi` undefined）

- [ ] **Step 3: 寫最小實作**

建立 `js/config-editor/template-ui.js`：

```javascript
// 範本管理 UI 純邏輯（可 Node 測試）— Esc 關閉優先序
(function () {
  'use strict';
  const SP = (window.SlotPlanner = window.SlotPlanner || {});
  const CE = (SP.ConfigEditor = SP.ConfigEditor || {});

  /** 一次只關一層：載入預覽 → 比較 modal → 範本彈窗 */
  function resolveTemplateEsc(state) {
    const s = {
      showTemplatePanel: !!state.showTemplatePanel,
      diffOpen: !!state.diffOpen,
      tplLoadPreviewOpen: !!state.tplLoadPreviewOpen,
    };
    if (!s.showTemplatePanel) return s;
    if (s.tplLoadPreviewOpen) return { ...s, tplLoadPreviewOpen: false };
    if (s.diffOpen) return { ...s, diffOpen: false };
    return { ...s, showTemplatePanel: false };
  }

  CE.TemplateUi = { resolveTemplateEsc };
})();
```

在 `app.html` 於 `js/config-editor/helpers.js` 之後、`mode-kind.js` 之前（或 helpers 與 template 之間）加入：

```html
<script defer src="js/config-editor/template-ui.js"></script>
```

- [ ] **Step 4: 跑測試確認通過**

Run:

```powershell
node js/config-editor/template-ui_test.js
```

Expected: `template-ui_test: OK`

- [ ] **Step 5: Commit**

```powershell
git add js/config-editor/template-ui.js js/config-editor/template-ui_test.js app.html
git commit -m "feat(cfg): 範本彈窗 Esc 優先序純函式"
```

---

### Task 2: Markup — panel 包成 overlay

**Files:**
- Modify: `js/config-editor/template.js`（約 L287–394）

**Interfaces:**
- Consumes: 既有 `showTemplatePanel`
- Produces: DOM 結構 `.cfg-tpl-overlay` > `.cfg-tpl-panel`；遮罩 `@click.self` 關閉

- [ ] **Step 1: 改 template markup**

把現有區塊：

```html
  <!-- ── 範本管理面板(可折疊)── -->
  <div v-if="showTemplatePanel" class="cfg-tpl-panel">
    ...
  </div>
```

改成：

```html
  <!-- ── 範本管理彈窗 ── -->
  <div v-if="showTemplatePanel" class="cfg-tpl-overlay"
       @click.self="showTemplatePanel = false">
    <div class="cfg-tpl-panel" role="dialog" aria-modal="true" aria-label="設定範本管理">
      <div class="cfg-tpl-header">
        <span class="cfg-tpl-title">📋 設定範本管理</span>
        <span class="cfg-tpl-hint">把目前所有設定存為快照,可在不同設計案間切換</span>
        <button class="cfg-tpl-close" @click="showTemplatePanel = false" title="關閉">✕</button>
      </div>
      <!-- 其餘內容（篩選列／存檔／清單／匯入）原樣保留，不要改功能綁定 -->
    </div>
  </div>
```

重點：
- 外層新增 `cfg-tpl-overlay` + `@click.self="showTemplatePanel = false"`
- ✕ 的 `title` 由「收合面板」改「關閉」
- 內部 `v-model` / `@click` / `ref` 全部不動

- [ ] **Step 2: 手動煙霧檢查（尚未加 CSS 時可暫略視覺）**

開啟 `app.html` → 設定檔編輯器 → 點「範本」→ DevTools 應看到 `.cfg-tpl-overlay` 包住 `.cfg-tpl-panel`。

- [ ] **Step 3: Commit**

```powershell
git add js/config-editor/template.js
git commit -m "feat(cfg): 範本管理面板改為 overlay markup"
```

---

### Task 3: CSS — modal 定位與尺寸

**Files:**
- Modify: `css/theme_additions.css`（既有 `.cfg-tpl-panel` 約 L3519）

**Interfaces:**
- Consumes: Task 2 的 class 名稱
- Produces: fixed overlay（z-index **880**，低於 `.cfg-diff-overlay` 900 與 `.cfg-tpl-diff-overlay` 9999）

- [ ] **Step 1: 新增 overlay，並調整 panel**

在 `.cfg-tpl-panel` 規則**之前**插入：

```css
/* 範本管理：整欄 → 中央彈窗 */
.cfg-tpl-overlay {
  position: fixed;
  inset: 0;
  z-index: 880; /* 低於 cfg-diff(900) / cfg-tpl-diff(9999) */
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(40, 36, 32, 0.38);
}
```

把既有 `.cfg-tpl-panel` 改為（保留內部子選擇器不動）：

```css
.cfg-tpl-panel {
  width: min(920px, 100%);
  max-height: min(82vh, 800px);
  margin-top: 0;
  padding: 14px 16px;
  background: var(--glass-5, rgba(255, 255, 255, 0.92));
  border: 1.5px solid var(--accent-brd);
  border-radius: var(--r-card);
  box-shadow: var(--shadow-xl);
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}
```

確認 `.cfg-tpl-list` 仍有 `overflow-y: auto`（既有約 `max-height: 320px`）；若清單在大彈窗內太矮，可改成：

```css
.cfg-tpl-list {
  /* ...既有 flex / gap 保留... */
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow-y: auto;
  padding-right: 4px;
}
```

- [ ] **Step 2: 手動驗收**

1. 點「範本」→ 中央彈窗，編輯區不被撐開  
2. 點遮罩／✕ 可關  
3. 開「比較」→ 比較 modal 應蓋在範本彈窗之上  
4. 開「載入」預覽 → 同上  

若 overlay 被 `card-shell` 的 `backdrop-filter` 吃掉定位：先把 `z-index` 提到 `980` 試；仍不行再回報（升級 Approach 2 Teleport），本 plan 預設不 Teleport。

- [ ] **Step 3: Commit**

```powershell
git add css/theme_additions.css
git commit -m "style(cfg): 範本管理彈窗 overlay 樣式"
```

---

### Task 4: setup.js 接上 Esc

**Files:**
- Modify: `js/config-editor/setup.js`（`_onGlobalKeydown`，約 L11152）

**Interfaces:**
- Consumes: `TemplateUi.resolveTemplateEsc`、`showTemplatePanel`、`diffOpen`、`tplLoadPreviewOpen`、`closeDiffModal`、`closeTemplateDiff`
- Produces: Esc 一次關一層

- [ ] **Step 1: 在 `_onGlobalKeydown` 加入 Esc 分支**

在既有 `shortcutsHelpOpen` Esc 處理**之前**（或合併進同一 `Escape` 區塊），加入：

```javascript
        // 範本彈窗 Esc：巢狀先關，再關範本（見 TemplateUi.resolveTemplateEsc）
        if (ev.key === 'Escape' && showTemplatePanel.value) {
          const TU = (window.SlotPlanner && window.SlotPlanner.ConfigEditor
            && window.SlotPlanner.ConfigEditor.TemplateUi) || null;
          const cur = {
            showTemplatePanel: showTemplatePanel.value,
            diffOpen: diffOpen.value,
            tplLoadPreviewOpen: tplLoadPreviewOpen.value,
          };
          const next = TU
            ? TU.resolveTemplateEsc(cur)
            : { ...cur, showTemplatePanel: false };
          if (next.tplLoadPreviewOpen !== cur.tplLoadPreviewOpen && !next.tplLoadPreviewOpen) {
            closeTemplateDiff();
          } else if (next.diffOpen !== cur.diffOpen && !next.diffOpen) {
            closeDiffModal();
          } else if (next.showTemplatePanel !== cur.showTemplatePanel) {
            showTemplatePanel.value = next.showTemplatePanel;
          }
          ev.preventDefault();
          return;
        }
```

注意：
- 當 `showTemplatePanel` 為 false 時，不攔截 Esc（留給其他 UI）
- 關閉巢狀時呼叫既有 `closeTemplateDiff` / `closeDiffModal`，不要只改 ref 而漏清其他狀態
- 關閉範本彈窗時只設 `showTemplatePanel = false`，不碰 `templateSearch` / `tplSaveOpen`

- [ ] **Step 2: 手動驗收 Esc**

1. 只開範本彈窗 → Esc → 關  
2. 範本 + 比較 → Esc → 只關比較；再 Esc → 關範本  
3. 範本 + 載入預覽 → Esc → 只關預覽；再 Esc → 關範本  

- [ ] **Step 3: 重跑純函式測試**

```powershell
node js/config-editor/template-ui_test.js
```

Expected: `template-ui_test: OK`

- [ ] **Step 4: Commit**

```powershell
git add js/config-editor/setup.js
git commit -m "feat(cfg): 範本彈窗支援 Esc 分層關閉"
```

---

## Spec Coverage Checklist

| Spec 要求 | Task |
|-----------|------|
| Overlay + 中央 modal | 2, 3 |
| ✕ / Esc / 點遮罩關閉 | 2, 3, 4 |
| 沿用 `showTemplatePanel` | 2, 4 |
| 內容結構原樣 | 2 |
| 巢狀 modal 疊上 | 3（z-index） |
| Esc 優先序 | 1, 4 |
| 不 Teleport / 不拆元件 | 全程 |
| 關閉不清除搜尋／存檔展開 | 4 |
| Acceptance 1–4 | Task 3–4 手動 |

## Self-Review

- 無 TBD／placeholder  
- `resolveTemplateEsc` 簽名在 Task 1／4 一致  
- z-index：880 < 900 < 9999，覆蓋巢狀疊層要求  
