# 新增模式彈窗 — 玩法大方向 OTHER + UI 微調

**Date:** 2026-07-17  
**Scope:** Config Editor「新增模式」彈窗（`cfg-modedlg`）  
**Approach:** 1 — 彈窗專用選項列 + `mode_kind=OTHER` / 文字寫入 `notes`  
**Skills applied:** `brainstorming`, `ponytail`

## Goal

調整「新增模式」彈窗：必填改紅星、玩法大方向五選一單排顯示，並支援「其他」自訂玩法描述。

## Decisions

| 項目 | 決定 |
|------|------|
| 必填標記 | 灰底「必填」→ 紅色 `*` |
| 按鈕文案 | SPIN、輪盤、點點樂、收集、其他 |
| 佈局 | 五顆 chip 單排（`nowrap`） |
| 「其他」資料 | `mode_kind = 'OTHER'`；自訂文字寫入 `m.notes` |
| 「其他」輸入 | 必填；空值時「建立模式」disabled |
| Bonus 行為 | OTHER 不當 bonus（與 SPIN 相同：無獎項表） |
| 觸發給付 | 僅 `kind === 'SPIN'` 顯示；OTHER 隱藏 |
| 卡片下拉 | `MODE_KIND_OPTIONS` 加 OTHER，避免建完後選項消失 |

## UI Changes

### 必填標記

- 「模式名稱」label：`<span class="cfg-key">必填</span>` → `<span class="cfg-req">*</span>`（紅色）。
- 選 OTHER 時，「玩法描述」label 同樣加紅 `*`。

### 玩法大方向

彈窗專用選項（可與卡片共用常數，或彈窗用短 label 對照）：

| value | 彈窗按鈕文字 |
|-------|-------------|
| `SPIN` | SPIN |
| `WHEEL` | 輪盤 |
| `PICK` | 點點樂 |
| `COLLECTION` | 收集 |
| `OTHER` | 其他 |

- Chip row：單排、不換行；必要時略縮 padding / 字級以塞進既有 `cfg-modedlg` 寬度。
- 選 `OTHER` 時，chip row 下方出現一欄文字輸入：
  - placeholder 例：「例：消除 / 過關」
  - `v-model` → `modeAddDlg.otherText`
  - 必填

## Data Flow

```
openAddModeDlg()
  → kind='SPIN', otherText='', name='', …

選 OTHER
  → 顯示 otherText 輸入

confirmAddModeDlg()
  → makeMode(name)
  → m.mode_kind = modeAddDlg.kind
  → if kind === 'OTHER': m.notes = otherText.trim()
  → (既有 trigger_pays 邏輯不變；僅 SPIN 可見)
```

**Confirm disabled 條件：**

- `!name.trim()` 或名稱撞名，或
- `kind === 'OTHER' && !otherText.trim()`

## Logic Adjustments

- `isBonusKind(m)`：改為明確列舉 bonus kinds（`WHEEL` / `PICK` / `COLLECTION`），避免 `OTHER` 被當成 bonus。
- `MODE_KIND_LABEL`：加 `OTHER: '其他'`。
- `MODE_KIND_OPTIONS`：加 `{ v: 'OTHER', label: '其他' }`（卡片下拉用短 label；彈窗可另用短標籤常數或同一組）。
- `_ensureModeGameplayFields`：若 `mode_kind` 空值仍預設 `SPIN`；不自動把 OTHER 改掉。

## Out of Scope

- 引擎模擬對 OTHER 的特殊行為（OTHER 視為非 bonus / 類似 SPIN 的編輯殼）。
- xlsx round-trip 新欄位（沿用既有 `Mode_Kind` + `notes`）。
- 模式卡片主畫面大改版。

## Testing

- 選 SPIN/輪盤/點點樂/收集：建立後 `mode_kind` 正確；OTHER 輸入欄不出現。
- 選其他、空白描述：「建立模式」disabled。
- 選其他、填描述：建立後 `mode_kind==='OTHER'` 且 `notes` 等於輸入文字。
- OTHER 模式卡片不出現 bonus 獎項表編輯器。
- 必填處顯示紅 `*`，無灰底「必填」pill。
