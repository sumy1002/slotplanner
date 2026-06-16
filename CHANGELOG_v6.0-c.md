# SlotPlanner Pro — v6.0-c 變更詳述（2026-06-13）

**主題**：Bonus 小遊戲框架（17_Bonus_Games）— 路線圖收尾。
**契約加法**：新增 17 分頁與 LS key;舊檔載入完全不受影響，已驗證向後相容。

**改動檔（7 個，無新檔）**：
`js/config-editor/helpers.js`、`js/config-editor/template.js`、`js/config-editor/setup.js`、
`js/aconfig-xlsx.js`、`js/docgen.js`、`css/theme_additions.css`、`py/schemas.py`、`py/a_loader.py`

---

## Bonus 小遊戲（17_Bonus_Games）

三型涵蓋常見 Bonus 關卡,統一 items 陣列承載:

- **WHEEL（輪盤）**:分段 value + weight;可 `wheel_upgrade_to` 升級到另一輪盤（多層輪盤）。
- **PICK（選獎 / Pick'em）**:獎項池 + 結束項（is_end，pooper）;可設 pick_count（0=抽到結束為止）。
- **COLLECTION（收集 / trail meter）**:收集獎勵 + collect_target 目標數。

每個項目可連結 13_Jackpots 的固定獎（link_jackpot）。

### 資料模型（新 LS key `slotplanner.aconfig.bonusgames.v1`）
`{ games: [BonusGame] }`,BonusGame 含 bonus_id / type / title / trigger_desc /
mode_scope / wheel_upgrade_to / pick_count / collect_target / items[] / notes。

### UI（新 bonus_games 分頁）
- 三型新增鈕;每個 game 一張卡（型別 badge + ID + 標題 + 刪除）。
- 型別專屬欄位（升級目標 / 抽選次數 / 目標收集數）依 type 動態顯示。
- 項目表:標籤 / 值 / 權重 / 即時機率 % / PICK 結束勾選 / 連結 JP;
  WHEEL/PICK 顯示期望值（加權平均,含 JP）。

### 匯出 / 引擎 / 文件
- A.xlsx `17_Bonus_Games`（每 game 首列帶欄位 + items 列;a_loader carry-forward 還原）。
- py `schemas.BonusGame` / `BonusItem`;`a_loader._parse_bonus_games`。
- docgen Markdown 新增「Bonus 小遊戲」章節（依型別出表,含機率 / 結束標記 / JP 連結）。

### 驗證
- Bonus ID 重複 → error;模式不存在 → error;權重總和 0 → error;
  PICK 無結束項也無次數 → warn;COLLECTION 無目標 → warn;
  WHEEL 升級目標不存在 → error;項目連結 JP 不存在 → error。

---

## 驗證（全部通過）

- `node --check` 全 JS、py_compile 全 py、config-editor 模板 Vue 編譯 0 error。
- **ConfigPage mount 15/15**（新增 bonus_games）、console.error=0、拖曳框選 ✓。
- **E2E XLSX 22 sheets**（含 17）;4 games / 7 items / 1 結束項正確匯出 ✓。
- **py round-trip**:WHEEL（升級 + JP 連結）/ PICK（結束項）/ COLLECTION（目標數）
  三型全部正確還原;舊檔無 17 → bonus_games=[] ✓。
- **docgen**:Markdown「Bonus 小遊戲」章節含輪盤 / 選獎 / 結束標記 ✓。
- 回歸:reel strips 引擎、bcompare 目標、RTP Monte Carlo 0.02pp、全模板——全綠。

---

## 路線圖：全部結清 ✅

| 類別 | 項目 | 版本 |
|---|---|---|
| 高優先 | 賠付彈性 / 投注結構 / 倍數 / 金幣面額 / 即時 RTP | v5.3–v5.5 |
| docgen 債 | 動態賠付 + 數值機制 + Bonus | v5.6 / v6.0-c |
| v6.0 | bcompare 目標 / 真實輪帶 / Bonus 小遊戲 | v6.0-a/b/c |

A.xlsx 已達 **22 sheets**,涵蓋 LINE / WAYS / Cluster / Scatter-pays / Cascade /
Hold&Win / 買免遊 / 多層 JP / 倍數系統 / 真實輪帶（含 stacked）/ 三型 Bonus——
公版工具對主流 SLOT 玩法的覆蓋已到位。
