"""
SlotPlanner Pro · S1
core/reel_generator.py — Reel 產牌模組

職責:
  1. 依照 04_Reel_Weights 建立每個 (mode, reel_id) 的加權抽樣池
  2. 支援 Megaways：依 05_Grid_Size_Weights 先決定該 spin 每 Reel 有幾格
  3. 支援副 Reel (is_subreel)
  4. 尊重 07_Constraints（REEL_RESTRICT / GLOBAL_MAX / GLOBAL_MIN / ADJACENCY_FORBID）
  5. 回傳 dict[(reel_id, row_idx), SymbolDef] — 鍵值與 grid_engine 一致

開發鐵律:
  - Reel-First：所有 array 第一維是 Reel
  - 不用 2D array，用 Dict[(reel, row), Cell]
  - 不持有 AConfig 本身，只接收必要的子資料（方便單元測試）
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Optional

from .schemas import (
    ReelLayout, LayoutConfig, PanelDef,
    SymbolDef, SymbolType,
    ReelWeight, GridSizeWeight, ComboWeightOverride,
    Constraint, ConstraintType,
    mode_in_scope,
)


# ============================================================
# 抽樣池 (預先建好，每次 spin 直接呼叫 random.choices)
# ============================================================

@dataclass
class _WeightPool:
    """單一 (mode, reel_id, is_subreel) 的符號抽樣池"""
    symbols: list[SymbolDef]
    weights: list[float]

    def draw(self, rng: random.Random) -> SymbolDef:
        return rng.choices(self.symbols, weights=self.weights, k=1)[0]

    def draw_n(self, n: int, rng: random.Random) -> list[SymbolDef]:
        return rng.choices(self.symbols, weights=self.weights, k=n)


@dataclass
class _GridSizePool:
    """Megaways：某 (mode, reel_id) 每 spin 可能顯示幾格的抽樣池"""
    sizes: list[int]
    weights: list[float]

    def draw(self, rng: random.Random) -> int:
        return rng.choices(self.sizes, weights=self.weights, k=1)[0]


# ============================================================
# ReelGenerator
# ============================================================

class ReelGenerator:
    """
    建立所有抽樣池，每次 spin 呼叫 generate_grid() 取得盤面。

    用法::

        gen = ReelGenerator(layout, symbols, reel_weights,
                            grid_size_weights, constraints)
        rng = random.Random(seed)
        grid = gen.generate_grid(mode="NG", rng=rng)
        # grid: dict[(reel_id, row_idx), SymbolDef]  row_idx 從 0

    Megaways 盤::

        grid = gen.generate_grid(mode="NG", rng=rng)
        active_rows = gen.last_active_rows   # {reel_id: int}
    """

    def __init__(
        self,
        layout: LayoutConfig,
        symbols: dict[str, SymbolDef],
        reel_weights: list[ReelWeight],
        grid_size_weights: list[GridSizeWeight],
        constraints: list[Constraint],
        combo_weights: list[ComboWeightOverride] | None = None,
        symbol_sets: dict[str, list[str]] | None = None,
    ):
        self._layout = layout
        self._symbols = symbols
        self._constraints = constraints
        self._combo_weights = combo_weights or []
        self._symbol_sets = symbol_sets or {}   # v4.7（D）

        # v4.7:panel 抽樣池 key = (mode, panel_id)（在 _build_pools 內填）
        self._panel_pools: dict[tuple[str, str], _WeightPool] = {}

        # 建主抽樣池：key = (mode, reel_id, is_subreel)
        self._pools: dict[tuple[str, int, bool], _WeightPool] = {}
        self._build_pools(reel_weights)

        # 建 Megaways grid-size 池：key = (mode, reel_id)
        self._gsize_pools: dict[tuple[str, int], _GridSizePool] = {}
        self._build_gsize_pools(grid_size_weights)

        # 建 Combo 覆蓋池（依 after_combo 分層）
        # key = (mode, reel_id, after_combo)
        self._combo_pools: dict[tuple[str, int, int], _WeightPool] = {}
        self._build_combo_pools()

        # 最後一次 generate_grid 的盤面資訊（供外部讀取）
        self.last_active_rows: dict[int, int] = {}

    # ────────────────────────────────────────────────────────────
    # 初始化：建抽樣池
    # ────────────────────────────────────────────────────────────

    def _build_pools(self, reel_weights: list[ReelWeight]) -> None:
        """依 (mode, reel_id, is_subreel) 分組建主輪/副輪 _WeightPool。
        v4.7:panel 權重（panel_id 非空）另建 self._panel_pools[(mode, panel_id)]。
        """
        groups: dict[tuple, list[ReelWeight]] = {}
        panel_groups: dict[tuple, list[ReelWeight]] = {}
        for w in reel_weights:
            if getattr(w, "panel_id", ""):
                panel_groups.setdefault((w.mode, w.panel_id), []).append(w)
            else:
                groups.setdefault((w.mode, w.reel_id, w.is_subreel), []).append(w)

        def _mk(ws):
            sym_list, wt_list = [], []
            for w in ws:
                sym = self._symbols.get(w.symbol_id)
                if sym is None:
                    continue
                sym_list.append(sym)
                wt_list.append(w.weight)
            return _WeightPool(sym_list, wt_list) if sym_list else None

        for key, ws in groups.items():
            pool = _mk(ws)
            if pool:
                self._pools[key] = pool
        for key, ws in panel_groups.items():
            pool = _mk(ws)
            if pool:
                self._panel_pools[key] = pool

    def _build_gsize_pools(self, grid_size_weights: list[GridSizeWeight]) -> None:
        groups: dict[tuple, list[GridSizeWeight]] = {}
        for g in grid_size_weights:
            key = (g.mode, g.reel_id)
            groups.setdefault(key, []).append(g)

        for key, gs in groups.items():
            sizes = [g.grid_size for g in gs]
            wts = [g.weight for g in gs]
            self._gsize_pools[key] = _GridSizePool(sizes, wts)

    def _build_combo_pools(self) -> None:
        if not self._combo_weights:
            return
        groups: dict[tuple, list[ComboWeightOverride]] = {}
        for c in self._combo_weights:
            key = (c.mode, c.reel_id, c.after_combo)
            groups.setdefault(key, []).append(c)

        for key, cws in groups.items():
            sym_list, wt_list = [], []
            for c in cws:
                sym = self._symbols.get(c.symbol_id)
                if sym is None:
                    continue
                sym_list.append(sym)
                wt_list.append(c.weight)
            if sym_list:
                self._combo_pools[key] = _WeightPool(sym_list, wt_list)

    # ────────────────────────────────────────────────────────────
    # 主介面：產生單次 spin 盤面
    # ────────────────────────────────────────────────────────────

    def generate_grid(
        self,
        mode: str,
        rng: random.Random,
        combo_step: int = 0,
        locked_reels: set[int] | None = None,
        sticky_cells: dict[tuple[int, int], SymbolDef] | None = None,
    ) -> dict[tuple[int, int], SymbolDef]:
        """
        產生一次 spin 的盤面。

        :param mode:         當前模式名稱（"NG" / "FG" 等）
        :param rng:          已播種的 random.Random（保證可重現）
        :param combo_step:   當前連爆步數（0 = 初始落盤）
        :param locked_reels: 被 LOCK_REEL action 鎖定的 reel_id 集合
        :param sticky_cells: 被 STICKY action 保留的格子 {(reel, row): SymbolDef}
        :return:             盤面 dict[(reel_id, row_idx), SymbolDef]，row_idx 從 0
        """
        locked_reels = locked_reels or set()
        sticky_cells = sticky_cells or {}

        grid: dict[tuple[int, int], SymbolDef] = {}
        self.last_active_rows = {}

        for reel in self._layout.reels:
            rid = reel.reel_id

            # ── 決定本 Reel 本次顯示幾格（Megaways / 固定高度）──
            active_rows = self._get_active_rows(mode, reel, rng)
            self.last_active_rows[rid] = active_rows

            # ── 本欄活格 row index（v7.5-Layer C:遮罩裁切;cells=None → 全實心）──
            active_local = reel.active_local_rows(active_rows)

            # ── 鎖定 Reel：從舊 sticky_cells 複製整欄 ──
            if rid in locked_reels:
                for row in active_local:
                    k = (rid, row)
                    grid[k] = sticky_cells.get(k) or self._fallback_draw(mode, rid, False, rng, combo_step)
                # 副輪
                if reel.has_subreel:
                    self._fill_subreel(grid, mode, reel, rng, combo_step, sticky_cells)
                continue

            # ── 填主輪格子 ──
            pool = self._get_pool(mode, rid, False, combo_step)
            if pool is None:
                raise RuntimeError(f"找不到抽樣池：mode={mode} reel={rid}")

            for row in active_local:
                k = (rid, row)
                if k in sticky_cells:
                    grid[k] = sticky_cells[k]
                else:
                    grid[k] = pool.draw(rng)

            # ── 填副輪 ──
            if reel.has_subreel:
                self._fill_subreel(grid, mode, reel, rng, combo_step, sticky_cells)

        # ── v4.7:填自由副盤 (Panel) ──
        for panel in self._layout.panels:
            self._fill_panel(grid, mode, panel, rng, combo_step, sticky_cells)

        return grid

    def _get_active_rows(
        self,
        mode: str,
        reel: ReelLayout,
        rng: random.Random,
    ) -> int:
        """決定此 reel 在本 spin 顯示幾格（Megaways 抽樣 / 固定高度）"""
        gsize_key = (mode, reel.reel_id)
        pool = self._gsize_pools.get(gsize_key)
        if pool is not None:
            return pool.draw(rng)
        return reel.max_rows   # 無 Megaways 設定 → 固定高度

    def _fill_subreel(
        self,
        grid: dict[tuple[int, int], SymbolDef],
        mode: str,
        reel: ReelLayout,
        rng: random.Random,
        combo_step: int,
        sticky_cells: dict[tuple[int, int], SymbolDef],
    ) -> None:
        """填副輪格子（subreel）；行號接在主輪後面（或沿用 subreel_position 解讀）。

        v4.6:四種 subreel_kind 都走同一條抽樣路徑（接在主輪後的連續 row index），
        差別只在「列數」與「權重來源」:
          - DUAL_PANEL（雙盤面）:列數 = 主輪實際列數（與主盤同尺寸、無滾動），
            每次 spin 重抽一次即為靜態盤面;權重可沿用主輪或用獨立副輪池。
          - STACK / SIDE_VERTICAL / TOP_HORIZONTAL:沿用 subreel_rows。
        位置(TOP/BOTTOM/LEFT/RIGHT)純為視覺資訊，不影響抽樣。
        """
        if not reel.has_subreel:
            return
        rid = reel.reel_id
        main_rows = self.last_active_rows.get(rid, reel.max_rows)
        # 雙盤面:列數鎖定為主輪實際列數（無滾動的第二張同尺寸盤）
        if reel.effective_kind == "DUAL_PANEL":
            sub_count = main_rows
        else:
            sub_count = reel.subreel_rows
        if sub_count <= 0:
            return
        pool = self._get_pool(mode, rid, True, combo_step)
        if pool is None:
            # v5.1:優先序更新 — 04 副盤專屬池 → SubReel_Symbol_Set 等權 → 沿用主輪
            sset = getattr(reel, "subreel_symbol_set", "")
            if sset:
                pool = self._subreel_set_pool(sset)
            if pool is None and reel.subreel_inherit_weight:
                pool = self._get_pool(mode, rid, False, combo_step)
            if pool is None:
                return

        for sub_row in range(sub_count):
            # 副輪 row index 接在主輪後面（以負數區分也可，此處用連續正整數）
            k = (rid, main_rows + sub_row)
            if k in sticky_cells:
                grid[k] = sticky_cells[k]
            else:
                grid[k] = pool.draw(rng)

    def _subreel_set_pool(self, sset: str):
        """v5.1:附掛副盤符號集等權池(lazy 快取;空集/查無 → None)"""
        cache = getattr(self, "_subreel_set_pools", None)
        if cache is None:
            cache = {}
            self._subreel_set_pools = cache
        if sset in cache:
            return cache[sset]
        members = self._symbol_sets.get(sset, [])
        syms = [self._symbols[m] for m in members if m in self._symbols]
        pool = _WeightPool(syms, [1.0] * len(syms)) if syms else None
        cache[sset] = pool
        return pool

    def _panel_pool(self, mode: str, panel: "PanelDef"):
        """取 panel 的抽樣池。優先序:
        1) panel 專屬權重池 (mode, panel_id)
        2) 若 panel 指定 symbol_set → 以該符號集等權建臨時池（D）
        3) inherit_weight=True → 沿用主輪 reel 1 的池（保底）
        回傳 _WeightPool 或 None。
        """
        pool = self._panel_pools.get((mode, panel.panel_id))
        if pool is not None:
            return pool
        # symbol_set 等權臨時池
        if panel.symbol_set:
            members = self._symbol_sets.get(panel.symbol_set, [])
            syms = [self._symbols[s] for s in members if s in self._symbols]
            if syms:
                return _WeightPool(syms, [1.0] * len(syms))
        # 保底:沿用主輪 reel 1
        if panel.inherit_weight:
            return self._pools.get((mode, 1, False))
        return None

    def _fill_panel(
        self,
        grid: dict,
        mode: str,
        panel: "PanelDef",
        rng: random.Random,
        combo_step: int,
        sticky_cells: dict,
    ) -> None:
        """v4.7:填自由副盤 (Panel)。

        - 格子 key = (panel_id, local_index)，local_index = r*width + c（與主輪 int key 不衝突）。
        - scroll=False:每 spin 靜態抽滿整個 width×height（雙盤面 / pick 格）。
        - scroll=True:同樣抽滿（P1 不模擬逐欄滾動動畫，僅落盤結果相同）。
        - 權重來源見 _panel_pool（專屬池 / symbol_set / 保底）。
        """
        pool = self._panel_pool(mode, panel)
        if pool is None:
            return
        w = max(0, panel.width)
        h = max(0, panel.height)
        # v7.x Layer C:只物化活格遮罩內的格子;遮罩外的格不抽符號、不入 grid
        #   → 自動不參與連線 / symbol_count（下游遍歷 grid 實際 key）。cells=None → 整塊矩形。
        active = set(panel.active_local_cells())
        for r in range(h):
            for c in range(w):
                if (c, r) not in active:
                    continue
                local = r * w + c
                k = (panel.panel_id, local)
                if k in sticky_cells:
                    grid[k] = sticky_cells[k]
                else:
                    grid[k] = pool.draw(rng)

    def _get_pool(
        self,
        mode: str,
        reel_id: int,
        is_subreel: bool,
        combo_step: int,
    ) -> "_WeightPool | None":
        """依優先順序取抽樣池：combo 覆蓋 > 一般池"""
        # 找 combo 覆蓋：取 after_combo <= combo_step 中最大的那個
        best_combo = -1
        best_pool = None
        for (m, rid, ac), pool in self._combo_pools.items():
            if m == mode and rid == reel_id and ac <= combo_step and ac > best_combo:
                best_combo = ac
                best_pool = pool
        if best_pool is not None:
            return best_pool

        # 一般池
        return self._pools.get((mode, reel_id, is_subreel))

    def _fallback_draw(
        self,
        mode: str,
        reel_id: int,
        is_subreel: bool,
        rng: random.Random,
        combo_step: int,
    ) -> SymbolDef:
        pool = self._get_pool(mode, reel_id, is_subreel, combo_step)
        if pool:
            return pool.draw(rng)
        # 最終保底：回傳第一個符號（不應發生）
        return next(iter(self._symbols.values()))

    # ────────────────────────────────────────────────────────────
    # 輔助：盤面符號計數（供 constraint 檢查用）
    # ────────────────────────────────────────────────────────────

    @staticmethod
    def count_symbols(
        grid: dict[tuple[int, int], SymbolDef]
    ) -> dict[str, int]:
        """統計盤面各符號出現次數 {symbol_id: count}"""
        counts: dict[str, int] = {}
        for sym in grid.values():
            counts[sym.symbol_id] = counts.get(sym.symbol_id, 0) + 1
        return counts

    # ────────────────────────────────────────────────────────────
    # Constraint 評估（供 GridEngine.validate_hard_constraints 呼叫）
    # ────────────────────────────────────────────────────────────

    def check_constraints(
        self,
        grid: dict[tuple[int, int], SymbolDef],
        mode: str,
    ) -> list[str]:
        """
        回傳被觸發的 constraint_id 清單（空 = 全部通過）。
        由 GridEngine 決定要 HARD 拋棄或 SOFT 記錄。
        """
        violated: list[str] = []
        counts = self.count_symbols(grid)

        for c in self._constraints:
            # mode_scope 過濾：ALL / 單模式 / 逗號多模式(v6.2)皆支援
            if not mode_in_scope(c.mode_scope, mode):
                continue

            if c.ctype == ConstraintType.REEL_RESTRICT:
                # 此符號只允許出現在指定 reel
                allowed = set(c.reels_allowed)
                for (reel_id, row), sym in grid.items():
                    if sym.symbol_id == c.symbol_id and reel_id not in allowed:
                        violated.append(c.constraint_id)
                        break

            elif c.ctype == ConstraintType.GLOBAL_MAX:
                if counts.get(c.symbol_id, 0) > c.threshold:
                    violated.append(c.constraint_id)

            elif c.ctype == ConstraintType.GLOBAL_MIN:
                if counts.get(c.symbol_id, 0) < c.threshold:
                    violated.append(c.constraint_id)

            elif c.ctype == ConstraintType.ADJACENCY_FORBID:
                # 同符號不可水平相鄰
                if _has_horizontal_adjacency(grid, c.symbol_id):
                    violated.append(c.constraint_id)

        return violated


# ────────────────────────────────────────────────────────────
# 私有輔助函式
# ────────────────────────────────────────────────────────────

def _has_horizontal_adjacency(
    grid: dict[tuple[int, int], SymbolDef],
    symbol_id: str,
) -> bool:
    """偵測指定符號是否有同 row 相鄰（reel 連續）的情況"""
    # 收集 {(row, reel_id)} 中的符號
    by_row: dict[int, list[int]] = {}
    for (reel_id, row), sym in grid.items():
        if sym.symbol_id == symbol_id:
            by_row.setdefault(row, []).append(reel_id)

    for row, reels in by_row.items():
        sorted_reels = sorted(reels)
        for i in range(len(sorted_reels) - 1):
            if sorted_reels[i + 1] - sorted_reels[i] == 1:
                return True
    return False
