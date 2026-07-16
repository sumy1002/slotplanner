# Shared UI Token Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 透過加深 `css/theme.css` 的 design tokens 與共用元件狀態，提升全站呼吸感、字級層級與 Hover／Pressed 回饋。

**Architecture:** 單一加深點在 `:root` tokens；`.btn*` / `.input` / `.field-label` / `.card-shell`（及外殼 `.app`）改吃 token 並對齊互動狀態。不新增 CSS 檔、不改 JS／HTML、不動 `cfg-*` 專用覆寫。

**Tech Stack:** 純 CSS（`css/theme.css`）；驗證用 PowerShell `Select-String`／瀏覽器目測。

## Global Constraints

- Scope A only：全站共用元件，見 `docs/superpowers/specs/2026-07-16-shared-ui-token-polish-design.md`
- Approach 1：Token 加深；不做 interaction mixin 系統
- 不改 `--space-1`～`--space-3`、色彩 palette、`--r-pill`
- Transitions 只列 `background`, `border-color`, `transform`, `box-shadow`（禁用 `transition: all`）
- 註釋使用繁體中文
- 僅修改 `css/theme.css`（外加本 plan／必要時修正 spec 尾端多餘字元）

## File Map

| File | Responsibility |
|------|----------------|
| `css/theme.css` | `:root` tokens、body font-size、共用按鈕／輸入／標籤／外殼樣式 |
| `docs/superpowers/specs/2026-07-16-shared-ui-token-polish-design.md` | 已核准 spec（若尾端有 stray `}` 一併刪除） |

---

### Task 1: Design tokens + body font-size

**Files:**
- Modify: `css/theme.css`（`:root` 圓角／間距／字級區塊；`html, body`）
- Verify: PowerShell `Select-String` against `css/theme.css`

**Interfaces:**
- Consumes: 無
- Produces: 更新後的 `--r-*`、`--space-4..7`、`--fs-*`；`body` font-size = `15px`（對齊 `--fs-base`）

- [ ] **Step 1: 寫入失敗驗證基準（確認舊值仍在）**

Run:

```powershell
Select-String -Path css/theme.css -Pattern '--r-xs:\s+6px|--space-4:\s+12px|--fs-xs:\s+12px|font-size:\s+14px; color: var\(--text\)'
```

Expected: 至少各命中一筆（舊值仍存在）。

- [ ] **Step 2: 更新圓角 token**

將 `:root` 內圓角區塊改為：

```css
  /* ── 圓角階梯(v7.0 收斂得更俐落 → token polish:柔和一階)── */
  --r-xs:   8px;
  --r-sm:   10px;
  --r-md:   12px;
  --r-lg:   16px;
  --r-xl:   22px;
  --r-pill: 999px;

  /* 舊 token alias */
  --r-card:  var(--r-lg);
  --r-btn:   var(--r-md);
  --r-input: var(--r-sm);
```

- [ ] **Step 3: 更新間距與字級 token + body**

將間距／字級改為：

```css
  /* ── v9.0 / 硬核工作站大改版:間距刻度(外鬆內緊的統一單位)──
     1-3 給卡片內部(緊湊:格點/輸入框/表格列),4-8 給卡片之間與版面級留白(寬敞)。
     token polish:只加大 4–7,保留 1–3 密排。 */
  --space-1: 2px;
  --space-2: 4px;
  --space-3: 8px;
  --space-4: 14px;
  --space-5: 18px;
  --space-6: 28px;
  --space-7: 36px;
  --space-8: 48px;

  /* ── UI/UX 改版 P1 → token polish:字級地板再升一階 ──
     --fs-xs 是「最小可讀字」,不再有比它更小的內文/標籤文字。 */
  --fs-xs:   13px;
  --fs-sm:   14px;
  --fs-base: 15px;
  --fs-md:   16px;
  --fs-lg:   18px;
  --fs-xl:   22px;
```

並將 `html, body` 的 `font-size: 14px` 改為：

```css
  font-size: 15px; color: var(--text);
```

- [ ] **Step 4: 驗證新值已寫入、舊值已消失**

Run:

```powershell
Select-String -Path css/theme.css -Pattern '--r-xs:\s+8px|--space-4:\s+14px|--fs-xs:\s+13px|--fs-base:\s+15px'
Select-String -Path css/theme.css -Pattern '--r-xs:\s+6px|--space-4:\s+12px|--fs-xs:\s+12px' 
```

Expected: 第一行有命中；第二行無命中（或僅出現在註釋歷史文字中，不得出現在實際 token 賦值）。

