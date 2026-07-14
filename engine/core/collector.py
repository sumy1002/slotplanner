"""
SlotPlanner Pro · S4
stats/collector.py — 統計收集器

職責：
  接收每次 spin 的 ComboResult，累積所有模擬統計，
  供 b_writer.py 輸出到 B 文件六大分頁。

開發鐵律：
  Median 取代 Average — 不可用 streaming，必須保留每筆序列
  體感棄牌(SOFT) vs 風控棄牌(HARD)：兩個獨立 Counter
"""
from __future__ import annotations

import math
from collections import defaultdict
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .combo_engine import ComboResult
    from .grid_engine import SpinResult
    from .schemas import AConfig


# ============================================================
# 工具：中位數（完整序列版）
# ============================================================

def median(seq: list[float]) -> float:
    if not seq:
        return 0.0
    s = sorted(seq)
    n = len(s)
    mid = n // 2
    return s[mid] if n % 2 else (s[mid - 1] + s[mid]) / 2.0


def percentile(seq: list[float], p: float) -> float:
    """p in [0, 100]"""
    if not seq:
        return 0.0
    s = sorted(seq)
    n = len(s)
    idx = (p / 100) * (n - 1)
    lo, hi = int(idx), min(int(idx) + 1, n - 1)
    return s[lo] + (idx - lo) * (s[hi] - s[lo])


# ============================================================
# SpinRecord：每局統計記錄（供分佈分析）
# ============================================================

@dataclass
class SpinRecord:
    mode: str
    total_payout: float        # 含 multiplier 後的本局總賠付
    combo_steps: int
    is_dead: bool
    hard_discards: int
    soft_discard_ids: list[str]
    win_count: int             # 本局 WinEvent 數量


# ============================================================
# Collector
# ============================================================

