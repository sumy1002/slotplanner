# 設定範本管理改彈窗 — Design Spec

**Date:** 2026-07-17  
**Approach:** 1 — 現有 `cfg-tpl-panel` 包成 overlay modal  
**Scope:** 呈現層 only（inline 整欄 → 中央彈窗）

## Goal

點頂部「範本」後，改以遮罩 + 中央彈窗顯示「設定範本管理」，不再在工具列下方撐開一整欄。搜尋、排序、存新範本、載入、比較、匯出、刪除、從 JSON 匯入等功能語意不變。

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| 呈現 | Overlay + 中央 modal（比照既有 `cfg-diff-overlay`） |
| 關閉 | ✕、Esc、點遮罩（`@click.self`） |
| 狀態 | 沿用 `showTemplatePanel`；不另開新 flag |
| 內容 | 現有 `cfg-tpl-panel` 內部結構原樣搬入 modal |
| 巢狀 modal | 範本比較、載入前差異預覽維持現狀，疊在範本彈窗之上 |
| Esc 優先序 | 巢狀已開 → 先關巢狀；否則關範本彈窗 |
| Teleport / 獨立元件 | 不做（YAGNI） |

## Out of Scope

- Templates API / localStorage 快照格式
- 存／載／匯入匯出／搜尋排序邏輯
- 拆成獨立 Vue 元件或掛到 `#filter-modal-root` 類 body portal
- 重設計清單 UI、空狀態、篩選列版面

## Interaction

1. 點「範本」→ `toggleTemplatePanel` 開啟 → 顯示半透明遮罩 + 中央彈窗。
2. 彈窗內操作與現況相同（存、載、比較、匯出、匯入等）。
3. 關閉途徑：
   - 點右上 ✕
   - 點遮罩空白處
   - 按 Esc（無巢狀 modal 時）
4. 開啟巢狀「範本比較」或「載入前差異預覽」時：
   - 視覺疊在範本彈窗之上（既有 z-index 關係）
   - Esc 先關巢狀，再關範本彈窗

## Implementation Touchpoints

| File | Change |
|------|--------|
| `js/config-editor/template.js` | 以 `cfg-tpl-overlay` 包住 `cfg-tpl-panel`；遮罩 `@click.self` 關閉 |
| `css/theme_additions.css` | overlay / modal 定位、寬高、max-height、z-index（低於巢狀 diff） |
| `js/config-editor/setup.js` | 全域 Esc 關閉範本彈窗，並尊重巢狀優先 |

不改：`aconfig-xlsx` Templates API、`helpers` diff 計算、既有 diff modal markup。

## Error Handling

- 無新錯誤路徑；既有 alert / status / confirm 行為不變。
- 關閉彈窗不清除搜尋字串或 `tplSaveOpen`（與現況收合面板一致；避免誤關後重填）。

## Acceptance

1. 點「範本」→ 中央彈窗；編輯區不被整欄撐開。
2. ✕ / Esc / 點遮罩可關。
3. 存、載、比較、匯出、匯入仍可用。
4. 開比較／載入預覽時，Esc 先關巢狀，再關範本彈窗。

## Testing

- 手動：上述 Acceptance 1–4。
- 若專案已有針對 template panel 的 DOM／行為測試，補一則「overlay 存在且 `showTemplatePanel` 控制顯示」即可；無既有測試則不新增測試框架。
