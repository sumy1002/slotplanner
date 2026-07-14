"""
SlotPlanner Pro · S2
core/pay_resolver.py — 賠付解析器

支援四種賠付模式（由 01_Global pay_type 決定）：
  LINE    — 沿 06_Paylines 定義的線路比對
  WAYS    — 所有左右相鄰欄組合（243 ways / Megaways）
  SCATTER — 特定符號出現 N 個以上即得獎（無視位置）
  CLUSTER — 同符號相鄰格子連通數 >= cluster_min_size

Wild 代換規則（通用）：
  - is_wild=True 的符號可代換任意 non-scatter/non-wild 符號
  - Wild 本身若有 pay_table 則以最高賠率計算

回傳 list[WinEvent]，每筆包含：
  - symbol_id / count / payout / line_id / positions
  供 combo_engine 彙整後乘以 multiplier
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from .schemas import (
    SymbolDef, SymbolType, PayType, WaysDirection,
    Payline, GlobalConfig,
)

if TYPE_CHECKING:
    from .grid_engine import Cell


# ============================================================
# WinEvent：單筆得獎記錄
# ============================================================

@dataclass
class WinEvent:
    symbol_id: str                          # 得獎符號
    count: int                              # 中獎數量（連線長度 / 出現次數）
    base_payout: float                      # 基礎賠付（倍率，未乘 multiplier）
    line_id: int = -1                       # LINE 模式：payline id；其餘 = -1
    positions: list[tuple[int, int]] = field(default_factory=list)
    win_type: str = ""                      # "LINE" / "WAYS" / "SCATTER" / "CLUSTER"

    @property
    def is_dead(self) -> bool:
        return self.base_payout <= 0


# ============================================================
# PayResolver
# ============================================================

class PayResolver:
    """
    賠付解析器。不持有盤面狀態，每次 resolve() 傳入當前盤面。

    用法::

        resolver = PayResolver(global_cfg, symbols, paylines)
        wins = resolver.resolve(grid)   # grid: dict[(reel, row), Cell]
        total_base = sum(w.base_payout for w in wins)
    """

    def __init__(
        self,
        global_cfg: GlobalConfig,
        symbols: dict[str, SymbolDef],
        paylines: list[Payline],
    ):
        self._cfg = global_cfg
        self._symbols = symbols
        self._paylines = paylines
        self._pay_type = global_cfg.pay_type
        self._ways_dir = global_cfg.ways_direction
        self._cluster_min = global_cfg.cluster_min_size

        # 預先找出 wild 符號
        self._wilds: set[str] = {
            sid for sid, sym in symbols.items() if sym.is_wild
        }
        # 預先找出 scatter 符號
        self._scatters: set[str] = {
            sid for sid, sym in symbols.items() if sym.is_scatter
        }

    # ────────────────────────────────────────────────────────────
    # 主介面
    # ────────────────────────────────────────────────────────────

    def resolve(
        self,
        grid: "dict[tuple[int,int], Cell]",
    ) -> list[WinEvent]:
        """
        解析當前盤面，回傳所有得獎事件。
        已消除（destroyed）的格子不參與計算。
        """
        active = {k: c for k, c in grid.items() if not c.destroyed}

        if self._pay_type == PayType.LINE:
            wins = self._resolve_line(active)
        elif self._pay_type == PayType.WAYS:
            wins = self._resolve_ways(active)
        elif self._pay_type == PayType.SCATTER:
            wins = self._resolve_scatter(active)
        elif self._pay_type == PayType.CLUSTER:
            wins = self._resolve_cluster(active)
        else:
            wins = []

        # SCATTER 符號額外獨立計算（不管主模式）
        scatter_wins = self._resolve_scatter(active)
        # 避免重複：若主模式已是 SCATTER 就不再加
        if self._pay_type != PayType.SCATTER:
            wins = wins + scatter_wins

        return [w for w in wins if not w.is_dead]

    # ────────────────────────────────────────────────────────────
    # LINE 賠付
    # ────────────────────────────────────────────────────────────

    def _resolve_line(
        self,
        active: "dict[tuple[int,int], Cell]",
    ) -> list[WinEvent]:
        wins: list[WinEvent] = []

        for payline in self._paylines:
            win = self._check_line(active, payline)
            if win:
                wins.append(win)

        return wins

    def _check_line(
        self,
        active: "dict[tuple[int,int], Cell]",
        payline: Payline,
    ) -> WinEvent | None:
        """沿一條 payline 從左往右（或依 direction）找最長連線"""
        path = payline.path

        # 依方向決定掃描順序
        if payline.direction == WaysDirection.RTL:
            path = list(reversed(path))

        # 收集路徑上的符號（row 從 1 開始，與 a_loader path 一致）
        cells_on_line: list[Cell | None] = []
        for (reel, row) in path:
            # path 存的是 1-based row，Cell 裡 row_idx 是 0-based
            cell = active.get((reel, row - 1)) or active.get((reel, row))
            cells_on_line.append(cell)

        if not cells_on_line or cells_on_line[0] is None:
            return None

        # 找第一個非 Wild 符號作為基準
        base_sym_id = self._first_non_wild(cells_on_line)
        if base_sym_id is None:
            # 全 Wild：以 Wild 自身 pay_table 計算
            base_sym_id = cells_on_line[0].symbol_id if cells_on_line[0] else None
            if base_sym_id is None:
                return None

        # 計算連線長度
        count = 0
        positions: list[tuple[int, int]] = []
        for i, cell in enumerate(cells_on_line):
            if cell is None:
                break
            sid = cell.symbol_id
            if sid == base_sym_id or sid in self._wilds:
                count += 1
                positions.append((path[i][0], path[i][1] - 1))
            else:
                break

        # 查 pay_table
        payout = self._lookup_pay(base_sym_id, count)
        if payout <= 0:
            return None

        return WinEvent(
            symbol_id=base_sym_id,
            count=count,
            base_payout=payout,
            line_id=payline.line_id,
            positions=positions,
            win_type="LINE",
        )

    # ────────────────────────────────────────────────────────────
    # WAYS 賠付
    # ────────────────────────────────────────────────────────────

    def _resolve_ways(
        self,
        active: "dict[tuple[int,int], Cell]",
    ) -> list[WinEvent]:
        """
        所有符號在每一欄至少出現一次即計算 ways。
        ways 數 = 各欄該符號出現次數的乘積。
        """
        wins: list[WinEvent] = []

        # 按 reel 分組
        reels_sorted = sorted(set(k[0] for k in active))
        if not reels_sorted:
            return wins

        # 每個非 Wild/Scatter 符號單獨計算
        candidate_syms = {
            c.symbol_id for c in active.values()
            if c.symbol_id not in self._wilds
            and c.symbol_id not in self._scatters
        }

        for sym_id in candidate_syms:
            win = self._check_ways_for_symbol(active, reels_sorted, sym_id)
            if win:
                wins.append(win)

        return wins

    def _check_ways_for_symbol(
        self,
        active: "dict[tuple[int,int], Cell]",
        reels_sorted: list[int],
        sym_id: str,
    ) -> WinEvent | None:
        """計算某符號的 WAYS 連線長度與 ways 數"""
        count = 0          # 連線 reel 數
        ways = 1           # ways 乘積
        positions: list[tuple[int, int]] = []

        ltr = self._ways_dir in (WaysDirection.LTR, WaysDirection.BOTH)
        rtl = self._ways_dir in (WaysDirection.RTL, WaysDirection.BOTH)

        def _calc(reels: list[int]) -> tuple[int, int, list]:
            c, w = 0, 1
            pos = []
            for reel_id in reels:
                cells_this_reel = [
                    cell for (r, row), cell in active.items()
                    if r == reel_id
                    and (cell.symbol_id == sym_id or cell.symbol_id in self._wilds)
                ]
                if not cells_this_reel:
                    break
                c += 1
                w *= len(cells_this_reel)
                pos.extend((reel_id, cell.row_idx) for cell in cells_this_reel)
            return c, w, pos

        best_count, best_ways, best_pos = 0, 0, []

        if ltr:
            c, w, pos = _calc(reels_sorted)
            if c > best_count or (c == best_count and w > best_ways):
                best_count, best_ways, best_pos = c, w, pos

        if rtl:
            c, w, pos = _calc(list(reversed(reels_sorted)))
            if c > best_count or (c == best_count and w > best_ways):
                best_count, best_ways, best_pos = c, w, pos

        if best_count < 3:
            return None

        base_pay = self._lookup_pay(sym_id, best_count)
        if base_pay <= 0:
            return None

        return WinEvent(
            symbol_id=sym_id,
            count=best_count,
            base_payout=base_pay * best_ways,
            positions=best_pos,
            win_type="WAYS",
        )

    # ────────────────────────────────────────────────────────────
    # SCATTER 賠付
    # ────────────────────────────────────────────────────────────

    def _resolve_scatter(
        self,
        active: "dict[tuple[int,int], Cell]",
    ) -> list[WinEvent]:
        wins: list[WinEvent] = []

        for sym_id in self._scatters:
            sym = self._symbols.get(sym_id)
            if sym is None:
                continue
            positions = [k for k, c in active.items() if c.symbol_id == sym_id]
            count = len(positions)
            payout = self._lookup_pay(sym_id, count)
            if payout > 0:
                wins.append(WinEvent(
                    symbol_id=sym_id,
                    count=count,
                    base_payout=payout,
                    positions=positions,
                    win_type="SCATTER",
                ))

        return wins

    # ────────────────────────────────────────────────────────────
    # CLUSTER 賠付
    # ────────────────────────────────────────────────────────────

    def _resolve_cluster(
        self,
        active: "dict[tuple[int,int], Cell]",
    ) -> list[WinEvent]:
        """
        BFS 找所有同符號的連通群，大小 >= cluster_min_size 才算得獎。
        連通定義：上下左右相鄰（同 reel 相鄰 row，或相鄰 reel 同 row）。
        """
        wins: list[WinEvent] = []
        visited: set[tuple[int, int]] = set()

        for key, cell in active.items():
            if key in visited:
                continue
            if cell.symbol_id in self._wilds or cell.symbol_id in self._scatters:
                visited.add(key)
                continue

            sym_id = cell.symbol_id
            cluster = self._bfs_cluster(active, key, sym_id, visited)
            visited.update(cluster)

            if len(cluster) >= self._cluster_min:
                payout = self._lookup_pay(sym_id, len(cluster))
                if payout > 0:
                    wins.append(WinEvent(
                        symbol_id=sym_id,
                        count=len(cluster),
                        base_payout=payout,
                        positions=list(cluster),
                        win_type="CLUSTER",
                    ))

        return wins

    def _bfs_cluster(
        self,
        active: "dict[tuple[int,int], Cell]",
        start: tuple[int, int],
        sym_id: str,
        visited: set[tuple[int, int]],
    ) -> set[tuple[int, int]]:
        """BFS 找出與 start 連通的同符號格子集合（Wild 也算）"""
        cluster: set[tuple[int, int]] = set()
        queue = [start]

        while queue:
            pos = queue.pop()
            if pos in cluster or pos in visited:
                continue
            cell = active.get(pos)
            if cell is None:
                continue
            if cell.symbol_id != sym_id and cell.symbol_id not in self._wilds:
                continue
            cluster.add(pos)

            reel, row = pos
            for neighbor in [
                (reel, row - 1),
                (reel, row + 1),
                (reel - 1, row),
                (reel + 1, row),
            ]:
                if neighbor not in cluster and neighbor not in visited:
                    queue.append(neighbor)

        return cluster

    # ────────────────────────────────────────────────────────────
    # 工具
    # ────────────────────────────────────────────────────────────

    def _first_non_wild(self, cells: list) -> str | None:
        for cell in cells:
            if cell and cell.symbol_id not in self._wilds:
                return cell.symbol_id
        return None

    def _lookup_pay(self, sym_id: str, count: int) -> float:
        """查 pay_table，找 <= count 的最大鍵對應賠率"""
        sym = self._symbols.get(sym_id)
        if sym is None or not sym.pay_table:
            return 0.0
        # 找最大的符合鍵
        valid = {k: v for k, v in sym.pay_table.items() if k <= count}
        if not valid:
            return 0.0
        return valid[max(valid)]
