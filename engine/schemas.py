"""
SlotPlanner Pro · 資料結構定義 (單一真相來源)

所有從 A.xlsx 解析出的設定、模擬中流轉的狀態、最終寫入 B.xlsx 的指標,
都以本檔案的 dataclass 為準。任何模組不得自行另立同義型別。
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum, auto
from typing import Any, Optional


# ============================================================
# 列舉 (Enums) — 對應 09_Puzzle_Rules 的下拉選單值
# ============================================================
class PayType(Enum):
    LINE = "LINE"
    WAYS = "WAYS"
    SCATTER = "SCATTER"
    CLUSTER = "CLUSTER"


class WaysDirection(Enum):
    LTR = "LTR"
    RTL = "RTL"
    BOTH = "BOTH"


class SymbolType(Enum):
    HIGH = "HIGH"
    LOW = "LOW"
    NORMAL = "NORMAL"   # 圖示頁「一般得分」中性型別（additive）；既有 HIGH/LOW 不改寫，下游皆視為一般得分
    WILD = "WILD"
    SCATTER = "SCATTER"
    BONUS = "BONUS"
    SPECIAL = "SPECIAL"


class ConstraintType(Enum):
    REEL_RESTRICT = "REEL_RESTRICT"
    GLOBAL_MAX = "GLOBAL_MAX"
    GLOBAL_MIN = "GLOBAL_MIN"
    ADJACENCY_FORBID = "ADJACENCY_FORBID"


class TriggerType(Enum):
    ON_SPIN_START      = "ON_SPIN_START"
    ON_GRID_GENERATED  = "ON_GRID_GENERATED"
    ON_WIN_RESOLVED    = "ON_WIN_RESOLVED"
    ON_SYMBOL_LANDED   = "ON_SYMBOL_LANDED"
    ON_COMBO_STEP      = "ON_COMBO_STEP"
    ON_COMBO_END       = "ON_COMBO_END"
    ON_DEAD_SPIN       = "ON_DEAD_SPIN"
    ON_MODE_ENTER      = "ON_MODE_ENTER"
    ON_MODE_EXIT       = "ON_MODE_EXIT"
    ON_CUSTOM_EMIT     = "ON_CUSTOM_EMIT"


class ActionType(Enum):
    ADJUST_MULTIPLIER  = "ADJUST_MULTIPLIER"
    BOARD_FILL         = "BOARD_FILL"
    BOARD_TRANSFORM    = "BOARD_TRANSFORM"
    BOARD_DESTROY      = "BOARD_DESTROY"
    MOVE               = "MOVE"
    SWAP               = "SWAP"
    STICKY             = "STICKY"
    LOCK_REEL          = "LOCK_REEL"
    UPDATE_GLOBAL      = "UPDATE_GLOBAL"
    UPDATE_LOCAL       = "UPDATE_LOCAL"
    AWARD_FREE_SPIN    = "AWARD_FREE_SPIN"
    SWITCH_MODE        = "SWITCH_MODE"
    EMIT_EVENT         = "EMIT_EVENT"
    HALT_RESOLUTION    = "HALT_RESOLUTION"
    # ── v8.4 / R2 P2:描述型符號行為 action(純描述,本工具不執行) ──
    #   a_loader 經 condition_parser.parse_actions 照收;logic_parser 無 handler
    #   (執行語意由下游數值模擬工具實作,本工具僅作 A.xlsx 帶資料 + docgen 描述)。
    EXPAND_REEL        = "EXPAND_REEL"        # 單格擴滿整輪(+鎖輪/重轉;Starburst)
    NUDGE              = "NUDGE"              # 逐格推移(+每步乘數;xNudge)
    WALK               = "WALK"               # 走位且持續存在(Jammin' Jars / Toro)
    REVEAL_AS          = "REVEAL_AS"          # 佔位符號統一揭示(Mystery Stack / xWays)
    SPLIT              = "SPLIT"              # 符號一分為 N(razor split / xSplit)
    DESTROY_ADJACENT   = "DESTROY_ADJACENT"   # 相鄰範圍消除(+開列;xBomb)
    GROW_BOARD         = "GROW_BOARD"         # 事件驅動加列/加輪/開格(Nitro / Infinity Reels)
    # ── v8.21 / G1 價值引擎:值動作(純描述,本工具不執行、不算 RTP) ──
    #   同 v8.4 描述型 action 慣例:a_loader.parse_actions 照收(enum 成員即合法);
    #   logic_parser 不註冊 handler(值如何演化 / 命中率 / RTP 由下游模擬工具實作)。
    #   docgen 照印進「特色規則」。CONVERT 為獨立 atype,不沿用 BOARD_TRANSFORM。
    COLLECT            = "COLLECT"            # 收集盤面值到計量表/彩池(Hold&Win 收金幣)
    PAY                = "PAY"                # 直接給付一個值(即時派彩;可餵動態值)
    MULTIPLY_VALUE     = "MULTIPLY_VALUE"     # 對盤面/格值做乘算(值成長)
    REVIVE             = "REVIVE"             # 重置/延長 respin(新符落定回補次數;界-2 sticky 重跑)
    COMPACT            = "COMPACT"            # 消除空隙、盤面壓實(值格向某方向聚攏)
    CONVERT            = "CONVERT"            # 值/型態轉換(獨立;非 BOARD_TRANSFORM,可依值轉換)
    # ── v8.24 / G5 生存結束:流程控制動作(純描述,本工具不執行) ──
    #   語意最接近 HALT_RESOLUTION;帶 when 謂詞 param(END_FEATURE{when:<predicate>}),
    #   與 ModeConfig.end_condition 連動。logic_parser 不註冊 handler(結束語意交下游)。
    END_FEATURE        = "END_FEATURE"        # 結束當前 feature(when 謂詞;生存局/條件式結束)
    # ── v8.28 / 缺口A:物件初始放置(純描述,本工具不執行) ──
    #   語意=於新一局(ON_SPIN_START)將物件置於指定格;初始位置以 params cell="r,c" 承載
    #   (幾何座標,沿用 cell_value.<r,c> 記法)。移動方向以 params dir(up/down/left/right/path)
    #   承載(WALK/MOVE 共用)。logic_parser 不註冊 handler(放置/移動語意交下游模擬工具)。
    SPAWN              = "SPAWN"              # 物件初始放置(cell="r,c";新一局觸發)
    # ── v8.43 / C-1 GAP-T2:條件式輪帶切換二枚(描述型;logic_parser 不註冊 handler,
    #    執行語意由下游模擬工具實作;沿 v8.4 七枚 / v8.28 SPAWN 前例) ──
    SYMBOL_SWAP        = "SYMBOL_SWAP"        # 輪帶層 from→to 符號置換(persist 期滿還原)
    SWITCH_STRIP       = "SWITCH_STRIP"       # 整帶切換為 04b 變體帶("模式#變體名" 列)
    # ── v8.44 / C-2 GAP-P5:面板動態啟停(描述型;與 02b Active_Modes 靜態域疊加) ──
    PANEL_SET          = "PANEL_SET"          # 副盤啟用/停用(panel=Panel_ID, active=Y|N)
    # ── v8.49 / 缺口3:計量條容量/當前值動態調整(描述型;本工具不執行) ──
    #   語意:對指定 meter_id 的 MeterDef 做動態調整,取代「容量寫死」的限制
    #   (Outlaws Inc Star Box「補星(VALUE_ADD)/開空格(CAPACITY_ADD)」)。
    #   params:meter_id(對應 21_Collection_Meters 的 meter_id)、
    #   op(CAPACITY_ADD 容量增量,可負 / CAPACITY_SET 容量直接設定 / VALUE_ADD 當前值增量)、
    #   value(數值,依 op 語意)。logic_parser 不註冊 handler,容量/當前值追蹤交下游模擬工具實作
    #   (比照 v8.21 值引擎慣例)。
    METER_ADJUST       = "METER_ADJUST"       # 計量條容量/當前值調整(Outlaws Inc Star Box)
    # ── v8.51 / 缺口提案12:重新觸發(描述型;本工具不執行) ──
    #   語意:讓畫面上 N 個「已消耗/已完成效果」的特殊符號再次發動一次自身效果;
    #   非 REVIVE 的「重置/延長 respin 次數」語意。a_loader 經 condition_parser.parse_actions
    #   照收(enum 成員即合法);logic_parser 不註冊 handler(執行語意由下游模擬工具實作)。
    RETRIGGER          = "RETRIGGER"          # 重新觸發已消耗符號效果(Money Train 3 死靈法師)


class ConditionOp(Enum):
    EQ = "=="
    NE = "!="
    GT = ">"
    GTE = ">="
    LT = "<"
    LTE = "<="
    IN = "in"
    NOT_IN = "not_in"
    CONTAINS = "contains"
    AND = "and"
    OR = "or"
    NOT = "not"


class DiscardType(Enum):
    HARD = "HARD"   # 風控,靜默重產,不計入棄牌率
    SOFT = "SOFT"   # 體感,計入棄牌率


class MultStackMode(Enum):
    """v6.4 / 缺漏#1:同一次得分涉及多個倍數時的疊加方式。
    MUL = 相乘(例:×3 與 ×5 → ×15,如 Mahjong Ways 2 的 WILD)。
    ADD = 相加(例:×3 與 ×5 → ×8,如 Buffalo King / Gates 的 FG 倍數)。
    對 RTP 影響巨大,故需結構化而非僅文字敘述。"""
    MUL = "MUL"
    ADD = "ADD"


class ResetScope(Enum):
    """v6.4 / 缺漏#2:進度/累積倍數的「重置範圍」,取代原本單一布林。
    CASCADE = 每次連線中斷即重置(per-cascade,如 MW2 的倍數梯)。
    SPIN    = 每一局重置(per-spin,如 Buffalo 的 FG 序列)。
    FEATURE = 整個 feature/FG 全程不重置(per-feature,如 Gates 的總倍數計數器)。"""
    CASCADE = "CASCADE"
    SPIN    = "SPIN"
    FEATURE = "FEATURE"


# ============================================================
# 全域設定 (對應 01_Global)
# ============================================================
@dataclass
class GlobalConfig:
    simulation_count: int = 1_000_000
    random_seed: int = 42
    output_prefix: str = "B_結果"
    pay_type: PayType = PayType.LINE
    ways_direction: WaysDirection = WaysDirection.LTR
    cluster_min_size: int = 5
    starting_mode: str = "NG"
    max_chain_depth: int = 100
    max_chain_per_rule: int = 50
    big_win_thresholds: list[float] = field(default_factory=lambda: [100.0, 500.0])
    dead_spin_buckets: list[int] = field(default_factory=lambda: [2, 3, 4, 5])
    # v6.4 / 缺漏#5:無傳統彩池時設 False,文件/匯出跳過 JACKPOT 段(不再強塞四級樣板)。
    has_jackpot: bool = True
    # v8.7 / R6 A-4:雙向 WAYS 去重宣告(規格描述;引擎不消費)。
    #   True = ways_direction=BOTH 時,同一符號組合左右兩向皆成立僅計分一次。
    ways_both_dedup: bool = True
    # v8.20 / G 界-3:結構化最大贏分封頂(規格描述;引擎不消費,交下游遵循)。
    #   與 disclosure.max_win 字串並存 — 前者可含區間/多來源備註(監理揭露用),
    #   本欄為單一結構化上限值(注額倍數):0 = 沿用 disclosure.max_win 字串(不另封頂)、
    #   -1 = 明示無上限、>0 = 硬封頂值。缺欄(舊 A.xlsx)→ 0(安全降級)。
    max_win_cap: float = 0.0
    # v8.28 / 缺口C:跨來源倍數複合方式(規格描述;引擎不消費,交下游遵循)。
    #   多來源倍數(單顆 instance_mult × 全域連鎖 × 特色)如何複合:
    #   MUL=相乘(預設,向後相容)、ADD=相加、MAX=取最高。缺欄(舊 A.xlsx)→ MUL。
    #   固定套用順序(描述):單顆 → 全域 → 特色。
    mult_compose: str = "MUL"
    # v8.39 / GAP-F1+軌道:全域補盤軌道('' = 現行重力/滾動補盤)與主盤跨局捲軸宣告
    #   ('' / 0 = 不捲動)。缺鍵 → 預設(01_Global kv by-name)。
    refill_track: str = ""
    scroll_track: str = ""
    scroll_step: float = 0.0
    # v6.4 / 缺漏#9+#10:合規數值披露(目標/實測)。None = 未填,由數值組重算後回填。
    disclosure: Optional["ComplianceDisclosure"] = None


# ============================================================
# 合規數值披露 (v6.4 / 缺漏#9+#10)
#   RTP / 波動度 / 命中率 / 最大贏分 — 監理/上架常需揭露。
#   max_win 採字串以容許區間與多來源備註(例:"5,000x" 或 "1,708x–25,000x")。
# ============================================================
@dataclass
class ComplianceDisclosure:
    rtp: float = 0.0                  # 理論 RTP %(0 = 待填)
    rtp_ante: float = 0.0             # 加押(Ante)模式 RTP %(0 = 不適用)
    volatility: str = ""              # 波動度(LOW/MEDIUM/HIGH/VERY_HIGH 或自由文字)
    hit_rate: float = 0.0             # 命中率 %(0 = 待填)
    max_win: str = ""                 # 最大贏分(字串,可含區間;例 "5,000x")
    max_win_note: str = ""            # 最大贏分備註(多來源說法不一時標註)


# ============================================================
# 盤面定義 (對應 02_Layout)
# ============================================================
@dataclass
class ReelLayout:
    reel_id: int
    y_offset: int          # 視覺垂直偏移
    max_rows: int          # 最大列數(Megaways 上限)
    has_subreel: bool = False
    subreel_position: str = ""    # TOP/BOTTOM/LEFT/RIGHT
    subreel_rows: int = 0
    subreel_inherit_weight: bool = False
    # v4.6: 副輪「種類」——把單一 Hold&Win 概念擴成四型。
    #   STACK          堆疊式（沿用舊行為；副輪列接在主輪後面，TOP/BOTTOM）
    #   SIDE_VERTICAL  獨立直向副盤（在主盤旁，與主盤無關；LEFT/RIGHT）
    #   TOP_HORIZONTAL 橫向副盤（在主盤上方，與主盤相關；可用不同符號）
    #   DUAL_PANEL     雙盤面（與主輪同尺寸、無滾動；Cashman Bingo 式）
    # 空字串視為 STACK（向後相容舊檔）。
    subreel_kind: str = "STACK"
    # v5.1:附掛副盤符號集(02_Layout 選用欄 SubReel_Symbol_Set;契約加法,
    #   舊檔無此欄 → 空字串)。引擎優先序:
    #   04 副盤專屬權重 → 此符號集等權 → subreel_inherit_weight 沿用主輪。
    subreel_symbol_set: str = ""
    # v7.5-Layer C：主輪活格遮罩 ["0,dy",…]（dx 恆 0，dy = 相對 y_offset 的 row）。
    #   None = 該欄 y_offset..y_offset+max_rows-1 實心（向後相容舊檔）。
    #   非 None = 只有遮罩內的 row 被物化（不抽符號、不入 grid、不計連線/symbol_count）。
    #   洞格語義＝結構性永遠空（不是暫時空位）；MOVE / BOARD_FILL 必須跳過洞格。
    #   與 Panel 的 cells 採同一套表示法與收斂規則（full/empty → None），單一真相。
    cells: Optional[list[str]] = None
    # #3:逐輪進場 / 滾動方式（02_Layout 選用欄 Entry_Mode / Scroll_Dir；契約加法，舊檔缺欄 → 預設）。
    #   entry_mode: SCROLL 輪滾動 / DROP 掉落 / SPAWN 原地生成。
    #   scroll_dir: DOWN 由上往下（或自上落下）/ UP 由下往上（或自下升起）/ NONE 無方向（SPAWN）。
    #   純描述性 metadata，供 docgen 與下游模擬工具；本工具不執行、引擎不消費（安全降級）。
    entry_mode: str = "SCROLL"
    scroll_dir: str = "DOWN"

    @property
    def effective_kind(self) -> str:
        return self.subreel_kind or "STACK"

    @property
    def is_dual_panel(self) -> bool:
        return self.has_subreel and self.effective_kind == "DUAL_PANEL"

    def active_local_rows(self, active_rows: Optional[int] = None) -> list[int]:
        """要物化的局部 row index（0-based，相對 y_offset）。

        :param active_rows: 本 spin 實際顯示列數（Megaways）；None → 用 max_rows。
        cells=None → range(active_rows) 全實心。
        cells 非 None → 只回落在 [0, active_rows) 內的遮罩 row（超界裁掉、去重、升冪）。
        洞格＝不在回傳清單內的 row。
        """
        n = self.max_rows if active_rows is None else active_rows
        n = max(0, int(n))
        if not self.cells:
            return list(range(n))
        seen: set[int] = set()
        out: list[int] = []
        for s in self.cells:
            try:
                dx_s, dy_s = str(s).strip().split(",")
                dx, dy = int(dx_s), int(dy_s)
            except (ValueError, AttributeError):
                continue
            # 主輪 mask 的 dx 恆為 0（單欄）；非 0 視為非法、忽略。
            if dx != 0:
                continue
            if 0 <= dy < n and dy not in seen:
                seen.add(dy)
                out.append(dy)
        out.sort()
        return out

    @property
    def active_row_count(self) -> int:
        """實際物化的列數（遮罩時為活格數，否則 = max_rows）。供統計/docgen。"""
        if self.cells:
            return len(self.active_local_rows())
        return max(0, self.max_rows)


# ============================================================
# v4.7:自由副盤 (Panel) — 與主輪平行的一級實體
#   - 自己的 ID 命名空間（panel_id 字串），不掛任何主輪
#   - 自由擺放（col/row）+ 自由尺寸（width/height）
#   - 可指定獨立符號集（symbol_set）
#   - join_payline:是否參與主盤連線判定（P1 僅儲存旗標，
#     實際 payline 套用到 panel 屬 P5;此處先存意圖，避免二次 migration）
# ============================================================
@dataclass
class PanelDef:
    panel_id: str               # 獨立 ID（例 "P1" / "BONUS"）
    col: int = 0                # 畫布左上 X（格，可負）
    row: int = 0                # 畫布左上 Y（格，可負）
    width: int = 3              # 欄數
    height: int = 3             # 列數
    scroll: bool = False        # 是否滾動（False=靜態盤，如雙盤面/pick 格）
    symbol_set: str = ""        # 符號集名稱（空=用全域符號）
    inherit_weight: bool = False  # 無獨立權重時是否沿用全域第一輪池（保底）
    join_payline: bool = False  # 是否參與主盤連線（P1 僅存旗標）
    note: str = ""
    # v7.x Layer B/C：活格遮罩 ["dx,dy",…]（相對外框左上）。None = 整塊矩形（向後相容）。
    #   - 遮罩外的格子不被物化（不抽符號、不計連線、不計 symbol_count）→ 不規則盤 / 環形盤。
    #   - 與 join_payline 正交：遮罩決定「哪些格存在」，join_payline 決定「存在的格算不算主盤連線」。
    cells: Optional[list[str]] = None
    # v8.39 / 軌道:面板跨局捲軸宣告。"" = 沿用現行隱含「往下滾」語意;step 可負=反向。
    #   位移狀態(offset 累計)由下游追蹤,本工具只宣告軌道與步幅。缺欄 → 預設。
    scroll_track: str = ""
    scroll_step: float = 1.0
    # v8.44 / C-2 GAP-P3+P5:面板評價域與模式作動域(尾欄 additive;缺欄 → 預設 = 現行為)。
    #   active_modes ""=全模式;eval_domain ""/MAIN=併入主盤(沿用 join_payline 現語意),
    #   SELF_LINE=盤內連線集(payline_set 引用 06 表 Line_ID csv 或 ALL)、SELF_WAYS=盤內 ways;
    #   非空時 eval_domain 優先、join_payline 忽略。scatter 計數域隨評價域(SELF=盤內計)。
    active_modes: str = ""
    eval_domain: str = ""
    payline_set: str = ""

    def active_local_cells(self) -> list[tuple[int, int]]:
        """要物化的局部座標 (c, r)。cells=None → 整塊 width×height 矩形。

        遮罩內非法/越界座標已在載入時（_parse_panel_cells）裁掉,此處僅做安全夾取。
        """
        w = max(0, self.width)
        h = max(0, self.height)
        if not self.cells:
            return [(c, r) for r in range(h) for c in range(w)]
        out: list[tuple[int, int]] = []
        seen: set[tuple[int, int]] = set()
        for s in self.cells:
            try:
                dx_s, dy_s = str(s).strip().split(",")
                dx, dy = int(dx_s), int(dy_s)
            except (ValueError, AttributeError):
                continue
            if 0 <= dx < w and 0 <= dy < h and (dx, dy) not in seen:
                seen.add((dx, dy))
                out.append((dx, dy))
        return out

    @property
    def cell_count(self) -> int:
        # v7.x:遮罩時回實際活格數（非外框 w×h）,讓統計 / docgen 自動正確。
        if self.cells:
            return len(self.active_local_cells())
        return max(0, self.width) * max(0, self.height)


@dataclass
class LayoutConfig:
    reels: list[ReelLayout]
    panels: list["PanelDef"] = field(default_factory=list)   # v4.7

    @property
    def reel_count(self) -> int:
        # 維持只算「主輪」,B 輸出 reel_count 語意不變
        return len(self.reels)

    @property
    def panel_count(self) -> int:
        return len(self.panels)

    def get(self, reel_id: int) -> ReelLayout:
        return next(r for r in self.reels if r.reel_id == reel_id)

    def get_panel(self, panel_id: str) -> "PanelDef":
        return next(p for p in self.panels if p.panel_id == panel_id)


# ============================================================
# 符號定義 (對應 03_Symbols)
# ============================================================
@dataclass
class SymbolDef:
    symbol_id: str
    display_name: str
    sym_type: SymbolType
    pay_table: dict[int, float]   # {3: 1.0, 4: 5.0, 5: 25.0, 6: 50.0}
    mega_width: int = 1
    mega_height: int = 1
    is_wild: bool = False
    is_scatter: bool = False
    notes: str = ""
    # v6.4 / 缺漏#1:此符號攜帶的倍數疊加方式;None = 繼承 Multipliers.stack_mode。
    mult_stack_mode: Optional[MultStackMode] = None
    # v8.3 / R1 D-12:符號出現模式宣告(逗號分隔模式名;"" = 所有模式)。
    #   取代「per-mode 權重 0 繞路」的宣告式欄位;純描述,引擎不消費。
    mode_scope: str = ""
    # v8.7 / R6 D-14:per-instance 乘數宣告(規格描述;引擎不消費)。
    #   True = 此符號每顆「實例」攜帶自身乘數(xWays/落地各帶倍數式);
    #   具體取值/疊加行為以規則或 Notes 描述。False = 傳統符號級乘數。
    instance_mult: bool = False
    # P0-2:每符號最小連線數（達此數才成立；預設 3，可覆寫 1/2）。
    #   純描述，引擎不消費；僅 LINE / WAYS（相鄰連線）有意義，SCATTER / CLUSTER 不套用。
    #   loader 對缺欄 / 空值安全降級為 3。
    min_match: int = 3
    # v8.3 / R1 A-1:賠付 count 區間同賠(scatter-pays 8-9/10-11/12-30、大盤 cluster)。
    #   loader 已同步把區間展開進 pay_table(from..to 每個 count 同賠),引擎照舊消費
    #   pay_table 即得正確結果;此欄保留原始區間描述供文件/下游輸出。None = 無區間列。
    pay_ranges: Optional[list] = None   # [(count_from, count_to, pay), ...]
    # P0-3:所屬符號家族 ID（"" = 不屬任何家族）。
    #   成員標籤；家族定義在 SymbolGroup / 03d_Symbol_Groups。純描述，引擎不消費。
    group_id: str = ""
    # v8.35 / GAP-H1:per-landing 尺寸分佈 "1:80;2:15;3:4"(size 可為 N=N×N 或 WxH)。
    #   原樣字串、不解析不求值(抽取語意交下游);"" = 沿用 mega_width/height 單一固定尺寸。
    #   純描述,引擎不消費;is_mega 判定不受此欄影響(維持既有語意)。
    mega_sizes: str = ""
    # 架構檢閱 #6:Wild 行為分類標籤(規格描述;引擎不消費)。
    #   拼圖規則系統(PuzzleRule + EXPAND_REEL/WALK/STICKY/ADJUST_MULTIPLIER 等 action)
    #   已能「執行」特殊 Wild 行為,但要知道「這顆符號是哪種特殊 Wild」得反查整套規則,
    #   docgen/符號清單無法一眼列出。此欄只是分類標籤,給文件與 UI 快速呈現用;
    #   實際觸發條件 / 行為細節仍以拼圖規則為權威來源,兩者不衝突、不重複規範。
    #   "" = 標準 Wild(替代符無特殊行為)/ EXPANDING(擴滿整輪)/ WALKING(走位存續)/
    #   STICKY(黏著多局)/ MULTIPLIER(攜帶倍數)。is_wild=False 時本欄應為 ""(非 Wild 無此分類)。
    #   缺欄(舊 A.xlsx)→ ""(安全降級)。
    wild_behavior: str = ""

    @property
    def is_mega(self) -> bool:
        return self.mega_width > 1 or self.mega_height > 1


# ============================================================
# 符號家族 (P0-3;ANY BAR 型混合賠付)
# ============================================================
@dataclass
class SymbolGroup:
    """P0-3:符號家族（ANY_BAR 等「任意混合成員」的混合賠付結構）。

    碎片＝個別符號（BAR / 2BAR / 3BAR 各自一塊）；group_id 為碎片的家族標籤；
    本類即家族的組裝規則（哪些碎片湊在一起 → 以家族費率賠付）。
    純描述，本工具引擎不消費；供 docgen 與下游數值模擬工具。
    成員由 SymbolDef.group_id 反查（不在此重列）。additive:缺 sheet → []；缺欄安全降級。
    """
    group_id: str
    display_name: str = ""
    match_mode: str = "ANY_MIXED"          # 比對語義:任意混合成員即成家族
    members_keep_individual: bool = True   # 成員是否同時保留自身賠率(混合走家族賠,下游取高者)
    mode_scope: str = ""                   # 出現/生效模式(比照符號;"" = 所有模式)
    pay_table: dict[int, float] = field(default_factory=dict)   # {3:.., 4:.., 5:.., 6:..} 基準費率
    # P0-3(進階):per-mode 家族費率覆寫。{ "<mode>": {3:.., 4:.., ...}, ... }。
    #   某模式有覆寫則以此為該模式費率,否則沿用 pay_table。對應 03e_Symbol_Group_Pays。
    #   純描述,引擎不消費;additive:缺 sheet / 缺模式 → 沿用 base。
    pay_by_mode: dict[str, dict[int, float]] = field(default_factory=dict)
    notes: str = ""


@dataclass
class ReelLink:
    """v8.38 / GAP-T1:輪帶連動配置選項(Twin Spin 每局隨機 2–5 輪連動、內容鏡射/相同)。

    一列 = 一個連動配置選項;每局在同 mode_scope 內依 weight 抽一列。
    reels = 1-based 輪號逗號字串("2,3";"" = 本局無連動選項)。
    link_kind:CLONE = 連動輪內容完全相同 / MIRROR = 左右鏡射。
    純描述,本工具引擎不消費;抽取與同步語意由下游模擬工具實作。
    additive:缺 sheet → [];缺欄安全降級。
    """
    link_id: str
    mode_scope: str = "ALL"
    reels: str = ""
    weight: float = 0.0
    link_kind: str = "CLONE"
    notes: str = ""


@dataclass
class Track:
    """v8.39 / GAP-F1+軌道 Phase 1:Track = 盤面上一條有序格子序列(純幾何)。

    用途由消費端引用 track_id 決定:GlobalConfig.refill_track / ModeConfig.refill_track_override
    (補盤路徑,Finn 螺旋)、WALK(track=)走位路徑、Panel.scroll_track / GlobalConfig.scroll_track
    (跨局捲軸;位移狀態由下游追蹤,本工具只宣告軌道與步幅)。
    cells = "r,c;r,c;…"(1-based 有序);entry = START/END(新內容由哪端進)。
    純描述,引擎不消費;additive:缺 sheet → []。
    """
    track_id: str
    scope: str = "MAIN"          # MAIN / PANEL:<pid>
    cells: str = ""
    entry: str = "START"
    notes: str = ""


# ============================================================
# 獎池級距 (v8.25 / G4;對應 19_Jackpot_Tiers)
#   Grand/Major/Minor/Mini 式級距階梯的單一層。與 13_Jackpots(個別彩池定義)正交。
#   只描述級距與觸發方式,不模擬命中率。純描述,引擎不消費;供 docgen 與下游模擬工具。
#   additive:缺 sheet → [];缺欄安全降級。
# ============================================================
@dataclass
class JackpotTier:
    tier: str = ""            # 層級序號或代號(如 1 / GRAND;自由)
    label: str = ""           # 顯示名(如 GRAND / MAJOR / MINOR / MINI)
    value: float = 0.0        # 級距值(×注額)
    notes: str = ""


# ============================================================
# 收集條分段門檻 (MeterTier;G-1;對應 21_Collection_Meters 的 Tiers 欄)
#   一段 tier = 累積值達 threshold 時,觸發 action(params)。純描述,引擎不消費;
#   觸發時機由下游模擬工具依此定義實作。action 沿用 on_full_action 同慣例(寬鬆字串,
#   可填 ActionType 字面值如 SPAWN / BOARD_DESTROY / SWITCH_MODE 或自由文字),
#   params 為該動作的參數字串(寬鬆;可含冒號,不可含分號——需含分號時整欄改用 JSON 形)。
# ============================================================
@dataclass
class MeterTier:
    threshold: float = 0.0    # 觸發門檻(累積值達此即觸發;非數字 → 上游 lint 警示、略過)
    action: str = ""          # 觸發動作(寬鬆字串;ActionType 字面值或自由文字)
    params: str = ""          # 動作參數(寬鬆字串)


# ============================================================
# 收集條 / 進度條 (MeterDef;架構檢閱 #21;對應 21_Collection_Meters)
#   拼圖式機制原生描述「單次事件觸發單次動作」(PuzzleRule),但收集條類玩法
#   (如 Sweet Bonanza 的 Scatter 符號收集、Money Train 的收集計量、任何
#   「累積到 N 才觸發」的橫向進度條)本質是跨局/跨消除持續累積的狀態機,
#   硬塞進單一 PuzzleRule 需要額外的隱藏全域變數 + 多條規則湊出「累積」與
#   「歸零」語意,難以在文件/UI 上一眼看出這是一條收集條。
#   MeterDef 是這類玩法的第一級（first-class）描述:一條收集條 = 填充來源
#   + 容量 + 歸零範圍 + 集滿動作,四個欄位講完,取代 3–5 條隱藏 PuzzleRule 的湊法。
#   純描述,引擎不消費;累積 / 歸零時機由下游模擬工具依此定義實作。
#   additive:缺 sheet → [];缺欄安全降級。
# ============================================================
@dataclass
class MeterDef:
    meter_id: str = ""
    label: str = ""
    mode_scope: str = "ALL"       # 生效模式(逗號名單;"ALL" = 不限)
    # 填充來源:寬鬆字串,慣例上填 symbol_id(如 "SCAT")或條件式(沿用 09_Puzzle_Rules
    # 的 condition DSL 語彙,如 "symbol_count.SCAT >= 1"),下游模擬工具自行決定如何判讀。
    fill_source: str = ""
    fill_amount: float = 1.0      # 每次命中 fill_source 累積的量
    capacity: float = 0.0         # 集滿所需總量;0 = 無上限(純計數,不觸發 on_full)
    # 歸零範圍(復用 Multipliers.reset_scope 同一組 enum,語意一致:
    # CASCADE=每次連線中斷即歸零 / SPIN=每局歸零 / FEATURE=整個 feature 全程不歸零)。
    reset_scope: ResetScope = ResetScope.FEATURE
    on_full_action: str = ""      # 集滿動作描述(寬鬆字串;可填 ActionType 字面值或自由文字)
    link_jackpot: str = ""        # 集滿連動的彩池(同構 BonusItem.link_jackpot;""=無)
    carry_over: bool = False      # 是否跨模式延續(False=切模式即視同離開此收集條情境)
    notes: str = ""
    # ── G-1:分段門檻(additive;缺 → 空/0/False = 退回現行單一 capacity + on_full_action)──
    #   絕對模式:tiers 列出各門檻的反應;比率模式:tier_step>0 時,每 tier_step 個觸發一次
    #   (每步動作複用 on_full_action),tier_repeat 決定是否每個倍數都觸發。純描述,引擎不消費。
    tiers: list = None            # list[MeterTier];絕對門檻反應清單(None/[] = 無)
    tier_step: float = 0.0        # 0/空 = 絕對模式;>0 = 比率型每 N 個觸發一次
    tier_repeat: bool = False     # 比率型:True=每個 N 都觸發 / False=僅第一個 N 觸發一次


# ============================================================
# 獎項項目 (BonusItem;v6.0-c 起用於 17_Bonus_Games,v7.14 起亦為 ModeConfig.items 承載)
# v8.0:BonusGame 已移除(bonus 併入 mode 玩法種類 mode_kind);BonusItem 保留供 ModeConfig.items 使用。
# ============================================================
@dataclass
class BonusItem:
    label:        str = ""
    value:        float = 0.0
    weight:       float = 100.0
    is_end:       bool = False
    link_jackpot: str = ""
    # v8.22 / G3:此獎項在收集玩法中的角色(描述用,寬鬆;引擎不消費)。
    #   "" / COIN(金幣值) / COLLECTOR(收集器) / MULTIPLIER(倍數) / BOOST(增益) / JACKPOT(彩池)。
    #   Hold&Win 常見收集玩法走設定(此欄);罕見遊戲特有互動走 G1 拼圖。缺欄 → ""。
    item_role:    str = ""
    # v8.27 / 批8:此獎項連結進入的模式名(通用原語,寬鬆;引擎不消費)。
    #   同構於 link_jackpot(item→彩池):此為 item→模式。一個原語同時表達:
    #     Pick 多層(抽到此項 → 進入下一層 pick 模式)、Wheel 分段跳轉(此分段 → 進入某模式)。
    #   "" = 無連結;缺欄(舊 A.xlsx)→ ""。與 mode 層 wheel_upgrade_to(整輪升級)並存、更細粒度。
    link_mode:    str = ""

# ============================================================
# 倍數系統 (對應 15_Multipliers, v5.4)
# ============================================================
@dataclass
class MultValue:
    mult:   float
    weight: float = 100.0

@dataclass
class Multipliers:
    wild_mult_enabled:      bool = False
    wild_mult_fixed:        float = 2.0
    wild_mult_values:       list = None
    progress_enabled:       bool = False
    progress_reset_on_mode: bool = True
    progress_ladders:       dict = None
    random_enabled:         bool = False
    random_symbol_id:       str = ""
    random_values:          list = None
    # v6.4 / 缺漏#1:多倍數疊加方式(系統層預設;符號 / 模式層可覆寫)。
    stack_mode:             MultStackMode = MultStackMode.MUL
    # v6.4 / 缺漏#2:進度倍數重置範圍(系統層預設)。supersedes progress_reset_on_mode 之語意;
    #   舊布林保留以維持向後相容(True≈CASCADE、False≈FEATURE 之粗略對應)。
    reset_scope:            ResetScope = ResetScope.CASCADE
    def __post_init__(self):
        if self.wild_mult_values is None: self.wild_mult_values = []
        if self.progress_ladders is None: self.progress_ladders = {}
        if self.random_values is None: self.random_values = []

# ============================================================
# 金幣面額 (對應 16_Coin_Values, v5.4 — Hold&Win)
# ============================================================
@dataclass
class CoinDenom:
    label:          str = ""
    value:          float = 1.0
    weight_by_mode: dict = None
    link_jackpot:   str = ""
    def __post_init__(self):
        if self.weight_by_mode is None: self.weight_by_mode = {}

@dataclass
class CoinValues:
    enabled:        bool = False
    coin_symbol_id: str = "COIN"
    denominations:  list = None
    def __post_init__(self):
        if self.denominations is None: self.denominations = []

# ============================================================
# 投注結構 (對應 14_Bet_Config, v5.3)
# ============================================================
@dataclass
class BuyFeatureDef:
    bf_id:        str
    target_mode:  str
    cost_mult:    float = 80.0
    rtp_target:   float = 96.0
    enabled:      bool  = True
    notes:        str   = ""
    # v8.6 / R5 E-15:購買檔位型式(規格描述;引擎不消費)。
    #   DIRECT=直接進 feature / BOOST_RATE=提高觸發率型「非直買」(X-iter 式) / SUPER=進階強化版。
    kind:         str   = "DIRECT"

# v8.6 / R5 E-18:多市場 RTP 出證版本(規格描述;92/94/96 等認證版本 + 市場別注限)
@dataclass
class RTPVariant:
    variant:    str            # 版本/市場名(如 'EU_96' / 'MGA' / '亞洲 92')
    target_rtp: float = 0.0    # 目標 RTP %
    max_bet:    float = 0.0    # 市場別注限(幣值或 ×注額;0=未設)
    notes:      str   = ""

@dataclass
class BetConfig:
    ante_bet_enabled:      bool  = False
    ante_bet_mult:         float = 1.25
    ante_bet_trigger_mult: float = 2.0
    ante_bet_desc:         str   = ""
    buy_features:          list  = None
    # v8.6 / R5 E-15:Ante/Buy 互斥宣告(啟用加押時停用購買,Pragmatic 式)+ Feature Drop 折抵
    #   (BTG 式:累積贏分折抵購買成本;細節自由文字)。規格描述,引擎不消費。
    ante_buy_exclusive:    bool  = False
    feature_drop_enabled:  bool  = False
    feature_drop_desc:     str   = ""
    # v8.6 / R5 E-18:多市場 RTP 版本表(list[RTPVariant])
    rtp_variants:          list  = None
    def __post_init__(self):
        if self.buy_features is None:
            self.buy_features = []
        if self.rtp_variants is None:
            self.rtp_variants = []

# v8.6 / R5 E-16:比倍(Gamble)設定 — 對應 18_Gamble(KV 式)。純規格描述,引擎不消費。
@dataclass
class GambleConfig:
    enabled:          bool  = False
    gamble_type:      str   = "CARD_COLOR"  # CARD_COLOR(紅黑×2)/CARD_SUIT(花色×4)/LADDER(階梯)/WHEEL/CUSTOM
    type_desc:        str   = ""            # 型式補充(LADDER 階梯表 / CUSTOM 描述)
    win_mult_options: str   = "2"           # 可選倍數(逗號分隔,如 '2,4')
    max_rounds:       int   = 5             # 最大連續比倍次數(0=無限)
    cap_mult:         float = 0.0           # 封頂(×注額;0=無)
    applies_to:       str   = "ALL_WINS"    # ALL_WINS / BELOW_LIMIT(僅低於門檻的贏分可比)
    applies_limit:    float = 0.0           # BELOW_LIMIT 門檻(×注額)
    collect_anytime:  bool  = True          # 可隨時收下
    # v8.23 / G2 比倍補強:非現金賭注/獎勵(規格描述;引擎不消費)。缺欄 → 預設(等同現金比倍,向後相容)。
    stake_type:       str   = "WIN"         # 賭注:WIN(贏分)/FREE_SPINS/BONUS_ENTRY/BONUS_LEVEL
    reward_type:      str   = "MULTIPLY_WIN"# 獎勵:MULTIPLY_WIN(倍增贏分)/ADD_SPINS/ENTER_BONUS/UPGRADE_LEVEL
    gamble_trigger:   str   = ""            # 何時可比倍(自由描述,寬鬆;如 ON_ANY_WIN / BONUS_END)
    notes:            str   = ""

# ============================================================
# Reel 權重 (對應 04_Reel_Weights, 08_Combo_Weights)
# ============================================================
@dataclass
class ReelWeight:
    mode: str
    reel_id: int            # 主輪用 1, 2... ; 副輪用 negative or 加 .sub flag
    is_subreel: bool
    symbol_id: str
    weight: float
    panel_id: str = ""      # v4.7:非空 → 此權重屬於某 Panel（reel_id 此時無意義）


@dataclass
class GridSizeWeight:
    """Megaways 用:某 Reel 開幾格的抽樣權重"""
    mode: str
    reel_id: int
    grid_size: int
    weight: float


@dataclass
class ModeGridRange:
    """逐模式逐輪的可變列數範圍（Megaways「每輪列 min–max，逐模式」）。

    對應可選表 05b_Mode_Grid_Range;缺表時由 05_Grid_Size_Weights + 02.Max_Rows 推導
    （安全降級,行為與舊檔一致）。逐模式 Megaways-ness 由 is_variable 推導,不再靠全域布林。
    純描述 metadata:本工具不執行 gameplay,可變高度由引擎既有 max_rows/active_rows/
    grid_size_weights 機制處理,本欄不改變引擎行為;供下游數據模擬工具 / 文件輸出消費。
    """
    mode: str
    reel_id: int
    min_rows: int
    max_rows: int
    notes: str = ""
    # ── G-7/8:動態盤面幾何(additive;0 = 未設,安全降級為現行行為)──
    #   base_max:基本期列上限(通常＝max_rows;0=沿用 max_rows)。
    #   feature_max:特色期列上限(可高於基本;0=無特色成長)。White Rabbit 7→12、Cygnus →8。
    #   純描述,幾何轉變執行歸下游;不改 computeWaysCount / 引擎行為。
    base_max: int = 0
    feature_max: int = 0

    @property
    def is_variable(self) -> bool:
        """該模式該輪是否為可變高度（min≠max）。"""
        return self.max_rows > self.min_rows


@dataclass
class ComboWeightOverride:
    """連爆權重切換:覆蓋 04_Reel_Weights 的特定條目"""
    mode: str
    after_combo: int        # 第 N 爆之後啟用
    reel_id: int
    symbol_id: str
    weight: float


# ============================================================
# Payline (對應 06_Paylines)
# ============================================================
@dataclass
class Payline:
    line_id: int
    path: list[tuple[int, int]]    # [(reel, row), ...]
    direction: WaysDirection
    notes: str = ""


# ============================================================
# 硬約束 (對應 07_Constraints)
# ============================================================
@dataclass
class Constraint:
    constraint_id: str
    ctype: ConstraintType
    symbol_id: str
    reels_allowed: list[int] = field(default_factory=list)   # REEL_RESTRICT 用
    threshold: int = 0                                       # GLOBAL_MAX/MIN 用
    mode_scope: str = "ALL"                                  # ALL 或具體模式名
    notes: str = ""


# ============================================================
# 產牌限制 / 生成期約束 (對應 07b_Gen_Limits, v7.11)
#   長格式(tidy):一條 = 一個符號 × 一個 zone × (min, max) × mode_scope。
#   zone 字串(單一真相):
#     MAIN              主盤整體(所有主輪格總和)
#     SUB:<reel_id>     某主輪附掛的副輪(例 SUB:3)
#     PANEL:<panel_id>  某自由副盤(例 PANEL:BONUS)
#   注意:max_count 為「該 zone 內」上限,與 SymbolDef/03_Symbols 的全盤 max_count 是不同概念。
#   本工具不執行此約束;僅描述 + 帶給下游模擬工具。
# ============================================================
@dataclass
class GenLimit:
    limit_id: str
    symbol_id: str
    zone: str = "MAIN"
    min_count: int = 0                       # 0 = 無下限
    max_count: Optional[int] = None          # None = 無上限
    mode_scope: str = "ALL"
    notes: str = ""
# ============================================================
# 關聯型產牌條件 (對應 07c_Gen_Constraints, §4.8/§4.9)
#   多符號合計(sum)/ 符號位置關係(pos)/ 整體盤面狀態(board)+ 巢狀「除了」例外。
#   except_ 為結構化 dict(連接子 any/all + 項目清單,項目為 leaf 或 group,一層巢狀)或 None。
#   (except 為 Python 保留字,故欄名用 except_。)
#   本工具不執行;僅描述 + 帶給下游模擬工具消費。
# ============================================================
@dataclass
class GenConstraint:
    constraint_id: str
    enabled: bool = True
    ctype: str = "sum"                       # sum / pos / board
    symbols: list[str] = field(default_factory=list)
    op: str = "le"                           # le / lt / eq / ge
    value: Optional[float] = None
    value_type: str = "fixed"                # fixed / dynamic
    relation: str = ""                       # pos: 相鄰 / 同列 / 同行 / 不可同盤
    board_state: str = ""                    # board: 已填滿 / 含指定符號 / 有空位 / 全同色
    except_: Optional[dict] = None           # 巢狀例外(見上)或 None
    notes: str = ""
# ============================================================
@dataclass
class ConditionLeaf:
    """葉節點:單一比較"""
    var: str           # "combo_step" / "symbol_count.WILD" / "global.coin_pool"
    op: ConditionOp
    value: Any

# ============================================================
# 位置型格子屬性 (v8.8 / R4 B-6)
#   一列 = 一格 × 一屬性。座標 1-based(Reel=reel_id、Row=1..max_rows 局部列),
#   對齊 06_Paylines 座標慣例。純規格描述:固定格乘數(Cygnus)/enhancer cell/
#   Fire Frame/金框格(Hold&Win 常見);引擎不消費,行為細節寫 Notes 或規則。
# ============================================================
@dataclass
class CellAttr:
    attr_id: str                  # 唯一識別(CA1, CA2, ...)
    reel: int = 1                 # 1-based reel_id
    row: int = 1                  # 1-based 局部列(1..max_rows)
    attr: str = "MULT"            # MULT / ENHANCER / FRAME / GOLD / CUSTOM
    value: str = ""               # 屬性值(MULT=倍數;可含區間字串;其餘型式選填)
    mode_scope: str = "ALL"       # ALL 或模式名(逗號分隔)
    notes: str = ""
    # v8.49 / 缺口4:此格屬性(通常是 attr="MULT")的數值上限,格式與 value 一致(可含區間字串)。
    #   "" = 無上限(向後相容,行為與舊檔一致)。
    #   Sugar Rush 式「格位倍數逐次翻倍,封頂128x」即填 cap_value="128"。
    #   純描述,引擎不消費;封頂判定(MULTIPLY_VALUE 執行到此格時是否還能再翻倍)交下游模擬工具。
    cap_value: str = ""
    # ── G-2:動態格位狀態層(additive;缺欄 → 空 = 純靜態屬性 = 現行行為,安全降級)──
    #   純描述狀態語意,執行(倒數 −1 / 擊破 / 累加 / 觸發後動作)歸下游模擬工具;工具不跑狀態機。
    state_type: str = ""       # MARKER / COVER / COUNTDOWN / COUNTER / ""(空=無狀態=純靜態屬性)
    state_init: str = ""       # 狀態初值(遮蓋層數 3 / 倒數起始 5…;寬鬆字串,可空)
    state_trigger: str = ""    # 觸發事件(ON_WIN_OVERLAP=中獎覆蓋此格 / ON_SYMBOL_LANDED / ON_COMBO_STEP / 自由)
    on_state_action: str = ""  # 觸發/歸零後動作(atype 字面值或自由文字,同 on_full_action 慣例)
    state_region: str = ""     # 作用範圍(空=錨點格 (reel,row);ALL / R1-R3 / col:2 / "(1,1);(2,2)" …)



@dataclass
class ConditionNode:
    """枝節點:邏輯組合"""
    op: ConditionOp    # AND / OR / NOT
    children: list     # list[ConditionLeaf | ConditionNode]


# Condition 型別別名 (Python 3.10+ Union)
Condition = ConditionLeaf | ConditionNode


@dataclass
class Action:
    atype: ActionType
    params: dict[str, Any]


@dataclass
class PuzzleRule:
    rule_id: str
    priority: int                # 數字越小越先
    trigger: TriggerType
    condition: Optional[Condition]   # None = 無條件總是觸發
    actions: list[Action]
    emits: list[str] = field(default_factory=list)
    enabled: bool = True
    description: str = ""
    # v8.4 / R2 P5:隨機擇一——同 random_group 的規則同時觸發時依 random_weight 抽一條執行
    #   (描述層;抽選由下游實作。Girl Power 三選一施放式)。"" = 不屬任何隨機組。
    random_group: str = ""
    random_weight: float = 100.0
    # v8.49 / 缺口1:規則觸發後的「額外機率閘門」(0~1;1.0=100%=現行行為,安全預設)。
    #   語意:condition 為 True(或 None=無條件)之後,再抽一次 fire_chance 機率骰,
    #   骰過才真正執行 actions。用於「無可數圖示條件,純機率直觸發」的機制
    #   (PG Soft Prize Symbol 系列的隨機 Feature 直觸發,如 Fortune Rabbit / Lucky Neko)。
    #   與 random_group/random_weight 正交:後者是「同組多條規則互斥擇一」,
    #   fire_chance 是「單條規則要不要真的發生」的獨立貝努利試驗,可疊加使用。
    #   純描述,引擎不消費;骰子求值與亂數來源交下游模擬工具實作(比照 random_weight 慣例)。
    #   缺欄(舊 A.xlsx)→ 1.0(安全降級,行為與舊檔一致,不影響既有規則)。
    #   v8.51 / 缺口提案13:型別放寬 float → float | str(比照 v8.34 GAP-S1 的 dyn 慣例)。
    #   字串 = 動態公式(如 "bet / 1000000"),求值語意交下游模擬工具;純數字仍為 float,
    #   行為與 v8.49 完全一致(只鬆不緊,舊資料無感)。Mega Moolah 機率與下注金額成正比即此路。
    fire_chance: "float | str" = 1.0
    # v8.21 / G1 價值引擎:persistent 規則層修飾子(★機主拍板:放規則層布林,非動作 params)。
    #   語意=此規則的動作「每回合(spin/respin)重跑」,同時完成界-2 sticky「重跑」。
    #   純描述,引擎不消費;缺欄(舊 A.xlsx)→ False(安全降級,行為與舊檔一致)。
    persistent: bool = False
    # v8.28 / 缺口A:補充判斷說明(自由文字;給前端/下游的「判斷規則」)。
    #   承載無法結構化、但須寫給前端/下游的軟規則:移動順序(水平先再垂直)、
    #   最短路徑選擇等。純描述,引擎不消費;與 description(人看的規則摘要)分離。
    #   缺欄(舊 A.xlsx)→ ""(安全降級)。
    notes: str = ""

    # 統計埋點 (跑測時動態累加)
    trigger_count: int = 0
    rtp_contribution: float = 0.0


# ============================================================
# 棄牌規則 (對應 10_Discard_Rules)
# ============================================================
@dataclass
class DiscardRule:
    rule_id: str
    dtype: DiscardType
    mode_scope: str
    condition: Optional[Condition]
    reason_label: str
    notes: str = ""
    enabled: bool = True          # §4.10b:棄牌開關(additive;預設啟用,舊檔無欄→True)

    # 統計埋點
    trigger_count: int = 0


# ============================================================
# 模式設定 (對應 11_Mode_Config)
# ============================================================
@dataclass
class ModeConfig:
    mode: str
    trigger_condition: Optional[Condition]
    spin_count: int                  # 0 = 無限
    inherit_globals: bool = False
    on_enter_reset_vars: list[str] = field(default_factory=list)
    notes: str = ""
    # v6.4 / 缺漏#2:此模式的進度倍數重置範圍;None = 繼承 Multipliers.reset_scope。
    reset_scope: Optional[ResetScope] = None
    # v6.4 / 缺漏#4:scatter-pay 觸發給付(觸發即付,非連線賠付)。
    #   例:Buffalo 4/5/6 SCATTER → 5x/20x/100x;Gates 4/5/6 → 3x/5x/100x。
    trigger_pays: list["TriggerPay"] = field(default_factory=list)
    # v7.11 additive:此模式的封頂/上限(規格書描述用;引擎不消費)。
    #   cap_enabled='' / 'Y';cap_value 字串(可含區間)。
    cap_enabled: str = ""
    cap_value: str = ""
    # v7.11 additive:此模式的倍數疊加方式;None = 繼承 Multipliers.stack_mode。
    #   三層優先序(docgen 描述):符號 mult_stack_mode → mode stack_mode → 全域。
    stack_mode: Optional[MultStackMode] = None
    # v7.14 additive:此模式的玩法種類。SPIN=旋轉模式(預設,向後相容);
    #   WHEEL/PICK/COLLECTION=bonus 小遊戲,此 mode 攜帶對應獎項表(items)。
    #   規格書描述用;引擎不消費、不執行、不算 RTP(由下游模擬工具負責)。
    mode_kind: str = "SPIN"          # SPIN / WHEEL / PICK / COLLECTION
    # 以下四欄僅 mode_kind != SPIN 時有意義(SPIN 模式忽略):
    wheel_upgrade_to: str = ""       # WHEEL 升級鏈:指向另一個 mode 名(空=無升級)
    pick_count: int = 0              # PICK 抽選次數(0=抽到結束項為止)
    collect_target: int = 0          # COLLECTION 目標值
    items: list["BonusItem"] = field(default_factory=list)  # 獎項表(沿用 BonusItem)
    # v8.5 / R3 additive:玩家擇一 + Hold&Win respin(規格描述;引擎不消費、不執行)。
    #   choice_group:同組名的模式=玩家擇一進入(二選一/三選一 FS;Dog House / Moon Princess)。
    #   respin_*:Hold&Win / Sticky Win 的 respin 狀態機描述(Money Train / Lucky Wagon / Aloha):
    #     respin_base > 0 即啟用;reset_on 描述何事重置計數;stop_cond 為開放式停止條件自由文字
    #     (「盤面填滿」「SEVEN 出現」等;Toro Re-Spins「直到某符號出現」亦收於此)。
    choice_group: str = ""           # "" = 不屬任何擇一組
    respin_base: int = 0             # 初始 respin 數(0 = 未啟用 Hold&Win 描述)
    respin_reset_on: str = ""        # "" / NEW_SYMBOL(落新符號重置) / ANY_WIN / NEVER
    respin_stop_cond: str = ""       # 開放式停止條件(自由文字)
    # v8.24 / G5 生存結束:結構化結束謂詞(規格描述;引擎不消費)。
    #   與自由文字 respin_stop_cond 並存(後者當備援/補充);可填謂詞如
    #   「respins_left == 0」「symbol_count.SEVEN >= 1」;拼圖層以 END_FEATURE{when} 連動。
    #   缺欄(舊 A.xlsx)→ ""(僅靠 respin_stop_cond,向後相容)。
    end_condition: str = ""
    # v8.7 / R6 A-2:per-mode 賠付模型覆寫(規格描述;引擎不消費)。
    #   "" = 繼承全域 pay_type;LINE/WAYS/SCATTER/CLUSTER = 此模式改用該賠付模型
    #   (NG=LINE、FG=SCATTER 混模型遊戲)。
    pay_type_override: str = ""
    # v8.22 / G3 Hold&Win 設定面(規格描述;引擎不消費、不執行、不算 RTP)。
    #   常見收集玩法走此設定;罕見遊戲特有互動走 G1 拼圖。缺欄 → 預設(安全降級)。
    collect_enabled: bool = False        # 此模式是否為收集型(Hold&Win)
    respin_reset_symbol: str = ""        # 落哪種符號重置 respin(符號 id;"" = 依 respin_reset_on)
    grid_expand_in_collect: bool = False # 收集中盤面是否擴張(Money Train 式加格)
    allow_persistent: bool = False       # 此模式是否允許 persistent 規則(每回合重跑)
    # v8.28 / 缺口B:解鎖前提(規格描述;引擎不消費)。此模式需先「玩過/解鎖」哪些模式
    #   才可進入/選取(漸進解鎖 FS:Immortal Romance 密室鏈)。模式名清單(可多個);
    #   空 = 無前提。與 choice_group 正交(擇一 vs 解鎖前提)。缺欄 → [](安全降級)。
    unlock_requires: list[str] = field(default_factory=list)
    # v8.28 / 缺口C:此模式的跨來源倍數複合方式覆寫(規格描述;引擎不消費)。
    #   "" = 沿用 01_Global.mult_compose;MUL/ADD/MAX = 此模式改用該複合方式。缺欄 → ""。
    mult_compose_override: str = ""
    # v8.39 / GAP-F1:此模式補盤軌道覆寫("" = 沿用 GlobalConfig.refill_track)。缺欄 → ""。
    refill_track_override: str = ""
    # 架構檢閱 #6:消除掉落 / 連鎖(Cascade / Tumble / Avalanche)結構化宣告(規格描述;
    #   引擎不消費、不執行)。拼圖規則系統已能描述整套消除迴圈(BOARD_DESTROY 消除中獎格 →
    #   BOARD_FILL 補位 → ON_COMBO_STEP/ON_COMBO_END 觸發下一輪判定,GlobalConfig.max_chain_depth
    #   為全域上限),但「此模式是否走連鎖消除玩法」目前只能靠掃描 BOARD_DESTROY+BOARD_FILL
    #   規則組合反推,文件/下游工具無法一眼確認遊戲類型。cascade_enabled 補上這個第一級旗標;
    #   cascade_max_depth 為此模式的連鎖深度上限覆寫(0 = 沿用 GlobalConfig.max_chain_depth,
    #   常見於基本盤與 Bonus 模式連鎖上限不同的設計)。缺欄(舊 A.xlsx)→ False / 0(安全降級)。
    cascade_enabled: bool = False
    cascade_max_depth: int = 0
    # ── G-7/8 / D1甲:動態盤面幾何轉變(additive;掛 modes 之每模式子清單,同 trigger_pays 範式)。
    #   缺 02e / 空清單 → 幾何維持 02_Layout/05b 靜態值(現行行為)。純描述,執行歸下游。──
    geometry_transitions: list["GeometryTransition"] = field(default_factory=list)
    # ── G-9 / D1甲:符號池動態變更(deck-thinning / 符號值升級;additive;掛每模式子清單,同上範式)。
    #   缺 11d / 空清單 → 符號集固定(現行行為)。純描述,對接 CONVERT atype,執行歸下游。──
    symbol_ops: list["SymbolOp"] = field(default_factory=list)
    # ── G-4 / D1甲:hold-and-win / cash-on-reels 描述欄(additive;掛 modes.v1,消化既有 respin_* 欄)。
    #   respin 收集回合本體沿用既有 respin_base/respin_reset_on/respin_reset_symbol/respin_stop_cond/
    #   collect_enabled;此處只補真正缺的描述欄。缺 22_HoldWin → 全空(現行行為)。純描述,執行歸下游。──
    hw_trigger_symbol: str = ""   # 觸發 / 被收集的符號(金幣符;Money Train coin、Big Bamboo golden bamboo)
    hw_persist_value: bool = False # 收集格是否攜帶持久值(cash-on-reels 金額常駐)
    hw_collect_rule: str = ""     # 收集 / 結算規則(自由字串;「填滿全付」「達標升級 jackpot」)
    hw_link_jackpot: str = ""     # 連結彩池級距(參照 19_Jackpot_Tiers 的 JP_ID / 級距名;下游解析)


# ============================================================
# 觸發給付 (scatter-pay,v6.4 / 缺漏#4)
# ============================================================
@dataclass
class TriggerPay:
    scatter_count: int            # 觸發所需 scatter 數
    pay: float = 0.0              # 注額倍數(觸發即付)
    grants_spins: int = 0         # 該觸發給予的免費局數(0 = 不適用 / 沿用模式 spin_count)


# ============================================================
# 動態盤面幾何轉變 (G-7/8,對應 02e_Geometry_Transitions)
# ============================================================
@dataclass
class GeometryTransition:
    """遊玩中盤面幾何轉變宣告(規格描述;引擎不消費、不執行、不算 RTP)。

    一宣告統包五款(White Rabbit 延展轉軸 / Punk 增輪 / xWays / Pirots / Cygnus):
    描述「在什麼觸發下、哪個維度、每次變多少、上限、ways 如何重算」。
    對接既有 GROW_BOARD / EXPAND_REEL atype(觸發時概念上發這些 action,執行歸下游)。
    掛 ModeConfig.geometry_transitions(每模式子清單);缺 02e / 空 → 幾何靜態(安全降級)。
    """
    mode: str                     # 所屬模式(Mode_Scope)
    dimension: str                # ROW_HEIGHT / REEL_COUNT / GRID_ROWS
    trigger_source: str = ""      # 觸發符號或事件(自由字串)
    step: str = ""                # 每次變化量(如 +1;寬鬆字串)
    cap: str = ""                 # 上限(列數 / 輪數;寬鬆字串)
    ways_recompute: str = ""      # PRODUCT_OF_ROWS / FIXED / NONE(自由)
    notes: str = ""


# ============================================================
# 符號池動態變更 (G-9,對應 11d_Mode_Symbol_Ops)
# ============================================================
@dataclass
class SymbolOp:
    """feature 中符號池動態變更宣告(規格描述;引擎不消費、不執行、不算 RTP)。

    一宣告涵蓋 deck-thinning(移出符號池)與符號值升級(對接 CONVERT atype):
    描述「什麼操作、選誰(Target)、每次幾個、豁免哪些、何時觸發」。
    命中 xWays Hoarder(移最低符)/ Drop'em(移掉落池符)/ Pirots(寶石 1→5 升級)。
    掛 ModeConfig.symbol_ops(每模式子清單);缺 11d / 空 → 符號集固定(安全降級)。
    """
    mode: str                     # 所屬模式(Mode_Scope)
    op: str                       # REMOVE / UPGRADE(自由)
    target: str = ""              # 選誰:lowest / highest / by_id:H1,H2 / by_color:GEM_RED(自由;下游解析)
    count: str = ""               # 每次處理幾個(寬鬆字串)
    immune: str = ""              # 豁免清單(symbol_id 逗號分隔;如 WILD,SCATTER)
    trigger: str = ""             # 觸發事件 / 符號(自由字串)
    notes: str = ""


# ============================================================
# 倍數分佈區間 (對應 12_Distribution_Bins)
# ============================================================
@dataclass
class DistributionBin:
    mode_scope: str
    bin_edges: list[float]
    notes: str = ""


# ============================================================
# 整包設定:從 A.xlsx 解析後的最終產物
# ============================================================
@dataclass
class AConfig:
    """A.xlsx 完整設定的容器"""
    global_cfg: GlobalConfig
    layout: LayoutConfig
    symbols: dict[str, SymbolDef]            # 用 symbol_id 索引
    reel_weights: list[ReelWeight]
    grid_size_weights: list[GridSizeWeight]
    paylines: list[Payline]
    constraints: list[Constraint]
    combo_weights: list[ComboWeightOverride]
    puzzle_rules: list[PuzzleRule]
    discard_rules: list[DiscardRule]
    modes: dict[str, ModeConfig]              # 用 mode 名稱索引
    distribution_bins: dict[str, DistributionBin]   # 用 mode_scope 索引

    # v4.7:符號集（D）{set_name: [symbol_id, ...]};舊檔無 → {}
    symbol_sets: dict[str, list[str]] = field(default_factory=dict)

    # v5.3 / v5.4:投注結構 / 倍數系統 / 金幣面額（選用;舊檔 → 預設）
    bet_config: "BetConfig" = field(default_factory=lambda: BetConfig())
    # v8.6 / R5 E-16:比倍設定(選用;舊檔 → 預設停用)
    gamble: "GambleConfig" = field(default_factory=lambda: GambleConfig())
    multipliers: "Multipliers" = field(default_factory=lambda: Multipliers())
    coin_values: "CoinValues" = field(default_factory=lambda: CoinValues())
    # v6.0-b:真實輪帶（啟用時引擎視窗抽樣）;reel_strips[mode][reel_id] = [sym,...]
    reel_strips_enabled: bool = False
    reel_strips: dict = field(default_factory=dict)
    # v8.0:bonus_games 已移除(bonus 併入 mode 玩法種類 mode_kind;獎項在 ModeConfig.items)。
    # v7.11:產牌限制 / 生成期約束（選用;對應 07b_Gen_Limits）
    #   本工具僅描述 + 帶資料 + 文件輸出,不在本引擎執行;供下游數據模擬工具消費。
    gen_limits: list["GenLimit"] = field(default_factory=list)

    # §4.8/§4.9:關聯型產牌條件（選用;對應 07c_Gen_Constraints）
    #   多符號合計 / 位置關係 / 盤面狀態 + 巢狀例外。本工具僅描述 + 帶資料,不在本引擎執行。
    gen_constraints: list["GenConstraint"] = field(default_factory=list)

    # v8.8 / R4 B-6:位置型格子屬性（選用;對應 02d_Cell_Attributes）
    #   固定格乘數(Cygnus)/enhancer cell/Fire Frame/金框格。純描述,引擎不消費。
    cell_attrs: list["CellAttr"] = field(default_factory=list)

    # P0-3:符號家族（選用;對應 03d_Symbol_Groups）。ANY BAR 型混合賠付結構。
    #   純描述,引擎不消費;成員由 SymbolDef.group_id 反查。舊檔無 sheet → []。
    symbol_groups: list["SymbolGroup"] = field(default_factory=list)
    # v8.38 / GAP-T1:輪帶連動(04c_Reel_Links;缺 sheet → [] = 無連動)
    reel_links: list["ReelLink"] = field(default_factory=list)
    # v8.39 / GAP-F1+軌道:軌道(02c_Tracks;缺 sheet → [] = 無軌道)
    tracks: list["Track"] = field(default_factory=list)

    # Megaways 逐模式:逐模式逐輪可變列範圍(05b_Mode_Grid_Range;缺 sheet →
    #   由 05_Grid_Size_Weights + 02.Max_Rows 推導,行為與舊檔一致)。純描述,引擎不消費。
    mode_grid_ranges: list["ModeGridRange"] = field(default_factory=list)

    # v8.25 / G4:獎池級距（選用;對應 19_Jackpot_Tiers）+ 整體觸發方式。
    #   與 13_Jackpots(個別彩池定義)正交:此為 Grand/Major/Minor/Mini 式級距階梯 + 觸發描述。
    #   只描述級距與觸發方式,不模擬命中率。純描述,引擎不消費。舊檔無 sheet → []。
    #   jackpot_trigger:PROBABILITY(機率)/COLLECT_METER(集滿進度)/TOKEN_COUNT(收滿 N 枚);"" = 未指定。
    jackpot_tiers: list["JackpotTier"] = field(default_factory=list)
    jackpot_trigger: str = ""

    # 架構檢閱 #21:收集條 / 進度條（選用;對應 21_Collection_Meters）。
    #   純描述,引擎不消費;累積 / 歸零由下游模擬工具依欄位定義實作。舊檔無 sheet → []。
    meters: list["MeterDef"] = field(default_factory=list)

    # ---- 原始 DataFrame 留存 (供 B 文件「A 參數回填」分頁用) ----
    raw_dataframes: dict[str, Any] = field(default_factory=dict)


# ============================================================
# 例外類別
# ============================================================
class ConfigValidationError(Exception):
    """A.xlsx 設定驗證失敗"""
    def __init__(self, sheet: str, message: str, row: Optional[int] = None):
        self.sheet = sheet
        self.row = row
        loc = f"[{sheet}" + (f" 第 {row} 列" if row else "") + "]"
        super().__init__(f"{loc} {message}")


class PuzzleLoopError(RuntimeError):
    """腳本引擎死循環(由 run.py 捕捉並計入 hard_discard)"""
    pass


# ============================================================
# v6.2 硬約束 #2:多模式 mode_scope 比對工具(單一真相)
# ============================================================
def mode_in_scope(scope: str, mode: str) -> bool:
    """判斷 current ``mode`` 是否落在 ``mode_scope`` 內。

    向後相容:
      - ``scope`` 為 None / 空字串 / ``"ALL"`` → 一律 True(全模式適用)。
      - 單一模式名(如 ``"NG"``)→ 完全比對(行為與舊版一致)。
    v6.2 新增:
      - 逗號分隔的多模式(如 ``"NG,FG1"``)→ 任一相符即 True。
    """
    if scope is None:
        return True
    s = str(scope).strip()
    if not s or s == "ALL":
        return True
    parts = [p.strip() for p in s.split(",") if p.strip()]
    return mode in parts
