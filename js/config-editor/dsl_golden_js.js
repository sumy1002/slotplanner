#!/usr/bin/env node
/* SlotPlanner DSL 金測試集 — JS 端 runner(v8.31 / R-2)
 * 用法:node dsl_golden_js.js(需與 helpers.js、dsl_golden_cases.json 同目錄)
 * 產出:/tmp/dsl_js.json — actions_roundtrip 每條經 parseActionsDSL 的結果,
 *      供 dsl_golden_py.py --compare 逐鍵比對。
 */
const fs = require('fs');
const path = require('path');
const HERE = __dirname;

global.window = {};
global.localStorage = {
  getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
};
global.window.localStorage = global.localStorage;
eval(fs.readFileSync(path.join(HERE, 'helpers.js'), 'utf8'));
const { parseActionsDSL } = window.SlotPlanner.ConfigEditor.Helpers;

const CASES = JSON.parse(fs.readFileSync(path.join(HERE, 'dsl_golden_cases.json'), 'utf8'));

// 與 py 端 _norm 對稱:數字統一 float 語意(JSON 下 1 與 1.0 相同)、其餘字串化
function norm(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v;
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) o[k] = norm(x);
    return o;
  }
  return String(v);
}

let fails = 0;
const out = [];
console.log('── 動作:JS parseActionsDSL 解析 → 輸出 params ──');
for (const t of CASES.actions_roundtrip) {
  try {
    const acts = parseActionsDSL(t);
    if (!acts.length) throw new Error('解析結果為空');
    out.push(acts.map(a => ({ atype: a.atype, params: norm(a.params) })));
    console.log('  PASS:', t.slice(0, 60));
  } catch (e) {
    out.push(null);
    console.log('  FAIL:', t.slice(0, 60), '->', e.message.slice(0, 60));
    fails++;
  }
}
fs.writeFileSync('/tmp/dsl_js.json', JSON.stringify(out));
console.log(`\nactions params 已輸出 /tmp/dsl_js.json;失敗 ${fails} 項`);
process.exit(fails ? 1 : 0);
