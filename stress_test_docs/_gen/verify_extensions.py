import sys
from pathlib import Path
sys.path.insert(0, str(Path(r"D:\slotplanner\engine")))
from core.a_loader import load_a_config
from core.schemas import ActionType

OUT = Path(r"D:\slotplanner\stress_test_docs\out")

def check(label, cond):
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}")
    return cond

ok = True

print("== fortune_rabbit：缺口1 fire_chance ==")
cfg = load_a_config(OUT / "fortune_rabbit" / "fortune_rabbit_A文件.xlsx")
r = next(r for r in cfg.puzzle_rules if r.rule_id == "P001")
ok &= check(f"P001.fire_chance == 0.004 (got {r.fire_chance})", abs(r.fire_chance - 0.004) < 1e-9)

print("== san_quentin_xways：缺口2 REVEAL_AS spread ==")
cfg = load_a_config(OUT / "san_quentin_xways" / "san_quentin_xways_A文件.xlsx")
r = next(r for r in cfg.puzzle_rules if r.rule_id == "P001")
a = r.actions[0]
ok &= check(f"atype == REVEAL_AS (got {a.atype})", a.atype == ActionType.REVEAL_AS)
ok &= check(f"params.spread == ADJACENT_REEL (got {a.params.get('spread')})", a.params.get("spread") == "ADJACENT_REEL")
ok &= check(f"params.spread_chance == 0.5 (got {a.params.get('spread_chance')})", a.params.get("spread_chance") == 0.5)

print("== outlaws_inc / money_train_3：缺口3 METER_ADJUST ==")
cfg = load_a_config(OUT / "outlaws_inc" / "outlaws_inc_A文件.xlsx")
r = next(r for r in cfg.puzzle_rules if r.rule_id == "P004")
a = r.actions[0]
ok &= check(f"P004 atype == METER_ADJUST, op=CAPACITY_SET (got {a.atype}, {a.params.get('op')})",
            a.atype == ActionType.METER_ADJUST and a.params.get("op") == "CAPACITY_SET")
ok &= check(f"meters 讀入 1 筆 (got {len(cfg.meters)})", len(cfg.meters) == 1)

print("== sugar_rush：缺口4 CellAttr.cap_value ==")
cfg = load_a_config(OUT / "sugar_rush" / "sugar_rush_A文件.xlsx")
ca = next(c for c in cfg.cell_attrs if c.attr_id == "CA1")
ok &= check(f"CA1.cap_value == '1024' (got {ca.cap_value!r})", ca.cap_value == "1024")

print("\n" + ("ALL_EXTENSIONS_VERIFIED" if ok else "SOME_CHECKS_FAILED"))
sys.exit(0 if ok else 1)
