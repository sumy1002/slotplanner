# 新增模式精靈 + 模式卡片區段化顯示

**Date:** 2026-07-17  
**Scope:** Config Editor「新增模式」彈窗（改為三步精靈）＋規則頁模式卡片「玩法設定」只顯示已啟用區段  
**Approach:** 單一 `MODE_SETTING_SECTIONS` registry + `mode.enabled_sections: string[]`  
**Skills applied:** `brainstorming`, visual companion  

## Goal

建立模式時用多步精靈一次設好共通與玩法相關欄位；建完後卡片不再一次攤開所有設定，只顯示使用者啟用的區段，其餘用「新增設定」補開。

## Decisions

| 項目 | 決定 |
|------|------|
| 精靈步數 | 固定 3 步；內容依玩法／觸發開關變化 |
| 建立按鈕 | 僅步驟 3；步驟 1–2 只有取消／上一步／下一步 |
| 步驟 2 版面 | **B**：左勾選啟用；點區段聚焦；右一次只編該區 |
| 區段真相來源 | 單一 registry；精靈、卡片、「新增設定」共用 |
| 啟用狀態 | 明確 `enabled_sections: string[]`（不做值推斷） |
| 取消勾選 | 只從清單移除（隱藏）；欄位值保留 |
| 舊資料無清單 | 視為該玩法「全部可用區段都開」，避免欄位突然消失 |
| 觸發條件 UI | 完整拼圖 builder（與模式卡片同級能力） |
| 第 2 頁深度 | 該玩法相關區段盡量完整（catalog 涵蓋現有玩法設定欄位） |
| 盤面／Megaways | 本輪不做 |

## Wizard Flow

```
步驟 1  名稱＊、玩法＊、觸發條件(開關)
        └ 開 → 拼圖 builder
             → 觸發給付(開關；僅 SPIN 且名稱非 NG)
             → 結束條件、解鎖前提
        [取消] [下一步]

步驟 2  左：該玩法可用區段勾選（含 kind 預設勾）
        右：目前聚焦且已勾區段的表單
        [取消] [上一步] [下一步]

步驟 3  純文字預覽（不可改）
        [取消] [上一步] [建立模式]
```

標題顯示 `步驟 N / 3`（沿用新增規則彈窗步驟標示風格）。

### 步驟 1 細節

- 模式名稱：必填紅 `*`、撞名防呆、NG/FG/BG 快選（既有行為保留）
- 玩法大方向：SPIN／輪盤／點點樂／收集／其他；OTHER 時必填玩法描述 → `notes`
- 觸發條件開關預設關；開了才顯示：
  - 完整條件拼圖（寫入 `trigger_condition`）
  - 觸發給付開關＋列編輯（寫入 `trigger_pays`；可見條件同現況：`kind === 'SPIN'` 且名稱非 `NG`）
  - `end_condition`、`unlock_requires`
- 下一步 gate：`modeAddCanConfirm` 同等規則（名稱、撞名、OTHER 描述）

### 步驟 2 細節

- 進入步驟 2 時，依 `mode_kind` 套用 registry 預設勾選 → 寫入 dialog 暫存的 `enabled_sections`
- 左邊列出該 kind 可用區段；勾選＝加入／移除 `enabled_sections`（移除不清欄位）
- 點區段列（已勾者）設為 `focusSection`；右邊只渲染該區表單
- 若目前 focus 被取消勾選：自動聚焦下一個已勾區段；若無則右欄顯示空狀態提示
- 不強制至少勾一區（可空著進步驟 3）

### 步驟 3 細節

- 預覽純文字／唯讀摘要：名稱、玩法、觸發 DSL（或「無」）、觸發給付列數、結束／解鎖、已啟用區段清單與關鍵值
- 「建立模式」：`makeMode` + 寫入步驟 1–2 欄位 + `m.enabled_sections` + 既有 `_ensureModeGameplayFields`

## Section Registry（catalog）

單一常數（建議放 `js/config-editor/mode-sections.js` 或併入既有 mode-kind 模組旁的小檔）：

