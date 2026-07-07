#!/usr/bin/env python3
"""SlotPlanner DSL 金測試集 — Python 端 runner(v8.31 / R-2)

用法:
  python3 dsl_golden_py.py            # 驗條件合法/非法 + 產 /tmp/dsl_py.json(actions params)
  python3 dsl_golden_py.py --compare  # 讀 /tmp/dsl_py.json 與 /tmp/dsl_js.json 逐鍵比對

擺放:與 core/ 套件同層(即 core/condition_parser.py 可 import 之處),
     dsl_golden_cases.json 置於本檔同目錄。
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).parent
CASES = json.loads((HERE / "dsl_golden_cases.json").read_text(encoding="utf-8"))

sys.path.insert(0, str(HERE))
from core.condition_parser import parse_condition, parse_actions  # noqa: E402


def _norm(v):
    """params 值正規化成可跨端比對的形狀(dict/list 遞迴;數字統一 float 比)。"""
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, list):
        return [_norm(x) for x in v]
    if isinstance(v, dict):
        return {k: _norm(x) for k, x in v.items()}
    return str(v)


def run():
    fails = 0

    print("── 條件:Python 必可解析 ──")
    for t in CASES["conditions_py_legal"]:
        try:
            parse_condition(t)
            print(f"  PASS: {t}")
        except Exception as e:
            print(f"  FAIL: {t} -> {str(e)[:70]}")
            fails += 1

    print("── 條件:Python 必以可見錯誤拒絕 ──")
    for t in CASES["conditions_py_illegal"]:
        try:
            parse_condition(t)
            print(f"  FAIL(未拒絕): {t}")
            fails += 1
        except Exception:
            print(f"  PASS(正確拒絕): {t}")

    print("── 動作:Python 解析 → 輸出 params ──")
    out = []
    for t in CASES["actions_roundtrip"]:
        try:
            acts = parse_actions(t)
            out.append([{"atype": a.atype.value, "params": _norm(a.params)} for a in acts])
            print(f"  PASS: {t[:60]}")
        except Exception as e:
            out.append(None)
            print(f"  FAIL: {t[:60]} -> {str(e)[:60]}")
            fails += 1

    print("── 動作:Python 必以可見錯誤拒絕(不靜默毀損)──")
    for t in CASES["actions_py_illegal"]:
        try:
            parse_actions(t)
            print(f"  FAIL(未拒絕): {t}")
            fails += 1
        except Exception:
            print(f"  PASS(正確拒絕): {t}")

    Path("/tmp/dsl_py.json").write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    print(f"\nactions params 已輸出 /tmp/dsl_py.json;失敗 {fails} 項")
    return fails


def compare():
    py = json.loads(Path("/tmp/dsl_py.json").read_text(encoding="utf-8"))
    js = json.loads(Path("/tmp/dsl_js.json").read_text(encoding="utf-8"))
    fails = 0
    print("── 跨端逐鍵比對(Python vs JS parseActionsDSL)──")
    for i, t in enumerate(CASES["actions_roundtrip"]):
        a, b = py[i], js[i]
        if a == b:
            print(f"  PASS: {t[:60]}")
        else:
            print(f"  FAIL: {t[:60]}\n    py={json.dumps(a, ensure_ascii=False)[:120]}\n    js={json.dumps(b, ensure_ascii=False)[:120]}")
            fails += 1
    print(f"\n跨端比對失敗 {fails} 項")
    return fails


if __name__ == "__main__":
    sys.exit(1 if (compare() if "--compare" in sys.argv else run()) else 0)