- [ ] **Step 5: Commit**

```powershell
git add css/theme.css
git commit -m @"
polish: bump shared spacing, radius, and type tokens

"@
```

---

### Task 2: Button hover / pressed / type tokens

**Files:**
- Modify: `css/theme.css`（`.btn-glass` 家族、`.btn` alias、`.btn-pill`、`.btn-browse`）
- Verify: `Select-String` + 瀏覽器 Hover／Active 目測

**Interfaces:**
- Consumes: Task 1 的 `--fs-sm` / `--fs-xs` / `--r-*` / `--hover` / `--press`
- Produces: 共用按鈕一致的 Hover（`translateY(-1px)`）與 Active（`scale(0.97)`）

- [ ] **Step 1: 更新 `.btn-glass` 基礎與狀態**

將 `.btn-glass` 區塊改為（保留既有結構，對齊字級與互動）：

```css
.btn-glass {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  font-family: inherit; font-size: var(--fs-sm); font-weight: 600;
  padding: 0 16px; height: 36px;
  background: var(--glass-3);
  border: 0.5px solid var(--glass-edge);
  border-radius: var(--r-md);
  color: var(--text);
  cursor: pointer;
  box-shadow: var(--shadow-sm);
  transition: background var(--t-fast), border-color var(--t-fast),
              transform 120ms var(--ease-ios), box-shadow var(--t-fast);
  outline: none;
  user-select: none;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
}
.btn-glass:hover {
  background: var(--glass-4);
  border-color: rgba(255,255,255,0.95);
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}
.btn-glass:active {
  background: var(--press);
  transform: scale(0.97);
  transition-duration: 80ms;
  box-shadow: var(--shadow-sm);
}
.btn-glass:focus-visible {
  box-shadow: var(--focus-ring), var(--shadow-md);
}
.btn-glass:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  transform: none !important;
}
/* size 變體 */
.btn-glass.is-sm  { height: 28px; font-size: var(--fs-xs); padding: 0 12px; border-radius: var(--r-sm); }
.btn-glass.is-lg  { height: 44px; font-size: var(--fs-base); padding: 0 22px; }
.btn-glass.is-pill{ border-radius: var(--r-pill); }
.btn-glass.is-icon{ width: 36px; padding: 0; }
/* tone 變體 */
.btn-glass.is-primary { background: var(--accent); border-color: var(--accent-brd); color: var(--accent-text); }
.btn-glass.is-primary:hover { background: var(--hover); }
.btn-glass.is-primary:active { background: var(--press); }
.btn-glass.is-danger  { background: var(--danger); border-color: var(--danger-brd); color: var(--danger-text); }
.btn-glass.is-ghost   { background: transparent; box-shadow: none; border-color: transparent; }
.btn-glass.is-ghost:hover { background: var(--glass-3); border-color: var(--glass-edge); }
```

注意：檔案後半若已有 `.btn-glass.is-primary` 的 `!important` 覆寫（約 1006 行附近），保留該覆寫；本 task 只確保基礎狀態與字級一致，不要刪掉既有 primary 實色規則。

- [ ] **Step 2: 更新 `.btn` / primary / secondary / danger / browse**

將 hover 的 `translateY(-0.5px)` 一律改為 `translateY(-1px)`，active 一律 `scale(0.97)`，字級吃 token：

