# SlotPlanner Pro — 專案指南與版本紀錄
**更新日期：** 2026-07-14
**使用說明：** 給新對話用。請將本檔與完整打包檔（`slotplanner_full_2026-07-14.zip`）帶入即可接續工作。

---

## 0. 一句話定位
純前端 Vue 3 CDN、無 build 的「規格描述 + A.xlsx 傳輸 + docgen 產出」工具。
本工具不執行任何玩法邏輯、不計算 RTP（全數交由外部下游模擬工具處理）。所有 mode 玩法欄位均為 additive 資料接線與 docgen 描述用途；無 `run.py`，無引擎執行框架。

---

## 1. 絕對鐵律 (不可違反)
*   **引擎五核**：`grid_engine`、`combo_engine`、`pay_resolver`、`logic_parser`、`reel_generator` (.py) 必須維持 byte-frozen（cmp vs pristine 必相同）。
*   **docgen.js 解凍條件**：僅限 UI 修改。凍結閘門為：docgen 輸出零 diff sweep（builder 三產物內容簽章不變），且 VBA blob `_CP_VBA_B64` 的 md5 必須保持 `b2f4ad96cd8a73efd11aedac5e1edfa6`。
*   **helpers.js 純函式區**：第 1–39 行與第 76 行以後 byte-frozen。僅 `ACTION_CATALOG`、`VAR_CATEGORIES` 與 TAB 常數區享有正式 scoped 豁免。
*   **A.xlsx 擴充原則**：一律 additive。新欄加在 sheet 尾部，舊檔安全降級，Python 端一律 by-name 讀取。永不改動既有欄序與欄名語意。
*   **LocalStorage 管控**：未授權禁止新增 LS 鍵值。於既有 LS 鍵內加欄位（additive）則允許。
*   **防呆診斷機制**：純靜態、非阻擋（warn / info）。不呼叫 `logic_parser`，不物化盤面。只提示邏輯上必然的衝突，絕不越界猜測。
*   **Layer C 洞格行為**：`cellsToReels` 邏輯為 block→allow（欄內挖洞合法，改用 cells 遮罩；欄與欄之間空欄視為斷欄非法）。
*   **探勘優於記憶**：動任何項目前，先用正確 ERE grep 實際程式碼確認完成度，工作樹常領先規格與記憶。

---

## 2. 資料夾與 CSS 架構 (部署必遵)
*   **config-editor 模組**：`slotplanner/js/config-editor/` 必須包含 `helpers.js`、`template.js`、`setup.js`、`index.js`，不可與其他 JS 平放。
*   **CSS 模組**：`slotplanner/css/modules/` 必須包含 `scrollbar.css`、`theme_v34.css`、`glass-overrides.css`。
*   **CSS 繼承**：`theme.css` 為根基 → `theme_additions.css`（append-only，並 @import 其他 module）。`glass-overrides.css` 需加 `#app` 前綴壓制 cascade。
*   **app.html 載入順序**：vue / exceljs / fflate / html2canvas → registry → mobile-gestures → game-spec → parser → xlsx → symbol → filter-modal → aconfig-xlsx → config-editor 模組 → docgen → bcompare → config-compare → app。
*   **Python 引擎 (`engine/`)**：網頁 App 不載入 Python。頂層扁平模組為 `core/` 的同步鏡像來源。

---

## 3. A.xlsx 契約與授權金鑰 (32+ Sheets)
*   **近期新增與變更表單**：
    *   `02_Layout`：新增 `Entry_Mode` / `Scroll_Dir`。
    *   `03f_Symbol_Appearance`：圖示分模式外觀。
    *   `05b_Mode_Grid_Range`：Megaways 逐模式盤面幾何條件式匯出。
    *   `07b_Gen_Limits` & `07c_Gen_Constraints`：產牌限制與結構化條件。
    *   `10_Discard`：新增 `Enabled` 棄牌開關。
    *   `15b_Symbol_Mults`：僅供匯出，無 reader，嚴禁添加 reader。
    *   `18_Gamble`：自 v8.6 起存在。
*   **已授權 LS 鍵**：所有 `slotplanner.aconfig.*`、`slotplanner.cfg.railPinned.v1`、`slotplanner.sym.cardOpen.v1`、`slotplanner.aconfig.jackpot.v1`、`slotplanner.aconfig.genLimits.v1`、`genConstraints.v1`。

---

