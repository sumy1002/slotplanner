"""型別金測試（圖示頁 type=NORMAL 契約子批）。

覆蓋：
  1. _coerce_sym_type 直接單元測試（含 None / NaN / 未知 / 顯示類別）。
  2. 經 _parse_symbols 端到端（Type 欄 → SymbolDef.sym_type）。
  3. 缺 Type 欄整欄不存在時不再 KeyError 硬炸 → 安全降級 NORMAL。
  4. 零 diff：既有 HIGH/LOW 及新 NORMAL 的 .value 原樣保留（供 b_writer 寫回）。
"""
import math
import pandas as pd

from core.schemas import SymbolType
from core.a_loader import _coerce_sym_type, _parse_symbols

fails = []
def check(name, got, want):
    ok = got == want
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: got={got!r} want={want!r}")
    if not ok:
        fails.append(name)

print("── 1. _coerce_sym_type 直接 ──")
# 既有合法值原樣保留
for v, want in [
    ("HIGH", SymbolType.HIGH), ("LOW", SymbolType.LOW), ("NORMAL", SymbolType.NORMAL),
    ("WILD", SymbolType.WILD), ("SCATTER", SymbolType.SCATTER),
    ("BONUS", SymbolType.BONUS), ("SPECIAL", SymbolType.SPECIAL),
    ("normal", SymbolType.NORMAL),      # 大小寫不敏感
    ("  wild ", SymbolType.WILD),        # 空白容錯
]:
    check(f"coerce({v!r})", _coerce_sym_type(v), want)
# 未知 / 空 / None / NaN / 前端顯示類別 → 安全降級 NORMAL
for v in ["一般得分", "FREE", "COIN", "Other", "GARBAGE", "", None, float("nan")]:
    check(f"coerce({v!r})→NORMAL", _coerce_sym_type(v), SymbolType.NORMAL)

print("── 2. _parse_symbols 端到端（有 Type 欄）──")
df = pd.DataFrame([
    {"Symbol_ID": "S_NORMAL",  "Display_Name": "一般", "Type": "NORMAL",  "Pay_3x": 1, "Pay_4x": 5, "Pay_5x": 25},
    {"Symbol_ID": "S_HIGH",    "Display_Name": "高牌", "Type": "HIGH",    "Pay_3x": 2, "Pay_4x": 8, "Pay_5x": 40},
    {"Symbol_ID": "S_LOW",     "Display_Name": "低牌", "Type": "LOW",     "Pay_3x": 1, "Pay_4x": 3, "Pay_5x": 10},
    {"Symbol_ID": "S_WILD",    "Display_Name": "百搭", "Type": "WILD",    "Pay_3x": 5, "Pay_4x": 20, "Pay_5x": 100},
    {"Symbol_ID": "S_ZH",      "Display_Name": "中類", "Type": "一般得分", "Pay_3x": 1, "Pay_4x": 4, "Pay_5x": 12},
    {"Symbol_ID": "S_FREE",    "Display_Name": "免費", "Type": "FREE",    "Pay_3x": 0, "Pay_4x": 0, "Pay_5x": 0},
    {"Symbol_ID": "S_EMPTY",   "Display_Name": "空型", "Type": "",        "Pay_3x": 1, "Pay_4x": 2, "Pay_5x": 3},
])
syms = _parse_symbols(df)
check("S_NORMAL", syms["S_NORMAL"].sym_type, SymbolType.NORMAL)
check("S_HIGH（不改寫）", syms["S_HIGH"].sym_type, SymbolType.HIGH)
check("S_LOW（不改寫）",  syms["S_LOW"].sym_type,  SymbolType.LOW)
check("S_WILD（不改寫）", syms["S_WILD"].sym_type, SymbolType.WILD)
check("S_ZH（一般得分→NORMAL）", syms["S_ZH"].sym_type, SymbolType.NORMAL)
check("S_FREE（→NORMAL）",  syms["S_FREE"].sym_type,  SymbolType.NORMAL)
check("S_EMPTY（空→NORMAL）", syms["S_EMPTY"].sym_type, SymbolType.NORMAL)

print("── 3. 缺 Type 欄整欄不存在（不得 KeyError 硬炸）──")
df_no_type = pd.DataFrame([
    {"Symbol_ID": "S_NOCOL", "Display_Name": "無型欄", "Pay_3x": 1, "Pay_4x": 2, "Pay_5x": 3},
])
try:
    syms2 = _parse_symbols(df_no_type)
    check("缺欄→NORMAL", syms2["S_NOCOL"].sym_type, SymbolType.NORMAL)
except Exception as e:
    check("缺欄不炸", f"EXCEPTION {type(e).__name__}: {e}", "no exception")

print("── 4. 零 diff：.value 原樣（供 b_writer 寫回）──")
check("HIGH.value", syms["S_HIGH"].sym_type.value, "HIGH")
check("LOW.value",  syms["S_LOW"].sym_type.value,  "LOW")
check("NORMAL.value", syms["S_NORMAL"].sym_type.value, "NORMAL")

print()
if fails:
    print(f"✗ 型別金測試 FAIL：{len(fails)} 項 → {fails}")
    raise SystemExit(1)
print("✓ 型別金測試全綠")