```css
.btn {
  font-family: inherit; font-size: var(--fs-sm); font-weight: 600;
  border-radius: var(--r-md); padding: 9px 18px;
  cursor: pointer; outline: none;
  transition: background var(--t-fast), border-color var(--t-fast),
              transform 120ms var(--ease-ios), box-shadow var(--t-fast);
  -webkit-tap-highlight-color: transparent;
}
.btn-primary {
  background: var(--accent); border: 0.5px solid var(--accent-brd); color: var(--accent-text);
  box-shadow: var(--shadow-md);
}
.btn-primary:hover  { background: var(--hover); border-color: var(--accent-brd); transform: translateY(-1px); box-shadow: var(--shadow-lg); }
.btn-primary:active { background: var(--press); transform: scale(0.97); box-shadow: var(--shadow-sm); }
.btn-primary:focus-visible { box-shadow: var(--focus-ring), var(--shadow-md); }
.btn-primary.big { padding: 12px 28px; font-size: var(--fs-base); }

.btn-secondary {
  background: var(--glass-3);
  border: 0.5px solid var(--glass-edge);
  color: var(--text);
  box-shadow: var(--shadow-md);
}
.btn-secondary:hover  { background: var(--glass-4); transform: translateY(-1px); box-shadow: var(--shadow-lg); }
.btn-secondary:active { background: var(--press); transform: scale(0.97); box-shadow: var(--shadow-sm); }
.btn-secondary:focus-visible { box-shadow: var(--focus-ring), var(--shadow-md); }

.btn-danger {
  background: var(--danger);
  border: 0.5px solid var(--danger-brd);
  color: var(--danger-text);
  box-shadow: var(--shadow-md);
}
.btn-danger:hover  { background: rgba(255,180,180,0.55); border-color: rgba(220,100,100,0.70); transform: translateY(-1px); }
.btn-danger:active { transform: scale(0.97); }
.btn-danger:focus-visible { box-shadow: 0 0 0 4px rgba(220,120,120,0.25), var(--shadow-md); }

.btn-browse {
  width: 44px; height: 42px; padding: 0; font-size: var(--fs-md);
  background: var(--glass-3);
  border: 0.5px solid var(--glass-edge);
  color: var(--accent-text);
  border-radius: var(--r-md);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  transition: background var(--t-fast), transform 120ms var(--ease-ios), box-shadow var(--t-fast);
}
.btn-browse:hover  { background: var(--glass-4); transform: translateY(-1px); box-shadow: var(--shadow-lg); }
.btn-browse:active { background: var(--press); transform: scale(0.97); box-shadow: var(--shadow-sm); }
```

- [ ] **Step 3: 更新 `.btn-pill`**

```css
.btn-pill {
  height: 32px; padding: 0 14px;
  border-radius: var(--r-md);
  background: var(--glass-3);
  border: 0.5px solid var(--glass-edge);
  color: var(--accent-text);
  font-size: var(--fs-sm); font-weight: 600; cursor: pointer;
  display: inline-flex; align-items: center; gap: 4px;
  box-shadow: var(--shadow-sm);
  transition: background var(--t-fast), border-color var(--t-fast),
              transform 120ms var(--ease-ios), box-shadow var(--t-fast);
  font-family: inherit;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}
.btn-pill:hover  { background: var(--glass-4); transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-pill:active { background: var(--press); transform: scale(0.97); }
.btn-pill:focus-visible { box-shadow: var(--focus-ring), var(--shadow-sm); }
```

保留既有 `.btn-pill:disabled`、`.btn-pill.add`、`.btn-pill.del` 規則。

- [ ] **Step 4: 驗證字級與 transform**

Run:

```powershell
Select-String -Path css/theme.css -Pattern 'btn-glass \{|\.btn-pill \{' -Context 0,8 | Select-Object -First 40
Select-String -Path css/theme.css -Pattern 'translateY\(-1px\)|scale\(0\.97\)' | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: `.btn-glass` / `.btn-pill` 使用 `var(--fs-sm)`；`translateY(-1px)` 與 `scale(0.97)` 各出現多次（≥ 4）。

- [ ] **Step 5: Commit**

```powershell
git add css/theme.css
git commit -m @"
polish: unify shared button hover and pressed feedback

"@
```

---

### Task 3: Inputs, labels, card shell spacing

**Files:**
- Modify: `css/theme.css`（`.input*`、`.field-label*`、`.app`、`.card-shell`）
- Verify: `Select-String` + `app.html` 目測

**Interfaces:**
- Consumes: Task 1 tokens
- Produces: 輸入 Hover 邊框回饋；標籤層級拉開；外殼留白吃 `--space-*`

- [ ] **Step 1: 更新 `.input` 與 `.input-sm`**

```css
.input {
  background: var(--input-bg);
  border: 0.5px solid var(--input-brd);
  border-radius: var(--r-input);
  padding: 0 12px; height: 42px;
  font-size: var(--fs-sm); color: var(--text);
  outline: none; font-family: inherit;
  box-shadow: var(--shadow-sm);
  transition: border-color var(--t-fast), background var(--t-fast), box-shadow var(--t-fast);
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
}
.input:hover:not(:disabled):not(:focus) {
  border-color: color-mix(in srgb, var(--input-focus-brd) 35%, var(--input-brd));
}
.input:focus {
  border-color: var(--input-focus-brd);
  background: var(--input-focus);
  box-shadow: var(--focus-ring), var(--shadow-sm);
}
.input.err {
  border-color: var(--input-err-brd);
  background: var(--input-err-bg);
}
.input:read-only { color: var(--text); }
.input:disabled {
  background: rgba(210,208,202,0.38);
  border-color: rgba(190,187,180,0.45);
  color: rgba(70,68,62,0.32);
  box-shadow: none;
}
.input-sm { height: 32px; font-size: var(--fs-xs); padding: 0 10px; }
```

若目標環境對 `color-mix` 有疑慮，改用固定色 `#c5c9e8`（亮模式接近 focus 靛的淡化邊）並在註釋標明：

