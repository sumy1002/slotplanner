# Rule Action 座標選格小視窗 — Design Spec

**Date:** 2026-07-17  
**Approach:** 1 — 輕量選格小視窗（不複用 layout 盤面編輯器）  
**Scope:** 規則動作參數的座標填寫 UX only

## Goal

讓使用者在設定規則動作的盤面座標時，不必手打 `[reel,row]`／`[[reel,row],…]`；改為點「選格」開啟小視窗、點選目前盤面格子，系統寫回既有字串格式。資料模型與匯出 schema 不變。

## Decisions (locked)

| Topic | Choice |
|-------|--------|
| 範圍 | 僅規則動作：`type: 'pos'` 與 `key: 'positions'` |
| 選取模式 | `pos` 單選；`positions` 多選（點一下切換選／取消） |
| 欄位形態 | 保留文字欄 + 旁側「選格」按鈕；哨兵（`SELF`／`RANDOM`／`BY_ATTR` 等）繼續手填 |
| 確認流程 | 開啟時反白既有可解析座標；按「套用」才寫回；「取消」不改文字 |
| 盤面來源 | 讀取目前 `02_Layout`／`layout`；洞格不可選；第一版只選主輪格 |
| 座標慣例 | 與既有 action lint 一致：0-based `[reel,row]`；`reel 0` = `reel_id 1` |

## Out of Scope

- 格子屬性 `02d_Cell_Attributes` 的 Reel／列 UI
- `SPAWN.cell`（`2,3`／`RANDOM` 格式）
- 複用 layout 的 `cfg-cv` 完整盤面編輯器
- 改資料模型、xlsx sheet、validation schema 語意
- 副盤格選取、框選拖曳、sentinel chip UI

## Interaction

1. 座標欄右側顯示「選格」按鈕（文字欄仍可手打）。
2. 點「選格」→ 開啟小 modal：
   - 標題：`選取位置`（單格）／`選取位置清單`（多格）
   - 中央依目前 `layout` 畫可點盤面格
   - 文字欄已有可解析座標 → 開啟時預先反白
   - 文字為哨兵／無法解析／空 → 從空白選取開始（關閉前不改文字）
3. 點格：
   - `pos`：單選；點另一格改選
   - `positions`：點一下選中、再點取消；順序＝點選順序
4. 底部：`取消`｜`清除`｜`套用`
   - 取消：關閉，不改文字欄
   - 清除：清空目前選取（尚未寫回）
   - 套用：寫回格式化字串後關閉
5. 洞格／遮罩外：灰掉、不可點

## Writeback & Parsing

**寫回字串（與現有 placeholder／lint 一致）：**

| 欄位 | 套用結果 |
|------|----------|
| `pos` | `[reel,row]`，例 `[0,1]`；未選 → `""` |
| `positions` | `[[reel,row],…]`，例 `[[0,1],[2,3]]`；0 格 → `""` |

**開啟時解析：**

- 可解析座標陣列 → 預選
- 哨兵／亂碼／空 → 不預選；取消後原字不變；套用才覆寫成座標

**邊界：**

- 舊值落洞：開啟可顯示警示，不強制刪；使用者改選後套用即可
- 不規則列數／`y_offset`：依 layout 真實幾何畫格；寫回 `row` 與 `_coordIssue` 同一套慣例
- 第一版不選副盤格（與現有 action 座標語意對齊）

## Implementation Seams

| File | Responsibility |
|------|----------------|
| `js/config-editor/template.js` | `pos`／`positions` 欄旁加「選格」；主畫面與規則對話框共用一個選格 modal |
| `js/config-editor/setup.js` | picker 狀態、開／關、點選、解析／格式化、套用寫回；複用 `_parsePositions`／`_coordIssue`／`_reelActiveRows` 語意 |
| CSS（`theme_additions.css` 或既有 module） | modal＋可點格子最小樣式（選中／洞格／hover） |
| `js/config-editor/helpers.js` | 原則不改 catalog；若以 `param.type`／`param.key` 判斷即可，則不動 |

**何時顯示選格鈕：**

- `param.type === 'pos'`，或
- `param.key === 'positions'`
- 鈕永遠顯示；哨兵仍手填文字欄

## Verification

1. `pos`：選一格 → 套用 → 欄位為 `[r,c]`
2. `positions`：多選／取消 → 套用 → `[[…],…]`；順序正確
3. 已有座標再開 → 正確反白
4. 哨兵字串開選格 → 不預選；取消後原字不變；套用才覆寫
5. 洞格點不到；既有座標 lint 行為不變
6. 規則主畫面與規則對話框兩邊按鈕皆可用
7. Dark theme 下 modal／選中態仍可讀

## Success Criteria

- 使用者可完全靠點選完成 `pos`／`positions` 座標填寫，不必記 0-based 慣例
- 既有手填與哨兵流程不破
- 零資料模型變更；匯出字串格式與今日 lint 相容