| section id | 顯示名 | 主要欄位 | 出現於 | 預設勾 |
|---|---|---|---|---|
| `pay_type` | 賠付模型覆寫 | `pay_type_override` | SPIN, OTHER | SPIN |
| `multipliers` | 倍數／封頂 | `reset_scope`, `stack_mode`, `cap_enabled`, `cap_value` | SPIN, OTHER | — |
| `choice_group` | 玩家擇一 | `choice_group` | 全部 | — |
| `hold_win` | 鎖點重轉 Hold&Win | `respin_base`, `respin_reset_on`, `respin_stop_cond` | 全部 | COLLECTION |
| `collect` | Hold&Win 收集設定 | `collect_enabled`, `respin_reset_symbol`, `grid_expand_in_collect`, `allow_persistent` | 全部 | COLLECTION |
| `cascade` | 消除連鎖 | `cascade_enabled`, `cascade_max_depth` | SPIN, OTHER | — |
| `mult_compose` | 倍數複合覆寫 | `mult_compose_override` | SPIN, OTHER | — |
| `refill_track` | 補盤路徑覆寫 | `refill_track_override` | SPIN, OTHER | — |
| `wheel` | 輪盤設定 | `wheel_upgrade_to` | WHEEL | WHEEL |
| `pick` | 點點樂設定 | `pick_count` | PICK | PICK |
| `collect_target` | 收集目標 | `collect_target` | COLLECTION | COLLECTION |
| `bonus_items` | 獎項／分段／獎勵 | `items[]` | WHEEL, PICK, COLLECTION | WHEEL, PICK, COLLECTION |

步驟 1 已涵蓋的觸發／結束／解鎖 **不** 進入 registry（避免與卡片上方觸發區重複）。

Helper（純函式、可 Node 測）：

- `sectionsForKind(kind) → Section[]`
- `defaultEnabledSections(kind) → string[]`
- `resolveEnabledSections(m) → string[]` — 有陣列用陣列；缺省／非陣列 → 該 kind 全部可用 id（舊檔全開）

## Mode Card Behavior

- 「玩法設定」卡體內：只渲染 `resolveEnabledSections(m)` 內的區段 UI（複用既有表單控件）
- 「＋ 新增設定」：子選單列出 `sectionsForKind(m.mode_kind)` 中尚未在 `enabled_sections` 的項目；選取 → push id 並展開該區
- 區段可關閉（從 `enabled_sections` 移除）→ 隱藏；值保留
- 觸發條件／`end_condition`／`unlock_requires` 維持卡片既有觸發區塊，不改走「新增設定」

## Data Shape

```text
mode.enabled_sections: string[]   // section id 清單；UI 顯示用
// 其餘欄位仍為既有 mode 欄位，不另造平行 schema
```

- `_ensureModeGameplayFields`：若 `enabled_sections` 缺省，不強制寫入陣列（讓 `resolveEnabledSections` 走「全開」）；精靈新建時則明確寫入陣列（可為 `[]`）
- 舊模式首次「關閉區段」或「新增設定」時：先把 `resolveEnabledSections(m)` 物化寫入 `m.enabled_sections`，再做增刪（避免只存稀疏差異）
- 持久化：跟著既有 modes 專案儲存／載入走；xlsx `11_Mode_Config` 若本輪方便加欄則 round-trip（例：`Enabled_Sections` 逗號分隔 id），否則省略欄位、載入無欄時走舊檔全開

## Out of Scope

- 盤面幾何／Megaways／`rows_variable` 等區段
- 引擎模擬新行為
- 全域 `pay_type` 改由本精靈設定（模式層僅 `pay_type_override`）
- 把觸發條件改成簡化版（本輪要完整拼圖）

## Testing

- `defaultEnabledSections('SPIN')` 含 `pay_type`；`COLLECTION` 含 `hold_win`／`collect`／`collect_target`／`bonus_items`
- `resolveEnabledSections`：有清單尊重清單；無清單 → 該 kind 全開
- 取消勾選不清除對應欄位值
- 精靈三步：僅步驟 3 可建立；建立後 mode 欄位與 `enabled_sections` 正確
- 卡片：只顯示清單內區段；新增設定可補開並出現表單

## Relation to Prior Spec

承接 `2026-07-17-mode-add-dlg-other-kind-design.md`（OTHER、紅星、五選一）。本 spec 將單頁彈窗升級為三步精靈，並新增卡片區段化；OTHER 規則維持不變。