class Collector:
    """
    模擬統計收集器。

    用法::

        col = Collector(cfg)
        for spin_i in range(N):
            col.record(spin_result, combo_result, mode)
        summary = col.summary()
    """

    def __init__(self, cfg: "AConfig"):
        self._cfg = cfg
        self._total_spins     = 0
        self._valid_spins     = 0
        self._hard_discards   = 0    # 風控棄牌（獨立 Counter）
        self._soft_discards   = 0    # 體感棄牌（獨立 Counter）
        self._loop_errors     = 0
        self._dead_spins      = 0
        self._consecutive_dead_max = 0
        self._total_payout    = 0.0

        # 逐局序列（不可用 streaming，保留原始數列供中位數）
        self._payout_seq:     list[float] = []   # 每局總賠付
        self._combo_seq:      list[int]   = []   # 每局連爆次數

        # 模式別統計
        self._mode_spins:   dict[str, int]   = defaultdict(int)
        self._mode_payout:  dict[str, float] = defaultdict(float)
        self._mode_dead:    dict[str, int]   = defaultdict(int)

        # 符號出現計數
        self._symbol_counts: dict[str, int] = defaultdict(int)

        # v3.7 / #6:符號別賠付累計(實質含 multiplier 的賠付)
        #   - 來源:ComboResult.win_events[*].symbol_id + base_payout
        #   - win_events 內的 base_payout 已是 step_total / step_base * multiplier 後的值,
        #     即「該符號在這局貢獻的實質倍率」(對齊 _total_payout)
        #   - sum(symbol_payout.values()) == _total_payout(浮點誤差內)
        self._symbol_payout: dict[str, float] = defaultdict(float)

        # 棄牌規則別觸發次數（SOFT）
        self._soft_rule_hits: dict[str, int] = defaultdict(int)

        # 連爆次數分佈直方圖
        self._combo_hist: dict[int, int] = defaultdict(int)

        # 大獎統計（依 big_win_thresholds 分層）
        thresholds = sorted(cfg.global_cfg.big_win_thresholds)
        self._big_win_thresholds = thresholds
        self._big_win_counts: dict[str, int] = {
            f">={t}x": 0 for t in thresholds
        }

        # 規則觸發次數（從 PuzzleRule.trigger_count 讀取）
        self._rule_trigger_snapshot: dict[str, int] = {}
        # 規則 RTP 貢獻（從 PuzzleRule.rtp_contribution 讀取；單位為 multiplier 加總）
        self._rule_rtp_snapshot: dict[str, float] = {}
        # 規則 metadata 快照（trigger / priority / enabled / description）
        # — 給 UI 顯示用，避免前端要另外 cross-reference 規則清單
        self._rule_meta_snapshot: dict[str, dict] = {}

        # 死局連續分佈（依 dead_spin_buckets）
        self._dead_buckets = cfg.global_cfg.dead_spin_buckets
        self._dead_bucket_counts: dict[str, int] = {
            str(b): 0 for b in self._dead_buckets
        }
        self._dead_bucket_counts["other"] = 0
        self._current_consecutive_dead = 0

    # ────────────────────────────────────────────────────────────
    # 主介面：記錄一局
    # ────────────────────────────────────────────────────────────

    def record_invalid(self, hard_count: int = 1):
        """記錄無效局（HARD 棄牌超上限）"""
        self._total_spins  += 1
        self._hard_discards += hard_count

    def record_loop_error(self):
        self._total_spins += 1
        self._loop_errors += 1
        self._hard_discards += 1

    def record(
        self,
        spin_result: "SpinResult",
        combo_result: "ComboResult",
        mode: str,
    ):
        """記錄一局完整統計"""
        self._total_spins += 1
        self._valid_spins += 1
        self._hard_discards += spin_result.hard_discard_count

        # SOFT 棄牌（體感，獨立計數）
        for rule_id in spin_result.soft_discards:
            self._soft_discards += 1
            self._soft_rule_hits[rule_id] += 1

        # 賠付
        payout = combo_result.total_base
        self._total_payout += payout
        self._payout_seq.append(payout)
        self._mode_payout[mode] += payout
        self._mode_spins[mode]  += 1

        # 連爆
        steps = combo_result.combo_steps
        self._combo_seq.append(steps)
        self._combo_hist[steps] += 1

        # 符號計數
        for sym_id, cnt in spin_result.symbol_counts().items():
            self._symbol_counts[sym_id] += cnt

        # v3.7 / #6:符號別賠付累計
        #   combo_result.win_events 內每個 WinEvent 已包含 multiplier 後的 base_payout,
        #   直接 sum 即為該符號在本局的實質貢獻
        for w in combo_result.win_events:
            self._symbol_payout[w.symbol_id] += float(w.base_payout)

        # 死局
        if combo_result.is_dead_spin:
            self._dead_spins += 1
            self._mode_dead[mode] += 1
            self._current_consecutive_dead += 1
            self._consecutive_dead_max = max(
                self._consecutive_dead_max, self._current_consecutive_dead
            )
            self._record_dead_bucket(self._current_consecutive_dead)
        else:
            self._current_consecutive_dead = 0

        # 大獎
        for t in self._big_win_thresholds:
            if payout >= t:
                self._big_win_counts[f">={t}x"] += 1

    def record_rule_triggers(self, rules):
        """模擬結束時呼叫，快照所有規則的累計觸發次數、RTP 貢獻、metadata"""
        for rule in rules:
            self._rule_trigger_snapshot[rule.rule_id] = rule.trigger_count
            self._rule_rtp_snapshot[rule.rule_id] = round(
                float(getattr(rule, "rtp_contribution", 0.0)), 6
            )
            # 把規則 metadata 一併快照，方便前端不依賴規則清單就能顯示完整軌跡
            self._rule_meta_snapshot[rule.rule_id] = {
                "trigger":       rule.trigger.value if hasattr(rule.trigger, "value") else str(rule.trigger),
                "priority":      rule.priority,
                "enabled":       rule.enabled,
                "description":   rule.description,
                "action_types":  [
                    (a.atype.value if hasattr(a.atype, "value") else str(a.atype))
                    for a in (rule.actions or [])
                ],
                "emit_names":    list(rule.emits or []),
            }

    # ────────────────────────────────────────────────────────────
    # 輸出：彙整統計
    # ────────────────────────────────────────────────────────────

    def summary(self) -> dict:
        """回傳供 b_writer 使用的完整統計字典"""
        valid = self._valid_spins or 1
        rtp   = self._total_payout / valid * 100

        # RTP 各模式
        mode_rtp = {
            m: (self._mode_payout[m] / self._mode_spins[m] * 100
                if self._mode_spins[m] else 0.0)
            for m in self._mode_spins
        }

        # 死局率
        dead_rate = self._dead_spins / valid * 100

        # 中位數（不用 streaming）
        med_payout = median(self._payout_seq)
        med_combo  = median([float(x) for x in self._combo_seq])

        # 百分位數
        p95 = percentile(self._payout_seq, 95)
        p99 = percentile(self._payout_seq, 99)

        # 符號頻率
        total_cells = sum(self._symbol_counts.values()) or 1
        # v3.7 / #6:per-symbol RTP 貢獻
        #   - rtp_contribution_pct: sym_payout / valid_spins * 100,單位與全局 rtp_pct 相同
        #   - payout_share_pct:   sym_payout / total_payout * 100,「這個符號貢獻了總賠付的多少 %」
        #   - avg_payout_per_hit:  sym_payout / count(出現次數),「每次出現平均吐多少」
        symbol_freq = {
            sid: {
                "count": cnt,
                "pct":   round(cnt / total_cells * 100, 6),
                "display_name": (self._cfg.symbols[sid].display_name
                                 if sid in self._cfg.symbols else sid),
                "sym_type": (self._cfg.symbols[sid].sym_type.value
                             if sid in self._cfg.symbols else ""),
                # v3.7 / #6 新增欄位
                "payout":                  round(self._symbol_payout.get(sid, 0.0), 6),
                "rtp_contribution_pct":    round(
                    self._symbol_payout.get(sid, 0.0) / valid * 100, 6
                ),
                "payout_share_pct":        round(
                    (self._symbol_payout.get(sid, 0.0) / self._total_payout * 100)
                    if self._total_payout > 0 else 0.0,
                    6,
                ),
                "avg_payout_per_hit":      round(
                    (self._symbol_payout.get(sid, 0.0) / cnt) if cnt > 0 else 0.0,
                    6,
                ),
            }
            for sid, cnt in sorted(self._symbol_counts.items(),
                                   key=lambda x: x[1], reverse=True)
        }

        return {
            # ── 總覽 ──
            "total_spins":          self._total_spins,
            "valid_spins":          self._valid_spins,
            "hard_discards":        self._hard_discards,
            "soft_discards":        self._soft_discards,
            "loop_errors":          self._loop_errors,
            "dead_spins":           self._dead_spins,
            "dead_rate_pct":        round(dead_rate, 6),
            "consecutive_dead_max": self._consecutive_dead_max,

            # ── RTP ──
            "total_payout":         round(self._total_payout, 6),
            "rtp_pct":              round(rtp, 6),
            "mode_rtp":             {m: round(v, 6) for m, v in mode_rtp.items()},

            # ── 分佈 ──
            "median_payout":        round(med_payout, 6),
            "p95_payout":           round(p95, 6),
            "p99_payout":           round(p99, 6),

            # ── 連爆 ──
            "median_combo":         round(med_combo, 2),
            "combo_hist":           dict(self._combo_hist),

            # ── 符號 ──
            "symbol_freq":          symbol_freq,

            # ── 棄牌 ──
            "soft_rule_hits":       dict(self._soft_rule_hits),
            "dead_bucket_counts":   dict(self._dead_bucket_counts),

            # ── 大獎 ──
            "big_win_counts":       dict(self._big_win_counts),

            # ── 規則 ──
            "rule_trigger_counts":     dict(self._rule_trigger_snapshot),
            "rule_rtp_contributions":  dict(self._rule_rtp_snapshot),
            "rule_meta":               {
                k: dict(v) for k, v in self._rule_meta_snapshot.items()
            },

            # ── 模式 ──
            "mode_spins":           dict(self._mode_spins),
            "mode_payout":          {m: round(v, 6) for m, v in self._mode_payout.items()},
            "mode_dead":            dict(self._mode_dead),
        }

    # ────────────────────────────────────────────────────────────
    # 私有工具
    # ────────────────────────────────────────────────────────────

    def _record_dead_bucket(self, consecutive: int):
        """把連續死局數歸入最接近的 bucket"""
        matched = False
        for b in sorted(self._dead_buckets):
            if consecutive <= b:
                self._dead_bucket_counts[str(b)] += 1
                matched = True
                break
        if not matched:
            self._dead_bucket_counts["other"] += 1
