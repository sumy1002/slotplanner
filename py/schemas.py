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

    @property
    def is_mega(self) -> bool:
        return self.mega_width > 1 or self.mega_height > 1


# ============================================================
# Bonus 小遊戲 (對應 17_Bonus_Games, v6.0-c)
# ============================================================
@dataclass
class BonusItem:
    label:        str = ""
    value:        float = 0.0
    weight:       float = 100.0
    is_end:       bool = False
    link_jackpot: str = ""

@dataclass
class BonusGame:
    bonus_id:         str = "BG1"
    type:             str = "WHEEL"   # WHEEL / PICK / COLLECTION
    title:            str = ""
    trigger_desc:     str = ""
    mode_scope:       str = "ALL"
    wheel_upgrade_to: str = ""
    pick_count:       int = 0
    collect_target:   int = 0
    items:            list = None
    notes:            str = ""
    def __post_init__(self):
        if self.items is None: self.items = []

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

@dataclass
class BetConfig:
    ante_bet_enabled:      bool  = False
    ante_bet_mult:         float = 1.25
    ante_bet_trigger_mult: float = 2.0
    ante_bet_desc:         str   = ""
    buy_features:          list  = None
    def __post_init__(self):
        if self.buy_features is None:
            self.buy_features = []

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
@dataclass
class ConditionLeaf:
    """葉節點:單一比較"""
    var: str           # "combo_step" / "symbol_count.WILD" / "global.coin_pool"
    op: ConditionOp
    value: Any


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


# ============================================================
# 觸發給付 (scatter-pay,v6.4 / 缺漏#4)
# ============================================================
@dataclass
class TriggerPay:
    scatter_count: int            # 觸發所需 scatter 數
    pay: float = 0.0              # 注額倍數(觸發即付)
    grants_spins: int = 0         # 該觸發給予的免費局數(0 = 不適用 / 沿用模式 spin_count)


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
    multipliers: "Multipliers" = field(default_factory=lambda: Multipliers())
    coin_values: "CoinValues" = field(default_factory=lambda: CoinValues())
    # v6.0-b:真實輪帶（啟用時引擎視窗抽樣）;reel_strips[mode][reel_id] = [sym,...]
    reel_strips_enabled: bool = False
    reel_strips: dict = field(default_factory=dict)
    # v6.0-c:Bonus 小遊戲（選用）
    bonus_games: list = field(default_factory=list)
    # v7.11:產牌限制 / 生成期約束（選用;對應 07b_Gen_Limits）
    #   本工具僅描述 + 帶資料 + 文件輸出,不在本引擎執行;供下游數據模擬工具消費。
    gen_limits: list["GenLimit"] = field(default_factory=list)

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
