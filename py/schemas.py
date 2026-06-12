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

    @property
    def effective_kind(self) -> str:
        return self.subreel_kind or "STACK"

    @property
    def is_dual_panel(self) -> bool:
        return self.has_subreel and self.effective_kind == "DUAL_PANEL"


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

    @property
    def cell_count(self) -> int:
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

    @property
    def is_mega(self) -> bool:
        return self.mega_width > 1 or self.mega_height > 1


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
# 腳本引擎 (對應 09_Puzzle_Rules) — 條件樹
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
