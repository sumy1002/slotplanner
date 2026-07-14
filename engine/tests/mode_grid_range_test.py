"""05b_Mode_Grid_Range 金測試（Megaways 逐模式遷移契約）。

覆蓋：
  A. sheet 存在 → 顯式解析（含 Min/Max 缺值由推導補、Max 夾 cap、Min>Max 夾正、註解列略過、
     未列 mode×reel 補推導、每 mode×reel 唯一一筆）。
  B. sheet 缺 + 05 有權重 → 推導範圍（多尺寸取 min/max；某輪無 05 → 固定 = Max_Rows）。
  C. sheet 缺 + 無 05 → 全固定高度（min=max=Max_Rows）。行為與舊檔一致。
  D. modes 空 → 退用 05 出現過的 mode 名。
  E. ModeGridRange.is_variable。
"""
from types import SimpleNamespace
import pandas as pd

from core.schemas import ModeGridRange, GridSizeWeight
from core.a_loader import _parse_mode_grid_range

fails = []
def check(name, got, want):
    ok = got == want
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}: got={got!r} want={want!r}")
    if not ok:
        fails.append(name)

def rng(out):
    """{(mode, reel_id): (min, max)}；同時斷言每鍵唯一。"""
    d = {}
    for m in out:
        key = (m.mode, m.reel_id)
        assert key not in d, f"重複 mode×reel: {key}"
        d[key] = (m.min_rows, m.max_rows)
    return d

# 共用 layout：3 輪，max_rows = 3 / 5 / 7；modes = NG, FG
layout = SimpleNamespace(reels=[
    SimpleNamespace(reel_id=1, max_rows=3),
    SimpleNamespace(reel_id=2, max_rows=5),
    SimpleNamespace(reel_id=3, max_rows=7),
])
modes = {"NG": object(), "FG": object()}

# 05 權重：FG,1={2,3}（另含 grid_size=1 weight=0 應被排除）；FG,2={3,4,5}；FG,3 無；NG 全無
gsw = [
    GridSizeWeight(mode="FG", reel_id=1, grid_size=2, weight=1.0),
    GridSizeWeight(mode="FG", reel_id=1, grid_size=3, weight=2.0),
    GridSizeWeight(mode="FG", reel_id=1, grid_size=1, weight=0.0),   # 零權重 → 排除
    GridSizeWeight(mode="FG", reel_id=2, grid_size=3, weight=1.0),
    GridSizeWeight(mode="FG", reel_id=2, grid_size=4, weight=1.0),
    GridSizeWeight(mode="FG", reel_id=2, grid_size=5, weight=1.0),
]

print("── A. 05b 存在（顯式 + 補值 + 夾範圍 + 補齊）──")
df = pd.DataFrame([
    {"Mode": "FG",  "Reel_ID": 2, "Min_Rows": 3,  "Max_Rows": 5,  "Notes": "n"},   # 顯式
    {"Mode": "NG",  "Reel_ID": 1, "Min_Rows": 1,  "Max_Rows": 3,  "Notes": ""},    # 顯式覆蓋推導(3,3)
    {"Mode": "FG",  "Reel_ID": 1, "Min_Rows": "", "Max_Rows": "", "Notes": ""},    # 缺值→推導補(2,3)
    {"Mode": "#註", "Reel_ID": 1, "Min_Rows": 1,  "Max_Rows": 1,  "Notes": ""},    # 註解列→略過
    {"Mode": "FG",  "Reel_ID": 3, "Min_Rows": 1,  "Max_Rows": 99, "Notes": ""},    # Max 夾 cap=7
    {"Mode": "NG",  "Reel_ID": 2, "Min_Rows": 9,  "Max_Rows": 5,  "Notes": ""},    # Min>Max 夾正→(5,5)
])
A = rng(_parse_mode_grid_range(df, layout, modes, gsw))
check("A FG,2 顯式", A[("FG", 2)], (3, 5))
check("A NG,1 顯式覆蓋", A[("NG", 1)], (1, 3))
check("A FG,1 缺值補推導", A[("FG", 1)], (2, 3))
check("A FG,3 Max夾cap", A[("FG", 3)], (1, 7))
check("A NG,2 Min>Max夾正", A[("NG", 2)], (5, 5))
check("A NG,3 補齊(推導固定)", A[("NG", 3)], (7, 7))
check("A 筆數=6(每 mode×reel 唯一)", len(A), 6)

print("── B. 05b 缺 + 05 有權重 → 推導 ──")
B = rng(_parse_mode_grid_range(None, layout, modes, gsw))
check("B FG,1 多尺寸", B[("FG", 1)], (2, 3))
check("B FG,2 多尺寸", B[("FG", 2)], (3, 5))
check("B FG,3 無05→固定", B[("FG", 3)], (7, 7))
check("B NG,1 無05→固定", B[("NG", 1)], (3, 3))
check("B NG,2 無05→固定", B[("NG", 2)], (5, 5))
check("B 筆數=6", len(B), 6)

print("── C. 05b 缺 + 無 05 → 全固定高度 ──")
C = rng(_parse_mode_grid_range(None, layout, modes, []))
check("C NG,1 固定", C[("NG", 1)], (3, 3))
check("C NG,2 固定", C[("NG", 2)], (5, 5))
check("C FG,3 固定", C[("FG", 3)], (7, 7))
check("C 筆數=6", len(C), 6)

print("── D. modes 空 → 退用 05 出現過的 mode 名 ──")
D = rng(_parse_mode_grid_range(None, layout, {},
        [GridSizeWeight(mode="BONUS", reel_id=1, grid_size=2, weight=1.0)]))
check("D BONUS,1 由05尺寸", D[("BONUS", 1)], (2, 2))
check("D BONUS,2 無05→固定", D[("BONUS", 2)], (5, 5))
check("D 只含 BONUS(3 輪)", len(D), 3)

print("── E. is_variable ──")
check("E (2,3) 可變", ModeGridRange("FG", 1, 2, 3).is_variable, True)
check("E (3,3) 固定", ModeGridRange("NG", 1, 3, 3).is_variable, False)

print()
if fails:
    print(f"✗ 05b 金測試 FAIL：{len(fails)} 項 → {fails}")
    raise SystemExit(1)
print("✓ 05b 金測試全綠")
