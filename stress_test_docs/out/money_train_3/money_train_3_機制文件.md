# Money Train 3（示範還原） — 機制文件

> 由 SlotPlanner Pro 設定檔自動產生　·　2026/7/15 上午4:24:29

## 基本規格

- 盤面 (H×W)：4-4-4-4-4（共 5 輪）
- 連線型態：圖示數量
- 賠付方式：任意位置達標數量同符即得分（見賠付表）
- 起始模式：NG
- 連線方式：滾輪停止後，從最左輪算起有連續3個以上相同圖示即可得分
- 補盤方式：連線時會消除得分圖示，並由上方圖示向下補滿，直到無法發生連線時，即計算遊戲一回合
- 滾動方式：主盤 整輪滾動↓
- 得分公式：押注額 × 連線圖示組合數 × 圖示賠率 = 獲得彩金

## 模式與觸發

| 模式 | 觸發條件 | 局數 | 說明 |
| --- | --- | --- | --- |
| NG | 起始模式 | 0 | 一般遊戲；Scatter-Pay 8+ 同圖示 |
| BONUS | symbol_count.CART >= 3 | 0 | Hold&Win 賞金局：3 回合起始，落新符即回補；黏著符每回合重跑逐局倍數成長 |

## 各模式玩法設定

> 以下為規格描述，供數值 / 模擬工具落盤遵循；本工具不執行、不計算 RTP。

| 模式 | 倍數重置範圍 | 倍數疊加方式 | 封頂 / 上限 | 玩家擇一 | Hold&Win Respin |
| --- | --- | --- | --- | --- | --- |
| NG | 繼承全域 | 繼承全域 | 不封頂 | — | — |
| BONUS | 繼承全域 | 繼承全域 | 不封頂 | — | 初始 3 局 · 落新符號重置 |

- 倍數疊加優先序：符號層 `mult_stack_mode` > 模式層 `stack_mode` > 全域 `Multipliers.stack_mode`；「繼承全域」表示未於本層覆寫。
- Hold&Win 收集設定：BONUS（收集型 · 允許 persistent 規則）。常見收集玩法以此描述,罕見特有互動改由特色規則(拼圖)表達。

## 各模式 bonus 小遊戲

> 以下模式的玩法種類為 bonus 小遊戲；何時觸發進入由各模式的觸發條件決定。供數值 / 模擬工具落盤遵循；本工具不執行、不計算 RTP。

### BONUS（收集）
- 觸發條件：`symbol_count.CART >= 3`
- 目標收集數：20
- 說明：Hold&Win 賞金局：3 回合起始，落新符即回補；黏著符每回合重跑逐局倍數成長


- 一般圖示 3 個、特殊圖示 4 個。
- **CART**（SCATTER）
- **COIN**（SPECIAL）
- **COLLECTOR**（SPECIAL）
- **PROSPERITY**（SPECIAL）

## 賠付表

| 編號 | 名稱 | 類型 | 5連線 | 4連線 | 3連線 |
| --- | --- | --- | --- | --- | --- |
| 1 | H1 | HIGH | 100 | 20 | 5 |
| 2 | H2 | HIGH | 80 | 15 | 4 |
| 3 | L1 | LOW | 20 | 5 | 1 |
| 4 | CART | SCATTER | — | — | — |
| 5 | COIN | SPECIAL | — | — | — |
| 6 | COLLECTOR | SPECIAL | — | — | — |
| 7 | PROSPERITY | SPECIAL | — | — | — |

## 連線 / 計分規則

滾輪停止後，從最左輪算起有連續3個以上相同圖示即可得分

- 補盤方式：連線時會消除得分圖示，並由上方圖示向下補滿，直到無法發生連線時，即計算遊戲一回合
- 滾動方式：主盤 整輪滾動↓
- 計分方式：押注額 × 連線圖示組合數 × 圖示賠率 = 獲得彩金

## 特殊圖示行為

### CART（SCATTER）

_（待填）_

### COIN（SPECIAL）

_（待填）_

### COLLECTOR（SPECIAL）

_（待填）_

### PROSPERITY（SPECIAL）

_（待填）_

## 特色規則

| 規則 | 優先序 | 適用模式 | 觸發 | 條件 | 動作 | 說明 |
| --- | --- | --- | --- | --- | --- | --- |
| P004 | 80 | ALL | 符號落盤 | mode == BONUS AND symbol_count.COLLECTOR >= 1 | 收集值（target=JACKPOT, source=symbol_value）；直接派彩（value=本 feature 累計值） | Collector Train 落定 → 收集盤面所有現金符數值直接派彩 |
| P002 | 90 | ALL | 符號落盤 | mode == BONUS | 計量調整（meter_id=COIN_POOL, op=VALUE_ADD, value=1） | 現金符落定 → 賞金池計量 +1（METER_ADJUST VALUE_ADD） |
| P003 | 95 | ALL | 符號落盤 | mode == BONUS AND symbol_count.PROSPERITY >= 1 | 計量調整（meter_id=COIN_POOL, op=CAPACITY_ADD, value=5） | Prosperity Train 落定 → 賞金池容量上限 +5（METER_ADJUST CAPACITY_ADD） |
| P001〔每回合重跑〕 | 100 | ALL | 符號落盤 | mode == BONUS | 黏著（symbol=COIN, duration=3, until=FEATURE, mult_growth=1） | 賞金局內現金符落定 → 黏著並每回合重跑（逐局倍數成長示意） |

> 特色規則為結構化描述（觸發 / 條件 / 動作），供數值組 / 模擬工具實作時遵循；本工具不執行、不計算 RTP。
> 同「隨機組」的規則同時觸發時，依權重隨機擇一執行；描述型動作（擴展整輪／推移／走位／揭示／分裂／相鄰消除／盤面成長／計量調整；收集值／直接派彩／值乘算／回補回合／盤面壓實／值/型態轉換）之執行語意由下游模擬工具實作。標記「每回合重跑」（persistent）的規則，其動作於每個 spin／respin 重複套用；標記「機率 N%」（fire_chance）的規則，於條件成立後再抽一次此機率，骰過才真正觸發（用於無可數圖示條件的純機率直觸發）。

## JACKPOT

| GRAND | MAJOR | MINOR | MINI |
| --- | --- | --- | --- |
| 1800 | 300 | 30 | 10 |

## FREE GAME

- 觸發方式：_（待填）_
- 加局：有
- 上限：無
