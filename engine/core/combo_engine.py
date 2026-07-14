"""
SlotPlanner Pro · S2
core/combo_engine.py — 連爆引擎

連爆流程（每個 spin 可能多輪）：
  1. PayResolver.resolve(grid) → 找所有得獎
  2. 若無得獎 → 觸發 ON_DEAD_SPIN → 結束
  3. 觸發 ON_WIN_RESOLVED（每筆 WinEvent 觸發一次 ON_SYMBOL_LANDED）
  4. 消除得獎格（BOARD_DESTROY）
  5. 觸發 ON_COMBO_STEP
  6. GridEngine.refill(grid) → 回填空格（重新抽樣）
  7. combo_step += 1，回到步驟 1
  8. 結束條件：無得獎 或 HALT_RESOLUTION

統計產出（供 run.py / stats/collector.py 使用）：
  ComboResult.win_events  — 所有輪次的 WinEvent（含 combo_step 標記）
  ComboResult.total_base  — 本 spin 總基礎賠付
  ComboResult.combo_steps — 實際連爆次數
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING
import random

from .schemas import TriggerType, ActionType
from .pay_resolver import PayResolver, WinEvent

if TYPE_CHECKING:
    from .grid_engine import GridEngine, Cell
    from .logic_parser import LogicParser, EvalContext
    from .reel_generator import ReelGenerator


# ============================================================
# ComboResult：一次 spin 連爆結果彙整
# ============================================================

@dataclass
class ComboResult:
    win_events: list[WinEvent] = field(default_factory=list)
    total_base: float = 0.0         # sum(base_payout * multiplier) 各步累加
    combo_steps: int = 0            # 實際連爆次數（0 = 死局）
    final_multiplier: float = 1.0   # 最後一步的 multiplier
    is_dead_spin: bool = True       # 整局無任何得獎


# ============================================================
# ComboEngine
# ============================================================

class ComboEngine:
    """
    連爆引擎。

    用法::

        combo = ComboEngine(resolver, engine, gen)
        result = combo.run(grid, ctx, rng, parser)
    """

    def __init__(
        self,
        resolver: PayResolver,
        engine: "GridEngine",
        gen: "ReelGenerator",
        max_combo: int = 200,
    ):
        self._resolver = resolver
        self._engine = engine
        self._gen = gen
        self._max_combo = max_combo     # 安全上限，防止無限連爆

    # ────────────────────────────────────────────────────────────
    # 主介面
    # ────────────────────────────────────────────────────────────

    def run(
        self,
        grid: "dict[tuple[int,int], Cell]",
        ctx: "EvalContext",
        rng: random.Random,
        parser: "LogicParser",
    ) -> ComboResult:
        """
        執行連爆迴圈直到無得獎或 HALT_RESOLUTION。

        :param grid:   初始盤面（dict[(reel, row), Cell]，來自 GridEngine.spin）
        :param ctx:    EvalContext（會被修改：combo_step / multiplier / win_events）
        :param rng:    隨機數生成器
        :param parser: LogicParser 實例
        :return:       ComboResult
        """
        result = ComboResult()
        ctx.combo_step = 0
        ctx.multiplier = 1.0

        for _step in range(self._max_combo):

            # ── 1. 賠付解析 ──
            wins = self._resolver.resolve(grid)

            # ── 2. 無得獎 → 死局 ──
            if not wins:
                if ctx.combo_step == 0:
                    result.is_dead_spin = True
                    ctx.consecutive_dead_spins += 1
                    parser.dispatch(TriggerType.ON_DEAD_SPIN, ctx)
                break

            result.is_dead_spin = False

            # ── 3. ON_WIN_RESOLVED + ON_SYMBOL_LANDED ──
            ctx.win_events = wins
            parser.dispatch(TriggerType.ON_WIN_RESOLVED, ctx)

            for win in wins:
                ctx.spin_locals["_last_win"] = win
                parser.dispatch(TriggerType.ON_SYMBOL_LANDED, ctx)

            # ── 4. 計算本步賠付（乘以當前 multiplier）──
            step_base = sum(w.base_payout for w in wins)
            step_total = step_base * ctx.multiplier

            # 標記 combo_step 後存入結果
            for w in wins:
                w_copy = WinEvent(
                    symbol_id=w.symbol_id,
                    count=w.count,
                    base_payout=w.base_payout * ctx.multiplier,
                    line_id=w.line_id,
                    positions=list(w.positions),
                    win_type=w.win_type,
                )
                result.win_events.append(w_copy)

            result.total_base += step_total
            result.combo_steps += 1
            ctx.total_multiplier += step_total

            # ── 5. 消除得獎格 ──
            winning_positions: set[tuple[int, int]] = set()
            for w in wins:
                winning_positions.update(w.positions)

            for pos in winning_positions:
                if pos in grid:
                    grid[pos].destroyed = True

            # ── 6. ON_COMBO_STEP（可能觸發 ADJUST_MULTIPLIER / HALT 等）──
            parser.dispatch(TriggerType.ON_COMBO_STEP, ctx)

            # HALT_RESOLUTION 檢查
            if ctx.spin_locals.get("_halt"):
                ctx.spin_locals.pop("_halt")
                break

            # ── 7. 回填空格 ──
            self._refill(grid, ctx, rng)

            # ── 8. combo_step 遞增 ──
            ctx.combo_step += 1

        result.final_multiplier = ctx.multiplier

        # ── ON_COMBO_END ──
        parser.dispatch(TriggerType.ON_COMBO_END, ctx)

        return result

    # ────────────────────────────────────────────────────────────
    # 回填空格
    # ────────────────────────────────────────────────────────────

    def _refill(
        self,
        grid: "dict[tuple[int,int], Cell]",
        ctx: "EvalContext",
        rng: random.Random,
    ) -> None:
        """
        把已消除（destroyed=True）的格子重新抽樣填入。
        Sticky 格子不回填。
        落點維持同一 (reel, row)（Tumble/Cascade 式，格子原地更新）。

        若需要「從上方落下補格」（Avalanche 式），S3 可擴充此方法。
        """
        from .grid_engine import Cell

        sticky_syms = ctx.spin_locals.get("_sticky_symbols", {})

        for key, cell in grid.items():
            if not cell.destroyed:
                continue
            if key in sticky_syms:
                # Sticky 格子：恢復原符號，不重新抽樣
                cell.symbol = sticky_syms[key]
                cell.destroyed = False
                continue

            reel_id, row_idx = key
            # 重新抽樣（使用當前 combo_step 的權重池）
            new_sym = self._gen._fallback_draw(
                mode=ctx.mode,
                reel_id=reel_id,
                is_subreel=cell.is_subreel,
                rng=rng,
                combo_step=ctx.combo_step,
            )
            cell.symbol = new_sym
            cell.destroyed = False
            cell.sticky = False
            cell.locked = False