```css
/* ponytail: color-mix 備援；暗色靠既有 --input-brd 對比仍可讀 */
.input:hover:not(:disabled):not(:focus) {
  border-color: #c5c9e8;
}
```

優先使用 `color-mix`（現代 Chromium／Firefox／Safari 皆支援）。

- [ ] **Step 2: 更新標籤層級**

```css
.field-label {
  font-size: var(--fs-base); font-weight: 700; color: var(--text);
  margin-bottom: 8px;
}
.field-label-sm {
  font-size: var(--fs-xs); color: var(--text-light);
  margin-bottom: 4px;
}
```

- [ ] **Step 3: 更新 `.app` 與 `.card-shell` 留白／圓角**

`.card-shell` 已使用 `border-radius: var(--r-lg)`（Task 1 自動生效）。將 `.app` 的硬編碼 padding 改吃 token，並為 `.card-shell` 加上與內容區一致的語意註釋（不強加會破壞 flex 佈局的內 padding）：

```css
.app {
  position: relative; z-index: 1;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-5);
  display: flex;
}

.card-shell {
  flex: 1;
  position: relative;
  background: var(--glass-2);
  border: 0.5px solid var(--glass-edge);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-xl);
  backdrop-filter: var(--blur-thick);
  -webkit-backdrop-filter: var(--blur-thick);
  display: flex;
  overflow: hidden;
}
```

- [ ] **Step 4: 確認 reduced-motion 規則仍在**

Run:

```powershell
Select-String -Path css/theme.css -Pattern 'prefers-reduced-motion' -Context 0,6
Select-String -Path css/theme.css -Pattern '\.input:hover|field-label \{|padding: var\(--space-5\)'
```

Expected: `prefers-reduced-motion` 區塊仍存在；`.input:hover`、`.field-label` 用 `var(--fs-base)`、`.app` 用 `var(--space-5)`。

- [ ] **Step 5: 瀏覽器目測清單**

開啟 `app.html`，確認：

1. 共用按鈕／輸入字級變大、圓角更圓、外殼留白略增  
2. Hover／Pressed 有回饋；Tab 仍見 focus ring  
3. 暗色模式切換後按鈕／輸入仍可讀  
4. Reel／矩陣密排未明顯撐壞（`--space-1..3` 未改）

- [ ] **Step 6: Commit**

```powershell
git add css/theme.css
git commit -m @"
polish: lift input hover, label hierarchy, and shell spacing

"@
```

---

### Task 4: Spec hygiene + final verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-shared-ui-token-polish-design.md`（若檔尾有 stray `}` 則刪除）
- Verify: git diff 範圍僅限 CSS（及上述 spec 修字）

- [ ] **Step 1: 移除 spec 檔尾多餘 `}`（若存在）**

開啟 spec，確認最後一行是成功準則條目，不得以單獨的 `}` 結尾。

- [ ] **Step 2: 確認 diff 不含 JS／HTML／cfg 專用大改**

Run:

```powershell
git diff --name-only HEAD~3..HEAD
```

Expected: 主要為 `css/theme.css` 與 docs；不得出現 `js/**` 業務邏輯改動（本 plan 執行期間）。

- [ ] **Step 3: Commit spec hygiene（僅在有變更時）**

```powershell
git add docs/superpowers/specs/2026-07-16-shared-ui-token-polish-design.md
git commit -m @"
docs: fix trailing character in shared UI polish spec

"@
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| `--space-4..7` 加大 | Task 1 |
| `--r-xs..xl` 柔和圓角 | Task 1 |
| `--fs-*` + body 15px | Task 1 |
| 按鈕 Hover／Pressed／token 字級 | Task 2 |
| 輸入 Hover／token 字級／`--r-input` | Task 3 |
| `.field-label` 層級 | Task 3 |
| `.card-shell`／外殼留白吃 token | Task 3 |
| 不動 space-1..3、palette、cfg-*、JS | Global Constraints + Task 4 |
| prefers-reduced-motion 保留 | Task 3 Step 4 |
| 無 `transition: all` | Task 2–3 明確列出屬性 |

## Self-Review Notes

- 無 TBD／placeholder steps  
- CSS 驗證以 `Select-String` 代替單元測試（repo 無 CSS test harness；符合 YAGNI）  
- `color-mix` 有備援路徑寫在 Task 3
}