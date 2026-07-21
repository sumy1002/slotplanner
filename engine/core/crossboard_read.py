#!/usr/bin/env python3
"""G-PotA CROSS_BOARD 讀回:真實匯出的 09_Puzzle_Rules → a_loader._parse_puzzle_rules → 還原 Action params。"""
import sys, os
import pandas as pd
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.a_loader import _parse_puzzle_rules
from core.schemas import ActionType

FAIL = []
def ck(cond, msg):
    print(f"  {'✅' if cond else '❌'} {msg}")
    if not cond: FAIL.append(msg)

sh = pd.read_excel('/tmp/crossboard.xlsx', sheet_name=None, dtype=object, engine='openpyxl')
rules = _parse_puzzle_rules(sh['09_Puzzle_Rules'])
by = {r.rule_id: r for r in rules}

ck('R_STACKED_WILD' in by and 'R_DUAL_TRANSFER' in by, f"兩規則讀回(實得 {sorted(by)})")

# COPY 整輪
r1 = by['R_STACKED_WILD']
a1 = r1.actions[0]
ck(a1.atype == ActionType.CROSS_BOARD, f"R1 atype=CROSS_BOARD(實得 {a1.atype})")
ck(a1.params.get('op') == 'COPY' and a1.params.get('to_board') == 'DAWN'
   and a1.params.get('grain') == 'REEL' and a1.params.get('mapping') == 'SAME_POS',
   f"R1 params 還原正確(op={a1.params.get('op')}, to={a1.params.get('to_board')}, grain={a1.params.get('grain')})")

# MOVE 單符
r2 = by['R_DUAL_TRANSFER']
a2 = r2.actions[0]
ck(a2.atype == ActionType.CROSS_BOARD and a2.params.get('op') == 'MOVE'
   and a2.params.get('grain') == 'SYMBOL' and a2.params.get('selector') == 'WILD_D',
   f"R2 params 還原正確(op={a2.params.get('op')}, grain={a2.params.get('grain')}, sel={a2.params.get('selector')})")

print(f"\nCROSS_BOARD 讀回: {'✅ 全通過(DSL round-trip 逐鍵相等)' if not FAIL else '❌ 失敗: ' + '; '.join(FAIL)}")
sys.exit(0 if not FAIL else 1)
