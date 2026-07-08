#!/usr/bin/env python3
"""dsl_golden_py.py — 金測試集 Python 端 runner(v8.34 重建,規格同 v8.31 _meta.usage)

三守恆:
  ①conditions_py_legal 全數可解析(不炸);
  ②actions_roundtrip 解析出的 params 傾印至 /tmp/dsl_py.json 供跨端比對;
  ③*_illegal 全數以可見錯誤拒絕(靜默通過 = 失敗)。
用法:python3 dsl_golden_py.py            → 驗條件 + 產出 /tmp/dsl_py.json
      python3 dsl_golden_py.py --compare → 讀 /tmp/dsl_js.json 逐鍵比對
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sp.condition_parser import parse_condition, parse_actions

CASES = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    '..', 'dsl_golden_cases.json'), encoding='utf-8'))

def norm(v):
    """params 值正規化供跨端比對(int/float 統一、dict/list 遞迴)"""
    if isinstance(v, bool):  return v
    if isinstance(v, (int, float)): return float(v)
    if isinstance(v, list): return [norm(x) for x in v]
    if isinstance(v, dict): return {k: norm(x) for k, x in v.items()}
    return v

def main():
    fails = []
    # ① 條件合法集
    for c in CASES['conditions_py_legal']:
        try:
            parse_condition(c)
        except Exception as e:
            fails.append(f"[cond-legal] {c!r} → {e}")
    # ③ 條件非法集
    for c in CASES['conditions_py_illegal']:
        try:
            parse_condition(c)
            fails.append(f"[cond-illegal 靜默通過] {c!r}")
        except Exception:
            pass
    # ② 動作 roundtrip → 傾印
    dump = {}
    for a in CASES['actions_roundtrip']:
        try:
            acts = parse_actions(a)
            dump[a] = [{'atype': x.atype.value if hasattr(x.atype, 'value') else str(x.atype),
                        'params': norm(x.params)} for x in acts]
        except Exception as e:
            fails.append(f"[action-legal] {a!r} → {e}")
    # ③ 動作非法集
    for a in CASES['actions_py_illegal']:
        try:
            parse_actions(a)
            fails.append(f"[action-illegal 靜默通過] {a!r}")
        except Exception:
            pass
    json.dump(dump, open('/tmp/dsl_py.json', 'w'), ensure_ascii=False, indent=1)

    if fails:
        print("❌ Python 端失敗:"); [print(" ", f) for f in fails]; sys.exit(1)
    print(f"✅ Python 端全綠(條件 {len(CASES['conditions_py_legal'])} 合法 / "
          f"{len(CASES['conditions_py_illegal'])} 非法;動作 {len(dump)} roundtrip / "
          f"{len(CASES['actions_py_illegal'])} 非法)→ /tmp/dsl_py.json")

def compare():
    py = json.load(open('/tmp/dsl_py.json'))
    js = json.load(open('/tmp/dsl_js.json'))
    fails = []
    for k in CASES['actions_roundtrip']:
        p, j = py.get(k), js.get(k)
        if p != j:
            fails.append(f"[跨端不等] {k!r}\n    py={p}\n    js={j}")
    if fails:
        print("❌ 跨端比對失敗:"); [print(" ", f) for f in fails]; sys.exit(1)
    print(f"✅ 跨端比對全綠({len(CASES['actions_roundtrip'])} 動作案例逐鍵相等)")

if __name__ == '__main__':
    compare() if '--compare' in sys.argv else main()
