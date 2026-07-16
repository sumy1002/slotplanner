# Shared UI Token Polish — Design Spec

**Date:** 2026-07-16  
**Scope:** A — 全站共用元件（design tokens + shared classes）  
**Approach:** 1 — Token 加深（最短路徑、全站生效）  
**Skills applied:** `frontend-design`, `web-design-guidelines`, `improve-codebase-architecture`

## Goal

提升 SlotPlanner 共用介面的呼吸感、視覺層級與互動回饋，同時保持現有 Clean 靛紫語言與模組邊界不變。

## Architecture

- **單一加深點：** `css/theme.css` 的 `:root` design tokens。
- **消費者：** 既有共用 class（`.btn-glass`、`.btn*`、`.btn-pill`、`.input`、`.field-label`、`.card-shell`）改吃 token，不新增 CSS 檔、不改業務 JS / HTML。
- **Locality：** 間距／字級／圓角決策集中在 token；頁面專用（`cfg-*`）覆寫不在本次範圍。
- **Deletion test：** 不引入 interaction mixin 或第二層狀態系統；方案 1 刻意不做方案 2 的抽象。

## Token Changes

| Token | Before | After | Purpose |
|-------|--------|-------|---------|
| `--space-4` | 12px | 14px | 卡片間／欄位間略鬆 |
| `--space-5` | 16px | 18px | 區塊內邊距 |
| `--space-6` | 24px | 28px | 內容區留白 |
| `--space-7` | 32px | 36px | 版面級留白 |
| `--r-xs` | 6px | 8px | 柔和小圓角 |
| `--r-sm` | 8px | 10px | 輸入／小元件 |
| `--r-md` | 10px | 12px | 按鈕預設 |
| `--r-lg` | 14px | 16px | 卡片 |
| `--r-xl` | 18px | 22px | 大面板 |
| `--fs-xs` | 12px | 13px | 最小可讀字地板 |
| `--fs-sm` | 13px | 14px | 按鈕／輸入 |
| `--fs-base` | 14px | 15px | 一般內文 |
| `--fs-md` | 15px | 16px | 強調／卡片標題 |
| `--fs-lg` | 16px | 18px | 區塊標題 |
| `--fs-xl` | 20px | 22px | 頁面級標題 |
| `body` font-size | 14px | 15px | 對齊 `--fs-base` |

**Unchanged:** `--space-1`～`--space-3`（表格／矩陣內仍緊湊）、色彩 palette、`--r-pill`。

Alias 行為不變：`--r-card` / `--r-btn` / `--r-input` 繼續指向對應 `--r-*`。

## Shared Component Interaction

Apply in `css/theme.css` only.

### Buttons (`.btn-glass`, `.btn`, `.btn-primary`, `.btn-secondary`, `.btn-danger`, `.btn-browse`, `.btn-pill`)

- Font size → `var(--fs-sm)`（small 變體用 `var(--fs-xs)`）。
- **Hover:** background → `--hover` 或 `--glass-4`；輕微 `translateY(-1px)`；shadow 升一階。
- **Active (pressed):** `scale(0.97)`；background → `--press`（適用處）；shadow 降回。
- **Focus:** 保留既有 `:focus-visible` + `--focus-ring`；禁止無替代的 `outline: none` 裸用（既有 focus-visible 路徑維持）。
- Transitions: 只列 `background`, `border-color`, `transform`, `box-shadow`（不用 `transition: all`）。

### Inputs (`.input`, `.input-sm`, `select.input`)

- Font size → `var(--fs-sm)` / small → `var(--fs-xs)`。
- Border radius → `var(--r-input)`。
- **Hover:** border-color 略加深（朝 `--input-focus-brd` 方向，但不搶 focus）。
- **Focus:** 維持現有 focus ring + 白底。

### Labels & shells

- `.field-label`: `font-size: var(--fs-base)`; `font-weight: 700`; 與 `.field-label-sm` 拉開層級。
- `.card-shell`: padding／gap 吃較大 `--space-*`；radius 吃新 `--r-*`。

### Motion / a11y (web-design-guidelines)

- Prefer compositor props (`transform` / `opacity` where used).
- Honor existing `prefers-reduced-motion` rules if present; do not add heavy animation.
- Interactive states must increase contrast vs idle.

## Out of Scope

- `cfg-*` 專用覆寫與設定編輯器結構改版
- 業務 JS / Vue template / HTML 結構
- 新色票、新依賴、新 CSS 模組檔
- Reel／矩陣密排內部間距（`--space-1`～`3`）
- 方案 2 的共用 interaction mixin 系統

## Verification

1. 開啟 `app.html`，目測共用按鈕／輸入／標籤字級變大、圓角更圓、區塊間距略增。
2. 滑鼠 Hover／按下按鈕與輸入框：有可感知但克制的狀態變化；鍵盤 Tab 仍見 focus ring。
3. 暗色模式（若啟用）：token 覆寫路徑仍正常（只動亮色 `:root` 數值時，暗色變數不受影響）。
4. 密排表格／reel 矩陣未明顯「撐開」到難用。

## Success Criteria

- 重要設定標籤（`.field-label`）一眼可辨，不再與次要說明混在同一字級。
- 按鈕與輸入有一致的 Hover／Pressed 回饋。
- 全站透過 token 生效，無業務邏輯 diff。
}