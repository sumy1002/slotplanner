#!/usr/bin/env node
/* dsl_golden_js.js — 金測試集 JS 端 runner(v8.34 重建)
   以 helpers.js 的 parseActionsDSL 解析 actions_roundtrip,傾印 /tmp/dsl_js.json。
   helpers.js 為 IIFE 掛 window,以 vm 沙盒載入。 */
const fs = require('fs'); const path = require('path'); const vm = require('vm');

const here = __dirname;
const helpersSrc = fs.readFileSync(path.join(here, '..', 'helpers.js'), 'utf8');
const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(helpersSrc, sandbox);
const SPn = sandbox.window.SlotPlanner || {};
const H = (SPn.ConfigEditor && SPn.ConfigEditor.Helpers) || {};
const parseActionsDSL = H.parseActionsDSL;
if (typeof parseActionsDSL !== 'function') {
  console.error('找不到 parseActionsDSL;window keys =', Object.keys(sandbox.window));
  process.exit(2);
}

const CASES = JSON.parse(fs.readFileSync(path.join(here, '..', 'dsl_golden_cases.json'), 'utf8'));

function norm(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v + 0.0;   // JSON 傾印時與 py float 對齊由比對端 float 化
  if (Array.isArray(v)) return v.map(norm);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = norm(v[k]); return o; }
  return v;
}

const dump = {}; const fails = [];
for (const a of CASES.actions_roundtrip) {
  try {
    const acts = parseActionsDSL(a);
    dump[a] = acts.map(x => ({ atype: x.atype, params: norm(x.params) }));
  } catch (e) { fails.push(`[action-legal] ${a} → ${e.message}`); }
}
fs.writeFileSync('/tmp/dsl_js.json', JSON.stringify(dump, null, 1));
if (fails.length) { console.log('❌ JS 端失敗:'); fails.forEach(f => console.log(' ', f)); process.exit(1); }
console.log(`✅ JS 端全綠(動作 ${Object.keys(dump).length} roundtrip)→ /tmp/dsl_js.json`);
