# San Quentin xWays（示範還原） — 機制文件

> 由 SlotPlanner Pro 設定檔自動產生　·　2026/7/15 上午4:24:29

## 基本規格

- 盤面 (H×W)：3-3-3-3-3（共 5 輪）
- 連線型態：百搭
- 連線種數：243
- 起始模式：NG
- 連線方式：滾輪停止後，從最左輪算起有連續3個以上相同圖示即可得分
- 補盤方式：連線時會消除得分圖示，並由上方圖示向下補滿，直到無法發生連線時，即計算遊戲一回合
- 滾動方式：主盤 整輪滾動↓
- 得分公式：押注額 × 連線圖示組合數 × 圖示賠率 = 獲得彩金

## 模式與觸發

| 模式 | 觸發條件 | 局數 | 說明 |
| --- | --- | --- | --- |
| NG | 起始模式 | 0 | 一般遊戲；xWays 隨機佔位揭示 + Infectious 擴散 |
| FG1 | symbol_count.SCAT >= 3 | 10 | xWays 免費遊戲，Infectious 擴散機率提升 |

## 各模式玩法設定

> 以下為規格描述，供數值 / 模擬工具落盤遵循；本工具不執行、不計算 RTP。

| 模式 | 倍數重置範圍 | 倍數疊加方式 | 封頂 / 上限 | 玩家擇一 | Hold&Win Respin |
| --- | --- | --- | --- | --- | --- |
| NG | 繼承全域 | 繼承全域 | 不封頂 | — | — |
| FG1 | 繼承全域 | 繼承全域 | 不封頂 | — | — |

- 倍數疊加優先序：符號層 `mult_stack_mode` > 模式層 `stack_mode` > 全域 `Multipliers.stack_mode`；「繼承全域」表示未於本層覆寫。


- 一般圖示 2 個、特殊圖示 4 個。
- **WILD**（WILD）
- **MYST**（SPECIAL）
- **BOMB**（SPECIAL）
- **SCAT**（SCATTER）

## 賠付表

| 編號 | 名稱 | 類型 | 5連線 | 4連線 | 3連線 |
| --- | --- | --- | --- | --- | --- |
| 2 | H1 | HIGH | 150 | 40 | 8 |
| 3 | L1 | LOW | 15 | 5 | 1 |
| 1 | WILD | WILD | — | — | — |
| 4 | MYST | SPECIAL | — | — | — |
| 5 | BOMB | SPECIAL | — | — | — |
| 6 | SCAT | SCATTER | — | — | — |

＊最少連線：除下列外均為 **3** 連起賠 —— MYST（最少 999 連起賠）、BOMB（最少 999 連起賠）。

## 連線 / 計分規則

滾輪停止後，從最左輪算起有連續3個以上相同圖示即可得分

- 補盤方式：連線時會消除得分圖示，並由上方圖示向下補滿，直到無法發生連線時，即計算遊戲一回合
- 滾動方式：主盤 整輪滾動↓
- 計分方式：押注額 × 連線圖示組合數 × 圖示賠率 = 獲得彩金
- 計分方向：左→右（LTR）

## 中獎線示意

全路徑（WAYS／Megaways）模式，無逐線定義，故不繪製中獎線示意。

## 特殊圖示行為

### WILD（WILD）

_（待填）_

### MYST（SPECIAL）

_（待填）_

### BOMB（SPECIAL）

_（待填）_

### SCAT（SCATTER）

_（待填）_

## 特色規則

| 規則 | 優先序 | 適用模式 | 觸發 | 條件 | 動作 | 說明 |
| --- | --- | --- | --- | --- | --- | --- |
| P004 | 70 | ALL | 符號落盤 | symbol_count.BOMB >= 1 | 相鄰消除（symbol=BOMB, radius=1, open_rows=Y, anchor=SYMBOL） | xBomb：以炸彈符為中心消除相鄰範圍，可炸開封閉列 |
| P003 | 80 | ALL | 符號落盤 | symbol_count.WILD >= 1 | 推移（symbol=WILD, direction=DOWN, full_reel=N, mult_per_step=1） | xNudge：Wild 每步推移 1 格，乘數隨推移步數 +1 |
| P002 | 95 | FG1 | 盤面生成 | mode == FG1 | 揭示（symbol=MYST, pool=WILD, spread=ADJACENT_REEL, spread_range=1, spread_chance=0.75）〔範圍：CELL〕 | FG 內 Infectious 擴散機率提升至 75%（同動作，不同機率參數，供比對兩種強度） |
| P001 | 100 | ALL | 盤面生成 | — | 揭示（symbol=MYST, pool=WILD, spread=ADJACENT_REEL, spread_range=1, spread_chance=0.5）〔範圍：CELL〕 | 佔位符落定揭示為 Wild，並以 50% 機率感染左右相鄰 1 輪的同款佔位符（Infectious xWays 核心機制） |

> 特色規則為結構化描述（觸發 / 條件 / 動作），供數值組 / 模擬工具實作時遵循；本工具不執行、不計算 RTP。
> 同「隨機組」的規則同時觸發時，依權重隨機擇一執行；描述型動作（擴展整輪／推移／走位／揭示／分裂／相鄰消除／盤面成長／計量調整；收集值／直接派彩／值乘算／回補回合／盤面壓實／值/型態轉換）之執行語意由下游模擬工具實作。標記「每回合重跑」（persistent）的規則，其動作於每個 spin／respin 重複套用；標記「機率 N%」（fire_chance）的規則，於條件成立後再抽一次此機率，骰過才真正觸發（用於無可數圖示條件的純機率直觸發）。

## JACKPOT

| GRAND | MAJOR | MINOR | MINI |
| --- | --- | --- | --- |
| 1800 | 300 | 30 | 10 |

## FREE GAME

- 觸發方式：_（待填）_
- 局數：最少 10 局
- 加局：有
- 上限：無
