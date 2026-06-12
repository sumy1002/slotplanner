"""
SlotPlanner Pro · S1
core/grid_engine.py — Spin 生命週期管理器

職責:
  1. 包裝 ReelGenerator，管理「一次 spin」的完整生命週期
  2. 落盤 → HARD/SOFT 棄牌檢查 → 觸發 ON_GRID_GENERATED → 回傳最終盤面
  3. 提供 apply_action() 介面給 logic_parser 的 stub action 呼叫
  4. 維護 sticky_cells / locked_reels 狀態（跨 combo step）

盤面表示法（開發鐵律）:
  dict[(reel_id, row_idx), Cell]
  row_idx 從 0 開始；subreel 格子接在主輪後面（row_idx >= main_rows）

與 run.py 的串接點::

    from core.grid_engine import GridEngine, SpinResult
    from core.reel_generator import ReelGenerator

    gen = ReelGenerator(layout, symbols, reel_weights, grid_size_weights, constraints)
    engine = GridEngine(gen, discard_rules, max_hard_retry=200)

    rng = random.Random(seed)
    ctx = EvalContext(mode="NG", globals_ref=globals_state)
    result = engine.spin(ctx, rng, logic_parser)
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional, TYPE_CHECKING

from .schemas import (
    SymbolDef, SymbolType,
    DiscardRule, DiscardType,
    Action, ActionType,
    ConfigValidationError,
)

if TYPE_CHECKING:
    from .logic_parser import LogicParser, EvalContext
    from .reel_generator import ReelGenerator


# ============================================================
# Cell：盤面最小單元
# ============================================================

@dataclass
class Cell:
    """盤面上的一個格子"""
    symbol: SymbolDef
    reel_id: int
    row_idx: int
    is_subreel: bool = False
    is_panel: bool = False       # v4.7:屬於自由副盤 (Panel)
    panel_id: str = ""           # v4.7:所屬 Panel 的 ID（is_panel 時有效）
    join_payline: bool = False   # v4.7:此 panel 是否參與主盤連線（否則不計入主盤統計）

    # 狀態旗標（在 Combo 連爆過程中由 action 修改）
    sticky: bool = False        # STICKY action 鎖定
    destroyed: bool = False     # BOARD_DESTROY action 已消除
    locked: bool = False        # LOCK_REEL 或其他鎖定

    @property
    def key(self) -> tuple[int, int]:
        return (self.reel_id, self.row_idx)

    @property
    def symbol_id(self) -> str:
        return self.symbol.symbol_id


# ============================================================
# SpinResult：一次 spin 完整產出
# ============================================================

@dataclass
class SpinResult:
    """GridEngine.spin() 的回傳值"""
    grid: dict[tuple[int, int], Cell]        # 最終盤面
    active_rows: dict[int, int]              # {reel_id: 顯示幾格}
    hard_discard_count: int = 0              # 本 spin HARD 重產次數
    soft_discards: list[str] = field(default_factory=list)  # 觸發的 SOFT 棄牌 rule_id
    is_valid: bool = True                    # False = 超過 max_hard_retry
    fail_reason: str = ""

    def symbol_counts(self) -> dict[str, int]:
        """統計盤面各符號出現次數（已消除格子不計）。
        v4.7:不參與連線的 panel 格子（join_payline=False）不計入主盤統計。
        """
        counts: dict[str, int] = {}
        for cell in self.grid.values():
            if cell.destroyed:
                continue
            if cell.is_panel and not cell.join_payline:
                continue
            counts[cell.symbol_id] = counts.get(cell.symbol_id, 0) + 1
        return counts

    def cells_by_reel(self, reel_id: int) -> list[Cell]:
        return sorted(
            [c for c in self.grid.values() if c.reel_id == reel_id],
            key=lambda c: c.row_idx,
        )


# ============================================================
# GridEngine
# ============================================================

class GridEngine:
    """
    單次 spin 生命週期管理器。

    設計原則：
    - 不持有 AConfig；只依賴已初始化的 ReelGenerator 和 DiscardRule 列表
    - 棄牌邏輯：HARD → 靜默重產（最多 max_hard_retry 次）；SOFT → 記錄但不重產
    - Action 派發由 logic_parser 呼叫 engine.apply_action()
    """

    def __init__(
        self,
        reel_gen: "ReelGenerator",
        discard_rules: list[DiscardRule],
        max_hard_retry: int = 200,
    ):
        self._gen = reel_gen
        self._discard_rules = discard_rules
        self._max_hard_retry = max_hard_retry

    # ────────────────────────────────────────────────────────────
    # 主介面：執行一次 spin
    # ────────────────────────────────────────────────────────────

    def spin(
        self,
        ctx: "EvalContext",
        rng: random.Random,
        logic_parser: "LogicParser",
    ) -> SpinResult:
        """
        執行一次完整 spin：

        1. 呼叫 ReelGenerator.generate_grid() 落盤
        2. 跑 HARD constraint → 超限則靜默重產（最多 max_hard_retry 次）
        3. 轉換為 Cell dict
        4. 執行 SOFT 棄牌評估（記錄不重產）
        5. 觸發 ON_GRID_GENERATED 事件（logic_parser）
        6. 回傳 SpinResult
        """
        mode = ctx.mode
        hard_retry = 0
        soft_discards: list[str] = []
        final_sym_grid: dict[tuple[int, int], SymbolDef] | None = None

        # ── HARD 棄牌迴圈 ──
        while True:
            sym_grid = self._gen.generate_grid(
                mode=mode,
                rng=rng,
                combo_step=ctx.combo_step,
                locked_reels=ctx.spin_locals.get("_locked_reels"),
                sticky_cells=self._extract_sticky_syms(ctx),
            )

            violated = self._gen.check_constraints(sym_grid, mode)
            hard_violations = [v for v in violated
                                if self._is_hard_discard(v, mode, sym_grid, ctx)]

            if not hard_violations:
                final_sym_grid = sym_grid
                break

            hard_retry += 1
            if hard_retry >= self._max_hard_retry:
                # 超過上限：標記無效 spin，由 run.py 計入統計後跳過
                return SpinResult(
                    grid={},
                    active_rows={},
                    hard_discard_count=hard_retry,
                    is_valid=False,
                    fail_reason=f"超過 HARD 棄牌上限 {self._max_hard_retry}",
                )

        # ── 轉換為 Cell dict ──
        grid = self._sym_grid_to_cells(
            final_sym_grid, self._gen.last_active_rows,
            {p.panel_id: p.join_payline for p in self._gen._layout.panels},
        )

        # ── SOFT 棄牌評估（記錄但不重產）──
        for rule in self._discard_rules:
            if rule.dtype == DiscardType.SOFT:
                if self._eval_discard_rule(rule, mode, grid, ctx):
                    soft_discards.append(rule.rule_id)
                    rule.trigger_count += 1

        # ── 同步 ctx 符號計數，供 logic_parser 條件評估 ──
        ctx.symbol_count = {cid: c for cid, c in
                            SpinResult(grid=grid, active_rows={}).symbol_counts().items()}

        # ── 觸發 ON_GRID_GENERATED ──
        from .schemas import TriggerType
        ctx.grid = self         # grid_engine 本身掛在 ctx 供 action stub 呼叫
        ctx.spin_locals["_grid_cells"] = grid
        logic_parser.dispatch(TriggerType.ON_GRID_GENERATED, ctx)

        return SpinResult(
            grid=grid,
            active_rows=self._gen.last_active_rows.copy(),
            hard_discard_count=hard_retry,
            soft_discards=soft_discards,
            is_valid=True,
        )

    # ────────────────────────────────────────────────────────────
    # apply_action：logic_parser stub 的實作入口
    # ────────────────────────────────────────────────────────────

    def apply_action(
        self,
        action: Action,
        ctx: "EvalContext",
    ) -> None:
        """
        接收 logic_parser dispatch 出來的 grid action，修改 ctx 內的盤面狀態。
        S1 實作：STICKY / LOCK_REEL / BOARD_DESTROY（BOARD_FILL / MOVE 等 S3 補）
        """
        atype = action.atype
        grid: dict[tuple[int, int], Cell] = ctx.spin_locals.get("_grid_cells", {})

        if atype == ActionType.STICKY:
            self._apply_sticky(action, grid, ctx)

        elif atype == ActionType.LOCK_REEL:
            self._apply_lock_reel(action, ctx)

        elif atype == ActionType.BOARD_DESTROY:
            self._apply_board_destroy(action, grid, ctx)

        elif atype == ActionType.BOARD_FILL:
            # S3 補實作；先呼叫不做事
            pass

        elif atype == ActionType.BOARD_TRANSFORM:
            self._apply_board_transform(action, grid, ctx)

        elif atype == ActionType.MOVE:
            # S3 補實作
            pass

        elif atype == ActionType.SWAP:
            self._apply_swap(action, grid, ctx)

        # 其餘 action（ADJUST_MULTIPLIER 等）由 logic_parser 自己處理

    # ────────────────────────────────────────────────────────────
    # 個別 action 實作
    # ────────────────────────────────────────────────────────────

    def _apply_sticky(
        self,
        action: Action,
        grid: dict[tuple[int, int], Cell],
        ctx: "EvalContext",
    ) -> None:
        """
        STICKY：把符合條件的格子標記為 sticky，下次 spin 保留。
        params:
          symbol_id  (可選) 只貼特定符號；省略 = 全部
          reel       (可選) 限定 reel_id（int 或 list[int]）
        """
        symbol_id = action.params.get("symbol_id")
        reel_filter = action.params.get("reel")
        if isinstance(reel_filter, int):
            reel_filter = [reel_filter]

        sticky_syms: dict[tuple[int, int], SymbolDef] = \
            ctx.spin_locals.get("_sticky_symbols", {})

        for key, cell in grid.items():
            rid, _ = key
            if reel_filter and rid not in reel_filter:
                continue
            if symbol_id and cell.symbol_id != symbol_id:
                continue
            cell.sticky = True
            sticky_syms[key] = cell.symbol

        ctx.spin_locals["_sticky_symbols"] = sticky_syms

    def _apply_lock_reel(
        self,
        action: Action,
        ctx: "EvalContext",
    ) -> None:
        """
        LOCK_REEL：標記下次 spin 要鎖定的 reel（不重新抽樣）。
        params:
          reel  int | list[int]
        """
        reel = action.params.get("reel", [])
        if isinstance(reel, int):
            reel = [reel]
        locked: set[int] = ctx.spin_locals.get("_locked_reels", set())
        locked.update(reel)
        ctx.spin_locals["_locked_reels"] = locked

    def _apply_board_destroy(
        self,
        action: Action,
        grid: dict[tuple[int, int], Cell],
        ctx: "EvalContext",
    ) -> None:
        """
        BOARD_DESTROY：把符合條件的格子標記為 destroyed（賠付完成後回填）。
        params:
          symbol_id  (可選) 只消除特定符號
          positions  (可選) list of [reel, row]
        """
        symbol_id = action.params.get("symbol_id")
        positions = action.params.get("positions")  # [[reel, row], ...]

        if positions:
            for pos in positions:
                key = (int(pos[0]), int(pos[1]))
                if key in grid:
                    grid[key].destroyed = True
        else:
            for cell in grid.values():
                if symbol_id is None or cell.symbol_id == symbol_id:
                    cell.destroyed = True

    def _apply_board_transform(
        self,
        action: Action,
        grid: dict[tuple[int, int], Cell],
        ctx: "EvalContext",
    ) -> None:
        """
        BOARD_TRANSFORM：把某符號就地替換成另一符號。
        params:
          from_symbol  str
          to_symbol    str
        """
        symbols = self._gen._symbols   # 取 symbol lookup
        from_id = action.params.get("from_symbol", "")
        to_id = action.params.get("to_symbol", "")
        to_sym = symbols.get(to_id)
        if to_sym is None:
            return
        for cell in grid.values():
            if cell.symbol_id == from_id:
                cell.symbol = to_sym

    def _apply_swap(
        self,
        action: Action,
        grid: dict[tuple[int, int], Cell],
        ctx: "EvalContext",
    ) -> None:
        """
        SWAP：交換兩個格子的符號。
        params:
          pos_a  [reel, row]
          pos_b  [reel, row]
        """
        pos_a = action.params.get("pos_a")
        pos_b = action.params.get("pos_b")
        if not pos_a or not pos_b:
            return
        key_a = (int(pos_a[0]), int(pos_a[1]))
        key_b = (int(pos_b[0]), int(pos_b[1]))
        if key_a in grid and key_b in grid:
            grid[key_a].symbol, grid[key_b].symbol = \
                grid[key_b].symbol, grid[key_a].symbol

    # ────────────────────────────────────────────────────────────
    # 棄牌輔助
    # ────────────────────────────────────────────────────────────

    def _is_hard_discard(
        self,
        constraint_id: str,
        mode: str,
        sym_grid: dict[tuple[int, int], SymbolDef],
        ctx: "EvalContext",
    ) -> bool:
        """
        判斷 constraint 觸發是否對應 HARD 棄牌規則。
        若沒有對應的 discard rule → 預設視為 HARD（安全預設）。
        """
        for rule in self._discard_rules:
            if rule.dtype == DiscardType.HARD:
                # rule.reason_label 慣例上包含 constraint_id，或直接用條件判斷
                if constraint_id in (rule.rule_id, rule.reason_label):
                    if rule.mode_scope == "ALL" or rule.mode_scope == mode:
                        return True
        # 若找不到對應規則，保守視為 HARD
        return True

    def _eval_discard_rule(
        self,
        rule: DiscardRule,
        mode: str,
        grid: dict[tuple[int, int], Cell],
        ctx: "EvalContext",
    ) -> bool:
        """評估 SOFT 棄牌規則條件"""
        if rule.mode_scope != "ALL" and rule.mode_scope != mode:
            return False
        if rule.condition is None:
            return True

        from .logic_parser import evaluate_condition
        # 先把 symbol_count 更新到 ctx（v4.7:不參與連線的 panel 格子不計）
        counts: dict[str, int] = {}
        for cell in grid.values():
            if cell.destroyed:
                continue
            if cell.is_panel and not cell.join_payline:
                continue
            counts[cell.symbol_id] = counts.get(cell.symbol_id, 0) + 1
        ctx.symbol_count = counts

        return evaluate_condition(rule.condition, ctx)

    # ────────────────────────────────────────────────────────────
    # 轉換工具
    # ────────────────────────────────────────────────────────────

    @staticmethod
    def _sym_grid_to_cells(
        sym_grid: dict[tuple[int, int], SymbolDef],
        active_rows: dict[int, int],
        panel_join: dict[str, bool] | None = None,
    ) -> dict[tuple[int, int], Cell]:
        """SymbolDef grid → Cell grid"""
        panel_join = panel_join or {}
        cells: dict[tuple[int, int], Cell] = {}
        for (first, row_idx), sym in sym_grid.items():
            # v4.7:panel 格子 key 第一維是字串 panel_id;主輪是 int reel_id
            if isinstance(first, str):
                cells[(first, row_idx)] = Cell(
                    symbol=sym,
                    reel_id=-1,
                    row_idx=row_idx,
                    is_subreel=False,
                    is_panel=True,
                    panel_id=first,
                    join_payline=bool(panel_join.get(first, False)),
                )
                continue
            reel_id = first
            main_rows = active_rows.get(reel_id, 0)
            is_sub = row_idx >= main_rows
            cells[(reel_id, row_idx)] = Cell(
                symbol=sym,
                reel_id=reel_id,
                row_idx=row_idx,
                is_subreel=is_sub,
            )
        return cells

    @staticmethod
    def _extract_sticky_syms(ctx: "EvalContext") -> dict[tuple[int, int], SymbolDef]:
        """從 ctx 取出上一次 spin 留下的 sticky 符號"""
        raw: dict[tuple[int, int], SymbolDef] = ctx.spin_locals.get("_sticky_symbols", {})
        return dict(raw)

    # ────────────────────────────────────────────────────────────
    # 工具：重置跨 spin 的暫存狀態（在 combo 結束後或新 spin 前呼叫）
    # ────────────────────────────────────────────────────────────

    @staticmethod
    def reset_spin_state(ctx: "EvalContext") -> None:
        """
        清空只活在單次 spin 內的 ctx 暫存狀態。
        不清跨局 globals_ref，不清 mode。
        """
        ctx.spin_locals.pop("_grid_cells", None)
        ctx.spin_locals.pop("_locked_reels", None)
        # sticky_symbols 保留直到 ON_SPIN_START 規則決定清除

    @staticmethod
    def clear_sticky(ctx: "EvalContext") -> None:
        """顯式清除 sticky 狀態（通常在離開 FG 模式時呼叫）"""
        ctx.spin_locals.pop("_sticky_symbols", None)