## 4. 驗證閘門 (每批交付前必跑)
*   執行 `node --check` 檢查更動的 JS 檔。
*   確認引擎五核 byte-diff 完全相同。
*   執行 docgen 輸出零 diff sweep 與 VBA blob md5 驗證。
*   比對 `helpers.js` 純函式範圍，確保差異僅在豁免區。
*   執行全樹 diff。
*   執行 `node r1_roundtrip_test.js` 與 `r1b_tierB_test.js`（欄序免疫測試）。
*   執行 `layerC_cellsToReels_test.js`（14 案測試）。
*   執行型別測試：`type_normal_test.py` 與 `node type_export_map_test.js`。
*   執行 DSL golden 跨端測試（108 案，逐鍵相等）。
*   執行 `py_compile` 檢查 Python 模組。
*   核對 template 識別字與 setup return 之一致性（R-H3）。
*   核對 `<div>`、`<template>` 與 CSS 括弧平衡。

---

## 5. 當前狀態：所有頁面 Spec-Complete
| 頁面模組 | 狀態說明 |
| :--- | :--- |
| **盤面 Board** | v2 完整（含四工具、右鍵、單格卡、整輪選取、副輪四型、三缺口收官） |
| **圖示 Symbol** | 分模式外觀完成（全頁 spec-complete） |
| **押注 bet_config** | v2.0 完整（比倍描述、彩池反查、購買 warn、jackpots 併入、分頁重導） |
| **規則 / 中線 / 產牌** | 三 peer 完整、產牌結構化條件、棄牌重構完成 |
| **權重 weights** | W1–W5 全完成（矩陣編輯、色帶雙向、CLONE/MIRROR、分佈 peer） |
| **輸出 DocGen** | 全案預檢、設定檔比對、企劃書預覽與文件設定七段全完成 |
| **比較 bcompare** | 結果比較 / TXT 轉 XLSX 穩定 |
*注意：UI 變更已過自動閘門，但尚未實機驗收（需於瀏覽器實際點擊測試）。*

---

## 6. 本次更新摘要 (2026-07-14)
*   **圖示分模式外觀**：新增 `appear_per_mode` 與 `appear_by_mode`，建立 `03f_Symbol_Appearance` 表單。
*   **輸出頁三張卡**：完成全案預檢（補 segmented 篩選）、設定檔比對（新增 `config-compare.js` 拖放比對）、企劃書預覽（XSS 安全白名單就地預覽）。
*   **docgen.js 解凍**：凍結閘門正式切換為「輸出零 diff sweep + VBA blob md5 不變」。
*   **盤面 Board v2 收官**：洞字合規化（改為無效格/遮罩等）、進場/滾動與方向全層 additive 實作、機制篩選 v1（純靜態高亮 `02d` 格子屬性）。
*   **權重頁 W1–W5**：探勘證實全數功能皆已領先完成。
*   **Batch A 結案**：`type=NORMAL` 映射完成、`MOVE`/`BOARD_FILL` 靜態驗證就位、42-case 迴歸通過、修復 DSL golden harness。

---

## 7. 待辦與後續計畫 (Backlog)
*   **需實機驗收**：Layer C 冒煙 4 情境測試、全案預檢搬輸出頁持久卡。
*   **Teardown 研究**：Planet of the Apes 待 seed。Gemix、Tome of Madness、Castle Builder II 尚未開始（目前維持 hold 狀態）。
*   **已定調延後項目**：橫向捲軸/軌道系統（下個大版本）、行動版 UX 微調、圖示群組混合賠付動畫。
*   **可選 Polish (低價值)**：棄牌與硬約束冗餘檢查（僅限嚴格版）、硬約束名詞殘留清理（不主動改名）。

---

## 8. 關鍵開發守則 (R-H 系列)
*   **R-H1 (Mode 參照覆蓋)**：任何以 mode 名稱為鍵值的資料，在執行 renameMode 與 removeMode 時皆須連動覆蓋。
*   **R-H2 (跨元件符號變更)**：必須由使用者動作觸發，嚴格遵循 `read clone` → `modify` → `applyAll`（僅在 touched 時執行）。
*   **R-H3 (Vue 綁定契約)**：每個 template 識別字必須存在於 setup 元件的 return 區塊中。
*   **擴充哲學**：優先使用拼圖規則系統的通用原語（變數、謂詞、事件、atypes），拒絕開發一次性特例開關。
*   **Instructions 整併規則**：要求重整時，直接產出完整 ready-to-copy 檔案，移除重複段，修順序並保留所有本文。
*   **工作流紀律**：設計討論 → 確認方向 → 完整實作與過閘門 → 交付檔案至 outputs → 唯讀參照 project。僅修改該 feature 絕對必要的檔案。