#!/usr/bin/env python3
"""G-4 additive roundtrip(Python 讀回側)。

1) 有值版:讀真實匯出 → _parse_hold_win 設 HW 的 hw_ 欄;kind=HOLD_AND_WIN;
   respin_base 仍由 11_Mode_Config 承載(未被 G-4 動,無重複)。NG 全空。
2) 舊檔無 22_HoldWin → 安全降級(hw_ 欄空/False)。
3) 欄序打亂:by-name 讀取仍正確。
4) 22_HoldWin 引用不存在的 Mode → ConfigValidationError。
"""
import sys, os
import pandas as pd
from openpyxl import Workbook
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from core.a_loader import _parse_modes, _parse_hold_win
from core.schemas import ConfigValidationError

FAIL = []
def ck(cond, msg):
    print(f"  {'✅' if cond else '❌'} {msg}")
    if not cond: FAIL.append(msg)
def rd(path):
    return pd.read_excel(path, sheet_name=None, dtype=object, engine='openpyxl')

# ── 1) 有值版 ──
print("== 1) 有值版:真實 buildAxlsxBufferFromLS 匯出 → 讀回 ==")
sh = rd('/tmp/g4_full.xlsx')
modes = _parse_modes(sh['11_Mode_Config'])
hw = modes.get('HW')
# 先確認既有 respin/kind 由 11_Mode_Config 讀入(未被 G-4 動)
ck(hw is not None and hw.mode_kind == 'HOLD_AND_WIN', f"HW kind=HOLD_AND_WIN(實得 {hw.mode_kind if hw else 'n/a'})")
ck(hw is not None and hw.respin_base == 3 and hw.respin_reset_on == 'NEW_SYMBOL',
   f"HW respin 沿用 11(base={hw.respin_base if hw else '?'}, reset={hw.respin_reset_on if hw else '?'})")
# 再掛 22_HoldWin 新欄
_parse_hold_win(sh.get('22_HoldWin'), modes)
ck(hw.hw_trigger_symbol == 'COIN', f"HW hw_trigger_symbol=COIN(實得 {hw.hw_trigger_symbol})")
ck(hw.hw_persist_value is True, f"HW hw_persist_value=True(實得 {hw.hw_persist_value})")
ck(hw.hw_collect_rule == '填滿全付 + 收集達標升級', f"HW hw_collect_rule 正確")
ck(hw.hw_link_jackpot == 'GRAND', f"HW hw_link_jackpot=GRAND(實得 {hw.hw_link_jackpot})")
ng = modes.get('NG')
ck(ng is not None and not ng.hw_trigger_symbol and ng.hw_persist_value is False
   and not ng.hw_collect_rule and not ng.hw_link_jackpot, "NG hw_ 欄全空(未宣告)")

# ── 2) 舊檔降級 ──
print("\n== 2) 舊檔無 22_HoldWin → 安全降級 ==")
modes_o = _parse_modes(sh['11_Mode_Config'])
_parse_hold_win(None, modes_o)   # sheet 不存在 → None
hw_o = modes_o.get('HW')
ck(hw_o is not None and not hw_o.hw_trigger_symbol and hw_o.hw_persist_value is False
   and not hw_o.hw_collect_rule and not hw_o.hw_link_jackpot, "舊檔降級:hw_ 欄空/False")
ck(hw_o.respin_base == 3, "舊檔 respin_base 仍完好(11 承載,不受 22 影響)")

# ── 3) 欄序打亂 ──
print("\n== 3) 22_HoldWin 欄序打亂 → by-name 讀取仍正確 ==")
wb = Workbook(); ws = wb.active; ws.title = '22_HoldWin'
ws.append(['Notes', 'Link_Jackpot', 'Collect_Rule', 'Mode_Scope', 'Persist_Value', 'Trigger_Symbol'])
ws.append(['亂序', 'MAJOR', '達標付', 'HW', 'FALSE', 'BAMBOO'])
wb.save('/tmp/g4_shuffle.xlsx')
shs = rd('/tmp/g4_shuffle.xlsx')
modes_s = _parse_modes(sh['11_Mode_Config'])
_parse_hold_win(shs.get('22_HoldWin'), modes_s)
hw_s = modes_s.get('HW')
ck(hw_s.hw_trigger_symbol == 'BAMBOO' and hw_s.hw_link_jackpot == 'MAJOR'
   and hw_s.hw_collect_rule == '達標付' and hw_s.hw_persist_value is False,
   f"亂序全欄正確(trig={hw_s.hw_trigger_symbol}, jp={hw_s.hw_link_jackpot}, persist={hw_s.hw_persist_value})")

# ── 4) 非法 mode ref → 報錯 ──
print("\n== 4) 22_HoldWin 引用不存在的 Mode → ConfigValidationError ==")
wb2 = Workbook(); ws2 = wb2.active; ws2.title = '22_HoldWin'
ws2.append(['Mode_Scope', 'Trigger_Symbol', 'Persist_Value', 'Collect_Rule', 'Link_Jackpot', 'Notes'])
ws2.append(['GHOST', 'COIN', 'TRUE', 'x', 'GRAND', ''])
wb2.save('/tmp/g4_bad.xlsx')
shb = rd('/tmp/g4_bad.xlsx')
modes_b = _parse_modes(sh['11_Mode_Config'])
raised = False
try:
    _parse_hold_win(shb.get('22_HoldWin'), modes_b)
except ConfigValidationError as e:
    raised = True; print(f"     （已擋:{e}）")
ck(raised, "22_HoldWin 引用不存在 Mode 'GHOST' 被拒")

print(f"\nG-4 additive roundtrip: {'✅ 全通過' if not FAIL else '❌ 失敗: ' + '; '.join(FAIL)}")
sys.exit(0 if not FAIL else 1)
