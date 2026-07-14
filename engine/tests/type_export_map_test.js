#!/usr/bin/env node
/* type_export_map_test.js — 圖示頁 type=NORMAL 前端閉環:
 * 匯出端 _symTypeToEnum 端到端驗證 —— seed registry（各型別）→ buildAxlsxBufferFromLS
 * → 讀回 03_Symbols Type 欄，斷言恆為規範 A.xlsx enum。
 *   ①已是 enum（HIGH/LOW/NORMAL/WILD/SCATTER/BONUS/SPECIAL）→ 原樣（零 diff）；
 *   ②顯示類別（一般得分/FREE/COIN/Other）→ 映射（NORMAL / SPECIAL…）；
 *   ③空 / 缺 type → NORMAL。
 */
const fs = require('fs');
global.window = {};
global.localStorage = (() => { const m = {}; return {
  getItem: k => m[k] ?? null, setItem: (k, v) => { m[k] = String(v); },
  removeItem: k => { delete m[k]; }, clear: () => { for (const k in m) delete m[k]; },
  key: i => Object.keys(m)[i], get length() { return Object.keys(m).length; } }; })();
global.window.localStorage = global.localStorage;
global.window.ExcelJS = require('exceljs');
eval(fs.readFileSync('helpers.js', 'utf8'));
eval(fs.readFileSync('aconfig-xlsx.js', 'utf8'));

// 各型別各一顆（enabled 必須 true 才會寫入 03_Symbols）
const SYMS = [
  { symbol_id: 'S_HIGH',  name: 'H',  type: 'HIGH',    enabled: true },
  { symbol_id: 'S_LOW',   name: 'L',  type: 'LOW',     enabled: true },
  { symbol_id: 'S_NORM',  name: 'N',  type: 'NORMAL',  enabled: true },
  { symbol_id: 'S_WILD',  name: 'W',  type: 'WILD',    enabled: true, is_wild: true },
  { symbol_id: 'S_SCAT',  name: 'C',  type: 'SCATTER', enabled: true, is_scatter: true },
  { symbol_id: 'S_BON',   name: 'B',  type: 'BONUS',   enabled: true },
  { symbol_id: 'S_SPEC',  name: 'P',  type: 'SPECIAL', enabled: true },
  { symbol_id: 'S_ZH',    name: 'Z',  type: '一般得分', enabled: true },
  { symbol_id: 'S_FREE',  name: 'F',  type: 'FREE',    enabled: true },
  { symbol_id: 'S_COIN',  name: 'O',  type: 'COIN',    enabled: true },
  { symbol_id: 'S_OTHER', name: 'T',  type: 'Other',   enabled: true },
  { symbol_id: 'S_EMPTY', name: 'E',  type: '',        enabled: true },
  { symbol_id: 'S_NONE',  name: 'X',                   enabled: true },   // 無 type 欄
];
localStorage.setItem('slotplanner.registry.v1', JSON.stringify({ symbols: SYMS }));

const WANT = {
  S_HIGH: 'HIGH', S_LOW: 'LOW', S_NORM: 'NORMAL', S_WILD: 'WILD',
  S_SCAT: 'SCATTER', S_BON: 'BONUS', S_SPEC: 'SPECIAL',
  S_ZH: 'NORMAL', S_FREE: 'SPECIAL', S_COIN: 'SPECIAL', S_OTHER: 'SPECIAL',
  S_EMPTY: 'NORMAL', S_NONE: 'NORMAL',
};

let fails = 0;
(async () => {
  const buf = await window.SlotPlanner.buildAxlsxBufferFromLS();
  const wb = new (require('exceljs')).Workbook();
  await wb.xlsx.load(Buffer.from(buf));
  const ws = wb.getWorksheet('03_Symbols');
  if (!ws) { console.error('✗ 找不到 03_Symbols'); process.exit(1); }

  // 表頭定位 Symbol_ID / Type 欄
  const hdr = ws.getRow(1).values.map(v => (v == null ? '' : String(v)));
  const cSid = hdr.indexOf('Symbol_ID');
  const cType = hdr.indexOf('Type');
  const got = {};
  ws.eachRow((row, n) => {
    if (n === 1) return;
    const sid = String(row.getCell(cSid).value || '').trim();
    if (!sid) return;
    got[sid] = String(row.getCell(cType).value || '').trim();
  });

  for (const sid of Object.keys(WANT)) {
    const ok = got[sid] === WANT[sid];
    console.log(`  [${ok ? 'PASS' : 'FAIL'}] ${sid}: Type=${got[sid]} 期望 ${WANT[sid]}`);
    if (!ok) fails++;
  }
  console.log('');
  if (fails) { console.log(`✗ 匯出映射 FAIL：${fails} 項`); process.exit(1); }
  console.log('✓ 匯出映射全綠（13 型別 → 規範 enum；enum 原樣、類別映射、空→NORMAL）');
})().catch(e => { console.error('✗ 例外:', e); process.exit(1); });
